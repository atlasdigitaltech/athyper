import { parseSaveableListState, type EntityListDescriptorV1, type ListLocationStateV1, type SaveableListStateV1 } from "@athyper/contract-platform-entity-list";

export interface SavedListView {
  readonly scope?: "personal"|"shared"|"system";
  readonly version?:number;
  readonly compatible?:boolean;
  readonly id: string;
  readonly name: string;
  readonly state: SaveableListStateV1;
}

export type DisplayPreferences = Readonly<Pick<SaveableListStateV1, "density" | "mode"> & {
  readonly searchBehavior: "instant" | "submit";
}>;

export function saveableViewState(state: ListLocationStateV1): SaveableListStateV1 {
  return Object.freeze({
    ...(state.standardViewKey?{standardViewKey:state.standardViewKey}:{}),
    filters: state.filters,
    sort: state.sort,
    ...(state.group ? { group: state.group } : {}),
    columns: state.columns,
    density: state.density,
    mode: state.mode,
    ...(state.spreadsheet ? { spreadsheet: state.spreadsheet } : {}),
  });
}

export function savedViewStorageKey(descriptor: EntityListDescriptorV1): string {
  return `athyper.entity-list.views.${descriptor.plane}.${descriptor.viewNamespace ?? descriptor.entity.code}`;
}

export function readSavedViews(key: string, descriptor: EntityListDescriptorV1): readonly SavedListView[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(value)) throw new TypeError("Saved views must be an array");
    const views = value.flatMap((candidate): SavedListView[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      if (typeof item["id"] !== "string" || !item["id"].trim() || typeof item["name"] !== "string" || !item["name"].trim()) return [];
      try {
        return [{
          id: item["id"].slice(0, 128),
          name: item["name"].trim().slice(0, 80),
          state: parseSaveableListState(item["state"], descriptor),
        }];
      } catch {
        return [];
      }
    });
    return Object.freeze([...(descriptor.viewCatalog?.views.filter(view=>view.compatible)??[]),...views.filter(view=>!descriptor.viewCatalog?.views.some(item=>item.id===view.id))].slice(0,100));
  } catch {
    removeStorageItem(key);
    return descriptor.viewCatalog?.views.filter(view=>view.compatible)??[];
  }
}

export function writeSavedViews(key: string, views: readonly SavedListView[]): void {
  writeStorageItem(key, JSON.stringify(views));
}

export function readDisplayPreferences(plane: EntityListDescriptorV1["plane"]): DisplayPreferences | undefined {
  const key = displayPreferenceKey(plane);
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<DisplayPreferences> | null;
    if (!value || !["compact", "comfortable", "spacious"].includes(value.density ?? "") || typeof value.mode !== "string") return undefined;
    return {
      density: value.density!,
      mode: value.mode as SaveableListStateV1["mode"],
      searchBehavior: value.searchBehavior === "submit" ? "submit" : "instant",
    };
  } catch {
    removeStorageItem(key);
    return undefined;
  }
}

export function writeDisplayPreferences(plane: EntityListDescriptorV1["plane"], preferences: DisplayPreferences): void {
  writeStorageItem(displayPreferenceKey(plane), JSON.stringify(preferences));
}

export function clearDisplayPreferences(plane: EntityListDescriptorV1["plane"]): void {
  removeStorageItem(displayPreferenceKey(plane));
}

function displayPreferenceKey(plane: EntityListDescriptorV1["plane"]): string {
  return `athyper.entity-list.preferences.${plane}`;
}

function writeStorageItem(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* Current-page settings still apply without local storage. */ }
}

function removeStorageItem(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}
