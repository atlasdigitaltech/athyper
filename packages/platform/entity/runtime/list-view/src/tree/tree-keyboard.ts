import type { KeyboardEvent } from "react";

/** One visible row of a tree grid, in display order. */
export interface TreeRowPosition {
  readonly key: string;
  readonly level: number;
  /** Undefined for rows that cannot expand (leaves, record rows under a group). */
  readonly expanded?: boolean;
}

export type TreeKeyAction =
  | { readonly kind: "focus"; readonly key: string }
  | { readonly kind: "toggle"; readonly key: string }
  | { readonly kind: "open"; readonly key: string }
  | { readonly kind: "expandSiblings"; readonly keys: readonly string[] };

/** The ARIA tree-grid keyboard model over the visible rows: Up and Down move;
 * Right expands a collapsed row or moves to its first child; Left collapses an
 * expanded row or moves to its parent; Home and End; Enter opens; `*` expands
 * the collapsed siblings already loaded. Right-to-left swaps Left and Right. */
export function treeKeyAction(rows: readonly TreeRowPosition[], current: string, key: string, rtl = false): TreeKeyAction | undefined {
  const index = rows.findIndex((row) => row.key === current);
  if (index < 0) return rows[0] ? { kind: "focus", key: rows[0].key } : undefined;
  const row = rows[index]!;
  const forward = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === "ArrowDown") return rows[index + 1] ? { kind: "focus", key: rows[index + 1]!.key } : undefined;
  if (key === "ArrowUp") return index > 0 ? { kind: "focus", key: rows[index - 1]!.key } : undefined;
  if (key === "Home") return { kind: "focus", key: rows[0]!.key };
  if (key === "End") return { kind: "focus", key: rows[rows.length - 1]!.key };
  if (key === "Enter") return { kind: "open", key: row.key };
  if (key === forward) {
    if (row.expanded === false) return { kind: "toggle", key: row.key };
    const child = rows[index + 1];
    return row.expanded && child && child.level === row.level + 1 ? { kind: "focus", key: child.key } : undefined;
  }
  if (key === back) {
    if (row.expanded) return { kind: "toggle", key: row.key };
    for (let at = index - 1; at >= 0; at -= 1) if (rows[at]!.level < row.level) return { kind: "focus", key: rows[at]!.key };
    return undefined;
  }
  if (key === "*") {
    const keys: string[] = [];
    // Siblings share the level and the nearest shallower ancestor.
    for (let at = index; at >= 0 && rows[at]!.level >= row.level; at -= 1) if (rows[at]!.level === row.level && rows[at]!.expanded === false) keys.push(rows[at]!.key);
    for (let at = index + 1; at < rows.length && rows[at]!.level >= row.level; at += 1) if (rows[at]!.level === row.level && rows[at]!.expanded === false) keys.push(rows[at]!.key);
    return keys.length ? { kind: "expandSiblings", keys } : undefined;
  }
  return undefined;
}

const TREE_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", "*"]);

/** DOM adapter for a tree grid whose rows are rendered by nested components:
 * reads the visible rows (`[data-tree-key]`, `aria-level`, `aria-expanded`) in
 * document order, applies {@link treeKeyAction}, and moves the roving tab stop.
 * Toggling clicks the row's `[data-tree-toggle]`; opening clicks its
 * `[data-tree-open]` link. Keys pressed inside other controls are ignored. */
export function handleTreeKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (!TREE_KEYS.has(event.key)) return;
  const target = event.target as HTMLElement;
  const current = target.closest<HTMLElement>("[data-tree-key]");
  if (!current || current !== target) return;
  const grid = event.currentTarget;
  const elements = [...grid.querySelectorAll<HTMLElement>("[data-tree-key]")];
  const rows = elements.map((element) => {
    const expanded = element.getAttribute("aria-expanded");
    return { key: element.dataset.treeKey!, level: Number(element.getAttribute("aria-level") ?? 1), ...(expanded === null ? {} : { expanded: expanded === "true" }) };
  });
  const rtl = grid.ownerDocument.defaultView?.getComputedStyle(grid).direction === "rtl";
  const action = treeKeyAction(rows, current.dataset.treeKey!, event.key, rtl);
  if (!action) return;
  event.preventDefault();
  const byKey = (key: string) => elements.find((element) => element.dataset.treeKey === key);
  if (action.kind === "focus") {
    const next = byKey(action.key);
    if (!next) return;
    current.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  } else if (action.kind === "toggle") byKey(action.key)?.querySelector<HTMLElement>("[data-tree-toggle]")?.click();
  else if (action.kind === "open") byKey(action.key)?.querySelector<HTMLElement>("[data-tree-open]")?.click();
  else for (const key of action.keys) byKey(key)?.querySelector<HTMLElement>("[data-tree-toggle]")?.click();
}
