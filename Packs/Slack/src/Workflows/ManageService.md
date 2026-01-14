# ManageService Workflow

Install, configure, and manage Slack as a system service.

## When to Use

User says:
- "Install slack service"
- "Set up slack to run on startup"
- "Check slack service status"
- "Uninstall slack service"

## Platform Detection

The workflow auto-detects platform, or user can specify explicitly.

## Execution

### Install Service

```bash
# Auto-detect platform
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --install

# Or specify platform
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --platform linux --install
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --platform mac --install
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --platform win --install
```

### Check Status

```bash
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --status
```

### Start/Stop/Restart

```bash
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --start
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --stop
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --restart
```

### Uninstall

```bash
bun run $PAI_DIR/skills/Slack/Tools/ServiceSetup.ts --uninstall
```

## Platform-Specific Notes

### Linux
- Uses systemd
- Requires sudo for system-wide install
- Unit: kai-slack.service
- Logs: `journalctl -u kai-slack -f`

### macOS
- Uses launchd
- User-level agent (no sudo required)
- Label: com.kai.slack
- Logs: `$PAI_DIR/skills/Slack/State/logs/`

### Windows
- Uses NSSM (Non-Sucking Service Manager)
- Requires Administrator for install
- Service name: KaiSlack
- Logs: `$PAI_DIR/skills/Slack/State/logs/`
