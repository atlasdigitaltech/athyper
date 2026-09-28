/** Optional preferences only, never an authorization or protected-data store. */
function storage(kind: "local" | "session"): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : kind === "local" ? window.localStorage : window.sessionStorage; }
  catch { return undefined; }
}
export function readBrowserStorage(key: string, kind: "local" | "session" = "local"): string | null {
  try { return storage(kind)?.getItem(key) ?? null; } catch { return null; }
}
export function writeBrowserStorage(key: string, value: string, kind: "local" | "session" = "local"): void {
  try { storage(kind)?.setItem(key, value); } catch { /* Optional storage may be disabled or full. */ }
}
export function removeBrowserStorage(key: string, kind: "local" | "session" = "local"): void {
  try { storage(kind)?.removeItem(key); } catch { /* Optional storage may be disabled. */ }
}
