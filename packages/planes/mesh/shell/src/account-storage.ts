// Persistence is optional: browser privacy settings must not prevent selecting
// an account that the server has already authorized.
export function readAccountSelection(key: string): string | undefined {
  try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}

export function writeAccountSelection(key: string, value?: string): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* Keep the selection in memory when storage is unavailable. */ }
}
