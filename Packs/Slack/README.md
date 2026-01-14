---
name: Slack Bot Integration
pack-id: badosanjos-slack-bot-v1.0.0
version: 1.0.0
author: badosanjos
description: Complete Slack bot with Socket Mode, thread-based Claude session persistence, memory extraction, HTTP API, and cross-platform service management. Enables AI assistants to maintain context across conversations.
type: skill
purpose-type: [integration, automation, productivity]
platform: claude-code
dependencies: ["@slack/bolt@^4.6.0", "@slack/web-api@^7.13.0"]
keywords: [slack, bot, integration, session, memory, socket-mode, thread, persistence]
---

# Slack Bot Integration Pack

Complete Slack bot integration with Socket Mode, thread-based Claude session persistence, memory extraction, HTTP API, and cross-platform service management.

## Installation Prompt

> You are installing the Slack Bot Integration pack for PAI. This pack provides complete Slack workspace integration enabling your AI assistant to:
>
> - Respond to @mentions in Slack channels via Socket Mode
> - Maintain persistent Claude sessions per thread (4-hour expiry)
> - Extract and store memories from conversations using triggers (goal:, remember:, challenge:, idea:, project:)
> - Provide HTTP API for programmatic access
> - Run as a system service on Linux, macOS, or Windows
>
> Prerequisites: A Slack app with Bot Token (xoxb-) and App Token (xapp-) configured for Socket Mode. Bun runtime installed.

## What's Included

| Component | Count | Description |
|-----------|-------|-------------|
| Core Server | 1 | Main bot server with Socket Mode |
| TypeScript Tools | 8 | Server, API client, memory, profiles, channels, context, files, TELOS bridge |
| Workflows | 5 | StartServer, ManageService, SendMessage, SessionManagement, SyncMemory |
| Type Definitions | 1 | 50+ TypeScript interfaces |
| State Directories | 6 | sessions, profiles, channels, memory, files, logs |

**Dependencies:** @slack/bolt, @slack/web-api

## The Concept and/or Problem

AI assistants in Slack face several challenges:

1. **No Session Persistence** - Each message is treated in isolation. The AI loses context between messages, even in the same thread.

2. **No Memory Extraction** - Important information mentioned in conversations (goals, facts, challenges) disappears into the chat history.

3. **Complex Setup** - Integrating Claude with Slack requires handling Socket Mode, thread context, session management, and service deployment.

4. **Multi-User Confusion** - In threads with multiple participants, the AI may confuse who said what or respond inappropriately.

5. **No Programmatic Access** - Sending messages from scripts or automations requires building custom integrations.

## The Solution

This pack provides a production-ready Slack integration that:

### Session Persistence
- Maps Slack threads to Claude sessions using `channel_thread_ts` keys
- Resumes existing sessions automatically (4-hour expiry)
- Injects thread history only for new sessions

### Memory Extraction
- Recognizes explicit triggers: `goal:`, `remember:`, `challenge:`, `idea:`, `project:`
- Stores memories locally with confidence scoring
- Auto-categorizes by type (health, work, family, learning, etc.)
- Optional TELOS sync for external memory system integration

### Channel Configuration
- Per-channel onboarding flow (personal, project, team types)
- Configurable memory and context injection per channel
- User profile tracking with interaction history

### HTTP API
- Health checks: `GET /health`
- Session management: `GET /sessions`, `POST /sessions/clear`
- Message sending: `POST /send`
- Progress tracking: `POST /progress/start`, `POST /progress/update`
- File operations: `POST /upload`, `GET /files/:channel`

### Cross-Platform Service
- Linux: systemd unit
- macOS: launchd agent
- Windows: NSSM service wrapper

## Why This Is Different

What makes this Slack integration unique among AI bot implementations?

This pack provides **session persistence at the thread level**, meaning your AI maintains full conversation context across multiple messages in the same Slack thread - something most Slack bots cannot do.

- First pack with thread-to-Claude session mapping
- Memory extraction with explicit user-controlled triggers
- Per-channel configuration with onboarding workflow
- Production-ready service deployment across all platforms

## Installation

### Prerequisites

1. **Bun Runtime** (required)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Slack App Setup**
   - Go to https://api.slack.com/apps
   - Create new app or select existing
   - Enable Socket Mode under Settings > Socket Mode
   - Generate App-Level Token with `connections:write` scope
   - Under OAuth & Permissions, add Bot Token Scopes:
     - `app_mentions:read`
     - `chat:write`
     - `channels:history`
     - `channels:read`
     - `files:read`
     - `files:write`
     - `users:read`
   - Install app to workspace

### Step 1: Create Directory Structure

```bash
# Set your PAI directory
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Create skill directories
mkdir -p "$PAI_DIR/skills/Slack/Tools"
mkdir -p "$PAI_DIR/skills/Slack/Workflows"
mkdir -p "$PAI_DIR/skills/Slack/State/sessions"
mkdir -p "$PAI_DIR/skills/Slack/State/profiles"
mkdir -p "$PAI_DIR/skills/Slack/State/channels"
mkdir -p "$PAI_DIR/skills/Slack/State/memory"
mkdir -p "$PAI_DIR/skills/Slack/State/files"
mkdir -p "$PAI_DIR/skills/Slack/State/logs"
```

### Step 2: Configure Environment Variables

```bash
# Add to $PAI_DIR/.env
cat >> "$PAI_DIR/.env" << 'EOF'
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
PAI_SLACK_PORT=9000
EOF
```

### Step 3: Install Source Files

Copy all files from `src/` to `$PAI_DIR/skills/Slack/Tools/`:
- Server.ts
- Types.ts
- SlackAPI.ts
- MemoryExtractor.ts
- TELOSBridge.ts
- ChannelManager.ts
- ProfileManager.ts
- ContextBuilder.ts
- FileManager.ts

Copy workflow files from `src/Workflows/` to `$PAI_DIR/skills/Slack/Workflows/`.

Copy `SKILL.md` to `$PAI_DIR/skills/Slack/SKILL.md`.

### Step 4: Install Dependencies

```bash
cd "$PAI_DIR/skills/Slack/Tools"
bun install @slack/bolt @slack/web-api
```

### Step 5: Update Skill Index

Add to `$PAI_DIR/skills/skill-index.json`:

```json
{
  "skills": {
    "Slack": {
      "path": "skills/Slack",
      "type": "deferred",
      "triggers": ["start slack", "slack server", "slack status", "send slack", "slack sessions"]
    }
  }
}
```

## Invocation Scenarios

### Scenario 1: First-Time Channel Setup

When the bot is mentioned in an unconfigured channel:

```
User: @bot hello
Bot: Hey! I've been added to this channel. Let me set things up.
     What type of channel is this?
     1. Personal - Private conversations, personal growth
     2. Project - Linked to a specific codebase
     3. Team - Collaboration with multiple people
```

### Scenario 2: Thread Conversation

```
User: @bot help me plan my week
Bot: [Creates new Claude session, responds with planning help]

User: @bot add "finish report" to that list
Bot: [Resumes same session, has full context, adds to list]
```

### Scenario 3: Memory Extraction

```
User: @bot goal: lose 10kg by March
Bot: [Extracts goal, stores in memory, acknowledges and responds]
```

### Scenario 4: Programmatic Message

```bash
bun run SlackAPI.ts send --channel "#alerts" --text "Build complete!"
```

## Example Usage

### Example 1: Start Server Manually

```bash
# Verify tokens configured
grep -q "SLACK_BOT_TOKEN" $PAI_DIR/.env && echo "Configured"

# Start server
bun run $PAI_DIR/skills/Slack/Tools/Server.ts
```

Output:
```
Loaded 3 active sessions
PAI Slack Server running
Socket Mode: Connected to Slack
HTTP API: http://localhost:9000
Endpoints: /health, /send, /upload, /files/:channel, /channels, /sessions, /progress, /memory
```

### Example 2: Install as Linux Service

```bash
# Create systemd unit
sudo tee /etc/systemd/system/pai-slack.service << EOF
[Unit]
Description=PAI Slack Bot
After=network.target

[Service]
Type=simple
User=$USER
Environment=PAI_DIR=$PAI_DIR
ExecStart=/usr/local/bin/bun run $PAI_DIR/skills/Slack/Tools/Server.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable pai-slack
sudo systemctl start pai-slack
```

### Example 3: Check Health and Sessions

```bash
# Health check
curl http://localhost:9000/health

# List active sessions
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts sessions
```

### Example 4: Send Message with Attachment

```bash
# Upload file to channel
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts upload \
  --channel C0A63N49M2R \
  --file ./report.pdf \
  --title "Weekly Report"
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | Yes | - | Bot OAuth token (xoxb-...) |
| `SLACK_APP_TOKEN` | Yes | - | App-level token (xapp-...) |
| `PAI_SLACK_PORT` | No | 9000 | HTTP API port |
| `PAI_DIR` | No | ~/.claude | PAI installation directory |

### Channel Configuration

Channels are configured via onboarding flow. Config stored in `State/channels/<channel_id>.json`:

```json
{
  "id": "C0A63N49M2R",
  "name": "personal",
  "type": "personal",
  "description": "Personal conversations",
  "memoryEnabled": true,
  "syncToTelos": true,
  "contextInjection": true,
  "created": "2025-01-15",
  "participants": ["U0A2EN4DK39"]
}
```

### Session Expiry

Sessions expire after 4 hours of inactivity. Adjust `SESSION_EXPIRY` in Server.ts if needed.

## Customization

### Recommended

**Memory Triggers:** Add custom triggers in `MemoryExtractor.ts` EXPLICIT_PATTERNS array:

```typescript
{
  pattern: /deadline[:\s]+(.+)/i,
  type: "fact",
  extractor: (m) => ({ content: `Deadline: ${m[1].trim()}`, confidence: 0.9 }),
}
```

**Category Keywords:** Extend CATEGORY_KEYWORDS for better auto-categorization.

### Optional

**TELOS Integration:** Enable by setting `syncToTelos: true` in channel config. Requires TELOS skill installed.

**Custom Onboarding:** Modify `ChannelManager.ts` to add onboarding questions.

**Progress Updates:** Customize streaming progress indicators in `parseStreamingEvent()`.

## Credits

- Built with [@slack/bolt](https://slack.dev/bolt-js/) - Slack's official framework
- Uses Socket Mode for firewall-friendly deployment
- Session persistence pattern inspired by PAI conversation management

## Related Work

- **Slack Official SDK** - Foundation for this integration
- **Claude Code** - Underlying AI engine

## Works Well With

- **TELOS Skill** - For persistent memory storage outside Slack
- **CORE Skill** - For identity and personal context injection

## Recommended

- Install TELOS skill for long-term memory persistence
- Configure personal channel for owner-specific context

## Relationships

- **Requires:** Bun runtime, Slack app tokens
- **Optional:** TELOS skill for memory sync
- **Conflicts:** None known

## Changelog

### v1.0.0 (2025-01-15)
- Initial release
- Socket Mode integration
- Thread-based session persistence
- Memory extraction with 6 trigger types
- HTTP API with 12 endpoints
- File upload/download support
- Cross-platform service templates
- User profile management
- Channel onboarding flow
