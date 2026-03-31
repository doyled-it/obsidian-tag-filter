# Tag Filter for Obsidian

An interactive tag picker that filters checkbox items by their inline `#prefix/value` tags.

## Features

- Auto-discovers tags from checkbox items in the current note
- Groups tags by prefix (`project/`, `source/`, `priority/`, etc.)
- Clickable tag pills with count badges
- AND/OR filter mode toggle
- Section headings collapse when all items are hidden
- Available inline (top of note) and as a sidebar panel
- Non-destructive: never modifies your markdown

## Usage

Open any note containing tagged checkboxes in reading view. The tag picker appears automatically at the top.

Click tag pills to filter. Use the AND/OR toggle to control whether items must match all or any selected tags. Click "Clear" to reset.

### Sidebar

Click the filter icon in the ribbon or use the command palette: "Toggle Tag Filter sidebar".

## Settings

- **Default filter mode** - AND or OR
- **Auto-activate** - show picker automatically on notes with tagged checkboxes
- **Group by prefix** - group tags or show flat list
- **Excluded prefixes** - comma-separated prefixes to hide from the picker

## Installation

### From Community Plugins (coming soon)

Search "Tag Filter" in Obsidian Settings > Community Plugins.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create `.obsidian/plugins/tag-filter/` in your vault
3. Copy the files into that directory
4. Enable "Tag Filter" in Community Plugins settings
