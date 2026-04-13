import { type ReactNode } from "react";

/**
 * Workbench group layout — (workbench)
 *
 * Wraps all bespoke domain control surfaces across ALL domains.
 *
 * ── Architecture convention (enforced by code review, not this layout) ────────
 *
 * Routes under (workbench)/ follow the no-[id]-route convention:
 *   - No [id] child routes exist anywhere under (workbench)/
 *   - All record focus uses query params, right drawers, bottom panels, or modals
 *   - Navigation must never leave the workbench URL
 *
 * Canonical workbench URL patterns:
 *   /finance/gl?entry=JE-10045              ← focus record in panel
 *   /finance/gl?period=2026-03&status=draft  ← filtered workbench state
 *   /finance/coa?account=400100              ← account selected in drawer
 *   /finance/views/trial-balance?as-of=2026-03-31
 *
 * Forbidden patterns:
 *   /finance/gl/JE-10045          ← NEVER — violates workbench convention
 *   /finance/coa/400100/edit       ← NEVER — use drawer or modal
 *
 * ── Domain expansion ──────────────────────────────────────────────────────────
 *
 * Finance is the first domain. Supply Chain, People, Projects, Manufacturing,
 * and Asset Management workbenches append here following the same convention.
 * Each domain may add its own layout.tsx for domain-specific context chrome.
 */
export default function WorkbenchGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
