import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { MarkdownView, Plugin } from "obsidian";
import { parseNote, CheckboxItem } from "./NoteParser";
import { TagFilterWidget } from "./TagFilterWidget";
import { TagFilterSettings, DEFAULT_SETTINGS, TagFilterSettingTab } from "./settings";

// State effects for communicating filter changes to CodeMirror
const setFilterEffect = StateEffect.define<{
  selectedTags: string[];
  mode: "AND" | "OR";
}>();

const clearFilterEffect = StateEffect.define<null>();

// Line-hiding decoration
const hiddenLine = Decoration.line({ class: "tag-filter-hidden" });

/**
 * CodeMirror StateField that tracks which lines should be hidden
 * based on the active tag filter.
 */
const filterField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(clearFilterEffect)) {
        return Decoration.none;
      }
      if (effect.is(setFilterEffect)) {
        const { selectedTags, mode } = effect.value;
        const tagSet = new Set(selectedTags);
        if (tagSet.size === 0) return Decoration.none;

        const doc = tr.state.doc;
        const content = doc.toString();
        const result = parseNote(content);
        const lines = content.split("\n");

        // Determine which lines to hide
        const hiddenLines = new Set<number>();

        for (const item of result.items) {
          if (item.indentLevel > 0) continue; // Sub-items follow parent

          const itemTags = new Set(item.tags.map((t) => t.full));
          let visible: boolean;

          if (itemTags.size === 0) {
            visible = false;
          } else if (mode === "AND") {
            visible = [...tagSet].every((t) => itemTags.has(t));
          } else {
            visible = [...tagSet].some((t) => itemTags.has(t));
          }

          if (!visible) {
            // Hide this line
            hiddenLines.add(item.lineIndex);
            // Hide following indented lines (sub-items, metadata)
            for (let i = item.lineIndex + 1; i < lines.length; i++) {
              const line = lines[i];
              if (/^\s+\S/.test(line) || /^\t/.test(line)) {
                hiddenLines.add(i);
              } else {
                break;
              }
            }
          }
        }

        // Build decoration set
        const builder = new RangeSetBuilder<Decoration>();
        for (let i = 0; i < doc.lines; i++) {
          if (hiddenLines.has(i)) {
            const lineStart = doc.line(i + 1).from; // CM lines are 1-indexed
            builder.add(lineStart, lineStart, hiddenLine);
          }
        }
        return builder.finish();
      }
    }
    // On document changes, recompute if we have active decorations
    if (tr.docChanged && decorations.size > 0) {
      // Need to reapply — but we don't have the filter state here.
      // Return mapped decorations (positions shift with edits)
      return decorations.map(tr.changes);
    }
    return decorations;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

export default class TagFilterPlugin extends Plugin {
  settings: TagFilterSettings = DEFAULT_SETTINGS;
  private activeWidget: { widget: TagFilterWidget; containerEl: HTMLElement } | null = null;
  private selectedTags: Set<string> = new Set();
  private filterMode: "AND" | "OR" = "OR";

  async onload(): Promise<void> {
    await this.loadSettings();
    this.filterMode = this.settings.defaultMode;

    // Register the CodeMirror extension
    this.registerEditorExtension([filterField]);

    this.addCommand({
      id: "toggle-tag-filter",
      name: "Toggle Tag Filter",
      callback: () => this.toggleFilter(),
    });

    this.addCommand({
      id: "clear-tag-filter",
      name: "Clear all tag filters",
      callback: () => this.clearFilter(),
    });

    this.addRibbonIcon("filter", "Toggle Tag Filter", () => {
      this.toggleFilter();
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.activeWidget) {
          this.removeWidget();
        }
      })
    );

    this.addSettingTab(new TagFilterSettingTab(this.app, this));
  }

  onunload(): void {
    this.removeWidget();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private toggleFilter(): void {
    if (this.activeWidget) {
      this.removeWidget();
    } else {
      this.injectWidget();
    }
  }

  private clearFilter(): void {
    this.selectedTags.clear();
    this.dispatchFilter();
    if (this.activeWidget) {
      this.activeWidget.widget.setState(this.selectedTags, this.filterMode);
    }
  }

  private injectWidget(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return;

    const content = view.editor.getValue();
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

    // Inject above the editor
    const editorContainer = (view as any).contentEl as HTMLElement;
    if (!editorContainer) return;

    const containerEl = document.createElement("div");
    containerEl.addClass("tag-filter-header");

    const cmEditor = editorContainer.querySelector(".cm-editor");
    if (cmEditor && cmEditor.parentElement) {
      cmEditor.parentElement.insertBefore(containerEl, cmEditor);
    } else {
      editorContainer.prepend(containerEl);
    }

    const widget = new TagFilterWidget(containerEl, {
      onFilterChange: (tags, mode) => {
        this.selectedTags = tags;
        this.filterMode = mode;
        this.dispatchFilter();
        this.filterTasksSidebar();
      },
    }, this.filterMode);

    widget.update(filtered);
    widget.setState(this.selectedTags, this.filterMode);

    this.activeWidget = { widget, containerEl };
  }

  private removeWidget(): void {
    if (this.activeWidget) {
      this.activeWidget.widget.destroy();
      this.activeWidget.containerEl.remove();
      this.activeWidget = null;
    }
    this.selectedTags.clear();
    this.dispatchClear();
    this.clearTasksSidebar();
  }

  /**
   * Dispatch the filter state to the CodeMirror editor via effects.
   */
  private dispatchFilter(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    // Access the underlying CodeMirror EditorView
    const cmView = (view.editor as any).cm as EditorView | undefined;
    if (!cmView) return;

    if (this.selectedTags.size === 0) {
      cmView.dispatch({ effects: clearFilterEffect.of(null) });
    } else {
      cmView.dispatch({
        effects: setFilterEffect.of({
          selectedTags: [...this.selectedTags],
          mode: this.filterMode,
        }),
      });
    }
  }

  private dispatchClear(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const cmView = (view.editor as any).cm as EditorView | undefined;
    if (!cmView) return;

    cmView.dispatch({ effects: clearFilterEffect.of(null) });
  }

  /**
   * Filter the Tasks plugin sidebar ("Focus on Today" and similar views).
   * Tasks plugin renders items as list items containing tag text.
   */
  private filterTasksSidebar(): void {
    // Find all Tasks plugin containers in the workspace
    const taskContainers = document.querySelectorAll<HTMLElement>(
      ".workspace-leaf-content .tasks-calendar-wrapper, " +
      ".workspace-leaf-content .task-list-item, " +
      ".workspace-leaf-content [data-task-source]"
    );

    // More broadly, find task items in right sidebar panels
    const rightSidebar = document.querySelector(".mod-right-split");
    if (!rightSidebar) return;

    // Tasks plugin renders items as li elements or div blocks with task text
    const taskItems = rightSidebar.querySelectorAll<HTMLElement>(
      "li, .task-list-item, [class*='task']"
    );

    if (this.selectedTags.size === 0) {
      // Clear all sidebar filtering
      taskItems.forEach((el) => el.removeClass("tag-filter-tasks-hidden"));
      return;
    }

    taskItems.forEach((el) => {
      const text = el.textContent ?? "";
      // Check if this element contains any tag references
      const re = /#?([a-zA-Z][\w-]*\/[\w-]+)/g;
      const tags = new Set<string>();
      let match;
      while ((match = re.exec(text)) !== null) {
        tags.add(match[1]);
      }

      // Also check for tag text without # (Tasks plugin may strip the #)
      for (const tag of this.selectedTags) {
        // Check both "project/foo" and "#project/foo"
        if (text.includes(tag) || text.includes("#" + tag)) {
          tags.add(tag);
        }
      }

      if (tags.size === 0) {
        // No tags found on this item — check if it's a structural element (date header, etc.)
        // Don't hide headers/structural elements
        if (el.tagName === "LI" || el.classList.contains("task-list-item")) {
          el.addClass("tag-filter-tasks-hidden");
        }
        return;
      }

      let visible: boolean;
      if (this.filterMode === "AND") {
        visible = [...this.selectedTags].every((t) => tags.has(t));
      } else {
        visible = [...this.selectedTags].some((t) => tags.has(t));
      }

      if (visible) {
        el.removeClass("tag-filter-tasks-hidden");
      } else {
        el.addClass("tag-filter-tasks-hidden");
      }
    });
  }

  private clearTasksSidebar(): void {
    const rightSidebar = document.querySelector(".mod-right-split");
    if (!rightSidebar) return;
    rightSidebar.querySelectorAll(".tag-filter-tasks-hidden").forEach((el) => {
      el.removeClass("tag-filter-tasks-hidden");
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
}
