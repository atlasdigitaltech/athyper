/** Non-sensitive shell choices; unavailable browser storage must not break navigation. */
export function readShellPreference(
  key: "athyper.shell.collapsed" | "athyper.atlas.pinned",
): boolean | undefined {
  try {
    const value = localStorage.getItem(key);
    if (value === "true" || value === "false") return value === "true";
  } catch { /* Try the existing server-readable collapse preference. */ }
  if (key === "athyper.shell.collapsed") {
    try {
      const value = /(?:^|;\s*)athyper_shell_collapsed=(true|false)(?:;|$)/.exec(document.cookie)?.[1];
      if (value !== undefined) return value === "true";
    } catch { /* Neither persistence mechanism is available. */ }
  }
  return undefined;
}
export function writeShellPreference(
  key: "athyper.shell.collapsed" | "athyper.atlas.pinned",
  value: boolean,
) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Keep the in-memory choice. */
  }
  if (key === "athyper.shell.collapsed") {
    try {
      document.cookie = `athyper_shell_collapsed=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      /* Storage may be blocked. */
    }
  }
}
