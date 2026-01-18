# PAI Packs Multi-Deployment Sync Strategy

## Overview

This document outlines the strategy for using the public `pai-packs` repository as a central hub for syncing improvements across multiple PAI deployments.

## Repository Structure

```
pai-packs/
├── .github/
│   └── workflows/          # CI/CD automation
├── Packs/
│   ├── Slack/              # Slack Bot Integration Pack
│   │   ├── src/
│   │   │   ├── Server.ts
│   │   │   ├── Types.ts
│   │   │   ├── MemoryExtractor.ts
│   │   │   ├── ChannelManager.ts
│   │   │   ├── ContextBuilder.ts
│   │   │   ├── ProfileManager.ts
│   │   │   ├── FileManager.ts
│   │   │   ├── TELOSBridge.ts
│   │   │   └── SlackAPI.ts
│   │   ├── README.md
│   │   ├── INSTALL.md
│   │   ├── VERIFY.md
│   │   ├── SKILL.md
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── [Future Packs]/
├── LICENSE
├── README.md
└── SYNC-STRATEGY.md      # This file
```

## Workflow: Local Development → Public Repo → All Deployments

### Phase 1: Development & Testing (Local PAI)

```bash
# Work on features in your local PAI deployment
cd /opt/PAI/.claude/skills/Slack/Tools

# Make improvements, test thoroughly
# Once stable, identify what to sync
```

### Phase 2: Export to Public Repo

```bash
# Clone public repo
git clone https://github.com/badosanjos/pai-packs.git
cd pai-packs

# Create feature branch
git checkout -b feat/your-feature-name

# Copy updated files from local deployment
cp /opt/PAI/.claude/skills/Slack/Tools/Server.ts Packs/Slack/src/
cp /opt/PAI/.claude/skills/Slack/Tools/MemoryExtractor.ts Packs/Slack/src/
# ... etc

# Review changes
git diff

# Commit with descriptive message
git add .
git commit -m "feat: Brief description

Detailed explanation of:
- What changed
- Why it changed
- How to use it
- Migration notes (if any)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
git push origin feat/your-feature-name

# Create Pull Request via GitHub UI or gh CLI
gh pr create --title "feat: Your Feature" --body-file PR-DESCRIPTION.md
```

### Phase 3: Import to Other Deployments

#### Option A: Git Pull (Recommended for Git-managed PAI)
```bash
# On each PAI deployment
cd /opt/PAI/.claude/skills/Slack

# Add public repo as remote (one-time setup)
git remote add public https://github.com/badosanjos/pai-packs.git

# Fetch latest changes
git fetch public

# Merge specific feature
git merge public/feat/your-feature-name

# Or merge main/master for all updates
git fetch public
git merge public/master

# Copy to Tools directory if needed
cp -r src/* Tools/
```

#### Option B: Manual Sync
```bash
# Download specific files via curl
curl -O https://raw.githubusercontent.com/badosanjos/pai-packs/master/Packs/Slack/src/Server.ts

# Move to your PAI deployment
mv Server.ts /opt/PAI/.claude/skills/Slack/Tools/

# Restart service
systemctl restart pai-slack  # or your service name
```

#### Option C: Script-based Sync
Create a sync script at `/opt/PAI/scripts/sync-slack.sh`:

```bash
#!/bin/bash
# Sync Slack Bot from public repo

REPO_URL="https://github.com/badosanjos/pai-packs.git"
TEMP_DIR="/tmp/pai-packs-sync"
TARGET_DIR="/opt/PAI/.claude/skills/Slack/Tools"

# Clone latest
rm -rf "$TEMP_DIR"
git clone --depth 1 "$REPO_URL" "$TEMP_DIR"

# Backup current version
cp -r "$TARGET_DIR" "$TARGET_DIR.backup-$(date +%Y%m%d-%H%M%S)"

# Sync files
cp "$TEMP_DIR/Packs/Slack/src/"* "$TARGET_DIR/"

# Cleanup
rm -rf "$TEMP_DIR"

# Restart service
echo "Files synced. Restart your Slack bot service to apply changes."
```

## Branching Strategy

### Main Branches
- **`master`** - Stable, production-ready code
- **`develop`** - Integration branch for features

### Feature Branches
- **`feat/*`** - New features (e.g., `feat/thread-tracking`)
- **`fix/*`** - Bug fixes (e.g., `fix/memory-leak`)
- **`docs/*`** - Documentation updates
- **`chore/*`** - Maintenance tasks

### Release Process
```
feat/thread-tracking
      ↓
    develop  (merge & test)
      ↓
    master   (merge when stable)
      ↓
   Tag v1.1.0
```

## Versioning

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (v2.0.0) - Breaking changes
- **MINOR** (v1.1.0) - New features, backward compatible
- **PATCH** (v1.0.1) - Bug fixes

Example:
```bash
# After merging feature to master
git tag -a v1.1.0 -m "Release v1.1.0: Thread message tracking"
git push origin v1.1.0
```

## Change Management

### Backward Compatibility Rules
1. **Never break existing deployments** without major version bump
2. **Always provide migration path** for breaking changes
3. **Default to safe behavior** for new optional features
4. **Test across deployments** before merging to master

### Communication
- Document all changes in PR description
- Update CHANGELOG.md for each release
- Tag breaking changes with `⚠️ BREAKING CHANGE`
- Provide rollback instructions

## Deployment Tracking

### Track which deployments have which versions

Create `/opt/PAI/.claude/VERSION` on each deployment:
```json
{
  "deployment": "PAI-PROD-01",
  "location": "home-server",
  "slack_bot_version": "v1.1.0",
  "last_sync": "2026-01-18T16:00:00Z",
  "git_commit": "a6df662",
  "features": [
    "thread-message-tracking",
    "memory-extraction",
    "file-uploads"
  ]
}
```

### Sync Status Dashboard
Consider creating a simple status page:

```bash
# Script to check version across deployments
for deployment in PAI-PROD-01 PAI-DEV-01 PAI-TEST-01; do
  ssh $deployment "cat /opt/PAI/.claude/VERSION | jq -r '.slack_bot_version'"
done
```

## Testing Strategy

### Before Publishing to Public Repo
- ✅ Test on local deployment (development)
- ✅ Test on staging deployment (if available)
- ✅ Verify backward compatibility
- ✅ Document any new dependencies
- ✅ Update README/docs if needed

### After Merging PR
- ✅ Sync to one deployment first
- ✅ Monitor for 24-48 hours
- ✅ Check logs for errors
- ✅ Verify all features work
- ✅ Then sync to remaining deployments

## Contribution Workflow

### For Team Members
1. Fork or branch from `master`
2. Make changes in feature branch
3. Test locally
4. Create PR with detailed description
5. Request review
6. Merge after approval
7. Delete feature branch

### For External Contributors
1. Fork repository
2. Make changes
3. Create PR from fork
4. Maintainer reviews
5. Maintainer merges or requests changes

## Conflict Resolution

### When Local Changes Conflict with Public Repo
```bash
# Fetch public changes
git fetch public

# Try rebase (cleanest)
git rebase public/master

# If conflicts, resolve manually
git status  # shows conflicts
# Edit files, resolve conflicts
git add .
git rebase --continue

# Or use merge if rebase is complex
git merge public/master
```

### Preserving Local Customizations
Create a `local-customizations` branch:
```bash
git checkout -b local-customizations
# Make your deployment-specific changes here
# Merge public updates into this branch
# Never push this branch to public repo
```

## Automation Ideas

### GitHub Actions Workflows

#### 1. Auto-sync on Release
`.github/workflows/notify-deployments.yml`:
```yaml
name: Notify Deployments on Release

on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send notification
        run: |
          # Send webhook to each deployment
          # Each PAI can have an endpoint that triggers sync
```

#### 2. Version Checker
`.github/workflows/check-versions.yml`:
```yaml
name: Check Deployment Versions

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Query deployments
        # SSH to each deployment, check VERSION file
        # Create issue if outdated
```

## Best Practices

### DO ✅
- ✅ Test thoroughly before pushing to public repo
- ✅ Write clear commit messages
- ✅ Document breaking changes prominently
- ✅ Use feature flags for experimental features
- ✅ Keep deployment-specific configs out of public repo
- ✅ Tag releases regularly
- ✅ Maintain CHANGELOG.md

### DON'T ❌
- ❌ Push secrets or API keys
- ❌ Break backward compatibility without major version bump
- ❌ Merge untested code to master
- ❌ Include deployment-specific hardcoded paths
- ❌ Commit large binary files
- ❌ Force push to master/develop

## Security Considerations

### What to Keep Private
- Environment variables (`.env` files)
- API tokens and secrets
- Deployment-specific configurations
- User data or logs
- Private channel IDs

### What's Safe to Share
- Source code (TypeScript/JavaScript)
- Documentation
- Configuration templates
- Installation scripts (without secrets)
- Test files

### Sanitize Before Publishing
```bash
# Check for secrets before committing
git diff | grep -i "token\|secret\|password\|api_key"

# Use .gitignore
echo ".env" >> .gitignore
echo "*.log" >> .gitignore
echo "State/" >> .gitignore
```

## Monitoring & Observability

### Track Sync Health
```bash
# On each deployment, log sync events
echo "$(date): Synced to v1.1.0 (commit a6df662)" >> /opt/PAI/sync-history.log

# Monitor for errors after sync
tail -f /opt/PAI/.claude/skills/Slack/slack-bot.log
```

### Metrics to Track
- Version deployed on each instance
- Last sync timestamp
- Error rates before/after sync
- Feature adoption (which features are enabled)

## Rollback Procedure

If a sync causes issues:

```bash
# 1. Stop the service
systemctl stop pai-slack

# 2. Restore from backup
cp -r /opt/PAI/.claude/skills/Slack/Tools.backup-20260118-160000/* \
      /opt/PAI/.claude/skills/Slack/Tools/

# 3. Restart service
systemctl start pai-slack

# 4. Report issue to public repo
gh issue create --title "Rollback required after v1.1.0 sync" --body "..."
```

## Summary

This strategy enables:
- 🔄 **Centralized improvements** via public GitHub repo
- 🚀 **Easy distribution** to all PAI deployments
- 🛡️ **Safety** through testing and versioning
- 📊 **Visibility** into deployment status
- 🤝 **Collaboration** across team and community

---

**Questions or suggestions?**
- Open an issue: https://github.com/badosanjos/pai-packs/issues
- Discuss: https://github.com/badosanjos/pai-packs/discussions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
