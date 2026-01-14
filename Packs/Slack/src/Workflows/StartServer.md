# StartServer Workflow

Launches the Slack bot server for interactive use.

## When to Use

User says:
- "Start the slack server"
- "Run slack bot"
- "Launch kai slack"

## Execution

### Step 1: Verify Configuration

Check that environment variables exist:

```bash
grep -q "SLACK_BOT_TOKEN" $PAI_DIR/.env && grep -q "SLACK_APP_TOKEN" $PAI_DIR/.env && echo "Tokens configured" || echo "ERROR: Missing Slack tokens in $PAI_DIR/.env"
```

### Step 2: Start Server

```bash
bun run $PAI_DIR/skills/Slack/Tools/Server.ts
```

Expected output:
```
Loaded N active sessions
Kai Slack Server running
Socket Mode: Connected to Slack
HTTP API: http://localhost:9000
```

### Step 3: Verify Connection

The server outputs connection status. Watch for errors in token validation.

## Stopping the Server

Press `Ctrl+C` to stop the foreground server.

For background execution, use the ManageService workflow instead.
