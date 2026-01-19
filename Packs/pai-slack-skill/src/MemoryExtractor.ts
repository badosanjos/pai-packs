#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/MemoryExtractor.ts
// Extracts memories from Slack conversations using explicit triggers

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  MemoryExtraction,
  ExtractionResult,
  StoredMemory,
  MemoryStore,
  MemoryType,
  MemoryCategory,
} from "./Types";

const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "Slack");
const MEMORY_DIR = join(SKILL_DIR, "State", "memory");

// Ensure memory directory exists
if (!existsSync(MEMORY_DIR)) {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

// Explicit trigger patterns (high confidence)
const EXPLICIT_PATTERNS: Array<{
  pattern: RegExp;
  type: MemoryType;
  extractor: (match: RegExpMatchArray) => Partial<MemoryExtraction>;
}> = [
  // Goals
  {
    pattern: /goal[:\s]+(.+)/i,
    type: "goal",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.95 }),
  },
  {
    pattern: /my (?:new )?goal is[:\s]+(.+)/i,
    type: "goal",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.9 }),
  },
  {
    pattern: /i want to[:\s]+(.+)/i,
    type: "goal",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.7 }),
  },

  // Facts / Remember
  {
    pattern: /remember[:\s]+(.+)/i,
    type: "fact",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.95 }),
  },
  {
    pattern: /fact[:\s]+(.+)/i,
    type: "fact",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.95 }),
  },
  {
    pattern: /note[:\s]+(.+)/i,
    type: "fact",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.85 }),
  },

  // Challenges
  {
    pattern: /challenge[:\s]+(.+)/i,
    type: "challenge",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.95 }),
  },
  {
    pattern: /struggling with[:\s]+(.+)/i,
    type: "challenge",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.85 }),
  },
  {
    pattern: /having trouble with[:\s]+(.+)/i,
    type: "challenge",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.8 }),
  },

  // Ideas
  {
    pattern: /idea[:\s]+(.+)/i,
    type: "idea",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.95 }),
  },
  {
    pattern: /what if[:\s]+(.+)/i,
    type: "idea",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.7 }),
  },

  // Projects
  {
    pattern: /project[:\s]+(.+)/i,
    type: "project",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.95 }),
  },
  {
    pattern: /working on[:\s]+(.+)/i,
    type: "project",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.8 }),
  },

  // Preferences
  {
    pattern: /i prefer[:\s]+(.+)/i,
    type: "preference",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.85 }),
  },
  {
    pattern: /i like[:\s]+(.+)/i,
    type: "preference",
    extractor: (m) => ({ content: m[1].trim(), confidence: 0.7 }),
  },
];

// Category detection keywords
const CATEGORY_KEYWORDS: Record<MemoryCategory, string[]> = {
  health: ["health", "exercise", "workout", "diet", "sleep", "meditation", "gym", "weight", "fitness", "running"],
  work: ["work", "job", "career", "project", "deadline", "meeting", "office", "colleague", "client", "business"],
  family: ["family", "kids", "children", "wife", "husband", "spouse", "parent", "daughter", "son", "mother", "father"],
  learning: ["learn", "study", "read", "book", "course", "skill", "tutorial", "training", "education"],
  finance: ["money", "budget", "savings", "investment", "financial", "income", "expense", "bank", "crypto"],
  relationships: ["friend", "relationship", "partner", "dating", "social", "network", "community"],
  spirituality: ["meditation", "prayer", "spiritual", "mindfulness", "gratitude", "faith", "soul"],
  routine: ["morning", "evening", "daily", "routine", "habit", "schedule", "ritual"],
  technical: ["code", "programming", "software", "api", "database", "server", "bug", "feature", "deploy"],
  general: [],
};

// Categories that should sync to TELOS by default
const TELOS_SYNC_CATEGORIES: MemoryCategory[] = ["health", "work", "family", "learning", "finance"];

function detectCategory(text: string): MemoryCategory {
  const lowerText = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "general") continue;
    if (keywords.some((kw) => lowerText.includes(kw))) {
      return category as MemoryCategory;
    }
  }
  return "general";
}

function generateId(): string {
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function extractMemories(userMessage: string): ExtractionResult {
  const extractions: MemoryExtraction[] = [];
  const needsConfirmation: MemoryExtraction[] = [];

  for (const { pattern, type, extractor } of EXPLICIT_PATTERNS) {
    const match = userMessage.match(pattern);
    if (match) {
      const extracted = extractor(match);
      const category = detectCategory(extracted.content || "");
      const extraction: MemoryExtraction = {
        type,
        content: extracted.content || "",
        category,
        confidence: extracted.confidence || 0.8,
        raw: match[0],
        subject: extracted.subject,
        syncToTelos: TELOS_SYNC_CATEGORIES.includes(category),
      };

      if (extraction.confidence >= 0.8) {
        extractions.push(extraction);
      } else {
        needsConfirmation.push(extraction);
      }
    }
  }

  return { extractions, needsConfirmation };
}

function loadMemoryStore(): MemoryStore {
  const storePath = join(MEMORY_DIR, "store.json");
  if (existsSync(storePath)) {
    try {
      return JSON.parse(readFileSync(storePath, "utf-8"));
    } catch (e) {
      console.error("[Memory] Error loading store:", e);
    }
  }
  return { goals: [], facts: [], challenges: [], ideas: [], projects: [] };
}

function saveMemoryStore(store: MemoryStore): void {
  const storePath = join(MEMORY_DIR, "store.json");
  writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function storeExtraction(
  extraction: MemoryExtraction,
  channelId: string,
  userId: string
): StoredMemory {
  const store = loadMemoryStore();

  const memory: StoredMemory = {
    id: generateId(),
    type: extraction.type,
    content: extraction.content,
    category: extraction.category || "general",
    source: `slack:${channelId}`,
    channel: channelId,
    userId,
    date: new Date().toISOString().split("T")[0],
    confidence: extraction.confidence,
    syncedToTelos: false,
  };

  // Add to appropriate array, avoiding duplicates
  const targetArray = getTargetArray(store, extraction.type);
  const isDuplicate = targetArray.some(
    (m) => m.content.toLowerCase() === memory.content.toLowerCase()
  );

  if (!isDuplicate) {
    targetArray.push(memory);
    saveMemoryStore(store);
    console.log(`[Memory] Stored ${extraction.type}: "${memory.content.slice(0, 50)}..."`);
  } else {
    console.log(`[Memory] Skipped duplicate: "${memory.content.slice(0, 50)}..."`);
  }

  return memory;
}

function getTargetArray(store: MemoryStore, type: MemoryType): StoredMemory[] {
  switch (type) {
    case "goal":
      return store.goals;
    case "fact":
    case "preference":
      return store.facts;
    case "challenge":
      return store.challenges;
    case "idea":
      return store.ideas;
    case "project":
      return store.projects;
    default:
      return store.facts;
  }
}

export function processMessage(
  userMessage: string,
  channelId: string,
  userId: string
): { stored: StoredMemory[]; needsConfirmation: MemoryExtraction[] } {
  const result = extractMemories(userMessage);
  const stored: StoredMemory[] = [];

  for (const extraction of result.extractions) {
    const memory = storeExtraction(extraction, channelId, userId);
    stored.push(memory);
  }

  return { stored, needsConfirmation: result.needsConfirmation };
}

export function getUnsyncedMemories(): StoredMemory[] {
  const store = loadMemoryStore();
  const all = [
    ...store.goals,
    ...store.facts,
    ...store.challenges,
    ...store.ideas,
    ...store.projects,
  ];
  return all.filter((m) => !m.syncedToTelos);
}

export function markAsSynced(ids: string[]): void {
  const store = loadMemoryStore();
  const now = new Date().toISOString().split("T")[0];

  const markInArray = (arr: StoredMemory[]) => {
    for (const memory of arr) {
      if (ids.includes(memory.id)) {
        memory.syncedToTelos = true;
        memory.telosSyncDate = now;
      }
    }
  };

  markInArray(store.goals);
  markInArray(store.facts);
  markInArray(store.challenges);
  markInArray(store.ideas);
  markInArray(store.projects);

  saveMemoryStore(store);
}

export function getMemoryStats(): {
  total: number;
  byType: Record<string, number>;
  unsynced: number;
} {
  const store = loadMemoryStore();
  const all = [
    ...store.goals,
    ...store.facts,
    ...store.challenges,
    ...store.ideas,
    ...store.projects,
  ];

  return {
    total: all.length,
    byType: {
      goals: store.goals.length,
      facts: store.facts.length,
      challenges: store.challenges.length,
      ideas: store.ideas.length,
      projects: store.projects.length,
    },
    unsynced: all.filter((m) => !m.syncedToTelos).length,
  };
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "stats" || !command) {
    const stats = getMemoryStats();
    console.log("Memory Statistics:");
    console.log(`  Total: ${stats.total}`);
    console.log(`  Goals: ${stats.byType.goals}`);
    console.log(`  Facts: ${stats.byType.facts}`);
    console.log(`  Challenges: ${stats.byType.challenges}`);
    console.log(`  Ideas: ${stats.byType.ideas}`);
    console.log(`  Projects: ${stats.byType.projects}`);
    console.log(`  Unsynced to TELOS: ${stats.unsynced}`);
  } else if (command === "unsynced") {
    const unsynced = getUnsyncedMemories();
    console.log(`Unsynced memories (${unsynced.length}):`);
    for (const m of unsynced) {
      console.log(`  [${m.type}] ${m.content.slice(0, 60)}...`);
    }
  } else if (command === "test") {
    const testMessage = args.slice(1).join(" ") || "goal: test the memory extraction system";
    console.log(`Testing extraction on: "${testMessage}"`);
    const result = extractMemories(testMessage);
    console.log("Extractions:", JSON.stringify(result.extractions, null, 2));
    console.log("Needs confirmation:", JSON.stringify(result.needsConfirmation, null, 2));
  } else {
    console.log(`
Memory Extractor - Slack Memory System

USAGE:
  bun run MemoryExtractor.ts [command]

COMMANDS:
  stats     Show memory statistics (default)
  unsynced  List memories not yet synced to TELOS
  test <msg>  Test extraction on a message

EXAMPLES:
  bun run MemoryExtractor.ts stats
  bun run MemoryExtractor.ts test "goal: lose 10kg by March"
`);
  }
}
