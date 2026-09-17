import { useEffect } from "react";

/**
 * Extracted from two nearly-identical implementations in composition-editor.tsx and
 * workbench-editor.tsx (same warning-on-close plus confirm-before-navigating-away behavior,
 * differing only in message text). Native window.confirm/beforeunload, matching what both
 * already did; not the app's own ConfirmDialog — Neon's useGuardedNavigation takes that
 * approach instead, and reconciling the two is a separate, bigger decision.
 */
export function useUnsavedChangesGuard(dirty: boolean, busy: boolean, message: string) {
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (!(event.target as Element)?.closest?.("a[href]")) return;
      if (busy || !window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, busy, message]);
}
