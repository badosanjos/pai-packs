# SendMessage Workflow

Send messages to Slack channels programmatically.

## When to Use

User says:
- "Send a message to #channel"
- "Post to slack"
- "Notify the team"

## Prerequisites

The Slack server must be running (either foreground or as service).

## Execution

### Send to Channel

```bash
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts send --channel "#general" --text "Hello from Kai!"
```

### Send to Thread

```bash
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts send --channel "#general" --thread "1234567890.123456" --text "Reply in thread"
```

### List Available Channels

```bash
bun run $PAI_DIR/skills/Slack/Tools/SlackAPI.ts channels
```

## Direct HTTP API Usage

If you need raw API access:

```bash
# Send message
curl -X POST http://localhost:9000/send \
  -H "Content-Type: application/json" \
  -d '{"channel": "#general", "text": "Hello!"}'

# Send to thread
curl -X POST http://localhost:9000/send \
  -H "Content-Type: application/json" \
  -d '{"channel": "#general", "text": "Reply", "thread_ts": "1234567890.123456"}'
```
