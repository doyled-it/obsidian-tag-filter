import { ItemView, MarkdownView, WorkspaceLeaf } from "obsidian";
import { parseNote } from "./NoteParser";
import { applyFilter, clearFilter } from "./FilterEngine";
import { TagFilterWidget } from "./TagFilterWidget";
import type TagFilterPlugin from "./main";

export const TAG_FILTER_VIEW_TYPE = "tag-filter-sidebar";

export class TagFilterSidebarView extends ItemView {
  private plugin: TagFilterPlugin;
  private widget: TagFilterWidget | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TagFilterPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TAG_FILTER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tag Filter";
  }

  getIcon(): string {
    return "filter";
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("tag-filter-sidebar");

    this.widget = new TagFilterWidget(contentEl, {
      onFilterChange: (selectedTags, mode) => {
        this.applyFilterToActiveNote(selectedTags, mode);
      },
    }, this.plugin.settings.defaultMode);

    this.refreshFromActiveNote();
  }

  async onClose(): Promise<void> {
    if (this.widget) {
      this.widget.destroy();
      this.widget = null;
    }
  }

  refreshFromActiveNote(): void {
    if (!this.widget) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      this.widget.update(new Map());
      return;
    }

    const content = view.editor.getValue();
    const result = parseNote(content);

    const excluded = new Set(
      this.plugin.settings.excludedPrefixes
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    );

    const filtered = new Map<string, Map<string, number>>();
    for (const [prefix, values] of result.tagGroups) {
      if (!excluded.has(prefix.toLowerCase())) {
        filtered.set(prefix, values);
      }
    }

    this.widget.update(filtered);
  }

  private applyFilterToActiveNote(selectedTags: Set<string>, mode: "AND" | "OR"): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const previewEl = (view as any).previewMode?.containerEl as HTMLElement | undefined;
    if (!previewEl) return;

    if (selectedTags.size === 0) {
      clearFilter(previewEl);
    } else {
      applyFilter(previewEl, { selectedTags, mode });
    }
  }
}
