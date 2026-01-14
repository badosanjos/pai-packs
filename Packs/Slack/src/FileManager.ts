#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/FileManager.ts
// File handling for Slack integration - receive and upload files

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { ReceivedFile, FileAttachment } from "./Types";

// PAI directory resolution
const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "Slack");
const STATE_DIR = join(SKILL_DIR, "State");
const FILES_DIR = join(STATE_DIR, "files");

// Ensure base files directory exists
if (!existsSync(FILES_DIR)) {
  mkdirSync(FILES_DIR, { recursive: true });
}

// Get channel-specific files directory
export function getChannelFilesDir(channelId: string): string {
  const channelDir = join(FILES_DIR, channelId);
  if (!existsSync(channelDir)) {
    mkdirSync(channelDir, { recursive: true });
  }
  return channelDir;
}

// Get file index path for a channel
function getFileIndexPath(channelId: string): string {
  return join(getChannelFilesDir(channelId), "_index.json");
}

// Load file index for a channel
export function loadFileIndex(channelId: string): ReceivedFile[] {
  const indexPath = getFileIndexPath(channelId);
  if (existsSync(indexPath)) {
    try {
      return JSON.parse(readFileSync(indexPath, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

// Save file index for a channel
function saveFileIndex(channelId: string, files: ReceivedFile[]): void {
  const indexPath = getFileIndexPath(channelId);
  writeFileSync(indexPath, JSON.stringify(files, null, 2));
}

// Generate safe filename (avoid collisions)
function generateSafeFilename(channelDir: string, originalName: string): string {
  const base = basename(originalName);
  let filename = base;
  let counter = 1;

  while (existsSync(join(channelDir, filename))) {
    const ext = base.includes(".") ? "." + base.split(".").pop() : "";
    const name = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
    filename = `${name}_${counter}${ext}`;
    counter++;
  }

  return filename;
}

// Download and save a file from Slack
export async function downloadAndSaveFile(
  file: FileAttachment,
  channelId: string,
  botToken: string,
  uploadedBy: string,
  threadTs?: string
): Promise<ReceivedFile | null> {
  try {
    // Download file content
    const response = await fetch(file.url_private_download, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to download file ${file.name}: ${response.statusText}`);
      return null;
    }

    // Get channel directory and generate safe filename
    const channelDir = getChannelFilesDir(channelId);
    const safeFilename = generateSafeFilename(channelDir, file.name);
    const localPath = join(channelDir, safeFilename);

    // Save file content
    const buffer = await response.arrayBuffer();
    writeFileSync(localPath, Buffer.from(buffer));

    // Create file record
    const receivedFile: ReceivedFile = {
      id: file.id,
      filename: safeFilename,
      mimetype: file.mimetype,
      size: file.size,
      localPath,
      channel: channelId,
      thread_ts: threadTs,
      uploadedBy,
      receivedAt: new Date().toISOString(),
    };

    // Update index
    const index = loadFileIndex(channelId);
    index.push(receivedFile);
    saveFileIndex(channelId, index);

    console.log(`[FileManager] Saved: ${safeFilename} (${formatBytes(file.size)})`);
    return receivedFile;
  } catch (error) {
    console.error(`[FileManager] Error saving file ${file.name}:`, error);
    return null;
  }
}

// Get a file by ID from any channel
export function getFileById(fileId: string, channelId?: string): ReceivedFile | null {
  // If channel specified, search only that channel
  if (channelId) {
    const index = loadFileIndex(channelId);
    return index.find((f) => f.id === fileId) || null;
  }

  // Search all channels
  if (!existsSync(FILES_DIR)) return null;

  const channels = readdirSync(FILES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const channel of channels) {
    const index = loadFileIndex(channel);
    const file = index.find((f) => f.id === fileId);
    if (file) return file;
  }

  return null;
}

// Get file by filename from a channel
export function getFileByName(filename: string, channelId: string): ReceivedFile | null {
  const index = loadFileIndex(channelId);
  return index.find((f) => f.filename === filename) || null;
}

// List all files for a channel
export function listChannelFiles(channelId: string): ReceivedFile[] {
  return loadFileIndex(channelId);
}

// Read file content (for text files)
export function readFileContent(file: ReceivedFile): string | null {
  try {
    if (!existsSync(file.localPath)) {
      console.error(`[FileManager] File not found: ${file.localPath}`);
      return null;
    }
    return readFileSync(file.localPath, "utf-8");
  } catch (error) {
    console.error(`[FileManager] Error reading file:`, error);
    return null;
  }
}

// Read file as buffer (for binary files)
export function readFileBuffer(file: ReceivedFile): Buffer | null {
  try {
    if (!existsSync(file.localPath)) {
      console.error(`[FileManager] File not found: ${file.localPath}`);
      return null;
    }
    return readFileSync(file.localPath);
  } catch (error) {
    console.error(`[FileManager] Error reading file:`, error);
    return null;
  }
}

// Check if file exists locally
export function fileExists(localPath: string): boolean {
  return existsSync(localPath);
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Get files directory path (for external access)
export function getFilesDir(): string {
  return FILES_DIR;
}

// Clean up old files (optional, for maintenance)
export function cleanupOldFiles(channelId: string, maxAgeDays: number = 30): number {
  const index = loadFileIndex(channelId);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  const kept = index.filter((file) => {
    const fileDate = new Date(file.receivedAt).getTime();
    if (fileDate < cutoff) {
      try {
        if (existsSync(file.localPath)) {
          const fs = require("fs");
          fs.unlinkSync(file.localPath);
        }
        removed++;
        return false;
      } catch {
        return true; // Keep in index if delete fails
      }
    }
    return true;
  });

  if (removed > 0) {
    saveFileIndex(channelId, kept);
    console.log(`[FileManager] Cleaned up ${removed} old files from ${channelId}`);
  }

  return removed;
}
