export interface TagFilterCallbacks {
  onFilterChange: (selectedTags: Set<string>, mode: "AND" | "OR") => void;
}

export class TagFilterWidget {
  private containerEl: HTMLElement;
  private selectedTags: Set<string> = new Set();
  private mode: "AND" | "OR" = "OR";
  private callbacks: TagFilterCallbacks;
  private tagGroups: Map<string, Map<string, number>> = new Map();

  constructor(parentEl: HTMLElement, callbacks: TagFilterCallbacks, defaultMode: "AND" | "OR" = "OR") {
    this.containerEl = parentEl.createDiv({ cls: "tag-filter-widget" });
    this.callbacks = callbacks;
    this.mode = defaultMode;
  }

  update(tagGroups: Map<string, Map<string, number>>): void {
    this.tagGroups = tagGroups;
    this.render();
  }

  getState(): { selectedTags: Set<string>; mode: "AND" | "OR" } {
    return { selectedTags: new Set(this.selectedTags), mode: this.mode };
  }

  setState(selectedTags: Set<string>, mode: "AND" | "OR"): void {
    this.selectedTags = new Set(selectedTags);
    this.mode = mode;
    this.render();
  }

  destroy(): void {
    this.containerEl.remove();
  }

  private render(): void {
    this.containerEl.empty();

    if (this.tagGroups.size === 0) return;

    const controls = this.containerEl.createDiv({ cls: "tag-filter-controls" });

    const toggle = controls.createDiv({ cls: "tag-filter-mode-toggle" });
    const orBtn = toggle.createEl("button", {
      text: "OR",
      cls: `tag-filter-mode-btn ${this.mode === "OR" ? "active" : ""}`,
    });
    const andBtn = toggle.createEl("button", {
      text: "AND",
      cls: `tag-filter-mode-btn ${this.mode === "AND" ? "active" : ""}`,
    });

    orBtn.addEventListener("click", () => {
      this.mode = "OR";
      this.render();
      this.emitChange();
    });

    andBtn.addEventListener("click", () => {
      this.mode = "AND";
      this.render();
      this.emitChange();
    });

    if (this.selectedTags.size > 0) {
      const clearBtn = controls.createEl("button", {
        text: "Clear",
        cls: "tag-filter-clear-btn",
      });
      clearBtn.addEventListener("click", () => {
        this.selectedTags.clear();
        this.render();
        this.emitChange();
      });
    }

    const groupsEl = this.containerEl.createDiv({ cls: "tag-filter-groups" });

    const sortedPrefixes = Array.from(this.tagGroups.keys()).sort();

    for (const prefix of sortedPrefixes) {
      const values = this.tagGroups.get(prefix)!;
      const groupEl = groupsEl.createDiv({ cls: "tag-filter-group" });

      const header = groupEl.createDiv({ cls: "tag-filter-group-header" });
      header.createSpan({ text: prefix, cls: "tag-filter-group-name" });

      const pillsEl = groupEl.createDiv({ cls: "tag-filter-pills" });

      const sortedValues = Array.from(values.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      for (const [value, count] of sortedValues) {
        const fullTag = `${prefix}/${value}`;
        const isActive = this.selectedTags.has(fullTag);

        const pill = pillsEl.createDiv({
          cls: `tag-filter-pill ${isActive ? "active" : ""}`,
        });

        pill.createSpan({ text: value, cls: "tag-filter-pill-label" });
        pill.createSpan({
          text: String(count),
          cls: "tag-filter-pill-count",
        });

        pill.addEventListener("click", () => {
          if (this.selectedTags.has(fullTag)) {
            this.selectedTags.delete(fullTag);
          } else {
            this.selectedTags.add(fullTag);
          }
          this.render();
          this.emitChange();
        });
      }
    }
  }

  private emitChange(): void {
    this.callbacks.onFilterChange(
      new Set(this.selectedTags),
      this.mode
    );
  }
}
