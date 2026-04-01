import type { Priority, ParseResult } from "./NoteParser";

export interface FilterCriteria {
  selectedTags: Set<string>;
  mode: "AND" | "OR";
  selectedPriorities: Set<Priority>;
  startDateFrom: string;
  startDateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
}

export interface TagFilterCallbacks {
  onFilterChange: (criteria: FilterCriteria) => void;
}

const PRIORITY_DISPLAY: { key: Priority; emoji: string; label: string }[] = [
  { key: "high", emoji: "🔺", label: "high" },
  { key: "medium", emoji: "🔼", label: "med" },
  { key: "low", emoji: "🔽", label: "low" },
  { key: "none", emoji: "—", label: "none" },
];

type TabId = "tags" | "priority" | "dates";

export class TagFilterWidget {
  private containerEl: HTMLElement;
  private selectedTags: Set<string> = new Set();
  private selectedPriorities: Set<Priority> = new Set();
  private mode: "AND" | "OR" = "OR";
  private startDateFrom = "";
  private startDateTo = "";
  private dueDateFrom = "";
  private dueDateTo = "";
  private callbacks: TagFilterCallbacks;
  private tagGroups: Map<string, Map<string, number>> = new Map();
  private priorities: Map<Priority, number> = new Map();
  private hasStartDates = false;
  private hasDueDates = false;
  private startDateRange = { min: "", max: "" };
  private dueDateRange = { min: "", max: "" };
  private activeTab: TabId = "tags";

  constructor(parentEl: HTMLElement, callbacks: TagFilterCallbacks, defaultMode: "AND" | "OR" = "OR") {
    this.containerEl = parentEl.createDiv({ cls: "tag-filter-widget" });
    this.callbacks = callbacks;
    this.mode = defaultMode;
  }

  updateFromParseResult(result: ParseResult): void {
    this.tagGroups = result.tagGroups;
    this.priorities = result.priorities;
    this.hasStartDates = result.hasStartDates;
    this.hasDueDates = result.hasDueDates;
    this.startDateRange = result.startDateRange;
    this.dueDateRange = result.dueDateRange;
    this.render();
  }

  getCriteria(): FilterCriteria {
    return {
      selectedTags: new Set(this.selectedTags),
      mode: this.mode,
      selectedPriorities: new Set(this.selectedPriorities),
      startDateFrom: this.startDateFrom,
      startDateTo: this.startDateTo,
      dueDateFrom: this.dueDateFrom,
      dueDateTo: this.dueDateTo,
    };
  }

  setCriteria(c: FilterCriteria): void {
    this.selectedTags = new Set(c.selectedTags);
    this.mode = c.mode;
    this.selectedPriorities = new Set(c.selectedPriorities);
    this.startDateFrom = c.startDateFrom;
    this.startDateTo = c.startDateTo;
    this.dueDateFrom = c.dueDateFrom;
    this.dueDateTo = c.dueDateTo;
    this.render();
  }

  destroy(): void {
    this.containerEl.remove();
  }

  hasActiveFilters(): boolean {
    return this.selectedTags.size > 0
      || this.selectedPriorities.size > 0
      || this.startDateFrom !== ""
      || this.startDateTo !== ""
      || this.dueDateFrom !== ""
      || this.dueDateTo !== "";
  }

  private getTabActiveCount(tab: TabId): number {
    switch (tab) {
      case "tags": return this.selectedTags.size;
      case "priority": return this.selectedPriorities.size;
      case "dates":
        return (this.startDateFrom ? 1 : 0) + (this.startDateTo ? 1 : 0)
          + (this.dueDateFrom ? 1 : 0) + (this.dueDateTo ? 1 : 0);
    }
  }

  private render(): void {
    this.containerEl.empty();

    const hasTags = this.tagGroups.size > 0;
    const hasPriority = this.priorities.size > 0;
    const hasDates = this.hasStartDates || this.hasDueDates;
    if (!hasTags && !hasPriority && !hasDates) return;

    // Available tabs
    const tabs: { id: TabId; label: string; available: boolean }[] = [
      { id: "tags", label: "Tags", available: hasTags },
      { id: "priority", label: "Priority", available: hasPriority },
      { id: "dates", label: "Dates", available: hasDates },
    ];
    const availableTabs = tabs.filter((t) => t.available);

    // Ensure active tab is valid
    if (!availableTabs.some((t) => t.id === this.activeTab)) {
      this.activeTab = availableTabs[0]?.id ?? "tags";
    }

    // Tab bar
    const tabBar = this.containerEl.createDiv({ cls: "tag-filter-tabbar" });

    for (const tab of availableTabs) {
      const isActive = tab.id === this.activeTab;
      const count = this.getTabActiveCount(tab.id);
      const tabEl = tabBar.createSpan({
        cls: `tag-filter-tab ${isActive ? "active" : ""}`,
      });
      tabEl.createSpan({ text: tab.label, cls: "tag-filter-tab-label" });
      if (count > 0) {
        tabEl.createSpan({ text: String(count), cls: "tag-filter-tab-badge" });
      }
      tabEl.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.render();
      });
    }

    // Right side: OR/AND + Clear
    const controls = tabBar.createSpan({ cls: "tag-filter-tabbar-controls" });

    const toggle = controls.createSpan({ cls: "tag-filter-mode-toggle" });
    const orBtn = toggle.createEl("button", {
      text: "OR",
      cls: `tag-filter-mode-btn ${this.mode === "OR" ? "active" : ""}`,
    });
    const andBtn = toggle.createEl("button", {
      text: "AND",
      cls: `tag-filter-mode-btn ${this.mode === "AND" ? "active" : ""}`,
    });
    orBtn.addEventListener("click", () => { this.mode = "OR"; this.render(); this.emitChange(); });
    andBtn.addEventListener("click", () => { this.mode = "AND"; this.render(); this.emitChange(); });

    if (this.hasActiveFilters()) {
      const clearBtn = controls.createEl("button", { text: "Clear", cls: "tag-filter-clear-btn" });
      clearBtn.addEventListener("click", () => {
        this.selectedTags.clear();
        this.selectedPriorities.clear();
        this.startDateFrom = "";
        this.startDateTo = "";
        this.dueDateFrom = "";
        this.dueDateTo = "";
        this.render();
        this.emitChange();
      });
    }

    // Tab content
    const content = this.containerEl.createDiv({ cls: "tag-filter-tab-content" });

    switch (this.activeTab) {
      case "tags": this.renderTagsContent(content); break;
      case "priority": this.renderPriorityContent(content); break;
      case "dates": this.renderDatesContent(content); break;
    }
  }

  private renderTagsContent(parent: HTMLElement): void {
    const sortedPrefixes = Array.from(this.tagGroups.keys()).sort();
    for (const prefix of sortedPrefixes) {
      const values = this.tagGroups.get(prefix)!;
      const groupEl = parent.createSpan({ cls: "tag-filter-group" });
      groupEl.createSpan({ text: prefix, cls: "tag-filter-group-name" });
      const pillsEl = groupEl.createSpan({ cls: "tag-filter-pills" });

      const sortedValues = Array.from(values.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [value, count] of sortedValues) {
        const fullTag = `${prefix}/${value}`;
        const isActive = this.selectedTags.has(fullTag);
        const pill = pillsEl.createSpan({ cls: `tag-filter-pill ${isActive ? "active" : ""}` });
        pill.createSpan({ text: value, cls: "tag-filter-pill-label" });
        pill.createSpan({ text: String(count), cls: "tag-filter-pill-count" });
        pill.addEventListener("click", () => {
          if (this.selectedTags.has(fullTag)) this.selectedTags.delete(fullTag);
          else this.selectedTags.add(fullTag);
          this.render();
          this.emitChange();
        });
      }
    }
  }

  private renderPriorityContent(parent: HTMLElement): void {
    const pillsEl = parent.createSpan({ cls: "tag-filter-pills" });
    for (const { key, emoji, label } of PRIORITY_DISPLAY) {
      const count = this.priorities.get(key);
      if (!count) continue;
      const isActive = this.selectedPriorities.has(key);
      const pill = pillsEl.createSpan({ cls: `tag-filter-pill ${isActive ? "active" : ""}` });
      pill.createSpan({ text: `${emoji} ${label}`, cls: "tag-filter-pill-label" });
      pill.createSpan({ text: String(count), cls: "tag-filter-pill-count" });
      pill.addEventListener("click", () => {
        if (this.selectedPriorities.has(key)) this.selectedPriorities.delete(key);
        else this.selectedPriorities.add(key);
        this.render();
        this.emitChange();
      });
    }
  }

  private renderDatesContent(parent: HTMLElement): void {
    if (this.hasStartDates) {
      const group = parent.createSpan({ cls: "tag-filter-date-group" });
      group.createSpan({ text: "🛫 Start", cls: "tag-filter-date-label" });
      const fromInput = group.createEl("input", {
        type: "date", cls: "tag-filter-date-input", value: this.startDateFrom,
      });
      fromInput.min = this.startDateRange.min;
      fromInput.max = this.startDateRange.max;
      group.createSpan({ text: "–", cls: "tag-filter-date-sep" });
      const toInput = group.createEl("input", {
        type: "date", cls: "tag-filter-date-input", value: this.startDateTo,
      });
      toInput.min = this.startDateRange.min;
      toInput.max = this.startDateRange.max;
      fromInput.addEventListener("change", () => { this.startDateFrom = fromInput.value; this.emitChange(); });
      toInput.addEventListener("change", () => { this.startDateTo = toInput.value; this.emitChange(); });
    }

    if (this.hasDueDates) {
      const group = parent.createSpan({ cls: "tag-filter-date-group" });
      group.createSpan({ text: "📅 Due", cls: "tag-filter-date-label" });
      const fromInput = group.createEl("input", {
        type: "date", cls: "tag-filter-date-input", value: this.dueDateFrom,
      });
      fromInput.min = this.dueDateRange.min;
      fromInput.max = this.dueDateRange.max;
      group.createSpan({ text: "–", cls: "tag-filter-date-sep" });
      const toInput = group.createEl("input", {
        type: "date", cls: "tag-filter-date-input", value: this.dueDateTo,
      });
      toInput.min = this.dueDateRange.min;
      toInput.max = this.dueDateRange.max;
      fromInput.addEventListener("change", () => { this.dueDateFrom = fromInput.value; this.emitChange(); });
      toInput.addEventListener("change", () => { this.dueDateTo = toInput.value; this.emitChange(); });
    }
  }

  private emitChange(): void {
    this.callbacks.onFilterChange(this.getCriteria());
  }
}
