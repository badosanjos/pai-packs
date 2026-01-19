#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/ContextBuilder.ts
// Builds context for Claude prompt injection

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ContextData, UserProfile, StoredMemory, ChannelConfig } from "./Types";
import { loadProfile, getOwnerProfile } from "./ProfileManager";
import { getChannelConfig } from "./ChannelManager";
import { getMemoryStats } from "./MemoryExtractor";

const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const TELOS_DIR = join(PAI_DIR, "skills", "CORE", "USER", "TELOS");
const MEMORY_STORE = join(PAI_DIR, "skills", "Slack", "State", "memory", "store.json");

// === TELOS Goals Loading ===

function loadTelosGoals(): string[] {
  const goalsPath = join(TELOS_DIR, "GOALS.md");
  const goals: string[] = [];

  if (!existsSync(goalsPath)) return goals;

  try {
    const content = readFileSync(goalsPath, "utf-8");
    const lines = content.split("\n");

    // Find "## Active Goals" section and extract bullet points
    let inActiveSection = false;
    for (const line of lines) {
      if (line.startsWith("## Active Goals")) {
        inActiveSection = true;
        continue;
      }
      if (line.startsWith("## ") && inActiveSection) {
        break; // Hit next section
      }
      if (inActiveSection && line.startsWith("- ")) {
        const goal = line.slice(2).trim();
        if (goal && !goal.startsWith("<!--")) {
          goals.push(goal);
        }
      }
    }
  } catch (e) {
    console.error("[Context] Error loading TELOS goals:", e);
  }

  return goals;
}

// === Memory Store Loading ===

function loadRecentMemories(channelId?: string): string[] {
  const memories: string[] = [];

  if (!existsSync(MEMORY_STORE)) return memories;

  try {
    const store = JSON.parse(readFileSync(MEMORY_STORE, "utf-8"));
    const all: StoredMemory[] = [
      ...(store.goals || []),
      ...(store.facts || []),
      ...(store.challenges || []),
      ...(store.ideas || []),
      ...(store.projects || []),
    ];

    // Filter by channel if specified, sort by date, take last 5
    let filtered = channelId
      ? all.filter((m) => m.channel === channelId)
      : all;

    filtered = filtered
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    for (const m of filtered) {
      memories.push(`[${m.type}] ${m.content}`);
    }
  } catch (e) {
    console.error("[Context] Error loading memories:", e);
  }

  return memories;
}

// === Context Building ===

export function buildContext(channelId: string, userId: string): ContextData {
  const context: ContextData = {};

  // 1. Load owner profile if user is owner
  const ownerProfile = getOwnerProfile();
  if (ownerProfile && (userId === ownerProfile.id || ownerProfile.role === "owner")) {
    context.profile = {
      name: ownerProfile.name,
      notes: ownerProfile.notes.slice(-5), // Last 5 notes
    };
  } else {
    // Load participant profile
    const profile = loadProfile(userId);
    if (profile && profile.notes.length > 0) {
      context.profile = {
        name: profile.name,
        notes: profile.notes.slice(-3),
      };
    }
  }

  // 2. Load TELOS goals
  const goals = loadTelosGoals();
  if (goals.length > 0) {
    context.goals = goals.slice(0, 5); // Top 5 goals
  }

  // 3. Load channel-specific context
  const channelConfig = getChannelConfig(channelId);
  if (channelConfig?.description) {
    context.channelContext = [`Channel: ${channelConfig.description}`];
  }

  // 4. Load recent memories from this channel
  const memories = loadRecentMemories(channelId);
  if (memories.length > 0) {
    context.recentMemories = memories;
  }

  return context;
}

export function formatContextForClaude(context: ContextData): string {
  const sections: string[] = [];

  // Profile section
  if (context.profile) {
    sections.push(`## Personal Context`);
    sections.push("");
    sections.push(`**About ${context.profile.name}:**`);
    for (const note of context.profile.notes) {
      sections.push(`- ${note}`);
    }
    sections.push("");
  }

  // Goals section
  if (context.goals && context.goals.length > 0) {
    sections.push(`**Active Goals:**`);
    for (const goal of context.goals) {
      sections.push(`- ${goal}`);
    }
    sections.push("");
  }

  // Channel context
  if (context.channelContext && context.channelContext.length > 0) {
    sections.push(`**Channel Notes:**`);
    for (const note of context.channelContext) {
      sections.push(`- ${note}`);
    }
    sections.push("");
  }

  // Recent memories
  if (context.recentMemories && context.recentMemories.length > 0) {
    sections.push(`**Recent Context:**`);
    for (const memory of context.recentMemories) {
      sections.push(`- ${memory}`);
    }
    sections.push("");
  }

  if (sections.length === 0) {
    return "";
  }

  sections.push("---");
  sections.push("");

  return sections.join("\n");
}

// === CLI Interface ===

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "build": {
      const channelId = args[1] || "test-channel";
      const userId = args[2] || "owner";
      const context = buildContext(channelId, userId);
      console.log("Context Data:");
      console.log(JSON.stringify(context, null, 2));
      console.log("\nFormatted for Claude:");
      console.log(formatContextForClaude(context));
      break;
    }

    case "goals": {
      const goals = loadTelosGoals();
      console.log(`TELOS Goals (${goals.length}):`);
      for (const g of goals) {
        console.log(`  - ${g}`);
      }
      break;
    }

    case "memories": {
      const channelId = args[1];
      const memories = loadRecentMemories(channelId);
      console.log(`Recent Memories${channelId ? ` (${channelId})` : ""}:`);
      for (const m of memories) {
        console.log(`  ${m}`);
      }
      break;
    }

    default:
      console.log(`
Context Builder - Claude Prompt Context Injection

USAGE:
  bun run ContextBuilder.ts [command]

COMMANDS:
  build [channel_id] [user_id]  Build and display context
  goals                          Show TELOS goals
  memories [channel_id]          Show recent memories

CONTEXT SOURCES:
  1. Owner/User profile (notes, preferences)
  2. TELOS goals (from GOALS.md)
  3. Channel description
  4. Recent memories from store.json

OUTPUT:
  Markdown formatted for Claude prompt injection
`);
  }
}
