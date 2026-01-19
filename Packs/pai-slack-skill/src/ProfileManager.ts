#!/usr/bin/env bun
// $PAI_DIR/skills/Slack/Tools/ProfileManager.ts
// Manages user profiles and interaction tracking

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { UserProfile, ProfileInteraction } from "./Types";

const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "Slack");
const STATE_DIR = join(SKILL_DIR, "State");
const PROFILES_DIR = join(STATE_DIR, "profiles");

// Known owner ID (User)
const OWNER_ID = "owner";

// Ensure directories exist
if (!existsSync(PROFILES_DIR)) {
  mkdirSync(PROFILES_DIR, { recursive: true });
}

// === Profile Operations ===

export function loadProfile(userId: string): UserProfile | null {
  const profilePath = join(PROFILES_DIR, `${userId}.json`);
  try {
    if (existsSync(profilePath)) {
      return JSON.parse(readFileSync(profilePath, "utf-8"));
    }
  } catch (e) {
    console.error(`[Profile] Error loading profile ${userId}:`, e);
  }
  return null;
}

export function saveProfile(profile: UserProfile): void {
  const profilePath = join(PROFILES_DIR, `${profile.id}.json`);
  profile.updated = new Date().toISOString().split("T")[0];
  writeFileSync(profilePath, JSON.stringify(profile, null, 2));
}

export function ensureProfileExists(
  userId: string,
  channelId: string,
  userName?: string
): UserProfile {
  let profile = loadProfile(userId);

  if (!profile) {
    profile = createEmptyProfile(userId, channelId, userName);
    saveProfile(profile);
    console.log(`[Profile] Created profile for ${userId}: ${profile.name}`);
  }

  return profile;
}

function createEmptyProfile(
  userId: string,
  channelId: string,
  userName?: string
): UserProfile {
  return {
    id: userId,
    name: userName || `User ${userId.slice(-6)}`,
    displayName: userName,
    role: "participant",
    firstSeen: new Date().toISOString().split("T")[0],
    updated: new Date().toISOString().split("T")[0],
    primaryChannel: channelId,
    notes: [],
    preferences: {},
    interactionCount: 0,
    recentInteractions: [],
  };
}

export function recordInteraction(
  userId: string,
  channelId: string,
  topic: string
): void {
  const profile = loadProfile(userId);
  if (!profile) return;

  const interaction: ProfileInteraction = {
    date: new Date().toISOString().split("T")[0],
    channel: channelId,
    topic: topic.slice(0, 100),
  };

  profile.recentInteractions.push(interaction);
  profile.interactionCount++;

  // Keep only last 50 interactions
  if (profile.recentInteractions.length > 50) {
    profile.recentInteractions = profile.recentInteractions.slice(-50);
  }

  saveProfile(profile);
}

export function getOwnerProfile(): UserProfile | null {
  // Try loading owner profile
  let profile = loadProfile(OWNER_ID);
  if (profile) return profile;

  // Try loading user.json as fallback
  profile = loadProfile("user");
  if (profile) return profile;

  return null;
}

export function addNoteToProfile(userId: string, note: string): void {
  const profile = loadProfile(userId);
  if (!profile) return;

  profile.notes.push(note);
  saveProfile(profile);
  console.log(`[Profile] Added note to ${userId}: ${note.slice(0, 50)}...`);
}

export function setProfilePreference(
  userId: string,
  key: string,
  value: string
): void {
  const profile = loadProfile(userId);
  if (!profile) return;

  profile.preferences[key] = value;
  saveProfile(profile);
  console.log(`[Profile] Set preference for ${userId}: ${key}=${value}`);
}

export function listProfiles(): UserProfile[] {
  const profiles: UserProfile[] = [];
  try {
    const files = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const profile = loadProfile(file.replace(".json", ""));
      if (profile) {
        profiles.push(profile);
      }
    }
  } catch (e) {
    console.error("[Profile] Error listing profiles:", e);
  }
  return profiles;
}

// === CLI Interface ===

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "list": {
      const profiles = listProfiles();
      console.log(`Profiles (${profiles.length}):`);
      for (const p of profiles) {
        console.log(`  ${p.id}: ${p.name} (${p.role}, ${p.interactionCount} interactions)`);
      }
      break;
    }

    case "get": {
      const userId = args[1];
      if (!userId) {
        console.error("Usage: ProfileManager.ts get <user_id>");
        process.exit(1);
      }
      const profile = loadProfile(userId);
      if (profile) {
        console.log(JSON.stringify(profile, null, 2));
      } else {
        console.log(`Profile ${userId} not found`);
      }
      break;
    }

    case "owner": {
      const owner = getOwnerProfile();
      if (owner) {
        console.log(JSON.stringify(owner, null, 2));
      } else {
        console.log("Owner profile not found");
      }
      break;
    }

    case "add-note": {
      const userId = args[1];
      const note = args.slice(2).join(" ");
      if (!userId || !note) {
        console.error("Usage: ProfileManager.ts add-note <user_id> <note>");
        process.exit(1);
      }
      addNoteToProfile(userId, note);
      console.log("Note added");
      break;
    }

    default:
      console.log(`
Profile Manager - User Profile Management

USAGE:
  bun run ProfileManager.ts [command]

COMMANDS:
  list                    List all profiles
  get <user_id>           Get profile by ID
  owner                   Get owner profile (User)
  add-note <id> <note>    Add note to profile

STORAGE:
  Profiles stored in: ${PROFILES_DIR}
`);
  }
}
