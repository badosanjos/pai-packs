#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/SlackAPI.ts
// CLI client for the Slack server HTTP API

import type { HealthResponse } from "./Types";

const BASE_URL = `http://localhost:${process.env.PAI_SLACK_PORT || 9000}`;

function printHelp(): void {
  console.log(`
Slack API CLI - HTTP client for Slack server

USAGE:
  bun run SlackAPI.ts <command> [options]

COMMANDS:
  health              Check server health and connection status
  sessions            List active thread sessions
  sessions --clear    Clear all stored sessions
  channels            List accessible Slack channels
  send                Send a message to a channel
  progress            Manage progress messages (edit-in-place updates)
  upload              Upload a file to a channel/thread
  files               List/manage received files

SEND OPTIONS:
  --channel <name>    Channel name or ID (required)
  --text <message>    Message text (required)
  --thread <ts>       Thread timestamp (optional, for replies)

UPLOAD OPTIONS:
  --channel <id>      Channel ID (required)
  --file <path>       Local file path to upload (required)
  --thread <ts>       Thread timestamp (optional, for replies)
  --title <title>     File title (optional)
  --comment <text>    Initial comment (optional)

FILES SUBCOMMANDS:
  files list          List received files for a channel
    --channel <id>    Channel ID (required)

  files info          Get info about a specific file
    --id <file_id>    File ID (required)

  files dir           Show files storage directory

PROGRESS SUBCOMMANDS:
  progress start      Start a progress message in a thread
    --channel <id>    Channel ID (required)
    --thread <ts>     Thread timestamp (required)
    --text <msg>      Initial text (optional, defaults to "Processing...")

  progress update     Update the active progress message
    --text <msg>      New text (required)

  progress clear      Clear progress tracking
  progress list       List active progress messages

EXAMPLES:
  bun run SlackAPI.ts health
  bun run SlackAPI.ts sessions
  bun run SlackAPI.ts channels
  bun run SlackAPI.ts send --channel "#general" --text "Hello!"
  bun run SlackAPI.ts upload --channel C0A63N49M2R --file ./report.md --thread 1234567890.123456
  bun run SlackAPI.ts upload --channel C0A63N49M2R --file ./data.json --title "Export Data"
  bun run SlackAPI.ts files list --channel C0A63N49M2R
  bun run SlackAPI.ts files info --id F0ABC123DEF
  bun run SlackAPI.ts files dir
  bun run SlackAPI.ts progress start --channel C0A63N49M2R --thread 1234567890.123456
  bun run SlackAPI.ts progress update --text "Analyzing files..."
`);
}

async function healthCheck(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data: HealthResponse = await response.json();

    console.log("Server Health:");
    console.log(`  Status: ${data.status}`);
    console.log(`  Port: ${data.port}`);
    console.log(`  Socket Mode: ${data.socket_mode ? "Connected" : "Disconnected"}`);
    console.log(`  Bot Token: ${data.bot_token_configured ? "Configured" : "Missing"}`);
    console.log(`  App Token: ${data.app_token_configured ? "Configured" : "Missing"}`);
    console.log(`  Active Sessions: ${data.active_sessions ?? "N/A"}`);
  } catch (error) {
    console.error("Failed to connect to server. Is it running?");
    console.error(`Tried: ${BASE_URL}/health`);
    process.exit(1);
  }
}

async function listSessions(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/sessions`);
    const data = await response.json();

    if (data.sessions && data.sessions.length > 0) {
      console.log(`Active Sessions (${data.sessions.length}):`);
      for (const session of data.sessions) {
        console.log(`  Thread: ${session.thread}`);
        console.log(`    Session ID: ${session.sessionId}`);
      }
    } else {
      console.log("No active sessions");
    }
  } catch (error) {
    console.error("Failed to fetch sessions. Is the server running?");
    process.exit(1);
  }
}

async function clearSessions(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/sessions/clear`, {
      method: "POST",
    });
    const data = await response.json();

    if (data.ok) {
      console.log("Sessions cleared successfully");
    } else {
      console.error("Failed to clear sessions:", data.error);
    }
  } catch (error) {
    console.error("Failed to clear sessions. Is the server running?");
    process.exit(1);
  }
}

async function listChannels(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/channels`);
    const data = await response.json();

    if (data.error) {
      console.error("Error:", data.error);
      process.exit(1);
    }

    if (data.channels && data.channels.length > 0) {
      console.log(`Accessible Channels (${data.channels.length}):`);
      for (const channel of data.channels) {
        console.log(`  #${channel.name} (${channel.id})`);
      }
    } else {
      console.log("No accessible channels found");
    }
  } catch (error) {
    console.error("Failed to fetch channels. Is the server running?");
    process.exit(1);
  }
}

async function sendMessage(channel: string, text: string, thread_ts?: string): Promise<void> {
  try {
    const body: { channel: string; text: string; thread_ts?: string } = {
      channel,
      text,
    };

    if (thread_ts) {
      body.thread_ts = thread_ts;
    }

    const response = await fetch(`${BASE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`Message sent successfully (ts: ${data.ts})`);
    } else {
      console.error("Failed to send message:", data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to send message. Is the server running?");
    process.exit(1);
  }
}

async function progressStart(channel: string, thread_ts: string, text?: string): Promise<void> {
  try {
    const body: { channel: string; thread_ts: string; text?: string } = {
      channel,
      thread_ts,
    };
    if (text) body.text = text;

    const response = await fetch(`${BASE_URL}/progress/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`Progress started (ts: ${data.message_ts})`);
    } else {
      console.error("Failed to start progress:", data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to start progress. Is the server running?");
    process.exit(1);
  }
}

async function progressUpdate(text: string): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/progress/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`Progress updated`);
    } else {
      console.error("Failed to update progress:", data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to update progress. Is the server running?");
    process.exit(1);
  }
}

async function progressClear(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/progress/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (data.ok) {
      console.log("Progress cleared");
    } else {
      console.error("Failed to clear progress:", data.error);
    }
  } catch (error) {
    console.error("Failed to clear progress. Is the server running?");
    process.exit(1);
  }
}

async function progressList(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/progress`);
    const data = await response.json();

    if (data.active && data.active.length > 0) {
      console.log(`Active Progress Messages (${data.active.length}):`);
      for (const p of data.active) {
        const elapsed = Math.round(p.elapsed / 1000);
        console.log(`  Thread: ${p.key}`);
        console.log(`    Message TS: ${p.message_ts}`);
        console.log(`    Elapsed: ${elapsed}s`);
      }
    } else {
      console.log("No active progress messages");
    }
  } catch (error) {
    console.error("Failed to list progress. Is the server running?");
    process.exit(1);
  }
}

// === FILE FUNCTIONS ===

async function uploadFile(
  channel: string,
  filePath: string,
  threadTs?: string,
  title?: string,
  comment?: string
): Promise<void> {
  try {
    const body: {
      channel: string;
      file_path: string;
      thread_ts?: string;
      title?: string;
      initial_comment?: string;
    } = {
      channel,
      file_path: filePath,
    };

    if (threadTs) body.thread_ts = threadTs;
    if (title) body.title = title;
    if (comment) body.initial_comment = comment;

    const response = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`File uploaded successfully`);
      if (data.file_id) console.log(`  File ID: ${data.file_id}`);
      if (data.permalink) console.log(`  Permalink: ${data.permalink}`);
    } else {
      console.error("Failed to upload file:", data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to upload file. Is the server running?");
    process.exit(1);
  }
}

async function listFiles(channelId: string): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/files/${channelId}`);
    const data = await response.json();

    if (data.ok && data.files) {
      if (data.files.length === 0) {
        console.log(`No files received in channel ${channelId}`);
        return;
      }

      console.log(`Received Files (${data.files.length}):`);
      for (const file of data.files) {
        const size = formatBytes(file.size);
        console.log(`  ${file.filename} (${size})`);
        console.log(`    ID: ${file.id}`);
        console.log(`    Type: ${file.mimetype}`);
        console.log(`    From: ${file.uploadedBy}`);
        console.log(`    Date: ${file.receivedAt}`);
        console.log(`    Path: ${file.localPath}`);
      }
    } else {
      console.error("Failed to list files:", data.error);
    }
  } catch (error) {
    console.error("Failed to list files. Is the server running?");
    process.exit(1);
  }
}

async function getFileInfo(fileId: string): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/file/${fileId}`);
    const data = await response.json();

    if (data.ok && data.file) {
      const file = data.file;
      console.log(`File: ${file.filename}`);
      console.log(`  ID: ${file.id}`);
      console.log(`  Size: ${formatBytes(file.size)}`);
      console.log(`  Type: ${file.mimetype}`);
      console.log(`  Channel: ${file.channel}`);
      console.log(`  Uploaded by: ${file.uploadedBy}`);
      console.log(`  Received: ${file.receivedAt}`);
      console.log(`  Local path: ${file.localPath}`);
    } else {
      console.error("File not found:", data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to get file info. Is the server running?");
    process.exit(1);
  }
}

async function getFilesDir(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/files/dir`);
    const data = await response.json();

    if (data.ok) {
      console.log(`Files directory: ${data.path}`);
    } else {
      console.error("Failed to get files directory");
    }
  } catch (error) {
    console.error("Failed to get files directory. Is the server running?");
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

const command = args[0];

switch (command) {
  case "health":
    await healthCheck();
    break;

  case "sessions":
    if (args.includes("--clear")) {
      await clearSessions();
    } else {
      await listSessions();
    }
    break;

  case "channels":
    await listChannels();
    break;

  case "send": {
    const channelIndex = args.indexOf("--channel");
    const textIndex = args.indexOf("--text");
    const threadIndex = args.indexOf("--thread");

    if (channelIndex === -1 || textIndex === -1) {
      console.error("Error: --channel and --text are required for send command");
      printHelp();
      process.exit(1);
    }

    const channel = args[channelIndex + 1];
    const text = args[textIndex + 1];
    const thread_ts = threadIndex !== -1 ? args[threadIndex + 1] : undefined;

    if (!channel || !text) {
      console.error("Error: channel and text values are required");
      process.exit(1);
    }

    await sendMessage(channel, text, thread_ts);
    break;
  }

  case "progress": {
    const subCommand = args[1];
    const channelIndex = args.indexOf("--channel");
    const threadIndex = args.indexOf("--thread");
    const textIndex = args.indexOf("--text");

    switch (subCommand) {
      case "start": {
        if (channelIndex === -1 || threadIndex === -1) {
          console.error("Error: --channel and --thread are required for progress start");
          printHelp();
          process.exit(1);
        }
        const channel = args[channelIndex + 1];
        const thread_ts = args[threadIndex + 1];
        const text = textIndex !== -1 ? args[textIndex + 1] : undefined;
        await progressStart(channel, thread_ts, text);
        break;
      }

      case "update": {
        if (textIndex === -1) {
          console.error("Error: --text is required for progress update");
          printHelp();
          process.exit(1);
        }
        const text = args[textIndex + 1];
        await progressUpdate(text);
        break;
      }

      case "clear":
        await progressClear();
        break;

      case "list":
        await progressList();
        break;

      default:
        console.error("Error: progress requires subcommand (start, update, clear, list)");
        printHelp();
        process.exit(1);
    }
    break;
  }

  case "upload": {
    const channelIndex = args.indexOf("--channel");
    const fileIndex = args.indexOf("--file");
    const threadIndex = args.indexOf("--thread");
    const titleIndex = args.indexOf("--title");
    const commentIndex = args.indexOf("--comment");

    if (channelIndex === -1 || fileIndex === -1) {
      console.error("Error: --channel and --file are required for upload command");
      printHelp();
      process.exit(1);
    }

    const channel = args[channelIndex + 1];
    const filePath = args[fileIndex + 1];
    const threadTs = threadIndex !== -1 ? args[threadIndex + 1] : undefined;
    const title = titleIndex !== -1 ? args[titleIndex + 1] : undefined;
    const comment = commentIndex !== -1 ? args[commentIndex + 1] : undefined;

    if (!channel || !filePath) {
      console.error("Error: channel and file values are required");
      process.exit(1);
    }

    await uploadFile(channel, filePath, threadTs, title, comment);
    break;
  }

  case "files": {
    const subCommand = args[1];
    const channelIndex = args.indexOf("--channel");
    const idIndex = args.indexOf("--id");

    switch (subCommand) {
      case "list": {
        if (channelIndex === -1) {
          console.error("Error: --channel is required for files list");
          printHelp();
          process.exit(1);
        }
        const channelId = args[channelIndex + 1];
        await listFiles(channelId);
        break;
      }

      case "info": {
        if (idIndex === -1) {
          console.error("Error: --id is required for files info");
          printHelp();
          process.exit(1);
        }
        const fileId = args[idIndex + 1];
        await getFileInfo(fileId);
        break;
      }

      case "dir":
        await getFilesDir();
        break;

      default:
        console.error("Error: files requires subcommand (list, info, dir)");
        printHelp();
        process.exit(1);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
