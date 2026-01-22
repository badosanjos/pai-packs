#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/AutoMemoryExtractor.ts
// Automatic memory extraction from Slack threads - runs periodically or on session end

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "Slack");
const STATE_DIR = join(SKILL_DIR, "State");
const MEMORY_DIR = join(STATE_DIR, "memory");
const HISTORY_DIR = join(STATE_DIR, "history");

// Ensure directories exist
[MEMORY_DIR, HISTORY_DIR].forEach((dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Load .env for Slack token
async function loadEnv(): Promise<void> {
  const envPath = join(PAI_DIR, ".env");
  if (existsSync(envPath)) {
    const envContent = await Bun.file(envPath).text();
    envContent.split("\n").forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

interface SlackMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string;
  thread_ts?: string;
}

interface ExtractionState {
  lastExtraction: Record<string, string>; // threadKey -> ISO timestamp
  lastFullExtraction: string; // ISO timestamp of last full extraction run
}

// State file for tracking extractions
const EXTRACTION_STATE_FILE = join(MEMORY_DIR, "extraction-state.json");

function loadExtractionState(): ExtractionState {
  if (existsSync(EXTRACTION_STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(EXTRACTION_STATE_FILE, "utf-8"));
    } catch (e) {
      console.error("[AutoExtract] Error loading state:", e);
    }
  }
  return { lastExtraction: {}, lastFullExtraction: "" };
}

function saveExtractionState(state: ExtractionState): void {
  writeFileSync(EXTRACTION_STATE_FILE, JSON.stringify(state, null, 2));
}

export function getLastExtractionTime(threadKey: string): string | null {
  const state = loadExtractionState();
  return state.lastExtraction[threadKey] || null;
}

export function setLastExtractionTime(threadKey: string, time: string): void {
  const state = loadExtractionState();
  state.lastExtraction[threadKey] = time;
  saveExtractionState(state);
}

// Fetch thread history from Slack API
export async function fetchThreadHistory(
  channel: string,
  threadTs: string
): Promise<SlackMessage[]> {
  await loadEnv();
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN not configured");
  }

  const url = new URL("https://slack.com/api/conversations.replies");
  url.searchParams.set("channel", channel);
  url.searchParams.set("ts", threadTs);
  url.searchParams.set("limit", "200");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return data.messages || [];
}

// Get user display name
async function getUserName(userId: string): Promise<string> {
  await loadEnv();
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return userId;

  try {
    const response = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();
    if (data.ok && data.user) {
      return data.user.real_name || data.user.name || userId;
    }
  } catch (e) {
    // Ignore errors
  }
  return userId;
}

// Format messages for storage
async function formatThread(messages: SlackMessage[]): Promise<string> {
  const userCache = new Map<string, string>();
  const lines: string[] = [];

  for (const msg of messages) {
    if (!msg.text) continue;

    let speaker = "Unknown";
    if (msg.bot_id) {
      speaker = "Kai";
    } else if (msg.user) {
      if (!userCache.has(msg.user)) {
        userCache.set(msg.user, await getUserName(msg.user));
      }
      speaker = userCache.get(msg.user) || msg.user;
    }

    // Clean Slack formatting
    let text = msg.text
      .replace(/<@[A-Z0-9]+>/g, "@user")
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
      .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
      .replace(/<([^>]+)>/g, "$1");

    lines.push(`[${speaker}]: ${text}`);
  }

  return lines.join("\n\n");
}

// Extract key information from conversation using pattern matching
function extractKeyInfo(formatted: string): {
  facts: string[];
  goals: string[];
  challenges: string[];
  decisions: string[];
} {
  const facts: string[] = [];
  const goals: string[] = [];
  const challenges: string[] = [];
  const decisions: string[] = [];

  const lines = formatted.split("\n");

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Skip Kai's responses for extraction (we want user's words)
    if (line.startsWith("[Kai]:")) continue;

    // Goals patterns
    if (
      lowerLine.includes("i want to") ||
      lowerLine.includes("my goal") ||
      lowerLine.includes("i need to") ||
      lowerLine.includes("i will")
    ) {
      const match = line.match(/\[.*?\]:\s*(.+)/);
      if (match && match[1].length > 20) {
        goals.push(match[1].trim());
      }
    }

    // Challenges patterns
    if (
      lowerLine.includes("struggling") ||
      lowerLine.includes("problem") ||
      lowerLine.includes("difficult") ||
      lowerLine.includes("challenge") ||
      lowerLine.includes("hard to")
    ) {
      const match = line.match(/\[.*?\]:\s*(.+)/);
      if (match && match[1].length > 20) {
        challenges.push(match[1].trim());
      }
    }

    // Facts/personal info patterns
    if (
      lowerLine.includes("i am") ||
      lowerLine.includes("i have") ||
      lowerLine.includes("my ") ||
      lowerLine.includes("i work") ||
      lowerLine.includes("i live")
    ) {
      const match = line.match(/\[.*?\]:\s*(.+)/);
      if (match && match[1].length > 15 && match[1].length < 500) {
        facts.push(match[1].trim());
      }
    }

    // Decisions patterns
    if (
      lowerLine.includes("i decided") ||
      lowerLine.includes("let's do") ||
      lowerLine.includes("ok,") ||
      lowerLine.includes("yes,") ||
      lowerLine.includes("i prefer")
    ) {
      const match = line.match(/\[.*?\]:\s*(.+)/);
      if (match && match[1].length > 10) {
        decisions.push(match[1].trim());
      }
    }
  }

  return { facts, goals, challenges, decisions };
}

// Save extracted thread to history
function saveThreadHistory(
  channel: string,
  threadTs: string,
  messages: SlackMessage[],
  formatted: string
): void {
  const filename = `${channel}_${threadTs}.json`;
  const filepath = join(HISTORY_DIR, filename);

  const data = {
    channel,
    thread_ts: threadTs,
    messageCount: messages.length,
    fetchedAt: new Date().toISOString(),
    formatted,
  };

  writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Main extraction function for a single thread
export async function extractAndSaveMemories(
  channel: string,
  threadTs: string
): Promise<{ extracted: number; saved: boolean }> {
  try {
    const messages = await fetchThreadHistory(channel, threadTs);
    if (messages.length < 2) {
      return { extracted: 0, saved: false };
    }

    const formatted = await formatThread(messages);
    const keyInfo = extractKeyInfo(formatted);

    // Save thread history
    saveThreadHistory(channel, threadTs, messages, formatted);

    // Count extracted items
    const extracted =
      keyInfo.facts.length +
      keyInfo.goals.length +
      keyInfo.challenges.length +
      keyInfo.decisions.length;

    // Update extraction state
    const threadKey = `${channel}_${threadTs}`;
    setLastExtractionTime(threadKey, new Date().toISOString());

    console.log(
      `[AutoExtract] Thread ${channel}/${threadTs}: ${messages.length} msgs, ${extracted} items extracted`
    );

    return { extracted, saved: true };
  } catch (e: any) {
    console.error(`[AutoExtract] Error on ${channel}/${threadTs}:`, e.message);
    return { extracted: 0, saved: false };
  }
}

// Load thread sessions
function loadThreadSessions(): Record<string, any> {
  const sessionsFile = join(STATE_DIR, "sessions", "thread-sessions.json");
  if (existsSync(sessionsFile)) {
    try {
      return JSON.parse(readFileSync(sessionsFile, "utf-8"));
    } catch (e) {
      return {};
    }
  }
  return {};
}

// Run extraction on all active threads
export async function runPeriodicExtraction(): Promise<{
  threadsProcessed: number;
  totalExtracted: number;
}> {
  const sessions = loadThreadSessions();
  const state = loadExtractionState();
  const now = new Date();
  let threadsProcessed = 0;
  let totalExtracted = 0;

  console.log(`[AutoExtract] Running periodic extraction on ${Object.keys(sessions).length} threads`);

  for (const [key] of Object.entries(sessions)) {
    const [channel, threadTs] = key.split("_");

    // Check if we've extracted this thread recently (within 1 hour)
    const lastExtraction = state.lastExtraction[key];
    if (lastExtraction) {
      const lastTime = new Date(lastExtraction);
      const hoursSince = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 1) {
        continue; // Skip recently extracted threads
      }
    }

    const result = await extractAndSaveMemories(channel, threadTs);
    if (result.saved) {
      threadsProcessed++;
      totalExtracted += result.extracted;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Update full extraction timestamp (reload state to get latest per-thread timestamps)
  const updatedState = loadExtractionState();
  updatedState.lastFullExtraction = now.toISOString();
  saveExtractionState(updatedState);

  console.log(
    `[AutoExtract] Complete: ${threadsProcessed} threads, ${totalExtracted} items extracted`
  );

  return { threadsProcessed, totalExtracted };
}

// Start periodic extraction timer (runs every hour)
let extractionInterval: Timer | null = null;

export function startPeriodicExtraction(intervalMs: number = 60 * 60 * 1000): void {
  if (extractionInterval) {
    clearInterval(extractionInterval);
  }

  console.log(`[AutoExtract] Starting periodic extraction every ${intervalMs / 1000 / 60} minutes`);

  // Run immediately on start
  runPeriodicExtraction().catch(console.error);

  // Then run periodically
  extractionInterval = setInterval(() => {
    runPeriodicExtraction().catch(console.error);
  }, intervalMs);
}

export function stopPeriodicExtraction(): void {
  if (extractionInterval) {
    clearInterval(extractionInterval);
    extractionInterval = null;
    console.log("[AutoExtract] Stopped periodic extraction");
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "run" || !command) {
    console.log("Running extraction on all threads...");
    runPeriodicExtraction().then((result) => {
      console.log(`Done: ${result.threadsProcessed} threads, ${result.totalExtracted} items`);
    });
  } else if (command === "thread") {
    const channel = args[1];
    const threadTs = args[2];
    if (!channel || !threadTs) {
      console.error("Usage: AutoMemoryExtractor.ts thread <channel> <thread_ts>");
      process.exit(1);
    }
    extractAndSaveMemories(channel, threadTs).then((result) => {
      console.log(`Extracted ${result.extracted} items`);
    });
  } else if (command === "status") {
    const state = loadExtractionState();
    console.log("Extraction State:");
    console.log(`  Last full run: ${state.lastFullExtraction || "Never"}`);
    console.log(`  Threads tracked: ${Object.keys(state.lastExtraction).length}`);
    for (const [key, time] of Object.entries(state.lastExtraction)) {
      console.log(`    ${key}: ${time}`);
    }
  } else {
    console.log(`
Auto Memory Extractor - Automatic memory extraction from Slack threads

USAGE:
  bun run AutoMemoryExtractor.ts [command]

COMMANDS:
  run           Extract from all active threads (default)
  thread <ch> <ts>  Extract from a specific thread
  status        Show extraction state

EXAMPLES:
  bun run AutoMemoryExtractor.ts run
  bun run AutoMemoryExtractor.ts thread C0A6ZLP2G5D 1767876869.211069
  bun run AutoMemoryExtractor.ts status
`);
  }
}
