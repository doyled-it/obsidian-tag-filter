export interface TagInfo {
  prefix: string;
  value: string;
  full: string;
}

export interface CheckboxItem {
  lineIndex: number;
  text: string;
  tags: TagInfo[];
  checked: boolean;
  indentLevel: number;
}

export interface ParseResult {
  items: CheckboxItem[];
  tagGroups: Map<string, Map<string, number>>;
}

const CHECKBOX_RE = /^(\s*)- \[([ xX])\] (.+)$/;
const TAG_RE = /#([a-zA-Z][\w-]*\/[\w-]+)/g;

export function parseNote(content: string): ParseResult {
  const lines = content.split("\n");
  const items: CheckboxItem[] = [];
  const tagGroups = new Map<string, Map<string, number>>();

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(CHECKBOX_RE);
    if (!match) continue;

    const indent = match[1];
    const checkChar = match[2];
    const text = match[3];
    const checked = checkChar === "x" || checkChar === "X";
    const indentLevel = Math.floor(indent.length / 2);

    const tags: TagInfo[] = [];
    let tagMatch;
    TAG_RE.lastIndex = 0;
    while ((tagMatch = TAG_RE.exec(text)) !== null) {
      const full = tagMatch[1];
      const slashIndex = full.indexOf("/");
      const prefix = full.substring(0, slashIndex);
      const value = full.substring(slashIndex + 1);
      tags.push({ prefix, value, full });

      if (!tagGroups.has(prefix)) {
        tagGroups.set(prefix, new Map());
      }
      const group = tagGroups.get(prefix)!;
      group.set(value, (group.get(value) ?? 0) + 1);
    }

    items.push({ lineIndex: i, text, tags, checked, indentLevel });
  }

  return { items, tagGroups };
}

export function itemMatchesFilter(
  item: CheckboxItem,
  selectedTags: Set<string>,
  mode: "AND" | "OR"
): boolean {
  if (selectedTags.size === 0) return true;

  const itemTagSet = new Set(item.tags.map((t) => t.full));

  if (mode === "AND") {
    for (const tag of selectedTags) {
      if (!itemTagSet.has(tag)) return false;
    }
    return true;
  } else {
    for (const tag of selectedTags) {
      if (itemTagSet.has(tag)) return true;
    }
    return false;
  }
}
