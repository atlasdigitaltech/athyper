import { ENTITY_LIST_MAX_URL_LENGTH, decodeListLocationState, encodeListLocationState, parseListLocationState, type EntityListDescriptorV1, type ListLocationStateV1, type SaveableListStateV1 } from "@athyper/contract-platform-entity-list";
import { readSavedViews, savedViewStorageKey } from "./preferences";

const SESSION_PARAMETER = "lst";
const SESSION_PREFIX = "athyper.entity-list.location.";
const SESSION_TOKEN = /^[a-zA-Z0-9-]{8,80}$/;

export function readListLocation(descriptor: EntityListDescriptorV1, search = window.location.search): ListLocationStateV1 {
  const parameters = new URLSearchParams(search);
  const token = parameters.get(SESSION_PARAMETER);
  if (token && SESSION_TOKEN.test(token)) {
    const stored = readSessionState(token, descriptor);
    if (stored) return stored;
  }
  const explicit=[...parameters.keys()].some(key=>["standardView","vid","bvid","q","sort","group","group.clear","density","view","lane","lanes.collapsed","cal","cal.view","cal.field","columns","cols","col.remove","col.move","filters","page","pageSize","cursor","lst"].includes(key)||key.startsWith("filter.")||key.startsWith("col.")||key.startsWith("sheet"));
  const preferred=descriptor.viewCatalog?.personalDefault??descriptor.viewCatalog?.sharedDefault;
  if(!explicit&&preferred)parameters.set("vid",preferred);
  const id=parameters.get("vid"),base=savedViewBase(id,descriptor);
  if(id&&id!=="system"&&!base)parameters.set("vid","system");
  return decodeListLocationState(parameters, descriptor, { baseState:base });
}

export function writeListLocation(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, history: "replace" | "push"): void {
  const baseState = savedViewBase(state.savedViewId, descriptor);
  const query = encodeListLocationState(state, descriptor, { baseState }).toString();
  let href = relativeHref(query);
  if (href.length > ENTITY_LIST_MAX_URL_LENGTH) {
    const token = storeSessionState(state, descriptor);
    if (token) href = relativeHref(`${SESSION_PARAMETER}=${encodeURIComponent(token)}`);
  }
  if (history === "replace") {
    removeCurrentSessionState();
    window.history.replaceState(window.history.state, "", href);
  } else window.history.pushState(withoutCompareEntry(window.history.state), "", href);
}

/** History-state key marking an entry created by opening a comparison
 * (Compare blueprint section 5.4). It lives in the entry itself, so Back,
 * navigation and other pushes can never leave it describing another entry. */
const COMPARE_ENTRY = "athyperEntityCompareEntry";

function withoutCompareEntry(state: unknown): unknown {
  if (!state || typeof state !== "object" || !(COMPARE_ENTRY in state)) return state;
  const { [COMPARE_ENTRY]: _marker, ...rest } = state as Record<string, unknown>;
  return rest;
}

/** Marks the current entry as the one pushed to open a comparison. */
export function markCompareEntry(): void {
  const current = window.history.state;
  window.history.replaceState({ ...(current && typeof current === "object" ? current : {}), [COMPARE_ENTRY]: true }, "", window.location.href);
}

/** The current entry was pushed by opening a comparison, so Close can go back to it. */
export function currentEntryOpenedCompare(): boolean {
  const current = window.history.state as Record<string, unknown> | null;
  return Boolean(current && typeof current === "object" && current[COMPARE_ENTRY] === true);
}

/** Returns a portable URL with no device-local saved-view or session identifier. */
export function portableListHref(state: ListLocationStateV1, descriptor: EntityListDescriptorV1): string | undefined {
  const query = encodeListLocationState(state, descriptor, { includeViewIds: false }).toString();
  const relative = relativeHref(query);
  if (relative.length > ENTITY_LIST_MAX_URL_LENGTH) return undefined;
  return new URL(relative, window.location.origin).href;
}

/** True when a shared link or the selected saved view asks for a layout this
 * viewer cannot use; the decoded state then keeps the surface default. */
export function requestedLayoutUnavailable(descriptor: EntityListDescriptorV1, search = window.location.search): boolean {
  const parameters = new URLSearchParams(search);
  const requested = parameters.get("view") ?? savedViewBase(parameters.get("vid"), descriptor)?.mode;
  return requested !== undefined && requested !== null && !descriptor.surface.supportedModes.some((mode) => mode === requested);
}

/** True when a shared link or the selected saved view names a lane field the
 * viewer cannot use; the decoded state then uses the first usable one. */
export function requestedLaneFieldUnavailable(descriptor: EntityListDescriptorV1, search = window.location.search): boolean {
  const board = descriptor.surface.board;
  if (!board) return false;
  const parameters = new URLSearchParams(search);
  const requested = parameters.get("lane") ?? savedViewBase(parameters.get("vid"), descriptor)?.board?.laneField;
  return typeof requested === "string" && !board.laneFields.some((item) => item.field === requested);
}

function savedViewBase(id: string | null | undefined, descriptor: EntityListDescriptorV1): SaveableListStateV1 | undefined {
  if (!id) return undefined;
  return readSavedViews(savedViewStorageKey(descriptor), descriptor).find((view) => view.id === id)?.state;
}

function relativeHref(query: string): string { return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`; }
function sessionKey(token: string): string { return `${SESSION_PREFIX}${token}`; }

function storeSessionState(state: ListLocationStateV1, descriptor: EntityListDescriptorV1): string | undefined {
  try {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(sessionKey(token), JSON.stringify({ descriptorHash: descriptor.revision.descriptorHash, state: parseListLocationState(state, descriptor) }));
    return token;
  } catch { return undefined; }
}

function readSessionState(token: string, descriptor: EntityListDescriptorV1): ListLocationStateV1 | undefined {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(sessionKey(token)) ?? "null") as { descriptorHash?: unknown; state?: unknown } | null;
    if (!parsed || parsed.descriptorHash !== descriptor.revision.descriptorHash) return undefined;
    return parseListLocationState(parsed.state, descriptor);
  } catch { return undefined; }
}

function removeCurrentSessionState(): void {
  try {
    const token = new URLSearchParams(window.location.search).get(SESSION_PARAMETER);
    if (token && SESSION_TOKEN.test(token)) window.sessionStorage.removeItem(sessionKey(token));
  } catch { /* Session storage is an optional resilience mechanism. */ }
}
