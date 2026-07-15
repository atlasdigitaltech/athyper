/**
 * @athyper/api-contracts — IAM Schemas
 *
 * Shapes for self-service IAM endpoints under `/api/iam/*`. Today this is
 * primarily the delegation flow consumed by the me-ui IdentitySection's
 * Delegations tab — list, grant, revoke — and the MFA step-up handshake
 * that gates the mutations.
 *
 *   GET    /api/iam/delegations/my           → DelegationsMyList
 *   POST   /api/iam/delegations/my           ← DelegationGrantRequest  → DelegationGrantResponse | StepUpRequiredResponse
 *   POST   /api/iam/delegations/:id/revoke-own  → { ok: true } | StepUpRequiredResponse
 *
 *   POST   /api/iam/mfa/elevate              ← MfaElevateRequest       → MfaElevateResponse
 *
 *   GET    /api/iam/principals?q=&limit=     → PrincipalSearchResults
 *   GET    /api/iam/permissions              → PermissionsCatalog
 */
import { z } from "zod";
import { UuidSchema } from "./common";

// ─── Delegation scope ────────────────────────────────────────────────────────

export const DelegationScopeTypeSchema = z.enum([
  "task",
  "entity",
  "workflow",
  "module",
  "company_code",
]);
export type DelegationScopeType = z.infer<typeof DelegationScopeTypeSchema>;

// ─── Delegation grant rows ───────────────────────────────────────────────────
//
// The runtime returns two parallel lists from GET /iam/delegations/my:
//   - `given`:    rows where the caller is the delegator    (delegate_*  columns)
//   - `received`: rows where the caller is the delegate     (delegator_* columns)
// Both share the same core fields; only the counterparty column differs.

const DelegationGrantCoreSchema = z.object({
  id: UuidSchema,
  scope_type: DelegationScopeTypeSchema,
  scope_ref: z.string().nullable(),
  permissions: z.array(z.string()),
  reason: z.string().nullable(),
  expires_at: z.string().datetime(),
  is_revoked: z.boolean(),
  revoked_at: z.string().datetime().nullable(),
  revoke_reason: z.string().nullable(),
  created_at: z.string().datetime().nullable(),
});

export const DelegationGivenSchema = DelegationGrantCoreSchema.extend({
  delegate_id: UuidSchema,
  delegate_name: z.string().nullable(),
});
export type DelegationGiven = z.infer<typeof DelegationGivenSchema>;

export const DelegationReceivedSchema = DelegationGrantCoreSchema.extend({
  delegator_id: UuidSchema,
  delegator_name: z.string().nullable(),
});
export type DelegationReceived = z.infer<typeof DelegationReceivedSchema>;

export const DelegationsMyListSchema = z.object({
  given: z.array(DelegationGivenSchema),
  received: z.array(DelegationReceivedSchema),
});
export type DelegationsMyList = z.infer<typeof DelegationsMyListSchema>;

// ─── Delegation grant request + response ─────────────────────────────────────

export const DelegationGrantRequestSchema = z.object({
  delegate_id: UuidSchema,
  scope_type: DelegationScopeTypeSchema,
  scope_ref: z.string().nullable().optional(),
  permissions: z.array(z.string()).min(1),
  expires_at: z.string().datetime(),
  reason: z.string().nullable().optional(),
});
export type DelegationGrantRequest = z.infer<typeof DelegationGrantRequestSchema>;

export const DelegationGrantResponseSchema = z.object({
  delegation_id: UuidSchema,
  created_at: z.string().datetime(),
});
export type DelegationGrantResponse = z.infer<typeof DelegationGrantResponseSchema>;

// ─── MFA step-up ─────────────────────────────────────────────────────────────

export const MfaActionClassSchema = z.enum([
  "delegation_accept",
  "security_change",
  // Extend as new step-up action classes land in the runtime.
]);
export type MfaActionClass = z.infer<typeof MfaActionClassSchema>;

export const MfaElevateRequestSchema = z.object({
  action_class: MfaActionClassSchema,
  code: z.string(),
  method_type: z.string().optional(),
});
export type MfaElevateRequest = z.infer<typeof MfaElevateRequestSchema>;

export const MfaElevateResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
});
export type MfaElevateResponse = z.infer<typeof MfaElevateResponseSchema>;

/**
 * Returned by mutating endpoints (delegation create/revoke) when the caller
 * does not yet hold the required step-up elevation. The client should open
 * the MFA dialog with `action_class` and resubmit the original mutation after
 * a successful elevation.
 */
export const StepUpRequiredResponseSchema = z.object({
  error: z.literal("STEP_UP_REQUIRED"),
  action_class: MfaActionClassSchema,
  message: z.string().optional(),
});
export type StepUpRequiredResponse = z.infer<typeof StepUpRequiredResponseSchema>;

// ─── Principal search ────────────────────────────────────────────────────────

export const PrincipalSearchItemSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  display_name: z.string().optional(),
  login_email: z.string().optional(),
});
export type PrincipalSearchItem = z.infer<typeof PrincipalSearchItemSchema>;

export const PrincipalSearchResultsSchema = z.object({
  items: z.array(PrincipalSearchItemSchema),
});
export type PrincipalSearchResults = z.infer<typeof PrincipalSearchResultsSchema>;

// ─── Permissions catalog ─────────────────────────────────────────────────────

export const PermissionItemSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  module_code: z.string(),
});
export type PermissionItem = z.infer<typeof PermissionItemSchema>;

export const PermissionsCatalogSchema = z.object({
  items: z.array(PermissionItemSchema),
});
export type PermissionsCatalog = z.infer<typeof PermissionsCatalogSchema>;
