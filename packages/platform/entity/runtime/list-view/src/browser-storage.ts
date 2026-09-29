/** Optional browser preferences. Never use this for protected record values. */
import { readBrowserStorage, writeBrowserStorage, removeBrowserStorage } from "@athyper/platform-ui";
export function removeStorageItem(key: string): void {
  removeBrowserStorage(key);
}
export function writeStorageItem(key: string, value: string): void {
  writeBrowserStorage(key, value);
}
export function readStorageJson(key: string): unknown {
  try { return JSON.parse(readBrowserStorage(key) ?? "null"); }
  catch { removeStorageItem(key); return null; }
}
export function readStorageItem(key: string): string | null {
  return readBrowserStorage(key) ?? null;
}
