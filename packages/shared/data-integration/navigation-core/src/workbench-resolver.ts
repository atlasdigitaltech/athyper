/**
 * @athyper/navigation — Workbench Resolver
 *
 * Resolves which workbench (admin/user/partner) to render
 * based on the session workbench field set during login.
 *
 * v4: workbench is always explicitly set in PersonaContext from the BFF session.
 * Capabilities-based fallback removed — authorization is deferred to DB via
 * the permissions map in RuntimeSession, not inferred from session fields.
 */
export type WorkbenchType = "admin" | "user" | "partner";

/** Minimum session shape required by resolveWorkbench. */
type WorkbenchSession = { persona: { workbench: string } };

/**
 * Resolve the workbench type from a session.
 *
 * Defensive against malformed session shapes (null persona, missing field)
 * by falling back to "user" rather than throwing — the BFF guarantees the
 * field is set, but the resolver must not crash if the shape is stale or
 * partially hydrated during login transitions.
 */
export function resolveWorkbench(session: WorkbenchSession): WorkbenchType {
  const wb = session?.persona?.workbench;
  if (wb === "admin" || wb === "partner" || wb === "user") {
    return wb;
  }
  return "user";
}
