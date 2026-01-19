# PAI Community Packs

Community-contributed packs for [PAI (Personal AI Infrastructure)](https://github.com/danielmiessler/Personal_AI_Infrastructure).

## Available Packs

| Pack | Description | Version |
|------|-------------|---------|
| [**pai-slack-skill**](Packs/pai-slack-skill/) | Complete Slack bot with Socket Mode, thread-based session persistence, memory extraction, and HTTP API | v1.1.0 |

## Installation

Each pack includes detailed installation instructions. General pattern:

```bash
# Set your PAI directory
export PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Navigate to the pack you want
cd Packs/pai-slack-skill

# Follow the INSTALL.md instructions
cat INSTALL.md
```

## Pack Structure

Each pack follows the [PAI v2.3.0 Pack Template](https://github.com/danielmiessler/Personal_AI_Infrastructure/blob/main/Tools/PAIPackTemplate.md):

```
Packs/pai-{name}-skill/
├── README.md      # Pack documentation with YAML frontmatter
├── INSTALL.md     # Wizard-style installation
├── VERIFY.md      # Verification checklist
├── SKILL.md       # Claude skill definition
├── icons/         # 256x256 PNG icons
└── src/           # Source code
```

## Contributing

To contribute a pack:

1. Fork this repository
2. Create your pack following the template structure
3. Test on a fresh PAI installation
4. Submit a Pull Request

### Quality Requirements

- Clear problem statement
- Complete working code (no snippets)
- All dependencies documented
- Real examples (not placeholders)
- Verification steps included
- No hardcoded personal data or secrets

## Related

- [PAI Main Repository](https://github.com/danielmiessler/Personal_AI_Infrastructure)
- [Anthropic Skills](https://github.com/anthropics/skills)
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)

## License

MIT License - See [LICENSE](LICENSE) for details.

---

Maintained by [@badosanjos](https://github.com/badosanjos)
