import { Plugin } from "obsidian";

export default class TagFilterPlugin extends Plugin {
  async onload() {
    console.log("Tag Filter plugin loaded");
  }

  onunload() {
    console.log("Tag Filter plugin unloaded");
  }
}
