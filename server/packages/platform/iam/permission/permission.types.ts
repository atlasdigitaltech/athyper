/**
 * IAM Permission Decision Types — v1.0
 *
 * Contract 1 (Phase 1): defines the output shape of the TypeScript wrapper
 * around master.check_permission(). Every IAM-consuming service that needs a
 * runtime permission check imports from here — never queries DB permission
 * tables directly.
 *
 * Binding rule: No service may call master.check_permission() directly via SQL.
 * All permission checks go through checkPermission() in permission.service.ts,
 * which handles audit logging, scope resolution, and typed error codes.
 *
 * Decision values align with log.permission_decision_log.decision CHECK constraint:
 *   allow | deny | not_found | not_in_plan | addon_required | not_granted
 *
 * Reason values align with log.permission_decision_log.decision_reason (non-empty text).
 */

// ─── Decision outcome ─────────────────────────────────────────────────────────

/**
 * The decision returned by check_permission() (5-step evaluation):
 *   Step 1: plan gate  → not_in_plan | addon_required
 *   Step 2: derive roles/groups
 *   Step 3: canonical role/group authority → allow
 *   Step 4: access_grant allow  → allow (grant_granted reason)
 *   Step 5: access_grant deny (always wins)  → deny
 *   Fallthrough  → not_found
 */
export type PermissionDecisionOutcome =
  | "allow"
  | "deny"
  | "not_found"
  | "not_in_plan"
  | "addon_required"
  | "not_granted";

// ─── Decision reason ──────────────────────────────────────────────────────────

/**
 * Human-readable reason code for the decision. Used for audit log
 * (log.permission_decision_log.decision_reason) and client diagnostics.
 */
export type PermissionDecisionReason =
  | "plan_gate_denied"     // Step 1: plan gate blocked the permission
  | "addon_required"       // Step 1: plan gate requires addon purchase
  | "no_grant_found"       // Fallthrough: no canonical authority path covers this permission
  | "explicit_deny"        // Step 5: access_grant deny won (always wins rule)
  | "role_granted"         // Step 3: canonical group-to-role path granted this
  | "grant_granted"        // Step 4: access_grant allow granted this
  | "delegation_granted";  // Extended: merged from an active delegation grant

// ─── Scope resolution ─────────────────────────────────────────────────────────

/**
 * The two-dimension scope resolved for an allowed permission.
 *
 * Dimension 1 — visibility (row-level data filtering):
 *   all  = every record in the tenant
 *   team = records created_by any member of the principal's team(s)
 *   own  = records created_by this principal only
 *
 * Dimension 2 — company_code boundary (assignment scope):
 *   company_code_ids.length = 0 → tenant-wide (no CC filter)
 *   company_code_ids.length > 0 → restrict to these CCs
 *
 * Source functions:
 *   master.get_effective_visibility_scope()  → visibility
 *   master.resolve_allowed_companies()       → company_code_ids
 */
export interface ResolvedScope {
  /** Widest row-level visibility across all grants for this permission. */
  visibility: "all" | "team" | "own";
  /**
   * UUIDs of company codes this principal is allowed to access for this
   * permission. Empty array means tenant-wide (no company_code restriction).
   */
  company_code_ids: string[];
}

// ─── Request context ──────────────────────────────────────────────────────────

/**
 * Optional context forwarded to the check and recorded in the audit log.
 * None of these fields change the decision — they provide traceability.
 */
export interface PermissionContext {
  /** Entity type being accessed (e.g. "journal_entry", "supplier"). */
  entity_type?: string;
  /** UUID of the specific entity being accessed. */
  entity_id?: string;
  /** Company code UUID restricting the resource context. */
  company_code_id?: string;
  /**
   * Active delegation ID. When set, the decision wrapper will also evaluate
   * whether the permission is covered by the delegation grant's permissions[]
   * array and set reason=delegation_granted if so.
   */
  delegation_id?: string;
  /** HTTP request ID for end-to-end trace. */
  request_id?: string;
  /** Correlation UUID linking to event.outbox if applicable. */
  correlation_id?: string;
  /** DB plane — when set, explicit-deny decisions are emitted to audit.security_event. */
  plane?: "neon" | "mesh" | "athyper";
}

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * Full output of checkPermission(). Returned to the calling service and
 * written to log.permission_decision_log (audit trail).
 */
export interface PermissionDecisionResult {
  /** The auth-engine outcome. Services must check `decision === 'allow'`. */
  decision: PermissionDecisionOutcome;
  /** Human-readable reason code for the decision. */
  reason: PermissionDecisionReason;
  /**
   * Resolved scope for allowed decisions. For deny/not_found/not_in_plan,
   * visibility defaults to 'own' and company_code_ids is empty (never used).
   */
  scope: ResolvedScope;
  /** Auth-engine evaluation latency in milliseconds. */
  evaluation_ms: number;
  /** UUID of the access_grant row that produced this decision (if any). */
  matched_grant_id?: string;
  /** UUID of the shared.role row that produced this decision (if any). */
  matched_role_id?: string;
  /** UUID of the auth_group that produced this decision (if any). */
  matched_group_id?: string;
}

// ─── Batch result ─────────────────────────────────────────────────────────────

/**
 * Returned by checkPermissionBatch() — maps permission code → decision result.
 * Used by GET /api/iam/effective-access/:principalId to produce the full
 * permission matrix without N+1 DB round-trips.
 */
export type PermissionBatchResult = Record<string, PermissionDecisionResult>;
