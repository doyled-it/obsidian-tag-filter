export interface TagInfo {
  prefix: string;
  value: string;
  full: string;
}

export type Priority = "high" | "medium" | "low" | "lowest" | "none";

export interface CheckboxItem {
  lineIndex: number;
  text: string;
  tags: TagInfo[];
  checked: boolean;
  indentLevel: number;
  priority: Priority;
  startDate: string; // YYYY-MM-DD or ""
  dueDate: string;   // YYYY-MM-DD or ""
}

export interface ParseResult {
  items: CheckboxItem[];
  tagGroups: Map<string, Map<string, number>>;
  priorities: Map<Priority, number>;
  hasStartDates: boolean;
  hasDueDates: boolean;
  startDateRange: { min: string; max: string };
  dueDateRange: { min: string; max: string };
}

const CHECKBOX_RE = /^(\s*)- \[([ xX])\] (.+)$/;
const TAG_RE = /#([a-zA-Z][\w-]*\/[\w-]+)/g;
const START_DATE_RE = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const DUE_DATE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;

const PRIORITY_MAP: [string, Priority][] = [
  ["🔺", "high"],
  ["⏫", "high"],
  ["🔼", "medium"],
  ["🔽", "low"],
  ["⏬", "lowest"],
];

function parsePriority(text: string): Priority {
  for (const [emoji, level] of PRIORITY_MAP) {
    if (text.includes(emoji)) return level;
  }
  return "none";
}

function parseDate(text: string, re: RegExp): string {
  const match = text.match(re);
  return match ? match[1] : "";
}

export function parseNote(content: string): ParseResult {
  const lines = content.split("\n");
  const items: CheckboxItem[] = [];
  const tagGroups = new Map<string, Map<string, number>>();
  const priorities = new Map<Priority, number>();
  let hasStartDates = false;
  let hasDueDates = false;
  let minStart = "9999-99-99";
  let maxStart = "0000-00-00";
  let minDue = "9999-99-99";
  let maxDue = "0000-00-00";

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(CHECKBOX_RE);
    if (!match) continue;

    const indent = match[1];
    const checkChar = match[2];
    const text = match[3];
    const checked = checkChar === "x" || checkChar === "X";
    const indentLevel = Math.floor(indent.length / 2);

    // Tags
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

    // Priority
    const priority = parsePriority(text);
    priorities.set(priority, (priorities.get(priority) ?? 0) + 1);

    // Dates
    const startDate = parseDate(text, START_DATE_RE);
    const dueDate = parseDate(text, DUE_DATE_RE);

    if (startDate) {
      hasStartDates = true;
      if (startDate < minStart) minStart = startDate;
      if (startDate > maxStart) maxStart = startDate;
    }
    if (dueDate) {
      hasDueDates = true;
      if (dueDate < minDue) minDue = dueDate;
      if (dueDate > maxDue) maxDue = dueDate;
    }

    items.push({ lineIndex: i, text, tags, checked, indentLevel, priority, startDate, dueDate });
  }

  return {
    items,
    tagGroups,
    priorities,
    hasStartDates,
    hasDueDates,
    startDateRange: { min: hasStartDates ? minStart : "", max: hasStartDates ? maxStart : "" },
    dueDateRange: { min: hasDueDates ? minDue : "", max: hasDueDates ? maxDue : "" },
  };
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
