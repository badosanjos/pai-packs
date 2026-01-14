# Slack Bot Integration - Installation Guide

Complete step-by-step installation for the Slack Bot Integration pack.

## Quick Install (5 minutes)

For experienced users who want to get running quickly:

```bash
# 1. Set PAI directory
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# 2. Run automated install script
curl -fsSL https://raw.githubusercontent.com/badosanjos/pai-packs/main/Packs/Slack/install.sh | bash

# 3. Configure tokens (edit manually)
nano "$PAI_DIR/.env"
# Add: SLACK_BOT_TOKEN=xoxb-...
# Add: SLACK_APP_TOKEN=xapp-...

# 4. Start server
bun run "$PAI_DIR/skills/Slack/Tools/Server.ts"
```

---

## Full Installation

### Prerequisites Checklist

Before starting, ensure you have:

- [ ] Bun runtime installed (`bun --version` should work)
- [ ] Slack workspace where you can create apps
- [ ] Admin or permission to install apps in the workspace

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

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From scratch**
4. Name your app (e.g., "PAI Assistant") and select workspace
5. Click **Create App**

### Step 3: Configure Socket Mode

1. In your app settings, go to **Settings > Socket Mode**
2. Toggle **Enable Socket Mode** to ON
3. Click **Generate Token**
4. Name it "socket-mode" and add scope `connections:write`
5. Click **Generate**
6. **Copy the token** (starts with `xapp-`) - you'll need this

### Step 4: Configure Bot Permissions

1. Go to **OAuth & Permissions** in the sidebar
2. Under **Scopes > Bot Token Scopes**, add these scopes:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Detect @mentions |
| `chat:write` | Send messages |
| `channels:history` | Read thread context |
| `channels:read` | List channels |
| `files:read` | Download files |
| `files:write` | Upload files |
| `users:read` | Get user info |

3. Scroll up and click **Install to Workspace**
4. Authorize the app
5. **Copy the Bot User OAuth Token** (starts with `xoxb-`)

### Step 5: Enable Events

1. Go to **Event Subscriptions**
2. Toggle **Enable Events** to ON
3. Under **Subscribe to bot events**, add:
   - `app_mention`
   - `message.channels` (optional, for file support)
4. Click **Save Changes**

### Step 6: Create Directory Structure

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

### Step 7: Configure Environment

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

### Step 8: Copy Source Files

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
  curl -O "https://raw.githubusercontent.com/badosanjos/pai-packs/main/Packs/Slack/src/$file"
done
```

### Step 9: Install Dependencies

```bash
cd "$PAI_DIR/skills/Slack/Tools"

# Initialize package.json if needed
[ -f package.json ] || echo '{"type":"module"}' > package.json

# Install Slack SDK
bun add @slack/bolt @slack/web-api
```

### Step 10: Update Skill Index

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

### Step 11: Verify Installation

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

### Step 12: Start the Server

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

### Step 13: Test the Integration

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
