export interface FilterState {
  selectedTags: Set<string>;
  mode: "AND" | "OR";
}

const HIDDEN_CLASS = "tag-filter-hidden";
const SECTION_COLLAPSED_CLASS = "tag-filter-section-collapsed";
const SECTION_BADGE_CLASS = "tag-filter-hidden-badge";

function getTagsFromElement(el: HTMLElement): Set<string> {
  const tags = new Set<string>();
  const text = el.textContent ?? "";
  const re = /#([a-zA-Z][\w-]*\/[\w-]+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    tags.add(match[1]);
  }
  return tags;
}

function findParentSection(el: HTMLElement): HTMLElement | null {
  let sibling = el.parentElement;
  while (sibling) {
    let prev = sibling.previousElementSibling;
    while (prev) {
      if (/^H[1-6]$/.test(prev.tagName)) {
        return prev as HTMLElement;
      }
      prev = prev.previousElementSibling;
    }
    sibling = sibling.parentElement;
  }
  return null;
}

function getSectionContent(heading: HTMLElement): HTMLElement | null {
  return heading.nextElementSibling as HTMLElement | null;
}

export function applyFilter(container: HTMLElement, state: FilterState): void {
  const { selectedTags, mode } = state;

  const allItems = container.querySelectorAll<HTMLElement>(
    "li.task-list-item"
  );

  const sectionVisibility = new Map<HTMLElement, { total: number; hidden: number }>();

  allItems.forEach((li) => {
    if (li.parentElement?.closest("li.task-list-item")) {
      return;
    }

    const tags = getTagsFromElement(li);
    let visible: boolean;

    if (selectedTags.size === 0) {
      visible = true;
    } else if (tags.size === 0) {
      visible = false;
    } else if (mode === "AND") {
      visible = true;
      for (const tag of selectedTags) {
        if (!tags.has(tag)) {
          visible = false;
          break;
        }
      }
    } else {
      visible = false;
      for (const tag of selectedTags) {
        if (tags.has(tag)) {
          visible = true;
          break;
        }
      }
    }

    if (visible) {
      li.removeClass(HIDDEN_CLASS);
    } else {
      li.addClass(HIDDEN_CLASS);
    }

    const section = findParentSection(li);
    if (section) {
      if (!sectionVisibility.has(section)) {
        sectionVisibility.set(section, { total: 0, hidden: 0 });
      }
      const info = sectionVisibility.get(section)!;
      info.total++;
      if (!visible) info.hidden++;
    }
  });

  sectionVisibility.forEach((info, heading) => {
    const oldBadge = heading.querySelector(`.${SECTION_BADGE_CLASS}`);
    if (oldBadge) oldBadge.remove();

    if (info.hidden === info.total && info.total > 0 && selectedTags.size > 0) {
      heading.addClass(SECTION_COLLAPSED_CLASS);
      const badge = document.createElement("span");
      badge.className = SECTION_BADGE_CLASS;
      badge.textContent = ` (${info.hidden} hidden)`;
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        heading.removeClass(SECTION_COLLAPSED_CLASS);
        const sectionEl = getSectionContent(heading);
        if (sectionEl) {
          sectionEl.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => {
            el.removeClass(HIDDEN_CLASS);
            el.addClass("tag-filter-revealed");
          });
        }
      });
      heading.appendChild(badge);
    } else {
      heading.removeClass(SECTION_COLLAPSED_CLASS);
    }
  });
}

export function clearFilter(container: HTMLElement): void {
  container.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => {
    el.removeClass(HIDDEN_CLASS);
  });
  container.querySelectorAll(`.${SECTION_COLLAPSED_CLASS}`).forEach((el) => {
    el.removeClass(SECTION_COLLAPSED_CLASS);
  });
  container.querySelectorAll(`.${SECTION_BADGE_CLASS}`).forEach((el) => {
    el.remove();
  });
  container.querySelectorAll(".tag-filter-revealed").forEach((el) => {
    el.removeClass("tag-filter-revealed");
  });
}
