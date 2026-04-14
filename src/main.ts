import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { MarkdownView, Plugin } from "obsidian";
import { parseNote, Priority } from "./NoteParser";
import { TagFilterWidget, FilterCriteria } from "./TagFilterWidget";
import { TagFilterSettings, DEFAULT_SETTINGS, TagFilterSettingTab } from "./settings";

interface ObsidianEditorWithCM {
  cm?: EditorView;
}

// State effect carrying the full filter criteria
const setFilterEffect = StateEffect.define<{
  selectedTags: string[];
  mode: "AND" | "OR";
  selectedPriorities: string[]; // Priority values as strings
  startDateFrom: string;
  startDateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
}>();

const clearFilterEffect = StateEffect.define<null>();

const hiddenLine = Decoration.line({ class: "tag-filter-hidden" });

const TAG_RE_DOM = /#([a-zA-Z][\w-]*\/[\w-]+)/g;
const START_DATE_RE_DOM = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const DUE_DATE_RE_DOM = /📅\s*(\d{4}-\d{2}-\d{2})/;

function parsePriorityFromText(text: string): Priority {
  if (text.includes("🔺") || text.includes("⏫")) return "high";
  if (text.includes("🔼")) return "medium";
  if (text.includes("🔽")) return "low";
  if (text.includes("⏬")) return "lowest";
  return "none";
}

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
        const {
          selectedTags, mode, selectedPriorities,
          startDateFrom, startDateTo, dueDateFrom, dueDateTo,
        } = effect.value;

        const tagSet = new Set(selectedTags);
        const prioSet = new Set(selectedPriorities as Priority[]);
        const hasTagFilter = tagSet.size > 0;
        const hasPrioFilter = prioSet.size > 0;
        const hasStartFilter = startDateFrom !== "" || startDateTo !== "";
        const hasDateFilter = dueDateFrom !== "" || dueDateTo !== "";
        const hasAnyFilter = hasTagFilter || hasPrioFilter || hasStartFilter || hasDateFilter;

        if (!hasAnyFilter) return Decoration.none;

        const doc = tr.state.doc;
        const content = doc.toString();
        const result = parseNote(content);
        const lines = content.split("\n");

        const hiddenLines = new Set<number>();

        for (const item of result.items) {
          if (item.indentLevel > 0) continue;

          // Tag filter
          let tagVisible = true;
          if (hasTagFilter) {
            const itemTags = new Set(item.tags.map((t) => t.full));
            if (itemTags.size === 0) {
              tagVisible = false;
            } else if (mode === "AND") {
              tagVisible = [...tagSet].every((t) => itemTags.has(t));
            } else {
              tagVisible = [...tagSet].some((t) => itemTags.has(t));
            }
          }

          // Priority filter
          let prioVisible = true;
          if (hasPrioFilter) {
            prioVisible = prioSet.has(item.priority);
          }

          // Start date filter
          let startVisible = true;
          if (hasStartFilter && item.startDate) {
            if (startDateFrom && item.startDate < startDateFrom) startVisible = false;
            if (startDateTo && item.startDate > startDateTo) startVisible = false;
          } else if (hasStartFilter && !item.startDate) {
            startVisible = false; // No start date = hidden when filtering by start date
          }

          // Due date filter
          let dueVisible = true;
          if (hasDateFilter && item.dueDate) {
            if (dueDateFrom && item.dueDate < dueDateFrom) dueVisible = false;
            if (dueDateTo && item.dueDate > dueDateTo) dueVisible = false;
          } else if (hasDateFilter && !item.dueDate) {
            dueVisible = false;
          }

          // Combined: AND across all filter types (tag AND priority AND dates)
          const visible = tagVisible && prioVisible && startVisible && dueVisible;

          if (!visible) {
            hiddenLines.add(item.lineIndex);
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

        const builder = new RangeSetBuilder<Decoration>();
        for (let i = 0; i < doc.lines; i++) {
          if (hiddenLines.has(i)) {
            const lineStart = doc.line(i + 1).from;
            builder.add(lineStart, lineStart, hiddenLine);
          }
        }
        return builder.finish();
      }
    }
    if (tr.docChanged && decorations.size > 0) {
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
  private currentCriteria: FilterCriteria | null = null;
  private readingViewObserver: MutationObserver | null = null;
  private observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerEditorExtension([filterField]);

    this.addCommand({
      id: "toggle-filter",
      name: "Toggle filter",
      callback: () => this.toggleFilter(),
    });

    this.addCommand({
      id: "clear-filters",
      name: "Clear all filters",
      callback: () => this.clearFilter(),
    });

    this.addRibbonIcon("filter", "Toggle tag filter", () => {
      this.toggleFilter();
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.activeWidget) {
          this.removeWidget();
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.handleLayoutChange();
      })
    );

    this.addSettingTab(new TagFilterSettingTab(this.app, this));
  }

  onunload(): void {
    this.stopReadingViewObserver();
    this.removeWidget();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TagFilterSettings>);
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
    this.currentCriteria = null;
    this.dispatchClear();
    this.clearReadingViewFilter();
    if (this.activeWidget) {
      this.activeWidget.widget.setCriteria({
        selectedTags: new Set(),
        mode: this.settings.defaultMode,
        selectedPriorities: new Set(),
        startDateFrom: "",
        startDateTo: "",
        dueDateFrom: "",
        dueDateTo: "",
      });
    }
  }

  private injectWidget(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return;

    const content = view.editor.getValue();
    const result = parseNote(content);
    if (result.tagGroups.size === 0 && result.priorities.size === 0) return;

    // Apply excluded prefixes
    const excluded = this.getExcludedPrefixes();
    for (const prefix of result.tagGroups.keys()) {
      if (excluded.has(prefix.toLowerCase())) {
        result.tagGroups.delete(prefix);
      }
    }

    const editorContainer = view.contentEl;
    if (!editorContainer) return;

    const containerEl = document.createElement("div");
    containerEl.addClass("tag-filter-header");

    const mode = view.getMode();
    if (mode === "source") {
      const cmEditor = editorContainer.querySelector(".cm-editor");
      if (cmEditor && cmEditor.parentElement) {
        cmEditor.parentElement.insertBefore(containerEl, cmEditor);
      } else {
        editorContainer.prepend(containerEl);
      }
    } else {
      const readingView = editorContainer.querySelector(".markdown-reading-view");
      if (readingView && readingView.parentElement) {
        readingView.parentElement.insertBefore(containerEl, readingView);
      } else {
        editorContainer.prepend(containerEl);
      }
    }

    const widget = new TagFilterWidget(containerEl, {
      onFilterChange: (criteria) => {
        this.currentCriteria = criteria;
        this.dispatchFilter(criteria);
        this.applyReadingViewFilter(criteria);
        this.filterTasksSidebar(criteria);
      },
    }, this.settings.defaultMode);

    widget.updateFromParseResult(result);

    if (this.currentCriteria) {
      widget.setCriteria(this.currentCriteria);
    }

    this.activeWidget = { widget, containerEl };

    if (view.getMode() === "preview") {
      this.startReadingViewObserver();
    }
  }

  private removeWidget(): void {
    this.stopReadingViewObserver();
    if (this.activeWidget) {
      this.activeWidget.widget.destroy();
      this.activeWidget.containerEl.remove();
      this.activeWidget = null;
    }
    this.currentCriteria = null;
    this.clearReadingViewFilter();
    this.dispatchClear();
    this.clearTasksSidebar();
  }

  private handleLayoutChange(): void {
    if (!this.activeWidget) return;
    this.stopReadingViewObserver();

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    // Save current criteria before tearing down the widget
    const savedCriteria = this.currentCriteria;

    // Remove the old widget DOM without clearing filter state
    this.activeWidget.widget.destroy();
    this.activeWidget.containerEl.remove();
    this.activeWidget = null;

    // Clear any stale filter state from both backends
    this.dispatchClear();
    this.clearReadingViewFilter();

    // Re-inject at the correct location for the new mode
    this.currentCriteria = savedCriteria;
    this.injectWidget();

    // Re-apply the saved criteria if we had one
    const newWidget = this.activeWidget as { widget: TagFilterWidget; containerEl: HTMLElement } | null;
    if (savedCriteria && newWidget) {
      newWidget.widget.setCriteria(savedCriteria);
      this.dispatchFilter(savedCriteria);
      this.applyReadingViewFilter(savedCriteria);
      this.filterTasksSidebar(savedCriteria);
    }

    const currentMode = this.getViewMode();
    if (currentMode === "preview" && newWidget) {
      this.startReadingViewObserver();
    }
  }

  private dispatchFilter(criteria: FilterCriteria): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (view.getMode() !== "source") return;

    const cmView = (view.editor as unknown as ObsidianEditorWithCM).cm;
    if (!cmView) return;

    const hasAny = criteria.selectedTags.size > 0
      || criteria.selectedPriorities.size > 0
      || criteria.startDateFrom !== ""
      || criteria.startDateTo !== ""
      || criteria.dueDateFrom !== ""
      || criteria.dueDateTo !== "";

    if (!hasAny) {
      cmView.dispatch({ effects: clearFilterEffect.of(null) });
    } else {
      cmView.dispatch({
        effects: setFilterEffect.of({
          selectedTags: [...criteria.selectedTags],
          mode: criteria.mode,
          selectedPriorities: [...criteria.selectedPriorities],
          startDateFrom: criteria.startDateFrom,
          startDateTo: criteria.startDateTo,
          dueDateFrom: criteria.dueDateFrom,
          dueDateTo: criteria.dueDateTo,
        }),
      });
    }
  }

  private dispatchClear(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (view.getMode() !== "source") return;

    const cmView = (view.editor as unknown as ObsidianEditorWithCM).cm;
    if (!cmView) return;

    cmView.dispatch({ effects: clearFilterEffect.of(null) });
  }

  private applyReadingViewFilter(criteria: FilterCriteria): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (view.getMode() !== "preview") return;

    const container = view.contentEl.querySelector(".markdown-reading-view");
    if (!container) return;

    const hasTagFilter = criteria.selectedTags.size > 0;
    const hasPrioFilter = criteria.selectedPriorities.size > 0;
    const hasStartFilter = criteria.startDateFrom !== "" || criteria.startDateTo !== "";
    const hasDateFilter = criteria.dueDateFrom !== "" || criteria.dueDateTo !== "";
    const hasAnyFilter = hasTagFilter || hasPrioFilter || hasStartFilter || hasDateFilter;

    const allItems = container.querySelectorAll<HTMLElement>("li.task-list-item");

    if (!hasAnyFilter) {
      allItems.forEach((li) => li.removeClass("tag-filter-hidden"));
      return;
    }

    allItems.forEach((li) => {
      // Skip child items — they follow their parent
      if (li.parentElement?.closest("li.task-list-item")) return;

      const text = li.textContent ?? "";

      // Tag filter
      let tagVisible = true;
      if (hasTagFilter) {
        const tags = new Set<string>();
        TAG_RE_DOM.lastIndex = 0;
        let m;
        while ((m = TAG_RE_DOM.exec(text)) !== null) tags.add(m[1]);
        if (tags.size === 0) {
          tagVisible = false;
        } else if (criteria.mode === "AND") {
          tagVisible = [...criteria.selectedTags].every((t) => tags.has(t));
        } else {
          tagVisible = [...criteria.selectedTags].some((t) => tags.has(t));
        }
      }

      // Priority filter
      let prioVisible = true;
      if (hasPrioFilter) {
        const prio = parsePriorityFromText(text);
        prioVisible = criteria.selectedPriorities.has(prio);
      }

      // Start date filter
      let startVisible = true;
      if (hasStartFilter) {
        const startMatch = text.match(START_DATE_RE_DOM);
        const startDate = startMatch ? startMatch[1] : "";
        if (startDate) {
          if (criteria.startDateFrom && startDate < criteria.startDateFrom) startVisible = false;
          if (criteria.startDateTo && startDate > criteria.startDateTo) startVisible = false;
        } else {
          startVisible = false;
        }
      }

      // Due date filter
      let dueVisible = true;
      if (hasDateFilter) {
        const dueMatch = text.match(DUE_DATE_RE_DOM);
        const dueDate = dueMatch ? dueMatch[1] : "";
        if (dueDate) {
          if (criteria.dueDateFrom && dueDate < criteria.dueDateFrom) dueVisible = false;
          if (criteria.dueDateTo && dueDate > criteria.dueDateTo) dueVisible = false;
        } else {
          dueVisible = false;
        }
      }

      const visible = tagVisible && prioVisible && startVisible && dueVisible;

      if (visible) {
        li.removeClass("tag-filter-hidden");
      } else {
        li.addClass("tag-filter-hidden");
      }
    });
  }

  private clearReadingViewFilter(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const container = view.contentEl.querySelector(".markdown-reading-view");
    if (!container) return;
    container.querySelectorAll(".tag-filter-hidden").forEach((el) => {
      el.removeClass("tag-filter-hidden");
    });
  }

  private startReadingViewObserver(): void {
    this.stopReadingViewObserver();

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "preview") return;

    const container = view.contentEl.querySelector(".markdown-reading-view");
    if (!container) return;

    this.readingViewObserver = new MutationObserver(() => {
      if (this.observerDebounceTimer) clearTimeout(this.observerDebounceTimer);
      this.observerDebounceTimer = setTimeout(() => {
        if (this.currentCriteria) {
          this.applyReadingViewFilter(this.currentCriteria);
        }
      }, 50);
    });

    this.readingViewObserver.observe(container, {
      childList: true,
      subtree: true,
    });
  }

  private stopReadingViewObserver(): void {
    if (this.observerDebounceTimer) {
      clearTimeout(this.observerDebounceTimer);
      this.observerDebounceTimer = null;
    }
    if (this.readingViewObserver) {
      this.readingViewObserver.disconnect();
      this.readingViewObserver = null;
    }
  }

  private filterTasksSidebar(criteria: FilterCriteria): void {
    const rightSidebar = document.querySelector(".mod-right-split");
    if (!rightSidebar) return;

    const taskItems = rightSidebar.querySelectorAll<HTMLElement>(
      "li, .task-list-item, [class*='task']"
    );

    const hasAny = criteria.selectedTags.size > 0
      || criteria.selectedPriorities.size > 0;

    if (!hasAny) {
      taskItems.forEach((el) => el.removeClass("tag-filter-tasks-hidden"));
      return;
    }

    taskItems.forEach((el) => {
      const text = el.textContent ?? "";

      // Tag matching
      let tagMatch = true;
      if (criteria.selectedTags.size > 0) {
        const tags = new Set<string>();
        const re = /#?([a-zA-Z][\w-]*\/[\w-]+)/g;
        let m;
        while ((m = re.exec(text)) !== null) tags.add(m[1]);
        for (const tag of criteria.selectedTags) {
          if (text.includes(tag) || text.includes("#" + tag)) tags.add(tag);
        }

        if (tags.size === 0) {
          if (el.tagName === "LI" || el.classList.contains("task-list-item")) {
            tagMatch = false;
          }
        } else if (criteria.mode === "AND") {
          tagMatch = [...criteria.selectedTags].every((t) => tags.has(t));
        } else {
          tagMatch = [...criteria.selectedTags].some((t) => tags.has(t));
        }
      }

      // Priority matching
      let prioMatch = true;
      if (criteria.selectedPriorities.size > 0) {
        const hasHigh = text.includes("🔺") || text.includes("⏫");
        const hasMed = text.includes("🔼");
        const hasLow = text.includes("🔽");
        const itemPrio: Priority = hasHigh ? "high" : hasMed ? "medium" : hasLow ? "low" : "none";
        prioMatch = criteria.selectedPriorities.has(itemPrio);
      }

      if (tagMatch && prioMatch) {
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

  private getViewMode(): "source" | "preview" | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    return view.getMode();
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
