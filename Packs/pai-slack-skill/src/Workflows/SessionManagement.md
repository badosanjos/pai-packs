# SessionManagement Workflow

Monitor and manage thread-to-session mappings.

## When to Use

User says:
- "List slack sessions"
- "Clear slack sessions"
- "Check slack health"
- "How many active sessions?"

## Execution

### Health Check

```bash
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts health
```

Output:
```
Server Health:
  Status: healthy
  Port: 9000
  Socket Mode: Connected
  Bot Token: Configured
  App Token: Configured
  Active Sessions: 5
```

### List Sessions

```bash
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts sessions
```

### Clear All Sessions

```bash
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts sessions --clear
```

## Session Expiry

Sessions expire after 4 hours of inactivity. The session file is located at:
```
$PAI_DIR/skills/Slack/State/sessions/thread-sessions.json
```

## Direct HTTP API Usage

```bash
# Health check
curl http://localhost:9000/health

# List sessions
curl http://localhost:9000/sessions

# Clear sessions
curl -X POST http://localhost:9000/sessions/clear
```
