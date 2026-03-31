import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, Plugin } from "obsidian";
import { parseNote } from "./NoteParser";
import { applyFilter, clearFilter } from "./FilterEngine";
import { TagFilterWidget } from "./TagFilterWidget";
import { TagFilterSidebarView, TAG_FILTER_VIEW_TYPE } from "./SidebarView";
import { TagFilterSettings, DEFAULT_SETTINGS, TagFilterSettingTab } from "./settings";

export default class TagFilterPlugin extends Plugin {
  settings: TagFilterSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      TAG_FILTER_VIEW_TYPE,
      (leaf) => new TagFilterSidebarView(leaf, this)
    );

    this.addRibbonIcon("filter", "Toggle Tag Filter", () => {
      this.toggleSidebar();
    });

    this.addCommand({
      id: "toggle-tag-filter-sidebar",
      name: "Toggle Tag Filter sidebar",
      callback: () => this.toggleSidebar(),
    });

    this.addCommand({
      id: "clear-tag-filter",
      name: "Clear all tag filters",
      callback: () => this.clearAllFilters(),
    });

    this.registerMarkdownPostProcessor(
      (element: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.injectInlineWidget(element, ctx);
      }
    );

    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.refreshSidebar();
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.refreshSidebar();
      })
    );

    this.addSettingTab(new TagFilterSettingTab(this.app, this));
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private injectInlineWidget(
    element: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    if (!this.settings.autoActivate) return;

    const checkboxes = element.querySelectorAll(
      'li.task-list-item, li:has(> input[type="checkbox"])'
    );
    if (checkboxes.length === 0) return;

    const root = element.closest(".markdown-reading-view") ?? element.parentElement;
    if (!root) return;
    if (root.querySelector(".tag-filter-widget")) return;

    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    this.app.vault.cachedRead(file).then((content) => {
      const result = parseNote(content);
      if (result.tagGroups.size === 0) return;

      const excluded = this.getExcludedPrefixes();
      const filtered = new Map<string, Map<string, number>>();
      for (const [prefix, values] of result.tagGroups) {
        if (!excluded.has(prefix.toLowerCase())) {
          filtered.set(prefix, values);
        }
      }

      if (filtered.size === 0) return;

      const widgetContainer = document.createElement("div");
      element.prepend(widgetContainer);

      const child = new TagFilterRenderChild(
        widgetContainer,
        filtered,
        this.settings.defaultMode,
        root as HTMLElement
      );
      ctx.addChild(child);
    });
  }

  private getExcludedPrefixes(): Set<string> {
    return new Set(
      this.settings.excludedPrefixes
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    );
  }

  private async toggleSidebar(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(TAG_FILTER_VIEW_TYPE);

    if (existing.length > 0) {
      existing.forEach((leaf) => leaf.detach());
    } else {
      const leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: TAG_FILTER_VIEW_TYPE, active: true });
        workspace.revealLeaf(leaf);
      }
    }
  }

  private clearAllFilters(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const previewEl = (view as any).previewMode?.containerEl as HTMLElement | undefined;
    if (previewEl) {
      clearFilter(previewEl);
    }
  }

  private refreshSidebar(): void {
    this.app.workspace.getLeavesOfType(TAG_FILTER_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof TagFilterSidebarView) {
        leaf.view.refreshFromActiveNote();
      }
    });
  }
}

class TagFilterRenderChild extends MarkdownRenderChild {
  private widget: TagFilterWidget | null = null;

  constructor(
    containerEl: HTMLElement,
    private tagGroups: Map<string, Map<string, number>>,
    private defaultMode: "AND" | "OR",
    private noteContainer: HTMLElement
  ) {
    super(containerEl);
  }

  onload(): void {
    this.widget = new TagFilterWidget(this.containerEl, {
      onFilterChange: (selectedTags, mode) => {
        if (selectedTags.size === 0) {
          clearFilter(this.noteContainer);
        } else {
          applyFilter(this.noteContainer, { selectedTags, mode });
        }
      },
    }, this.defaultMode);

    this.widget.update(this.tagGroups);
  }

  onunload(): void {
    if (this.widget) {
      this.widget.destroy();
      this.widget = null;
    }
    clearFilter(this.noteContainer);
  }
}
