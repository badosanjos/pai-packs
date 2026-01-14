---
name: Slack
description: Slack bot integration with persistent thread sessions, memory extraction, and context injection. USE WHEN start slack, slack server, slack status, send slack message, slack sessions, sync memories, OR manage slack service.
---

# Slack - Bot Integration & Session Management

Provides complete Slack bot integration with Socket Mode, thread-based session persistence, HTTP API, and cross-platform service management.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **StartServer** | "start slack", "run slack server", "launch bot" | `Workflows/StartServer.md` |
| **ManageService** | "install service", "setup service", "slack service status" | `Workflows/ManageService.md` |
| **SendMessage** | "send slack message", "post to slack", "notify channel" | `Workflows/SendMessage.md` |
| **SessionManagement** | "list sessions", "clear sessions", "slack health" | `Workflows/SessionManagement.md` |
| **SyncMemory** | "sync memories", "sync to telos", "slack memory sync" | `Workflows/SyncMemory.md` |

## Tools Reference

| Tool | Purpose | Usage |
|------|---------|-------|
| **Server.ts** | Main bot server | `bun run $PAI_DIR/skills/Slack/Tools/Server.ts` |
| **SlackAPI.ts** | HTTP client for API | `bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts <command>` |
| **MemoryExtractor.ts** | Extract memories from messages | `bun run $PAI_DIR/skills/Slack/Tools/MemoryExtractor.ts stats` |
| **TELOSBridge.ts** | Sync memories to TELOS | `bun run $PAI_DIR/skills/Slack/Tools/TELOSBridge.ts sync` |

## Configuration

Environment variables in `$PAI_DIR/.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
PAI_SLACK_PORT=9000  # Optional, defaults to 9000
```

## Examples

**Example 1: Start server manually**
```
User: "start the slack server"
-> Invokes StartServer workflow
-> Executes Server.ts in foreground
-> Shows connection status
```

**Example 2: Install as service**
```
User: "set up slack as a Linux service"
-> Invokes ManageService workflow
-> Configures systemd service with auto-start
```

**Example 3: Send notification**
```
User: "send 'Build complete' to #dev-alerts"
-> Invokes SendMessage workflow
-> Executes SlackAPI.ts send --channel dev-alerts --text "Build complete"
```

**Example 4: Check health**
```
User: "is the slack bot running?"
-> Invokes SessionManagement workflow
-> Calls SlackAPI.ts health
-> Reports status and active sessions
```

## State Storage

All state stored in `$PAI_DIR/skills/Slack/State/`:
- `sessions/thread-sessions.json` - Thread-to-Claude session mapping
- `memory/store.json` - Extracted memories (goals, facts, challenges, ideas, projects)
- `profiles/` - User profile data
- `channels/` - Channel configurations
- `files/` - Downloaded file metadata
- `logs/` - Service logs

## Memory Extraction

Use these triggers in Slack messages to capture memories:

| Trigger | Type | Example |
|---------|------|---------|
| `goal:` | Goal | `@bot goal: complete the project by Friday` |
| `remember:` | Fact | `@bot remember: API key expires March 15` |
| `challenge:` | Challenge | `@bot challenge: staying focused in meetings` |
| `idea:` | Idea | `@bot idea: build a habit tracker app` |
| `project:` | Project | `@bot project: website redesign` |

Memories are stored locally in `State/memory/` and can be synced to TELOS via `TELOSBridge.ts sync`.

## Multi-User Thread Awareness

**CRITICAL:** Threads may have multiple participants. Always consider who is speaking.

### User Identification

Each Slack message contains a unique `user` ID. User profiles are stored in `State/profiles/`:

```
State/profiles/
├── U0XXXXXXX.json
├── U0YYYYYYY.json
└── ...
```

### Response Guidelines

1. **Identify the speaker** - Check the User ID to know who sent the message
2. **Respect individual preferences** - Each user may have different language/style preferences
3. **Maintain context per user** - Don't assume all messages are from the same person
4. **Address appropriately** - When multiple users are in a thread, be clear about who you're responding to if needed

### Profile Structure

```json
{
  "id": "U0XXXXXXXX",
  "name": "user.name",
  "displayName": "Display Name",
  "role": "participant",
  "preferences": {
    "language": "en-US",
    "style": "professional"
  },
  "recentInteractions": [...]
}
```

## HTTP API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status and session count |
| `/sessions` | GET | List active thread sessions |
| `/sessions/clear` | POST | Clear all sessions |
| `/send` | POST | Send message to channel |
| `/channels` | GET | List accessible channels |
| `/channels/configured` | GET | List configured channels |
| `/channel/:id` | GET | Get channel configuration |
| `/profile/:id` | GET | Get user profile |
| `/memory` | GET | Memory extraction statistics |
| `/progress/start` | POST | Start progress message |
| `/progress/update` | POST | Update progress message |
| `/progress/clear` | POST | Clear progress tracking |
| `/upload` | POST | Upload file to channel |
| `/files/:channel` | GET | List files for channel |
| `/file/:id` | GET | Get file info |
