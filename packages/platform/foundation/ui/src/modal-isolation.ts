"use client";
import { useEffect, useRef, type RefObject } from "react";

type Entry = { panel: HTMLElement; outside: readonly HTMLElement[] };
type Branch = { owner: HTMLElement; element: HTMLElement };
type State = {
  entries: Entry[];
  branches: Set<Branch>;
  changed: Map<HTMLElement, boolean>;
  overflow: string;
  observer: MutationObserver;
};
const states = new WeakMap<Document, State>();

function roots(state: State): HTMLElement[] {
  const top = state.entries.at(-1);
  if (!top) return [];
  const allowed = [top.panel, ...top.outside];
  for (const branch of state.branches) {
    if (allowed.some((root) => root.contains(branch.owner)))
      allowed.push(branch.element);
  }
  return allowed;
}
function sync(doc: Document, state: State) {
  for (const [element, previous] of state.changed) element.inert = previous;
  state.changed.clear();
  const allowed = roots(state).filter((element) => element.isConnected);
  if (!allowed.length) return;
  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof doc.defaultView!.HTMLElement)) continue;
      if (allowed.includes(child)) continue;
      if (allowed.some((root) => child.contains(root))) visit(child);
      else {
        state.changed.set(child, child.inert);
        child.inert = true;
      }
    }
  };
  visit(doc.body);
}
function stateFor(doc: Document): State {
  const existing = states.get(doc);
  if (existing) return existing;
  const state: State = {
    entries: [],
    branches: new Set(),
    changed: new Map(),
    overflow: doc.body.style.overflow,
    observer: new doc.defaultView!.MutationObserver(() => sync(doc, state)),
  };
  states.set(doc, state);
  state.observer.observe(doc.body, { childList: true, subtree: true });
  return state;
}
/** Portal menus remain part of the modal that owns their trigger. */
export function registerModalBranch(
  owner: HTMLElement,
  element: HTMLElement,
): () => void {
  const state = states.get(owner.ownerDocument);
  if (!state) return () => {};
  const branch = { owner, element };
  state.branches.add(branch);
  sync(owner.ownerDocument, state);
  return () => {
    state.branches.delete(branch);
    sync(owner.ownerDocument, state);
  };
}
function isVisible(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === "function")
    return element.checkVisibility({ checkVisibilityCSS: true });
  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    const style = element.ownerDocument.defaultView!.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (
      current.tagName === "DETAILS" &&
      !current.hasAttribute("open") &&
      !current.querySelector(":scope > summary")?.contains(element)
    )
      return false;
  }
  return !element.matches('input[type="hidden"]');
}
function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,summary,[contenteditable="true"],[tabindex]',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[hidden],[inert]") &&
      isVisible(element),
  );
}

/** One isolation stack for inline shell modals, portal drawers and nested dialogs. */
export function useModalIsolation(
  panel: RefObject<HTMLElement | null>,
  enabled: boolean,
  options: {
    readonly initialFocus?: () => HTMLElement | null;
    readonly outside?: () => readonly HTMLElement[];
    readonly onEscape?: () => void;
    readonly restoreFocus?: boolean;
  } = {},
) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const element = panel.current;
    if (!enabled || !element) return;
    const doc = element.ownerDocument,
      state = stateFor(doc);
    const previous =
      doc.activeElement instanceof doc.defaultView!.HTMLElement
        ? doc.activeElement
        : null;
    const entry: Entry = {
      panel: element,
      outside: latest.current.outside?.() ?? [],
    };
    state.entries.push(entry);
    doc.body.style.overflow = "hidden";
    const oldTabIndex = element.getAttribute("tabindex");
    if (oldTabIndex === null) element.tabIndex = -1;
    sync(doc, state);
    const top = () => state.entries.at(-1) === entry;
    const inside = (target: Node | null) =>
      target && roots(state).some((root) => root.contains(target));
    const focusFirst = () =>
      (
        latest.current.initialFocus?.() ??
        focusable(element)[0] ??
        element
      ).focus();
    if (!inside(doc.activeElement)) focusFirst();
    const focus = (event: FocusEvent) => {
      if (top() && !inside(event.target as Node)) focusFirst();
    };
    const key = (event: KeyboardEvent) => {
      if (!top() || event.defaultPrevented) return;
      if (event.key === "Escape" && latest.current.onEscape) {
        event.preventDefault();
        latest.current.onEscape();
        return;
      }
      if (event.key !== "Tab") return;
      const items = roots(state)
        .filter((root) => !entry.outside.includes(root))
        .flatMap(focusable);
      const first = items[0],
        last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        element.focus();
        return;
      }
      if (
        event.shiftKey &&
        (doc.activeElement === first || !inside(doc.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (doc.activeElement === last || !inside(doc.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    doc.addEventListener("focusin", focus);
    doc.addEventListener("keydown", key);
    return () => {
      doc.removeEventListener("focusin", focus);
      doc.removeEventListener("keydown", key);
      state.entries = state.entries.filter((value) => value !== entry);
      if (oldTabIndex === null) element.removeAttribute("tabindex");
      sync(doc, state);
      if (!state.entries.length) {
        state.observer.disconnect();
        states.delete(doc);
        doc.body.style.overflow = state.overflow;
      }
      if (
        latest.current.restoreFocus !== false &&
        previous?.isConnected &&
        !previous.closest("[inert]")
      )
        previous.focus();
    };
  }, [enabled, panel]);
}
