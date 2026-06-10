// packages/shared/runtime-contracts/src/token-claims.ts
//
// Phase E — Validated shape for Keycloak access-token claims.
//
// Both the runtime (server/src/auth/auth-pipeline.ts +
// verifyTokenForCurrentContext) and the BFF (validatePlaneServerSession)
// read JWT claims as Record<string, unknown> and feature-pick fields ad-hoc.
// This module centralises the shape so:
//
//   1. Malformed tokens are rejected at the parse boundary with a clear
//      field-path error in the log (caller surfaces 401 MALFORMED_TOKEN).
//   2. Downstream pipeline steps see typed data, eliminating the per-step
//      `typeof x === "string"` guards.
//   3. UI consumers (auth-bff/error-codes) and tests share the same schema
//      so legacy / corrupted tokens fail identically across surfaces.
//
// What we validate vs what we don't:
//
//   Validated (when present)    — sub, iss, azp, tenant_id, allowed_tenants,
//                                  required_actions, realm_access.roles,
//                                  resource_access[clientId].roles, exp, iat.
//   Pass-through                — every other claim (name, email, given_name,
//                                  picture, custom mapper output, etc.) is
//                                  preserved so callers that read them today
//                                  continue to work; schema only fails on
//                                  invariant-breaking shape errors.
//
// The runtime never trusts schema-validated values for authorization on
// their own — they're still cross-checked against headers + DB lookup by
// the pipeline. The schema's job is *shape*, not *trust*.

import { z } from "zod";

// ─── Leaf schemas ────────────────────────────────────────────────────────────

const UuidSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "Expected a UUID",
);

const RoleListSchema = z.array(z.string());

const RealmAccessSchema = z
  .object({
    roles: RoleListSchema.optional(),
  })
  .passthrough();

const ClientAccessSchema = z
  .object({
    roles: RoleListSchema.optional(),
  })
  .passthrough();

// ─── Full token claims schema ────────────────────────────────────────────────

export const TokenClaimsSchema = z
  .object({
    // Required claims — every KC access token carries these.
    sub: z.string().min(1, "sub must be a non-empty string"),
    iss: z.string().url("iss must be a URL"),
    azp: z.string().min(1, "azp must be a non-empty string"),

    // Lifecycle (KC always emits but we keep optional for sub-typed JWT shapes).
    exp: z.number().int().nonnegative().optional(),
    iat: z.number().int().nonnegative().optional(),

    // Phase A/B custom-mapper output — see stack/config/iam/protocol-mappers.
    tenant_id: UuidSchema.optional(),
    allowed_tenants: z.array(z.string()).optional(),

    // Either casing accepted — KC emits snake_case; some legacy tooling sends
    // camelCase. Treated as the same logical claim downstream.
    required_actions: z.array(z.string()).optional(),
    requiredActions: z.array(z.string()).optional(),

    // Authorization-relevant.
    realm_access: RealmAccessSchema.optional(),
    resource_access: z.record(z.string(), ClientAccessSchema).optional(),

    // Common KC profile / OIDC claims left as optional unknowns.
    name: z.string().optional(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    preferred_username: z.string().optional(),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
  })
  .passthrough();

export type TokenClaims = z.infer<typeof TokenClaimsSchema>;

// ─── Parse helper with structured error ──────────────────────────────────────

export interface TokenClaimsParseError {
  /** Top-level reason for a structured logger ("token_claims_invalid"). */
  readonly reason: "token_claims_invalid";
  /** Human-readable summary — never include in HTTP responses (info leak). */
  readonly message: string;
  /** Path of the first failing field, e.g. `tenant_id`. */
  readonly fieldPath: string;
  /** Full list of issues from Zod for debug logs (test fixtures). */
  readonly issues: ReadonlyArray<{ path: string; message: string; code: string }>;
}

export type TokenClaimsParseResult =
  | { readonly ok: true; readonly claims: TokenClaims }
  | { readonly ok: false; readonly error: TokenClaimsParseError };

/**
 * Validate `claims` against TokenClaimsSchema. Returns the typed claims on
 * success; on failure returns a structured error whose `fieldPath` is the
 * first failing field for triage. Never throws.
 *
 * Callers (api.ts verifyTokenForCurrentContext, /api/auth/verify, BFF
 * pipeline) log the structured error and surface a generic 401
 * `MALFORMED_TOKEN` to the client — the field path stays server-side to
 * avoid leaking implementation detail to attackers crafting bad tokens.
 */
export function parseTokenClaims(claims: unknown): TokenClaimsParseResult {
  const result = TokenClaimsSchema.safeParse(claims);
  if (result.success) return { ok: true, claims: result.data };

  const issues = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
    message: issue.message,
    code: issue.code,
  }));
  const first = issues[0];
  return {
    ok: false,
    error: {
      reason: "token_claims_invalid",
      message: first
        ? `${first.path}: ${first.message}`
        : "Token claims failed schema validation.",
      fieldPath: first?.path ?? "<root>",
      issues,
    },
  };
}

/**
 * Convenience: return the typed claims (or throw). Use only in tests; the
 * production code path uses the result variant to attach structured logs.
 */
export function parseTokenClaimsOrThrow(claims: unknown): TokenClaims {
  const result = parseTokenClaims(claims);
  if (result.ok) return result.claims;
  throw new Error(`Token claims invalid: ${result.error.message}`);
}

/**
 * Extract the canonical required-actions list across snake_case and camelCase
 * variants. Returns an empty array when both are absent.
 */
export function requiredActionsFromTokenClaims(claims: TokenClaims): readonly string[] {
  return claims.required_actions ?? claims.requiredActions ?? [];
}
