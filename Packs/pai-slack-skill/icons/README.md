# Icon Requirements

This pack needs a 256x256 transparent PNG icon.

## Specifications
- Size: 256x256 pixels
- Format: PNG with transparency
- Color palette: Blue/purple (PAI standard)
- Suggested: Slack logo stylized or chat bubble with session indicator

## Generating an Icon

Option 1: Use Slack's brand assets (check licensing)
Option 2: Create custom icon with:
- ImageMagick: `convert -size 256x256 xc:transparent -fill '#4A154B' -draw "roundrectangle 20,20 236,236 20,20" slack.png`
- Figma/Canva with Slack-inspired design

Place the final icon as `slack.png` in this directory.
