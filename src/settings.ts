import { App, PluginSettingTab, Setting } from "obsidian";
import type TagFilterPlugin from "./main";

export interface TagFilterSettings {
  defaultMode: "AND" | "OR";
  autoActivate: boolean;
  groupByPrefix: boolean;
  excludedPrefixes: string;
}

export const DEFAULT_SETTINGS: TagFilterSettings = {
  defaultMode: "OR",
  autoActivate: true,
  groupByPrefix: true,
  excludedPrefixes: "",
};

export class TagFilterSettingTab extends PluginSettingTab {
  plugin: TagFilterPlugin;

  constructor(app: App, plugin: TagFilterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default filter mode")
      .setDesc("Choose whether items must match all selected tags or any selected tag.")
      .addDropdown((drop) =>
        drop
          .addOption("OR", "Match any")
          .addOption("AND", "Match all")
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultMode = value as "AND" | "OR";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-activate")
      .setDesc("Automatically show the tag picker on notes containing tagged checkboxes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoActivate)
          .onChange(async (value) => {
            this.plugin.settings.autoActivate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Group by prefix")
      .setDesc("Group tags by their prefix (project/, source/, etc.) or show a flat list.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.groupByPrefix)
          .onChange(async (value) => {
            this.plugin.settings.groupByPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Excluded prefixes")
      .setDesc("Comma-separated list of tag prefixes to hide from the picker (e.g., status,type).")
      .addText((text) =>
        text
          .setPlaceholder("Status, type")
          .setValue(this.plugin.settings.excludedPrefixes)
          .onChange(async (value) => {
            this.plugin.settings.excludedPrefixes = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
