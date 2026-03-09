// lib/auth/workspace-telemetry.ts
//
// Workspace resolution telemetry schema and emit helper.
//
// Three events:
//   workspace.resolution_started  — emitted on entry to the resolver
//   workspace.resolved            — emitted on successful finalization
//   workspace.resolution_failed   — emitted on error or denial
//
// Source enum tracks how the workspace was determined or why it failed.

export type WorkspaceResolutionSource =
  | "return_url"       // resolved via a valid returnUrl
  | "last_used"        // resolved via localStorage lastUsedWorkbench
  | "single_allowed"   // auto-routed because only one workbench is permitted
  | "chooser_manual"   // user picked from the /workspace chooser (pending state)
  | "switch_manual"    // user switched from the /workspace switcher (resolved state)
  | "denied";          // user has no allowed workbenches

export type WorkspaceEventName =
  | "workspace.resolution_started"
  | "workspace.resolved"
  | "workspace.resolution_failed";

export interface WorkspaceResolutionEvent {
  event: WorkspaceEventName;
  userId: string;
  tenantId: string;
  /** Truncated SHA-256 of the session ID — safe to log. */
  sidHash: string;
  allowedWorkbenches: string[];
  finalWorkbench?: string;
  source?: WorkspaceResolutionSource;
  /** returnUrl that was rejected (entitlement denied or unsafe family). */
  rejectedReturnUrl?: string;
  /** returnUrl that was requested (for tracing, even if not honoured). */
  requestedReturnUrl?: string;
  requestedPath?: string;
  finalPath?: string;
  success: boolean;
  latencyMs?: number;
  /**
   * The resolution state of the session before this event.
   * Distinguishes initial resolution ("pending") from workspace switching ("resolved").
   */
  resolutionStateBefore: "pending" | "resolved";
}

/**
 * Emit a workspace resolution event to the audit log via Redis.
 * Uses the same lpush pattern as the existing BFF audit system.
 * Fire-and-forget: errors are swallowed so telemetry never breaks the auth flow.
 */
export async function emitWorkspaceEvent(
  redis: { lPush: (key: string, value: string) => Promise<unknown> },
  event: WorkspaceResolutionEvent,
): Promise<void> {
  try {
    const payload = JSON.stringify({
      ...event,
      ts: new Date().toISOString(),
    });
    await redis.lPush("audit:workspace", payload);
  } catch {
    // Telemetry must never interrupt the auth flow
  }
}
