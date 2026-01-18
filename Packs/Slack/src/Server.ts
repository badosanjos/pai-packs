#!/usr/bin/env bun
// PAI Slack Bot Integration - Main Server
// Slack integration using Bolt SDK with Socket Mode
// Supports persistent sessions per Slack thread
// UPDATED: Now catches missed messages in threads between bot responses

import { App } from "@slack/bolt";
import { serve } from "bun";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  SlackThreadMessage,
  ThreadContext,
  SendMessageRequest,
  HealthResponse,
  ActiveProgress,
  ProgressStartRequest,
  ProgressUpdateRequest,
  ProgressResponse,
  FileAttachment,
  FileUploadRequest,
  FileUploadResponse,
  FileListResponse,
} from "./Types";
import { processMessage, getMemoryStats } from "./MemoryExtractor";
import { syncToTelos } from "./TELOSBridge";
import {
  getChannelConfig,
  isChannelConfigured,
  isOnboarding,
  startOnboarding,
  processOnboardingStep,
  saveChannelConfig,
  loadChannelIndex,
} from "./ChannelManager";
import { ensureProfileExists, recordInteraction, loadProfile } from "./ProfileManager";
import { buildContext, formatContextForClaude } from "./ContextBuilder";
import {
  downloadAndSaveFile,
  listChannelFiles,
  getFileById,
  getFilesDir,
} from "./FileManager";

// PAI directory resolution
const PAI_DIR = process.env.PAI_DIR || join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "Slack");

// Load .env from PAI directory
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

// Configuration
const HTTP_PORT = parseInt(process.env.PAI_SLACK_PORT || "9000");
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "not-used-in-socket-mode";

// Claude CLI configuration
// Configurable allowed tools - can be restricted for safer operation
const ALLOWED_TOOLS = process.env.PAI_SLACK_ALLOWED_TOOLS || "Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch";

// Check if running as root (not allowed by Claude Code)
if (process.getuid && process.getuid() === 0) {
  console.error("ERROR: Cannot run as root user. Claude Code refuses root execution for safety.");
  console.error("Please run as a non-root user or create a dedicated service account.");
  process.exit(1);
}

// Session storage directory (skill-local state)
const STATE_DIR = join(SKILL_DIR, "State");
const SESSIONS_DIR = join(STATE_DIR, "sessions");
if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Session data structure - now includes lastMessageTs to track missed messages
interface ThreadSession {
  sessionId: string;
  lastMessageTs: string; // Timestamp of last processed message
}

// Thread to Claude session mapping
// Key: `${channel}_${thread_ts}` -> Value: ThreadSession
const threadSessions = new Map<string, ThreadSession>();

// Active progress message tracking
// Key: `${channel}_${thread_ts}` -> Value: ActiveProgress
const activeProgress = new Map<string, ActiveProgress>();

// Session expiry time (4 hours in ms)
const SESSION_EXPIRY = 4 * 60 * 60 * 1000;

// Load persisted sessions on startup
function loadSessions(): void {
  const sessionsFile = join(SESSIONS_DIR, "thread-sessions.json");
  if (existsSync(sessionsFile)) {
    try {
      const data = JSON.parse(readFileSync(sessionsFile, "utf-8"));
      const now = Date.now();
      for (const [key, value] of Object.entries(data)) {
        const session = value as { sessionId: string; createdAt: number; lastMessageTs?: string };
        // Only load sessions that haven't expired
        if (now - session.createdAt < SESSION_EXPIRY) {
          threadSessions.set(key, {
            sessionId: session.sessionId,
            lastMessageTs: session.lastMessageTs || "0",
          });
        }
      }
      console.log(`Loaded ${threadSessions.size} active sessions`);
    } catch (e) {
      console.error("Error loading sessions:", e);
    }
  }
}

// Save sessions to disk
function saveSessions(): void {
  const sessionsFile = join(SESSIONS_DIR, "thread-sessions.json");
  const data: Record<string, { sessionId: string; createdAt: number; lastMessageTs: string }> = {};
  const now = Date.now();
  for (const [key, session] of threadSessions.entries()) {
    data[key] = {
      sessionId: session.sessionId,
      createdAt: now,
      lastMessageTs: session.lastMessageTs,
    };
  }
  writeFileSync(sessionsFile, JSON.stringify(data, null, 2));
}

// Get session key for a thread
function getThreadKey(channel: string, thread_ts: string): string {
  return `${channel}_${thread_ts}`;
}

// Cross-platform Claude CLI path detection
function getClaudePath(): string {
  const home = homedir();

  // Check common locations
  const candidates = [
    join(home, ".local", "bin", "claude"),       // Linux/WSL
    join(home, ".local", "bin", "claude.exe"),   // Windows via WSL
    "/usr/local/bin/claude",                      // macOS Homebrew
    join(home, "AppData", "Local", "Programs", "claude", "claude.exe"), // Windows native
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  // Fallback to PATH
  return "claude";
}

// Validate required tokens
if (!SLACK_BOT_TOKEN) {
  console.error(`SLACK_BOT_TOKEN not found in ${envPath}`);
  console.error(`Add: SLACK_BOT_TOKEN=xoxb-... to ${envPath}`);
  process.exit(1);
}

if (!SLACK_APP_TOKEN) {
  console.error(`SLACK_APP_TOKEN not found in ${envPath}`);
  console.error(`Add: SLACK_APP_TOKEN=xapp-... to ${envPath}`);
  process.exit(1);
}

// Initialize Bolt app with Socket Mode
const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
  signingSecret: SLACK_SIGNING_SECRET,
});

// Fetch full thread context
async function getThreadContext(
  channel: string,
  thread_ts: string
): Promise<SlackThreadMessage[]> {
  try {
    const result = await app.client.conversations.replies({
      channel,
      ts: thread_ts,
    });
    return (result.messages as SlackThreadMessage[]) || [];
  } catch (error) {
    console.error("Error fetching thread:", error);
    return [];
  }
}

// Format thread context for Claude
function formatThreadForClaude(messages: SlackThreadMessage[]): string {
  return messages
    .map((msg) => {
      const sender = msg.bot_id ? "Assistant" : `User ${msg.user}`;
      return `[${sender}]: ${msg.text}`;
    })
    .join("\n\n");
}

// Filter messages newer than a given timestamp (for catching missed messages)
function filterMissedMessages(
  messages: SlackThreadMessage[],
  lastMessageTs: string,
  currentMessageTs: string
): SlackThreadMessage[] {
  return messages.filter((msg) => {
    const msgTs = msg.ts || "0";
    // Include messages after lastMessageTs but before the current message
    return msgTs > lastMessageTs && msgTs < currentMessageTs;
  });
}

// Helper to update progress message in Slack
async function updateProgress(channel: string, thread_ts: string, text: string): Promise<void> {
  const key = getThreadKey(channel, thread_ts);
  const progress = activeProgress.get(key);

  if (progress) {
    try {
      await app.client.chat.update({
        channel: progress.channel,
        ts: progress.message_ts,
        text,
      });
      progress.lastUpdate = Date.now();
    } catch (e) {
      console.error("Failed to update progress:", e);
    }
  }
}

// Helper to start progress tracking for a thread
async function startProgress(channel: string, thread_ts: string, initialText: string): Promise<string | null> {
  try {
    const result = await app.client.chat.postMessage({
      channel,
      text: initialText,
      thread_ts,
    });

    if (result.ok && result.ts) {
      const key = getThreadKey(channel, thread_ts);
      activeProgress.set(key, {
        channel,
        thread_ts,
        message_ts: result.ts,
        startedAt: Date.now(),
        lastUpdate: Date.now(),
      });
      return result.ts;
    }
  } catch (e) {
    console.error("Failed to start progress:", e);
  }
  return null;
}

// Parse streaming output to extract tool usage info
function parseStreamingEvent(line: string): { type: string; detail?: string } | null {
  try {
    const data = JSON.parse(line);

    // Assistant message with tool_use in content array
    if (data.type === "assistant" && data.message?.content) {
      const content = data.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use") {
            const toolName = block.name || "tool";
            const input = block.input || {};
            let detail = toolName;

            // Extract useful details based on tool type
            if (toolName === "Read" && input.file_path) {
              const file = input.file_path.split("/").pop();
              detail = `Reading ${file}`;
            } else if (toolName === "Glob" && input.pattern) {
              detail = `Glob: ${input.pattern}`;
            } else if (toolName === "Grep" && input.pattern) {
              detail = `Grep: ${input.pattern.slice(0, 25)}`;
            } else if (toolName === "Bash" && input.command) {
              const cmd = input.command.split(/\s+/)[0];
              detail = `Running ${cmd}`;
            } else if (toolName === "Edit" && input.file_path) {
              const file = input.file_path.split("/").pop();
              detail = `Editing ${file}`;
            } else if (toolName === "Write" && input.file_path) {
              const file = input.file_path.split("/").pop();
              detail = `Writing ${file}`;
            } else if (toolName === "WebSearch" && input.query) {
              detail = `Searching: ${input.query.slice(0, 20)}`;
            } else if (toolName === "WebFetch") {
              detail = `Fetching URL`;
            } else if (toolName === "Task") {
              const subtype = input.subagent_type || "agent";
              detail = `Spawning ${subtype}`;
            } else if (toolName === "TodoWrite") {
              detail = `Updating tasks`;
            } else {
              detail = `${toolName}`;
            }

            return { type: "tool", detail };
          } else if (block.type === "text" && block.text) {
            // Text response means thinking/responding
            return { type: "thinking" };
          }
        }
      }
    }

    // Tool result (user message with tool_result)
    if (data.type === "user" && data.tool_use_result) {
      return { type: "tool_result" };
    }

  } catch {
    // Not JSON, ignore
  }
  return null;
}

// Invoke Claude via Claude Code CLI with session persistence and streaming progress
// Now supports injecting missed messages for existing sessions
async function invokeClaude(
  prompt: string,
  threadKey: string,
  channel: string,
  thread_ts: string,
  context?: ThreadContext,
  contextPrefix?: string,
  missedMessagesContext?: string
): Promise<string> {
  return new Promise(async (resolve) => {
    const claudePath = getClaudePath();
    const existingSession = threadSessions.get(threadKey);

    // Build command arguments
    const args = [claudePath, "-p", prompt];

    if (existingSession) {
      // Resume existing session
      args.push("--resume", existingSession.sessionId);

      // If there are missed messages, prepend them to the prompt
      if (missedMessagesContext) {
        const fullPrompt = `## Missed Messages (conversation that happened while you were away)\n\n${missedMessagesContext}\n\n## Current Message\n\n${prompt}`;
        args[2] = fullPrompt;
        console.log(`Resuming session ${existingSession.sessionId} with missed messages`);
      } else {
        console.log(`Resuming session ${existingSession.sessionId} for thread ${threadKey}`);
      }
    } else {
      // New session - inject context if available
      let fullPrompt = prompt;

      if (contextPrefix && context && context.messages.length > 1) {
        // Both memory context and thread history
        const threadHistory = formatThreadForClaude(context.messages.slice(0, -1));
        fullPrompt = `${contextPrefix}\n## Thread History\n\n${threadHistory}\n\n## Current Message\n\n${prompt}`;
        console.log(`New session with context + ${context.messages.length - 1} messages`);
      } else if (contextPrefix) {
        // Memory context only
        fullPrompt = `${contextPrefix}\n## Current Message\n\n${prompt}`;
        console.log(`New session with context for thread ${threadKey}`);
      } else if (context && context.messages.length > 1) {
        // Thread history only
        const threadHistory = formatThreadForClaude(context.messages.slice(0, -1));
        fullPrompt = `## Previous Thread Context\n\n${threadHistory}\n\n## Current Message\n\n${prompt}`;
        console.log(`New session with ${context.messages.length - 1} messages of context`);
      } else {
        console.log(`New session for thread ${threadKey}`);
      }

      args[2] = fullPrompt;
    }

    // Add permission flags - use streaming JSON output
    // IMPORTANT: --dangerously-skip-permissions is required because Slack
    // cannot handle interactive permission prompts during message processing
    args.push(
      "--dangerously-skip-permissions",
      "--allowedTools", ALLOWED_TOOLS,
      "--output-format", "stream-json",
      "--verbose"
    );

    console.log(`Invoking Claude with prompt: "${prompt.slice(0, 50)}..."`);

    // Start progress message
    await startProgress(channel, thread_ts, "Processing...");
    const startTime = Date.now();
    let lastProgressUpdate = Date.now();
    let currentActivity = "Thinking";
    let toolCount = 0;

    try {
      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      // Read stdout as stream for progress updates
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let fullOutput = "";
      let buffer = "";

      // Progress update interval (update every 3 seconds minimum)
      const PROGRESS_INTERVAL = 3000;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullOutput += chunk;
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          const event = parseStreamingEvent(line);
          if (event) {
            if (event.type === "tool" && event.detail) {
              currentActivity = event.detail;
              toolCount++;
              // Update immediately on tool use
              const elapsed = Math.round((Date.now() - startTime) / 1000);
              const progressText = `${currentActivity} (${elapsed}s)`;
              await updateProgress(channel, thread_ts, progressText);
              lastProgressUpdate = Date.now();
            } else if (event.type === "thinking" && currentActivity !== "Thinking") {
              currentActivity = "Thinking";
            }
          }
        }

        // Update progress periodically for long-running operations (heartbeat)
        const now = Date.now();
        if (now - lastProgressUpdate >= PROGRESS_INTERVAL) {
          const elapsed = Math.round((now - startTime) / 1000);
          const progressText = `${currentActivity} (${elapsed}s)`;
          await updateProgress(channel, thread_ts, progressText);
          lastProgressUpdate = now;
        }
      }

      const errorOutput = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Final progress update
      const totalTime = Math.round((Date.now() - startTime) / 1000);

      if (exitCode === 0 && fullOutput.trim()) {
        // Parse the final output - look for the last complete JSON with result
        const lines = fullOutput.trim().split("\n");
        let sessionId: string | undefined;
        let responseText = "";

        // Find session_id and final response from stream
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.session_id) sessionId = data.session_id;
            if (data.type === "result" && data.result) {
              responseText = data.result;
            } else if (data.type === "assistant" && data.message?.content) {
              // Extract text from assistant messages
              const content = data.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "text" && block.text) {
                    responseText = block.text;
                  }
                }
              }
            }
          } catch {
            // Not valid JSON, skip
          }
        }

        // Store session ID for this thread (sessionId update handled by caller via updateSessionTimestamp)
        if (sessionId && sessionId !== existingSession?.sessionId) {
          threadSessions.set(threadKey, {
            sessionId,
            lastMessageTs: "0", // Will be updated by caller
          });
          saveSessions();
          console.log(`Stored new session ${sessionId} for thread ${threadKey}`);
        }

        // Clear progress tracking
        const key = getThreadKey(channel, thread_ts);
        const progress = activeProgress.get(key);
        if (progress) {
          // Delete the progress message - we'll send the real response separately
          try {
            await app.client.chat.delete({
              channel: progress.channel,
              ts: progress.message_ts,
            });
          } catch {
            // If delete fails, just update it with completion
            await updateProgress(channel, thread_ts, `Done (${totalTime}s, ${toolCount} operations)`);
          }
          activeProgress.delete(key);
        }

        console.log(`Claude response received (${responseText.length} chars, ${totalTime}s, ${toolCount} tools)`);
        resolve(responseText || fullOutput.trim());
      } else {
        // Clear progress on error
        const key = getThreadKey(channel, thread_ts);
        const progress = activeProgress.get(key);
        if (progress) {
          await updateProgress(channel, thread_ts, `Error after ${totalTime}s`);
          activeProgress.delete(key);
        }

        console.error("Claude CLI failed:", errorOutput || "No output");
        resolve("Sorry, I couldn't process that request right now.");
      }
    } catch (error) {
      console.error("Claude CLI error:", error);

      // Clear progress on error
      const key = getThreadKey(channel, thread_ts);
      activeProgress.delete(key);

      resolve("Sorry, I encountered an error processing your request.");
    }
  });
}

// Update session's lastMessageTs after processing
function updateSessionTimestamp(threadKey: string, messageTs: string): void {
  const session = threadSessions.get(threadKey);
  if (session) {
    session.lastMessageTs = messageTs;
    saveSessions();
    console.log(`[Session] Updated lastMessageTs for ${threadKey} to ${messageTs}`);
  }
}

// Handle @bot mentions
app.event("app_mention", async ({ event, say }) => {
  console.log(`Mention received in ${event.channel}: "${event.text.slice(0, 50)}..."`);

  const threadTs = event.thread_ts || event.ts;
  const currentMessageTs = event.ts; // The timestamp of the current message

  try {
    // Remove the @bot mention from the text
    const prompt = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    // === ONBOARDING CHECK ===
    if (!isChannelConfigured(event.channel)) {
      if (isOnboarding(event.channel)) {
        // Process onboarding response
        const result = processOnboardingStep(event.channel, prompt);
        await say({ text: result.message, thread_ts: threadTs });

        if (result.complete && result.config) {
          // Fetch channel name from Slack API
          try {
            const channelInfo = await app.client.conversations.info({ channel: event.channel });
            result.config.name = channelInfo.channel?.name || result.config.name;
            result.config.participants = [event.user || "unknown"];
          } catch {
            // Use default name
          }
          saveChannelConfig(result.config);
          console.log(`[Channel] Configured ${event.channel}: ${result.config.type}`);
        }
        return;
      } else {
        // Start onboarding
        const onboardingMessage = startOnboarding(event.channel);
        await say({ text: onboardingMessage, thread_ts: threadTs });
        return;
      }
    }

    // === GET CHANNEL CONFIG ===
    const channelConfig = getChannelConfig(event.channel);

    if (!prompt) {
      await say({
        text: "Hey! How can I help?",
        thread_ts: threadTs,
      });
      return;
    }

    // === PROFILE HANDLING ===
    const userId = event.user || "unknown";
    if (channelConfig?.memoryEnabled && event.user) {
      try {
        const userInfo = await app.client.users.info({ user: event.user });
        ensureProfileExists(userId, event.channel, userInfo.user?.real_name);
      } catch {
        ensureProfileExists(userId, event.channel);
      }
    }

    // Get thread key
    const threadKey = getThreadKey(event.channel, threadTs);

    // Check if we have an existing session for this thread
    const existingSession = threadSessions.get(threadKey);
    const hasExistingSession = !!existingSession;

    // === ALWAYS FETCH THREAD CONTEXT (for both new and existing sessions) ===
    const messages = await getThreadContext(event.channel, threadTs);

    // === CONTEXT BUILDING ===
    let contextPrefix = "";
    let context: ThreadContext | undefined;
    let missedMessagesContext = "";

    if (hasExistingSession) {
      // EXISTING SESSION: Check for missed messages
      const missedMessages = filterMissedMessages(
        messages,
        existingSession.lastMessageTs,
        currentMessageTs
      );

      if (missedMessages.length > 0) {
        // Format missed messages for injection
        missedMessagesContext = formatThreadForClaude(missedMessages);
        console.log(`[Thread] Found ${missedMessages.length} missed messages since last interaction`);
      } else {
        console.log(`[Thread] No missed messages for existing session`);
      }
    } else {
      // NEW SESSION: Build full context
      if (channelConfig?.contextInjection) {
        const contextData = buildContext(event.channel, userId);
        contextPrefix = formatContextForClaude(contextData);
        if (contextPrefix) {
          console.log(`[Context] Built context for new session`);
        }
      }

      if (messages.length > 0) {
        context = {
          messages,
          channel: event.channel,
          thread_ts: threadTs,
        };
        console.log(`Thread context: ${messages.length} messages (new session)`);
      }
    }

    // === MEMORY EXTRACTION ===
    const memoryResult = processMessage(prompt, event.channel, userId);
    if (memoryResult.stored.length > 0) {
      console.log(`[Memory] Extracted ${memoryResult.stored.length} memories from message`);

      // Auto-sync to TELOS only if channel config allows
      if (channelConfig?.syncToTelos) {
        const syncResult = syncToTelos(memoryResult.stored);
        if (syncResult.synced > 0) {
          console.log(`[TELOS] Auto-synced ${syncResult.synced} memories`);
        }
        if (syncResult.errors.length > 0) {
          console.error(`[TELOS] Sync errors:`, syncResult.errors);
        }
      }
    }

    // === INVOKE CLAUDE (now with missed messages support) ===
    const response = await invokeClaude(
      prompt,
      threadKey,
      event.channel,
      threadTs,
      context,
      contextPrefix,
      missedMessagesContext
    );

    // Reply in thread
    await say({
      text: response,
      thread_ts: threadTs,
    });

    // === UPDATE SESSION TIMESTAMP ===
    // Update lastMessageTs to current message so we don't re-inject these messages next time
    updateSessionTimestamp(threadKey, currentMessageTs);

    // === RECORD INTERACTION ===
    if (channelConfig?.memoryEnabled) {
      recordInteraction(userId, event.channel, prompt.slice(0, 100));
    }

    console.log(`Response sent to thread ${threadTs}`);
  } catch (error) {
    console.error("Error handling mention:", error);
    await say({
      text: "Sorry, I encountered an error. Please try again.",
      thread_ts: threadTs,
    });
  }
});

// Handle file uploads in messages (when files are shared with @bot mention)
app.event("message", async ({ event, context }) => {
  // Type guard for message with files
  const msg = event as any;

  // Only process messages with files
  if (!msg.files || msg.files.length === 0) return;

  // Skip bot messages
  if (msg.bot_id) return;

  // Check if this is a mention to the bot (has files + mentions bot)
  const hasBotMention = msg.text?.includes(`<@${context.botUserId}>`);

  // For now, only save files when bot is mentioned
  if (!hasBotMention) return;

  const channelId = msg.channel;
  const threadTs = msg.thread_ts || msg.ts;
  const userId = msg.user || "unknown";

  console.log(`[Files] Received ${msg.files.length} file(s) in ${channelId}`);

  const savedFiles: string[] = [];

  for (const file of msg.files as FileAttachment[]) {
    const saved = await downloadAndSaveFile(
      file,
      channelId,
      context.botToken!,
      userId,
      threadTs
    );

    if (saved) {
      savedFiles.push(saved.filename);
    }
  }

  if (savedFiles.length > 0) {
    console.log(`[Files] Saved: ${savedFiles.join(", ")}`);
  }
});

// HTTP API server for programmatic access
const httpServer = serve({
  port: HTTP_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "http://localhost",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // Health check
    if (url.pathname === "/health") {
      const health: HealthResponse = {
        status: "healthy",
        port: HTTP_PORT,
        socket_mode: true,
        bot_token_configured: !!SLACK_BOT_TOKEN,
        app_token_configured: !!SLACK_APP_TOKEN,
        active_sessions: threadSessions.size,
      };
      return new Response(JSON.stringify(health), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List active sessions (updated to show lastMessageTs)
    if (url.pathname === "/sessions" && req.method === "GET") {
      const sessions = Array.from(threadSessions.entries()).map(([key, session]) => ({
        thread: key,
        sessionId: session.sessionId,
        lastMessageTs: session.lastMessageTs,
      }));
      return new Response(JSON.stringify({ sessions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear sessions endpoint
    if (url.pathname === "/sessions/clear" && req.method === "POST") {
      threadSessions.clear();
      saveSessions();
      return new Response(JSON.stringify({ ok: true, message: "Sessions cleared" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send message endpoint
    if (url.pathname === "/send" && req.method === "POST") {
      try {
        const data: SendMessageRequest = await req.json();

        if (!data.channel || !data.text) {
          return new Response(
            JSON.stringify({ error: "channel and text required" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const result = await app.client.chat.postMessage({
          channel: data.channel,
          text: data.text,
          thread_ts: data.thread_ts,
        });

        return new Response(
          JSON.stringify({ ok: true, ts: result.ts }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (error: any) {
        console.error("Send error:", error);
        return new Response(
          JSON.stringify({ error: error.message || "Failed to send message" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Memory stats endpoint
    if (url.pathname === "/memory" && req.method === "GET") {
      const stats = getMemoryStats();
      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Progress: Start a progress message
    if (url.pathname === "/progress/start" && req.method === "POST") {
      try {
        const data: ProgressStartRequest = await req.json();

        if (!data.channel || !data.thread_ts) {
          return new Response(
            JSON.stringify({ ok: false, error: "channel and thread_ts required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const initialText = data.text || "Processing...";
        const result = await app.client.chat.postMessage({
          channel: data.channel,
          text: initialText,
          thread_ts: data.thread_ts,
        });

        if (result.ok && result.ts) {
          const key = getThreadKey(data.channel, data.thread_ts);
          activeProgress.set(key, {
            channel: data.channel,
            thread_ts: data.thread_ts,
            message_ts: result.ts,
            startedAt: Date.now(),
            lastUpdate: Date.now(),
          });

          const response: ProgressResponse = { ok: true, message_ts: result.ts };
          return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ ok: false, error: "Failed to post message" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Progress: Update existing progress message
    if (url.pathname === "/progress/update" && req.method === "POST") {
      try {
        const data: ProgressUpdateRequest = await req.json();

        if (!data.text) {
          return new Response(
            JSON.stringify({ ok: false, error: "text required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Find active progress - use provided channel/thread or find most recent
        let progress: ActiveProgress | undefined;

        if (data.channel && data.thread_ts) {
          const key = getThreadKey(data.channel, data.thread_ts);
          progress = activeProgress.get(key);
        } else {
          // Get most recent active progress
          let mostRecent: ActiveProgress | undefined;
          for (const p of activeProgress.values()) {
            if (!mostRecent || p.lastUpdate > mostRecent.lastUpdate) {
              mostRecent = p;
            }
          }
          progress = mostRecent;
        }

        if (!progress) {
          return new Response(
            JSON.stringify({ ok: false, error: "No active progress message found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update the message
        const result = await app.client.chat.update({
          channel: progress.channel,
          ts: progress.message_ts,
          text: data.text,
        });

        if (result.ok) {
          progress.lastUpdate = Date.now();
          const response: ProgressResponse = { ok: true, message_ts: progress.message_ts };
          return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ ok: false, error: "Failed to update message" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Progress: Clear/end progress tracking
    if (url.pathname === "/progress/clear" && req.method === "POST") {
      try {
        const data = await req.json().catch(() => ({}));

        if (data.channel && data.thread_ts) {
          const key = getThreadKey(data.channel, data.thread_ts);
          activeProgress.delete(key);
        } else {
          activeProgress.clear();
        }

        return new Response(
          JSON.stringify({ ok: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Progress: Get active progress info
    if (url.pathname === "/progress" && req.method === "GET") {
      const progressList = Array.from(activeProgress.entries()).map(([key, p]) => ({
        key,
        ...p,
        elapsed: Date.now() - p.startedAt,
      }));
      return new Response(JSON.stringify({ active: progressList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List channels endpoint
    if (url.pathname === "/channels" && req.method === "GET") {
      try {
        const result = await app.client.conversations.list({
          types: "public_channel,private_channel",
          limit: 100,
        });

        const channels = result.channels?.map((c) => ({
          id: c.id,
          name: c.name,
          configured: isChannelConfigured(c.id || ""),
        }));

        return new Response(JSON.stringify({ channels }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // List configured channels
    if (url.pathname === "/channels/configured" && req.method === "GET") {
      const index = loadChannelIndex();
      return new Response(JSON.stringify(index), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get channel config
    if (url.pathname.match(/^\/channel\/[A-Z0-9]+$/i) && req.method === "GET") {
      const channelId = url.pathname.split("/")[2];
      const config = getChannelConfig(channelId);
      if (config) {
        return new Response(JSON.stringify(config), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "Channel not configured" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get user profile
    if (url.pathname.match(/^\/profile\/[A-Z0-9]+$/i) && req.method === "GET") {
      const userId = url.pathname.split("/")[2];
      const profile = loadProfile(userId);
      if (profile) {
        return new Response(JSON.stringify(profile), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // === FILE ENDPOINTS ===

    // Upload file to Slack channel/thread
    if (url.pathname === "/upload" && req.method === "POST") {
      try {
        const data: FileUploadRequest = await req.json();

        if (!data.channel || !data.file_path) {
          return new Response(
            JSON.stringify({ ok: false, error: "channel and file_path required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if file exists
        if (!existsSync(data.file_path)) {
          return new Response(
            JSON.stringify({ ok: false, error: `File not found: ${data.file_path}` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Read file content
        const fileContent = readFileSync(data.file_path);
        const filename = data.filename || data.file_path.split("/").pop() || "file";

        // Upload using filesUploadV2
        const result = await app.client.filesUploadV2({
          channel_id: data.channel,
          file: fileContent,
          filename,
          title: data.title || filename,
          ...(data.thread_ts && { thread_ts: data.thread_ts }),
          ...(data.initial_comment && { initial_comment: data.initial_comment }),
        } as any);

        const response: FileUploadResponse = {
          ok: true,
          file_id: (result as any).files?.[0]?.id,
          permalink: (result as any).files?.[0]?.permalink,
        };

        console.log(`[Files] Uploaded: ${filename} to ${data.channel}`);
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        console.error("[Files] Upload error:", error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message || "Upload failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // List files for a channel
    if (url.pathname.match(/^\/files\/[A-Z0-9]+$/i) && req.method === "GET") {
      const channelId = url.pathname.split("/")[2];
      const files = listChannelFiles(channelId);
      const response: FileListResponse = { ok: true, files };
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get specific file info
    if (url.pathname.match(/^\/file\/[A-Z0-9]+$/i) && req.method === "GET") {
      const fileId = url.pathname.split("/")[2];
      const file = getFileById(fileId);
      if (file) {
        return new Response(JSON.stringify({ ok: true, file }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ ok: false, error: "File not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get files directory path
    if (url.pathname === "/files/dir" && req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, path: getFilesDir() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("PAI Slack Server - Use /health, /send, /channels, /sessions, /progress, /upload, /files/:channel, /file/:id", {
      headers: corsHeaders,
    });
  },
});

// Start the app
(async () => {
  loadSessions();
  await app.start();
  console.log("PAI Slack Server running");
  console.log(`Socket Mode: Connected to Slack`);
  console.log(`HTTP API: http://localhost:${HTTP_PORT}`);
  console.log(`Endpoints: /health, /send, /upload, /files/:channel, /channels, /sessions, /progress, /memory`);
  console.log(`Active sessions: ${threadSessions.size}`);
  console.log(`State directory: ${STATE_DIR}`);
  console.log(`Files directory: ${getFilesDir()}`);
  console.log(`Memory extraction: Enabled (triggers: goal:, remember:, challenge:, idea:, project:)`);
  console.log(`Missed messages: Enabled (catches thread messages between bot responses)`);
})();
