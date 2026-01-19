#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/TELOSBridge.ts
// Syncs extracted Slack memories to TELOS files

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getUnsyncedMemories, markAsSynced, getMemoryStats } from "./MemoryExtractor";
import type { StoredMemory, TELOSSyncResult, MemoryType } from "./Types";

const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const TELOS_DIR = join(PAI_DIR, "skills", "CORE", "USER", "TELOS");

// Map memory types to TELOS files
const TYPE_TO_FILE: Record<MemoryType, string> = {
  goal: "GOALS.md",
  fact: "LEARNED.md",
  preference: "LEARNED.md",
  challenge: "CHALLENGES.md",
  idea: "IDEAS.md",
  project: "PROJECTS.md",
};

// Map memory types to section headers in TELOS files
const TYPE_TO_SECTION: Record<MemoryType, string> = {
  goal: "## Active Goals",
  fact: "## Recent Learnings",
  preference: "## Recent Learnings",
  challenge: "## Active Challenges",
  idea: "## Recent Ideas",
  project: "## Active Projects",
};

function checkUpgradeFlag(): boolean {
  const flagPath = join(TELOS_DIR, "_UPGRADE_FLAG.md");
  if (!existsSync(flagPath)) {
    console.error("[TELOS] Upgrade flag not found. TELOS may not be properly configured.");
    console.error(`Expected: ${flagPath}`);
    return false;
  }
  return true;
}

function formatMemoryForTelos(memory: StoredMemory): string {
  const dateStr = memory.date;
  const channelShort = memory.channel.slice(-6);
  return `- [slack] ${memory.content} _(${dateStr}, ${channelShort})_`;
}

function appendToTelosFile(filename: string, section: string, entry: string): boolean {
  const filePath = join(TELOS_DIR, filename);

  if (!existsSync(filePath)) {
    console.error(`[TELOS] File not found: ${filePath}`);
    return false;
  }

  try {
    let content = readFileSync(filePath, "utf-8");

    // Find the section and insert after it
    const sectionIndex = content.indexOf(section);
    if (sectionIndex === -1) {
      console.error(`[TELOS] Section "${section}" not found in ${filename}`);
      return false;
    }

    // Find the next line after the section header
    const sectionEnd = content.indexOf("\n", sectionIndex);
    if (sectionEnd === -1) {
      // Section is at end of file
      content = content + "\n" + entry;
    } else {
      // Insert after section header (and any blank line)
      let insertPos = sectionEnd + 1;
      // Skip blank lines after header
      while (content[insertPos] === "\n") {
        insertPos++;
      }
      // Skip comment lines
      while (content.slice(insertPos, insertPos + 4) === "<!--") {
        const commentEnd = content.indexOf("-->", insertPos);
        if (commentEnd === -1) break;
        insertPos = commentEnd + 3;
        while (content[insertPos] === "\n") {
          insertPos++;
        }
      }

      content = content.slice(0, insertPos) + entry + "\n" + content.slice(insertPos);
    }

    writeFileSync(filePath, content);
    return true;
  } catch (e) {
    console.error(`[TELOS] Error writing to ${filename}:`, e);
    return false;
  }
}

export function syncToTelos(memories?: StoredMemory[]): TELOSSyncResult {
  const result: TELOSSyncResult = { synced: 0, skipped: 0, errors: [] };

  // Check upgrade flag
  if (!checkUpgradeFlag()) {
    result.errors.push("TELOS upgrade flag not found");
    return result;
  }

  // Get memories to sync
  const toSync = memories || getUnsyncedMemories();

  if (toSync.length === 0) {
    console.log("[TELOS] No memories to sync");
    return result;
  }

  console.log(`[TELOS] Syncing ${toSync.length} memories...`);

  const syncedIds: string[] = [];

  for (const memory of toSync) {
    const filename = TYPE_TO_FILE[memory.type];
    const section = TYPE_TO_SECTION[memory.type];

    if (!filename || !section) {
      result.skipped++;
      continue;
    }

    const entry = formatMemoryForTelos(memory);
    const success = appendToTelosFile(filename, section, entry);

    if (success) {
      result.synced++;
      syncedIds.push(memory.id);
      console.log(`[TELOS] Synced to ${filename}: ${memory.content.slice(0, 40)}...`);
    } else {
      result.errors.push(`Failed to sync: ${memory.content.slice(0, 40)}...`);
    }
  }

  // Mark as synced
  if (syncedIds.length > 0) {
    markAsSynced(syncedIds);
  }

  return result;
}

export function exportForMigration(): string {
  const memories = getUnsyncedMemories();
  const synced = getMemoryStats();

  const exportData = {
    exportDate: new Date().toISOString(),
    paiVersion: "1.4.0",
    stats: synced,
    memories: memories,
  };

  const exportPath = join(PAI_DIR, "skills", "Slack", "State", "telos-export.json");
  writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

  console.log(`[TELOS] Exported ${memories.length} memories to ${exportPath}`);
  return exportPath;
}

function printHelp(): void {
  console.log(`
TELOS Bridge - Sync Slack memories to TELOS

USAGE:
  bun run TELOSBridge.ts [command]

COMMANDS:
  sync      Sync unsynced memories to TELOS files (default)
  status    Show sync status
  export    Export memories for future migration
  help      Show this help

TELOS FILES:
  goals      → GOALS.md
  facts      → LEARNED.md
  challenges → CHALLENGES.md
  ideas      → IDEAS.md
  projects   → PROJECTS.md

NOTES:
  - Only memories with confidence >= 0.8 are synced
  - Entries are tagged with [slack] for future migration
  - See _UPGRADE_FLAG.md for migration instructions
`);
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "sync";

  switch (command) {
    case "sync": {
      const result = syncToTelos();
      console.log("\nSync complete:");
      console.log(`  Synced: ${result.synced}`);
      console.log(`  Skipped: ${result.skipped}`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
        for (const err of result.errors) {
          console.log(`    - ${err}`);
        }
      }
      break;
    }

    case "status": {
      const stats = getMemoryStats();
      console.log("TELOS Sync Status:");
      console.log(`  Total memories: ${stats.total}`);
      console.log(`  Unsynced: ${stats.unsynced}`);
      console.log(`  By type:`);
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`    ${type}: ${count}`);
      }

      // Check TELOS files
      console.log("\nTELOS files:");
      for (const file of Object.values(TYPE_TO_FILE)) {
        const exists = existsSync(join(TELOS_DIR, file));
        console.log(`  ${file}: ${exists ? "✓" : "✗"}`);
      }
      break;
    }

    case "export": {
      const path = exportForMigration();
      console.log(`Export saved to: ${path}`);
      break;
    }

    case "help":
    default:
      printHelp();
  }
}
