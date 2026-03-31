import { Plugin } from "obsidian";
import { TagFilterSettings, DEFAULT_SETTINGS, TagFilterSettingTab } from "./settings";

export default class TagFilterPlugin extends Plugin {
  settings: TagFilterSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TagFilterSettingTab(this.app, this));
    console.log("Tag Filter plugin loaded");
  }

  onunload() {
    console.log("Tag Filter plugin unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
