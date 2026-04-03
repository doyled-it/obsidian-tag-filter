// SidebarView — kept for potential future use but not currently registered
import { ItemView, WorkspaceLeaf } from "obsidian";

export const TAG_FILTER_VIEW_TYPE = "tag-filter-sidebar";

export class TagFilterSidebarView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return TAG_FILTER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tag filter";
  }

  getIcon(): string {
    return "filter";
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: "Use the filter icon in the ribbon to activate filtering." });
  }

  async onClose(): Promise<void> {}
}
