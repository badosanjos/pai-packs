#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/ChannelManager.ts
// Manages channel configuration and onboarding flow

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  ChannelType,
  ChannelConfig,
  ChannelIndex,
  OnboardingState,
  OnboardingResult,
} from "./Types";

const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "Slack");
const STATE_DIR = join(SKILL_DIR, "State");
const CHANNELS_DIR = join(STATE_DIR, "channels");

// Ensure directories exist
if (!existsSync(CHANNELS_DIR)) {
  mkdirSync(CHANNELS_DIR, { recursive: true });
}

// In-memory onboarding state (per channel)
const onboardingStates = new Map<string, OnboardingState>();

// === Index Operations ===

export function loadChannelIndex(): ChannelIndex {
  const indexPath = join(CHANNELS_DIR, "index.json");
  try {
    if (existsSync(indexPath)) {
      return JSON.parse(readFileSync(indexPath, "utf-8"));
    }
  } catch (e) {
    console.error("[Channel] Error loading index:", e);
  }
  return { channels: {}, lastUpdated: new Date().toISOString() };
}

export function saveChannelIndex(index: ChannelIndex): void {
  const indexPath = join(CHANNELS_DIR, "index.json");
  index.lastUpdated = new Date().toISOString();
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

// === Config Operations ===

export function getChannelConfig(channelId: string): ChannelConfig | null {
  const configPath = join(CHANNELS_DIR, `${channelId}.json`);
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    console.error(`[Channel] Error loading config for ${channelId}:`, e);
  }
  return null;
}

export function saveChannelConfig(config: ChannelConfig): void {
  const configPath = join(CHANNELS_DIR, `${config.id}.json`);
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Update index
  const index = loadChannelIndex();
  index.channels[config.id] = {
    name: config.name,
    type: config.type,
    configured: true,
  };
  saveChannelIndex(index);

  console.log(`[Channel] Saved config for ${config.id} (${config.type})`);
}

export function isChannelConfigured(channelId: string): boolean {
  const configPath = join(CHANNELS_DIR, `${channelId}.json`);
  return existsSync(configPath);
}

// === Onboarding ===

export function isOnboarding(channelId: string): boolean {
  return onboardingStates.has(channelId);
}

export function startOnboarding(channelId: string): string {
  onboardingStates.set(channelId, {
    channelId,
    step: 0,
    answers: { id: channelId },
    startedAt: new Date().toISOString(),
  });

  return `Hey! I've been added to this channel. Let me set things up.

*What type of channel is this?*
1. **Personal** - Private conversations, personal growth, life topics
2. **Project** - Linked to a specific codebase or project
3. **Team** - Collaboration with multiple people

Reply with a number (1-3) or the type name.`;
}

export function processOnboardingStep(
  channelId: string,
  response: string
): OnboardingResult {
  const state = onboardingStates.get(channelId);
  if (!state) {
    return { message: "No onboarding in progress.", complete: false };
  }

  const normalized = response.toLowerCase().trim();

  switch (state.step) {
    case 0: // Channel type
      return handleTypeStep(state, normalized);

    case 1: // Memory enabled
      return handleMemoryStep(state, normalized);

    case 2: // Description
      return handleDescriptionStep(state, response.trim());

    default:
      onboardingStates.delete(channelId);
      return {
        message: "Something went wrong. Let me know if you want to reconfigure.",
        complete: false,
      };
  }
}

function handleTypeStep(
  state: OnboardingState,
  response: string
): OnboardingResult {
  const typeMap: Record<string, ChannelType> = {
    "1": "personal",
    "2": "project",
    "3": "team",
    personal: "personal",
    project: "project",
    team: "team",
  };

  const channelType = typeMap[response];
  if (!channelType) {
    return {
      message: "Please reply with 1, 2, 3 or: personal, project, team",
      complete: false,
    };
  }

  state.answers.type = channelType;
  state.step = 1;

  return {
    message: `Got it - *${channelType}* channel.

*Should I remember facts and context from our conversations here?*
1. **Yes** - I'll track important info, goals, and learnings
2. **No** - Keep conversations ephemeral

Reply with 1 or 2.`,
    complete: false,
  };
}

function handleMemoryStep(
  state: OnboardingState,
  response: string
): OnboardingResult {
  const memoryEnabled = ["1", "yes", "y"].includes(response);
  const memoryDisabled = ["2", "no", "n"].includes(response);

  if (!memoryEnabled && !memoryDisabled) {
    return { message: "Please reply with 1 (Yes) or 2 (No).", complete: false };
  }

  state.answers.memoryEnabled = memoryEnabled;

  // Set defaults based on channel type and memory setting
  if (memoryEnabled) {
    // Personal channels sync to TELOS by default
    state.answers.syncToTelos = state.answers.type === "personal";
    state.answers.contextInjection = true;
  } else {
    state.answers.syncToTelos = false;
    state.answers.contextInjection = false;
  }

  state.step = 2;

  return {
    message: `*Give this channel a short description* (or reply "skip"):`,
    complete: false,
  };
}

function handleDescriptionStep(
  state: OnboardingState,
  response: string
): OnboardingResult {
  const description = response.toLowerCase() === "skip" ? "" : response;

  // Build final config
  const config: ChannelConfig = {
    id: state.channelId,
    name: `channel-${state.channelId.slice(-6)}`, // Will be updated with actual name
    type: state.answers.type || "personal",
    description,
    memoryEnabled: state.answers.memoryEnabled ?? true,
    syncToTelos: state.answers.syncToTelos ?? false,
    contextInjection: state.answers.contextInjection ?? true,
    created: new Date().toISOString().split("T")[0],
    participants: [],
  };

  // Clean up
  onboardingStates.delete(state.channelId);

  const syncInfo = config.syncToTelos ? " (syncing to TELOS)" : "";

  return {
    message: `Channel configured:
- Type: **${config.type}**
- Memory: **${config.memoryEnabled ? "enabled" + syncInfo : "disabled"}**
- Context injection: **${config.contextInjection ? "enabled" : "disabled"}**
${config.description ? `- Description: ${config.description}` : ""}

Ready to go!`,
    complete: true,
    config,
  };
}

export function cancelOnboarding(channelId: string): void {
  onboardingStates.delete(channelId);
}

export function getOnboardingState(channelId: string): OnboardingState | undefined {
  return onboardingStates.get(channelId);
}

// === CLI Interface ===

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "list": {
      const index = loadChannelIndex();
      console.log("Configured Channels:");
      for (const [id, info] of Object.entries(index.channels)) {
        console.log(`  ${id}: ${info.name} (${info.type})`);
      }
      break;
    }

    case "get": {
      const channelId = args[1];
      if (!channelId) {
        console.error("Usage: ChannelManager.ts get <channel_id>");
        process.exit(1);
      }
      const config = getChannelConfig(channelId);
      if (config) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log(`Channel ${channelId} not configured`);
      }
      break;
    }

    default:
      console.log(`
Channel Manager - Slack Channel Configuration

USAGE:
  bun run ChannelManager.ts [command]

COMMANDS:
  list              List all configured channels
  get <channel_id>  Get channel configuration

NOTES:
  - Onboarding happens automatically when @bot is mentioned in unconfigured channel
  - Configs stored in: ${CHANNELS_DIR}
`);
  }
}
