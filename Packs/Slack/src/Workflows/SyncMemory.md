# SyncMemory Workflow

Sync extracted Slack memories to TELOS files.

## When to Use

User says:
- "Sync slack memories"
- "Sync to telos"
- "Push memories to telos"
- "slack memory sync"

## How It Works

1. **Extraction** happens automatically when you use triggers like `goal:`, `remember:`, etc.
2. **Local storage** saves to `$PAI_DIR/skills/Slack/State/memory/store.json`
3. **TELOS sync** is manual (this workflow) or can be automated

## Execution

### Check Status

```bash
bun run $PAI_DIR/skills/Slack/Tools/TELOSBridge.ts status
```

Shows:
- Total memories stored
- How many are unsynced
- TELOS file status

### Sync to TELOS

```bash
bun run $PAI_DIR/skills/Slack/Tools/TELOSBridge.ts sync
```

Appends unsynced memories to TELOS files:
- `goal:` → GOALS.md
- `remember:`, `fact:` → LEARNED.md
- `challenge:` → CHALLENGES.md
- `idea:` → IDEAS.md
- `project:` → PROJECTS.md

### Export for Migration

```bash
bun run $PAI_DIR/skills/Slack/Tools/TELOSBridge.ts export
```

Creates `telos-export.json` for future migration when official TELOS pack releases.

## Memory Triggers

Use these in Slack to capture memories:

| Trigger | Type | Example |
|---------|------|---------|
| `goal:` | Goal | `goal: lose 10kg by March` |
| `my goal is` | Goal | `my goal is to learn Rust` |
| `remember:` | Fact | `remember: Luna's birthday is March 15` |
| `fact:` | Fact | `fact: API key rotates monthly` |
| `challenge:` | Challenge | `challenge: staying focused in meetings` |
| `struggling with` | Challenge | `struggling with procrastination` |
| `idea:` | Idea | `idea: build a habit tracker app` |
| `project:` | Project | `project: PAI Slack migration` |
| `working on` | Project | `working on the new authentication flow` |

## TELOS Files

Memories sync to these files in `$PAI_DIR/skills/CORE/USER/TELOS/`:

- **GOALS.md** - Goals tagged `[slack]`
- **LEARNED.md** - Facts and learnings tagged `[slack]`
- **CHALLENGES.md** - Obstacles tagged `[slack]`
- **IDEAS.md** - Ideas tagged `[slack]`
- **PROJECTS.md** - Projects tagged `[slack]`

## Future Migration

When official PAI TELOS pack releases:

1. Check `_UPGRADE_FLAG.md` for instructions
2. Run export: `TELOSBridge.ts export`
3. Follow official migration guide
4. Archive custom implementation
