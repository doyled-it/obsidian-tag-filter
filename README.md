# Tag Filter for Obsidian

Filter your checkbox items by their inline `#prefix/value` tags with an interactive tag picker that lives right above your editor.

> **Note:** Screenshots coming soon after first stable release.

## What It Does

Tag Filter adds a compact, interactive toolbar above your note editor. It scans your checkbox items for hierarchical tags like `#project/busta`, `#source/outlook`, `#priority/high`, and lets you filter your view instantly by clicking tag pills.

It also filters the **Obsidian Tasks plugin sidebar** (e.g., "Focus On Today"), so your whole workspace narrows down to what you're looking at.

## Features

- **Works in edit mode** - no need to switch to reading view
- **Auto-discovers tags** from `- [ ]` and `- [x]` items in the current note
- **Groups by prefix** - tags are organized under their prefix (`project/`, `source/`, etc.) with count badges
- **AND/OR toggle** - match items with *all* selected tags or *any* selected tag
- **Filters Tasks plugin sidebar** - the "Focus On Today" view and other Tasks panels also filter
- **Compact inline layout** - pills flow on one line, minimal vertical footprint
- **Non-destructive** - never modifies your markdown, only hides lines visually
- **Toggle on/off** - click the filter icon in the ribbon or use the command palette

## Usage

1. Open any note with tagged checkboxes
2. Click the **filter icon** in the left ribbon (or command palette: "Toggle Tag Filter")
3. The tag picker appears above your editor
4. Click tag pills to filter - active pills are highlighted
5. Toggle **AND/OR** to change matching behavior
6. Click **Clear** to reset all filters
7. Click the filter icon again to dismiss

### Example Tags

The plugin works with any `#prefix/value` tag pattern:

```markdown
- [ ] Review PR from Kyle #project/busta #source/gitlab
- [ ] Complete NATO training #project/hr #source/outlook 📅 2026-04-25
- [ ] Prepare TQE slides #project/ep2p #source/meeting-recap
```

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Default filter mode | AND (match all) or OR (match any) | OR |
| Auto-activate | Show picker automatically on notes with tagged checkboxes | On |
| Group by prefix | Group tags by prefix or show flat list | On |
| Excluded prefixes | Comma-separated prefixes to hide (e.g., `status,type`) | None |

## Installation

### Community Plugins (coming soon)

1. Open Settings > Community Plugins > Browse
2. Search "Tag Filter"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/doyled-it/obsidian-tag-filter/releases)
2. Create a folder: `.obsidian/plugins/tag-filter/` in your vault
3. Copy the three files into that folder
4. Restart Obsidian
5. Enable "Tag Filter" in Settings > Community Plugins

### Development

```bash
git clone https://github.com/doyled-it/obsidian-tag-filter.git
cd obsidian-tag-filter
npm install
npm run dev    # watch mode
npm run build  # production build
```

Symlink into your vault for testing:
```bash
ln -s /path/to/obsidian-tag-filter /path/to/vault/.obsidian/plugins/tag-filter
```

## Compatibility

- Obsidian v1.0.0+
- Works with the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin sidebar
- Works alongside Dataview, Calendar, and other community plugins

## Contributing

Issues and pull requests welcome at [github.com/doyled-it/obsidian-tag-filter](https://github.com/doyled-it/obsidian-tag-filter).

## License

MIT
