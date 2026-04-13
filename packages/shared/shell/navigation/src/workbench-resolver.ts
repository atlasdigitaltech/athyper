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

type WorkbenchSession = { persona: { workbench: string } };

export function resolveWorkbench(session: WorkbenchSession): WorkbenchType {
  const wb = session.persona.workbench;
  if (wb === "admin" || wb === "partner" || wb === "user") {
    return wb;
  }
  // Fallback: default to "user" if workbench value is unrecognized
  return "user";
}
