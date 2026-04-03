import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        document: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        MutationObserver: "readonly",
      },
    },
    rules: {
      "import/no-extraneous-dependencies": "off",
      "@typescript-eslint/require-await": "error",
    },
  },
]);
