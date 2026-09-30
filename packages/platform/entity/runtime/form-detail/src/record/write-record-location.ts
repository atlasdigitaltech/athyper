/** Preserve router history state; transient viewport changes replace the current entry. */
export function writeRecordLocation(
  change: URL | ((url: URL) => void),
  mode: "push" | "replace" = "push",
): boolean {
  const next = new URL(window.location.href);
  if (typeof change === "function") change(next);
  const target = change instanceof URL ? change : next;
  if (target.origin !== window.location.origin) throw new Error("Record navigation must remain same-origin");
  if (target.href === window.location.href) return false;
  window.history[mode === "push" ? "pushState" : "replaceState"](
    window.history.state, "", target,
  );
  return true;
}
