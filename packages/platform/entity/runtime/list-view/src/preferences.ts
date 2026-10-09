import {
  readStorageItem,
  readStorageJson,
  writeStorageItem,
  removeStorageItem,
} from "./browser-storage";
import {
  parseSaveableListState,
  type EntityListDescriptorV1,
  type ListLocationStateV1,
  type SaveableListStateV1,
} from "@athyper/contract-platform-entity-list";

export interface SavedListView {
  readonly scope?: "personal" | "shared" | "system";
  readonly version?: number;
  readonly compatible?: boolean;
  readonly id: string;
  readonly name: string;
  readonly state: SaveableListStateV1;
}

/** Per-device list display preferences. `density` is present only when the
 * person chose one for this list; absent means the list follows the app
 * density (Utilities / profile). */
export type DisplayPreferences = Readonly<
  Pick<SaveableListStateV1, "mode"> & {
    readonly density?: SaveableListStateV1["density"];
    readonly searchBehavior: "instant" | "submit";
  }
>;

export function saveableViewState(
  state: ListLocationStateV1,
): SaveableListStateV1 {
  return Object.freeze({
    ...(state.standardViewKey
      ? { standardViewKey: state.standardViewKey }
      : {}),
    filters: state.filters,
    sort: state.sort,
    ...(state.groups?.length ? { groups: state.groups } : {}),
    columns: state.columns,
    density: state.density,
    mode: state.mode,
    ...(state.spreadsheet ? { spreadsheet: state.spreadsheet } : {}),
    ...(state.board ? { board: state.board } : {}),
    // The calendar's date field and view are saved; its anchor never is.
    ...(state.calendar ? { calendar: state.calendar } : {}),
    // Gantt's date field and zoom are saved; its anchor never is.
    ...(state.gantt ? { gantt: state.gantt } : {}),
    // Matrix measures and pinned participants are saved; its pages never are.
    ...(state.matrix ? { matrix: state.matrix } : {}),
  });
}

export function savedViewStorageKey(
  descriptor: EntityListDescriptorV1,
): string {
  return `athyper.entity-list.views.${descriptor.plane}.${descriptor.viewNamespace ?? descriptor.entity.code}`;
}

/** Copies views saved under a shared-list key into an embedded surface's own key the
 * first time it opens. Idempotent: an existing destination is never overwritten. */
export function inheritSavedViews(fromKey: string, toKey: string): void {
  if (fromKey === toKey || readStorageItem(toKey) !== null) return;
  const inherited = readStorageItem(fromKey);
  if (inherited !== null) writeStorageItem(toKey, inherited);
}

export function readSavedViews(
  key: string,
  descriptor: EntityListDescriptorV1,
): readonly SavedListView[] {
  try {
    const value = readStorageJson(key) ?? [];
    if (!Array.isArray(value))
      throw new TypeError("Saved views must be an array");
    const views = value.flatMap((candidate): SavedListView[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      if (
        typeof item["id"] !== "string" ||
        !item["id"].trim() ||
        typeof item["name"] !== "string" ||
        !item["name"].trim()
      )
        return [];
      try {
        return [
          {
            id: item["id"].slice(0, 128),
            name: item["name"].trim().slice(0, 80),
            state: parseStoredListState(item["state"], descriptor),
          },
        ];
      } catch {
        return [];
      }
    });
    return Object.freeze(
      [
        ...(descriptor.viewCatalog?.views.filter((view) => view.compatible) ??
          []),
        ...views.filter(
          (view) =>
            !descriptor.viewCatalog?.views.some((item) => item.id === view.id),
        ),
      ].slice(0, 100),
    );
  } catch {
    removeStorageItem(key);
    return (
      descriptor.viewCatalog?.views.filter((view) => view.compatible) ?? []
    );
  }
}

/** Parses a stored view and refuses one that would not apply exactly as saved.
 * The parser skips filters, sort levels or a group whose field or operator is
 * no longer available; for a stored view that would silently widen or reorder
 * its results, so the view is treated as out of date instead. This is the same
 * rule the server applies to stored views (`validateViewState`). */
export function parseStoredListState(
  raw: unknown,
  descriptor: EntityListDescriptorV1,
): SaveableListStateV1 {
  const parsed = parseSaveableListState(raw, descriptor);
  const value = raw as Record<string, unknown>;
  const length = (items: unknown) => (Array.isArray(items) ? items.length : 0);
  if (
    length(value.filters) !== parsed.filters.length ||
    length(value.sort) !== parsed.sort.length
  )
    throw new TypeError("Saved view no longer applies exactly as saved");
  return parsed;
}

/** Removes browser-saved views that no longer apply exactly as saved and
 * returns how many were removed, so the list can say so once. */
export function pruneRetiredSavedViews(
  key: string,
  descriptor: EntityListDescriptorV1,
): number {
  const value = readStorageJson(key);
  if (!Array.isArray(value)) return 0;
  const kept = value.filter((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    try {
      parseStoredListState(
        (candidate as Record<string, unknown>)["state"],
        descriptor,
      );
      return true;
    } catch {
      return false;
    }
  });
  if (kept.length !== value.length) writeStorageItem(key, JSON.stringify(kept));
  return value.length - kept.length;
}

export function writeSavedViews(
  key: string,
  views: readonly SavedListView[],
): void {
  writeStorageItem(key, JSON.stringify(views));
}

export function readDisplayPreferences(
  plane: EntityListDescriptorV1["plane"],
  namespace?: string,
): DisplayPreferences | undefined {
  const key = displayPreferenceKey(plane, namespace);
  try {
    const value = readStorageJson(key) as Partial<DisplayPreferences> | null;
    if (
      !value ||
      (value.density !== undefined &&
        !["compact", "comfortable", "spacious"].includes(value.density)) ||
      typeof value.mode !== "string"
    )
      return undefined;
    return {
      ...(value.density ? { density: value.density } : {}),
      mode: value.mode as SaveableListStateV1["mode"],
      searchBehavior: value.searchBehavior === "submit" ? "submit" : "instant",
    };
  } catch {
    removeStorageItem(key);
    return undefined;
  }
}

export function entityDisplayPreferenceNamespace(
  descriptor: Pick<EntityListDescriptorV1, "entity" | "surface">,
): string {
  return `entity.${descriptor.entity.code}.surface.${descriptor.surface.key}`;
}

export function writeDisplayPreferences(
  plane: EntityListDescriptorV1["plane"],
  preferences: DisplayPreferences,
  namespace?: string,
): void {
  writeStorageItem(
    displayPreferenceKey(plane, namespace),
    JSON.stringify(preferences),
  );
}

export function clearDisplayPreferences(
  plane: EntityListDescriptorV1["plane"],
  namespace?: string,
): void {
  removeStorageItem(displayPreferenceKey(plane, namespace));
}

function displayPreferenceKey(
  plane: EntityListDescriptorV1["plane"],
  namespace?: string,
): string {
  return `athyper.entity-list.preferences.${plane}${namespace ? `.${namespace}` : ""}`;
}
