# Slack Bot Integration - Verification Guide

Use this guide to verify your installation is working correctly.

## Quick Health Check

```bash
# Check if server is running and healthy
curl -s http://localhost:9000/health | jq .
```

Expected response:
```json
{
  "status": "healthy",
  "port": 9000,
  "socket_mode": true,
  "bot_token_configured": true,
  "app_token_configured": true,
  "active_sessions": 0
}
```

---

## Pre-Flight Checklist

Run these checks before starting the server:

### 1. File Structure Verification

```bash
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

echo "=== File Structure Check ==="
for file in Server.ts Types.ts SlackAPI.ts MemoryExtractor.ts TELOSBridge.ts ChannelManager.ts ProfileManager.ts ContextBuilder.ts FileManager.ts; do
  [ -f "$PAI_DIR/skills/Slack/Tools/$file" ] && echo "✓ $file" || echo "✗ MISSING: $file"
done

echo ""
echo "=== Directory Check ==="
for dir in sessions profiles channels memory files logs; do
  [ -d "$PAI_DIR/skills/Slack/State/$dir" ] && echo "✓ State/$dir" || echo "✗ MISSING: State/$dir"
done
```

### 2. Environment Configuration

```bash
echo "=== Environment Check ==="
[ -f "$PAI_DIR/.env" ] && echo "✓ .env file exists" || echo "✗ .env file missing"

grep -q "^SLACK_BOT_TOKEN=xoxb-" "$PAI_DIR/.env" 2>/dev/null && \
  echo "✓ SLACK_BOT_TOKEN configured (xoxb-)" || \
  echo "✗ SLACK_BOT_TOKEN missing or invalid"

grep -q "^SLACK_APP_TOKEN=xapp-" "$PAI_DIR/.env" 2>/dev/null && \
  echo "✓ SLACK_APP_TOKEN configured (xapp-)" || \
  echo "✗ SLACK_APP_TOKEN missing or invalid"
```

### 3. Dependencies Check

```bash
echo "=== Dependencies Check ==="
[ -d "$PAI_DIR/skills/Slack/Tools/node_modules/@slack/bolt" ] && \
  echo "✓ @slack/bolt installed" || \
  echo "✗ @slack/bolt missing - run: bun add @slack/bolt"

[ -d "$PAI_DIR/skills/Slack/Tools/node_modules/@slack/web-api" ] && \
  echo "✓ @slack/web-api installed" || \
  echo "✗ @slack/web-api missing - run: bun add @slack/web-api"

which bun >/dev/null 2>&1 && \
  echo "✓ Bun runtime: $(bun --version)" || \
  echo "✗ Bun runtime not found"
```

---

## Runtime Verification

After starting the server, verify these endpoints:

### Health Endpoint

```bash
curl -s http://localhost:9000/health
```

| Field | Expected | Meaning |
|-------|----------|---------|
| status | "healthy" | Server is running |
| socket_mode | true | Connected to Slack |
| bot_token_configured | true | Bot token loaded |
| app_token_configured | true | App token loaded |

### Channels Endpoint

```bash
curl -s http://localhost:9000/channels | jq .
```

Should return list of channels the bot can access.

### Sessions Endpoint

```bash
curl -s http://localhost:9000/sessions | jq .
```

Returns active thread-to-Claude session mappings.

### Memory Stats

```bash
curl -s http://localhost:9000/memory | jq .
```

Returns:
```json
{
  "total": 0,
  "byType": {
    "goals": 0,
    "facts": 0,
    "challenges": 0,
    "ideas": 0,
    "projects": 0
  },
  "unsynced": 0
}
```

---

## Functional Verification

### Test 1: Slack Connection

1. Open Slack workspace
2. Invite bot to a test channel: `/invite @YourBot`
3. Mention the bot: `@YourBot ping`
4. Bot should respond with channel onboarding or a reply

**Check server logs for:**
```
Mention received in C0A... : "ping..."
Invoking Claude with prompt: "ping..."
Response sent to thread...
```

### Test 2: Session Persistence

1. Start a conversation: `@YourBot help me plan a project`
2. Get initial response
3. Reply in same thread: `@YourBot add testing phase`
4. Bot should remember context from first message

**Verify session created:**
```bash
curl -s http://localhost:9000/sessions | jq .
# Should show session for the thread
```

### Test 3: Memory Extraction

1. Send: `@YourBot goal: complete the Slack integration`
2. Check memory was stored:

```bash
curl -s http://localhost:9000/memory | jq .
# goals count should increase
```

Or check the store directly:
```bash
cat "$PAI_DIR/skills/Slack/State/memory/store.json" | jq '.goals'
```

### Test 4: HTTP Message Sending

```bash
# Get channel ID from Slack or from /channels endpoint
CHANNEL_ID="C0A63N49M2R"  # Replace with actual ID

curl -X POST http://localhost:9000/send \
  -H "Content-Type: application/json" \
  -d "{\"channel\": \"$CHANNEL_ID\", \"text\": \"Test message from API\"}"
```

Expected: `{"ok":true,"ts":"1234567890.123456"}`

### Test 5: File Upload

```bash
# Create test file
echo "Test content" > /tmp/test.txt

curl -X POST http://localhost:9000/upload \
  -H "Content-Type: application/json" \
  -d "{\"channel\": \"$CHANNEL_ID\", \"file_path\": \"/tmp/test.txt\", \"title\": \"Test Upload\"}"
```

Expected: `{"ok":true,"file_id":"F0...","permalink":"https://..."}`

---

## CLI Tool Verification

### SlackAPI CLI

```bash
cd "$PAI_DIR/skills/Slack/Tools"

# Health check
bun run SlackAPI.ts health

# List channels
bun run SlackAPI.ts channels

# List sessions
bun run SlackAPI.ts sessions
```

### Memory Extractor CLI

```bash
# Show stats
bun run MemoryExtractor.ts stats

# Test extraction
bun run MemoryExtractor.ts test "goal: test the system"
```

### Channel Manager CLI

```bash
# List configured channels
bun run ChannelManager.ts list
```

### Profile Manager CLI

```bash
# List profiles
bun run ProfileManager.ts list
```

---

## Service Verification

If running as a system service:

### Linux (systemd)

```bash
# Check status
sudo systemctl status pai-slack

# View logs
journalctl -u pai-slack -f

# Check if enabled on boot
systemctl is-enabled pai-slack
```

### macOS (launchd)

```bash
# Check if loaded
launchctl list | grep pai.slack

# View logs
tail -f "$PAI_DIR/skills/Slack/State/logs/stdout.log"
```

---

## Common Issues & Solutions

### Issue: Health returns "unhealthy"

**Solution:** Check server logs for token errors:
```bash
# Look for auth errors
grep -i "error\|invalid\|token" "$PAI_DIR/skills/Slack/State/logs/stderr.log"
```

### Issue: No response in Slack

**Checklist:**
1. Bot invited to channel?
2. Event subscriptions enabled?
3. `app_mentions:read` scope added?
4. Server running? (`curl localhost:9000/health`)

### Issue: Sessions not persisting

**Check:** State directory permissions:
```bash
ls -la "$PAI_DIR/skills/Slack/State/sessions/"
# Should have write permissions
```

### Issue: Memory not storing

**Check:** Memory directory and store file:
```bash
ls -la "$PAI_DIR/skills/Slack/State/memory/"
cat "$PAI_DIR/skills/Slack/State/memory/store.json"
```

---

## Complete Verification Script

Run this to perform all checks at once:

```bash
#!/bin/bash
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

echo "========================================"
echo "PAI Slack Integration Verification"
echo "========================================"
echo ""

# Pre-flight
echo "--- Pre-Flight Checks ---"
[ -f "$PAI_DIR/.env" ] && echo "✓ .env exists" || echo "✗ .env missing"
[ -f "$PAI_DIR/skills/Slack/Tools/Server.ts" ] && echo "✓ Server.ts exists" || echo "✗ Server.ts missing"
[ -d "$PAI_DIR/skills/Slack/Tools/node_modules/@slack" ] && echo "✓ Dependencies installed" || echo "✗ Dependencies missing"

echo ""
echo "--- Runtime Checks ---"

# Try health endpoint
health=$(curl -s http://localhost:9000/health 2>/dev/null)
if [ -n "$health" ]; then
  echo "✓ Server responding"
  echo "  Status: $(echo $health | jq -r '.status')"
  echo "  Socket Mode: $(echo $health | jq -r '.socket_mode')"
  echo "  Sessions: $(echo $health | jq -r '.active_sessions')"
else
  echo "✗ Server not responding (is it running?)"
fi

echo ""
echo "--- Memory Stats ---"
memory=$(curl -s http://localhost:9000/memory 2>/dev/null)
if [ -n "$memory" ]; then
  echo "  Total memories: $(echo $memory | jq -r '.total')"
  echo "  Unsynced: $(echo $memory | jq -r '.unsynced')"
else
  echo "  (server not running)"
fi

echo ""
echo "========================================"
echo "Verification complete"
echo "========================================"
```

Save as `verify.sh` and run: `bash verify.sh`
