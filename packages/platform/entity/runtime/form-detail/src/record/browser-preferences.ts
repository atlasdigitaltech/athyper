import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@athyper/platform-ui";

/** Optional browser preferences only; never store protected record values here. */
export function readBrowserPreference(key: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(readBrowserStorage(key) ?? "null"); } catch { removeBrowserStorage(key); }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  removeBrowserStorage(key);
  return {};
}
export function writeBrowserPreference(key: string, value: Record<string, unknown>): void {
  try { writeBrowserStorage(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}
