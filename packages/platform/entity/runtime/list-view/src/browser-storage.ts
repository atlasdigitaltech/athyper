/** Optional browser preferences. Never use this for protected record values. */
export function removeStorageItem(key: string): void {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(key); } catch { /* Storage is optional. */ }
}
export function writeStorageItem(key: string, value: string): void {
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
}
export function readStorageJson(key: string): unknown {
  try { return typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(key) ?? "null"); }
  catch { removeStorageItem(key); return null; }
}
