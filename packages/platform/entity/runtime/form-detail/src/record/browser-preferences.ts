import { readStorageJson, removeStorageItem, writeStorageItem } from "@athyper/platform-entity-list-view/browser-storage";

/** Optional browser preferences only; never store protected record values here. */
export function readBrowserPreference(key: string): Record<string, unknown> {
  const value = readStorageJson(key);
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  removeStorageItem(key);
  return {};
}
export function writeBrowserPreference(key: string, value: Record<string, unknown>): void {
  try { writeStorageItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}
