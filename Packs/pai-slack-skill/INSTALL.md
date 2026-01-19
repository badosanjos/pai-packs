# PAI Slack Integration - Installation Guide

Complete step-by-step installation for the PAI Slack Integration skill pack.

## Quick Install

For experienced users who want to get running quickly:

```bash
# 1. Set PAI directory
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# 2. Download source files
cd "$PAI_DIR/skills/Slack/Tools"
for file in Server.ts Types.ts SlackAPI.ts MemoryExtractor.ts TELOSBridge.ts ChannelManager.ts ProfileManager.ts ContextBuilder.ts FileManager.ts; do
  curl -sO "https://raw.githubusercontent.com/badosanjos/pai-packs/main/Packs/pai-slack-skill/src/$file"
done

# 3. Install dependencies
bun add @slack/bolt @slack/web-api

# 4. Configure tokens (edit manually)
nano "$PAI_DIR/.env"
# Add: SLACK_BOT_TOKEN=xoxb-...
# Add: SLACK_APP_TOKEN=xapp-...

# 5. Start server
bun run "$PAI_DIR/skills/Slack/Tools/Server.ts"
```

---

## Full Installation

### Prerequisites Checklist

Before starting, ensure you have:

- [ ] Bun runtime installed (`bun --version` should work)
- [ ] Claude Code CLI installed (`claude --version` should work)
- [ ] Slack workspace access
- [ ] **Permission to create Slack Apps** in your workspace (see note below)
- [ ] **Non-root user account** (see security note below)

> **Critical: Claude Code Permissions & Security**
>
> This bot runs Claude Code in **headless mode** with `--dangerously-skip-permissions` flag because Slack cannot handle interactive permission prompts. This means:
>
> **Security Implications:**
> - Claude will have access to execute bash commands, read/write files without asking
> - The bot uses a restricted tool set: `Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch`
> - All actions are logged but not interactively approved
>
> **Requirements:**
> - **DO NOT run as root user** - Claude Code refuses to run with root privileges for safety
> - Create a dedicated non-root user for the bot service (recommended)
> - Consider running in a sandboxed environment or container
>
> **To configure allowed tools**, set `PAI_SLACK_ALLOWED_TOOLS` in your `.env`:
> ```bash
> # Default tools (recommended)
> PAI_SLACK_ALLOWED_TOOLS="Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch"
>
> # Restricted mode (read-only, safer)
> PAI_SLACK_ALLOWED_TOOLS="Read,Glob,Grep,WebSearch,WebFetch"
>
> # Extended mode (includes Task for subagents)
> PAI_SLACK_ALLOWED_TOOLS="Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Task"
> ```

> **Important: Slack App Creation Permissions**
>
> To create a Slack App, you need one of the following:
> - **Workspace Owner or Admin** role
> - **Permission granted by admin** to create apps (Settings > Manage Apps > App Management)
> - Access to a **development workspace** where you have full control
>
> If you see "You don't have permission to install apps" when trying to install, contact your Slack workspace admin to either:
> 1. Grant you permission to create apps
> 2. Create the app for you using the manifest file provided ([slack-app-manifest.json](slack-app-manifest.json))
>
> For enterprise workspaces, you may need IT approval before proceeding.

### Step 1: Install Bun Runtime

If you don't have Bun installed:

```bash
# Linux/macOS/WSL
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

For Windows native, download from https://bun.sh/docs/installation

### Step 2: Create Slack App

You have two options to create the Slack App:

#### Option A: Using App Manifest (Recommended - Fastest)

The manifest file pre-configures all permissions, events, and Socket Mode settings automatically.

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From an app manifest**
4. Select your workspace and click **Next**
5. Choose **JSON** tab and paste the contents of [`slack-app-manifest.json`](slack-app-manifest.json):

```json
{
  "display_information": {
    "name": "PAI Assistant",
    "description": "Personal AI Infrastructure - Claude-powered assistant",
    "background_color": "#4A154B"
  },
  "features": {
    "bot_user": {
      "display_name": "PAI Assistant",
      "always_online": true
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "channels:history",
        "channels:read",
        "chat:write",
        "files:read",
        "files:write",
        "users:read",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history",
        "mpim:read",
        "mpim:write"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim"
      ]
    },
    "socket_mode_enabled": true
  }
}
```

6. Click **Next**, review the summary, then click **Create**
7. Skip to **Step 3** below to generate tokens

#### Option B: Manual Configuration

If you prefer to configure manually or need custom settings:

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From scratch**
4. Name your app (e.g., "PAI Assistant") and select workspace
5. Click **Create App**

**Enable Socket Mode:**
1. Go to **Settings > Socket Mode** in the sidebar
2. Toggle **Enable Socket Mode** to ON
3. You'll generate the token in Step 3

**Configure Bot Permissions:**
1. Go to **OAuth & Permissions** in the sidebar
2. Under **Scopes > Bot Token Scopes**, add these scopes:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Detect @mentions in channels |
| `chat:write` | Send messages and replies |
| `channels:history` | Read thread context for session continuity |
| `channels:read` | List and identify channels |
| `files:read` | Download shared files |
| `files:write` | Upload files to channels |
| `users:read` | Get user profile information |
| `groups:history` | Read private channel history (optional) |
| `im:history` | Read direct message history (optional) |
| `im:write` | Send direct messages (optional) |

**Enable Events:**
1. Go to **Event Subscriptions** in the sidebar
2. Toggle **Enable Events** to ON
3. Under **Subscribe to bot events**, add:
   - `app_mention` (required)
   - `message.channels` (for file support)
   - `message.groups` (for private channels, optional)
   - `message.im` (for DMs, optional)
4. Click **Save Changes**

### Step 3: Generate Tokens

After creating the app (via manifest or manual), you need two tokens:

**App-Level Token (for Socket Mode):**
1. Go to **Settings > Basic Information**
2. Scroll to **App-Level Tokens**
3. Click **Generate Token and Scopes**
4. Name: `socket-mode`
5. Add scope: `connections:write`
6. Click **Generate**
7. **Copy the token** (starts with `xapp-`) - save this securely

**Bot User OAuth Token:**
1. Go to **OAuth & Permissions** in the sidebar
2. Click **Install to Workspace** (or **Reinstall** if already installed)
3. Review and authorize the permissions
4. **Copy the Bot User OAuth Token** (starts with `xoxb-`) - save this securely

> **Security Note:** Never commit these tokens to version control. They provide full access to your Slack workspace through this bot.

### Step 4: Create Directory Structure

```bash
# Set your PAI directory (default: ~/.claude)
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Create all required directories
mkdir -p "$PAI_DIR/skills/Slack/Tools"
mkdir -p "$PAI_DIR/skills/Slack/Workflows"
mkdir -p "$PAI_DIR/skills/Slack/State/sessions"
mkdir -p "$PAI_DIR/skills/Slack/State/profiles"
mkdir -p "$PAI_DIR/skills/Slack/State/channels"
mkdir -p "$PAI_DIR/skills/Slack/State/memory"
mkdir -p "$PAI_DIR/skills/Slack/State/files"
mkdir -p "$PAI_DIR/skills/Slack/State/logs"

# Verify structure
ls -la "$PAI_DIR/skills/Slack/"
```

### Step 5: Configure Environment

Create or update your `.env` file:

```bash
# Create .env if it doesn't exist
touch "$PAI_DIR/.env"

# Add Slack configuration
cat >> "$PAI_DIR/.env" << 'EOF'

# Slack Bot Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
PAI_SLACK_PORT=9000
EOF
```

**Important:** Replace the placeholder tokens with your actual tokens from Steps 3 and 4.

```bash
# Edit with your tokens
nano "$PAI_DIR/.env"
```

### Step 6: Copy Source Files

Copy all TypeScript files from this pack's `src/` directory to your installation:

```bash
# From the pack directory
cp src/*.ts "$PAI_DIR/skills/Slack/Tools/"
cp src/Workflows/*.md "$PAI_DIR/skills/Slack/Workflows/"
cp SKILL.md "$PAI_DIR/skills/Slack/"
```

Or download directly:

```bash
cd "$PAI_DIR/skills/Slack/Tools"

# Download all source files
for file in Server.ts Types.ts SlackAPI.ts MemoryExtractor.ts TELOSBridge.ts ChannelManager.ts ProfileManager.ts ContextBuilder.ts FileManager.ts; do
  curl -O "https://raw.githubusercontent.com/badosanjos/pai-packs/main/Packs/pai-slack-skill/src/$file"
done
```

### Step 7: Install Dependencies

```bash
cd "$PAI_DIR/skills/Slack/Tools"

# Initialize package.json if needed
[ -f package.json ] || echo '{"type":"module"}' > package.json

# Install Slack SDK
bun add @slack/bolt @slack/web-api
```

### Step 8: Update Skill Index

Add the Slack skill to your skill index:

```bash
# Check if skill-index.json exists
if [ -f "$PAI_DIR/skills/skill-index.json" ]; then
  echo "Update your skill-index.json to include the Slack skill"
else
  # Create new index
  cat > "$PAI_DIR/skills/skill-index.json" << 'EOF'
{
  "version": "1.0.0",
  "skills": {
    "Slack": {
      "path": "skills/Slack",
      "type": "deferred",
      "triggers": ["start slack", "slack server", "slack status", "send slack", "slack sessions", "sync memories"]
    }
  }
}
EOF
fi
```

### Step 9: Verify Installation

Run the verification checks:

```bash
# Check all files exist
echo "Checking files..."
[ -f "$PAI_DIR/skills/Slack/Tools/Server.ts" ] && echo "✓ Server.ts" || echo "✗ Server.ts missing"
[ -f "$PAI_DIR/skills/Slack/Tools/Types.ts" ] && echo "✓ Types.ts" || echo "✗ Types.ts missing"
[ -f "$PAI_DIR/skills/Slack/SKILL.md" ] && echo "✓ SKILL.md" || echo "✗ SKILL.md missing"

# Check tokens configured
echo "Checking configuration..."
grep -q "SLACK_BOT_TOKEN=xoxb-" "$PAI_DIR/.env" && echo "✓ Bot token configured" || echo "✗ Bot token missing"
grep -q "SLACK_APP_TOKEN=xapp-" "$PAI_DIR/.env" && echo "✓ App token configured" || echo "✗ App token missing"

# Check dependencies
echo "Checking dependencies..."
[ -d "$PAI_DIR/skills/Slack/Tools/node_modules/@slack" ] && echo "✓ Slack SDK installed" || echo "✗ Run: bun add @slack/bolt @slack/web-api"
```

### Step 10: Start the Server

```bash
# Start in foreground (for testing)
bun run "$PAI_DIR/skills/Slack/Tools/Server.ts"
```

Expected output:
```
Loaded 0 active sessions
PAI Slack Server running
Socket Mode: Connected to Slack
HTTP API: http://localhost:9000
Endpoints: /health, /send, /upload, /files/:channel, /channels, /sessions, /progress, /memory
Active sessions: 0
State directory: /home/user/.claude/skills/Slack/State
Files directory: /home/user/.claude/skills/Slack/State/files
Memory extraction: Enabled (triggers: goal:, remember:, challenge:, idea:, project:)
```

### Step 11: Test the Integration

1. Go to your Slack workspace
2. Invite the bot to a channel: `/invite @YourBotName`
3. Mention the bot: `@YourBotName hello!`
4. The bot should respond and initiate channel onboarding

---

## Service Installation (Optional)

To run the bot as a background service:

### Linux (systemd)

```bash
sudo tee /etc/systemd/system/pai-slack.service << EOF
[Unit]
Description=PAI Slack Bot
After=network.target

[Service]
Type=simple
User=$USER
Environment=PAI_DIR=$PAI_DIR
WorkingDirectory=$PAI_DIR/skills/Slack/Tools
ExecStart=$(which bun) run $PAI_DIR/skills/Slack/Tools/Server.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pai-slack
sudo systemctl start pai-slack
sudo systemctl status pai-slack
```

### macOS (launchd)

```bash
cat > ~/Library/LaunchAgents/com.pai.slack.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pai.slack</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which bun)</string>
        <string>run</string>
        <string>$PAI_DIR/skills/Slack/Tools/Server.ts</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PAI_DIR</key>
        <string>$PAI_DIR</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$PAI_DIR/skills/Slack/State/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$PAI_DIR/skills/Slack/State/logs/stderr.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.pai.slack.plist
```

---

## Troubleshooting

### "SLACK_BOT_TOKEN not found"

Ensure your `.env` file contains the token without quotes around the value:
```
SLACK_BOT_TOKEN=xoxb-1234567890-abcdefghijk
```

### "Socket Mode connection failed"

- Verify Socket Mode is enabled in your Slack app settings
- Check that your app token (xapp-) has `connections:write` scope
- Ensure no firewall is blocking WebSocket connections

### "Bot not responding to mentions"

1. Check the bot is invited to the channel
2. Verify `app_mentions:read` scope is added
3. Check Event Subscriptions are enabled
4. Look at server logs for errors

### "Cannot find module @slack/bolt"

Run dependency installation:
```bash
cd "$PAI_DIR/skills/Slack/Tools"
bun add @slack/bolt @slack/web-api
```

---

## Next Steps

After successful installation:

1. Run `/health` check: `curl http://localhost:9000/health`
2. Complete channel onboarding by mentioning the bot
3. Test memory extraction: `@bot goal: learn TypeScript`
4. Set up as system service for production use
