/**
 * Shared route helpers used across all platform route files.
 *
 * Exports: auth (verifyBearer), UUID validation (isUuid), constants,
 * header extraction (extractOrgHeaders), tenant + principal resolution,
 * and field-map resolver.
 */

import type { RequestHandler } from "express";
import { sql, type Kysely } from "kysely";

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthDeps {
  verifyToken(token: string): Promise<Record<string, unknown>>;
}

export async function verifyBearer(
  authHeader: string,
  auth: AuthDeps,
  res: Parameters<RequestHandler>[1],
): Promise<Record<string, unknown> | null> {
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required" });
    return null;
  }
  try {
    return await auth.verifyToken(match[1]!);
  } catch {
    res.status(401).json({ error: "INVALID_TOKEN", message: "Token verification failed" });
    return null;
  }
}

// ── UUID ──────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean { return UUID_RE.test(s); }

// ── Constants ─────────────────────────────────────────────────────────────────

export const SYSTEM_PRINCIPAL_UUID = "00000000-0000-0000-0000-000000000000";

const ATTACHMENT_AUTH_STRICT = process.env.ATTACHMENT_AUTH_STRICT === "true";
const ATTACHMENT_MULTIPART_CLEANUP_STRICT = process.env.ATTACHMENT_MULTIPART_CLEANUP_STRICT === "true";

/** Verified identity and selected authorization scope for a request. */
export interface VerifiedRequestContext {
  tenantId: string;
  tenantCode: string;
  companyCode?: string;
  companyCodeId?: string;
  organizationId?: string;
  legalEntityId?: string;
  realmKey: string;
  principalId: string;
  authEpoch: number;
  subject: string;
  /** Service credentials are accepted only when they match the bound service principal. */
  authType: "bearer" | "internal_service";
  serviceClientId?: string;
  correlationId?: string;
  workspace?: string;
  profile?: string;
  workContextType?: "legal_entity" | "operating_organization";
  workContextId?: string;
  workContextDomain?: "procurement" | "sales";
  scopeVersion?: number;
  headerOrg?: string | null;
  headerRealm?: string | null;
}

/** @deprecated Use VerifiedRequestContext for new authorization boundaries. */
export type AttachmentAuthContext = VerifiedRequestContext;

export interface AttachmentAuthContextResult {
  ok: true;
  context: AttachmentAuthContext;
}

export interface AttachmentAuthContextFailure {
  ok: false;
  error: string;
  message: string;
  status: number;
}

export type AttachmentAuthContextAttempt = AttachmentAuthContextResult | AttachmentAuthContextFailure;

export type VerifiedRequestContextAttempt =
  | { ok: true; context: VerifiedRequestContext }
  | AttachmentAuthContextFailure;

export interface VerifiedRequestContextHints {
  org?: string | null;
  realm?: string | null;
  tenantId?: string | null;
  tenantCode?: string | null;
  companyCodeId?: string | null;
  organizationId?: string | null;
  legalEntityId?: string | null;
  orgContextType?: string | null;
  workContextType?: string | null;
  workContextId?: string | null;
  workContextDomain?: string | null;
  scopeVersion?: number | null;
  authEpoch?: number | null;
  correlationId?: string | null;
  /** Trusted tenant UUID already resolved by the authenticated host boundary. */
  trustedTenantId?: string | null;
}

// ── Default realm key (bootstrap-configured) ──────────────────────────────────
//
// Phase D — the setter + state moved to realm-default.ts and is exposed only
// via the `@athyper/svc-shared/bootstrap` subpath. Routes read through
// getDefaultRealmKey() but cannot mutate the value. See realm-default.ts for
// the set-once invariants.
import { getDefaultRealmKey } from "./realm-default.js";

function defaultRealmKey(): string {
  return getDefaultRealmKey();
}

// ── Header extraction ─────────────────────────────────────────────────────────

export function extractOrgHeaders(req: Parameters<RequestHandler>[0]): { xOrg: string; xRealm: string } {
  return {
    xOrg:   (req.headers["x-org"] as string | undefined)
      ?? (req.headers["x-tenant-code"] as string | undefined)
      ?? "",
    xRealm:
      (req.headers["x-realm-key"] as string | undefined)
      ?? (req.headers["x-realm"] as string | undefined)
      ?? defaultRealmKey(),
  };
}

/** Extract non-authoritative routing hints for resolveVerifiedRequestContext. */
export function extractVerifiedRequestContextHints(
  req: Parameters<RequestHandler>[0],
): VerifiedRequestContextHints {
  const header = (name: string): string | undefined => {
    const value = req.headers[name];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  };
  return {
    org: header("x-org"),
    realm: header("x-realm-key") ?? header("x-realm"),
    tenantId: header("x-tenant-id"),
    tenantCode: header("x-tenant-code"),
    companyCodeId: header("x-company-code-id"),
    organizationId: header("x-organization-id"),
    legalEntityId: header("x-legal-entity-id"),
    orgContextType: header("x-org-context-type"),
    workContextType: header("x-work-context-type"),
    workContextId: header("x-work-context-id"),
    workContextDomain: header("x-work-context-domain"),
    scopeVersion: Number.isFinite(Number(header("x-scope-version"))) ? Number(header("x-scope-version")) : undefined,
    authEpoch: Number.isFinite(Number(header("x-auth-epoch"))) ? Number(header("x-auth-epoch")) : undefined,
    correlationId: header("x-trace-id") ?? header("x-request-id"),
  };
}

export function getAttachmentAuthFlags(): { attachmentAuthStrict: boolean; multipartCleanupStrict: boolean } {
  return {
    attachmentAuthStrict: ATTACHMENT_AUTH_STRICT,
    multipartCleanupStrict: ATTACHMENT_MULTIPART_CLEANUP_STRICT,
  };
}

function normalizeClaimString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function splitOrgHeader(value: string | null | undefined): { tenantCode: string; companyCode: string } {
  const org = normalizeClaimString(value) ?? "";
  const [tenantCode = "", companyCode = ""] = org.split("--");
  return { tenantCode, companyCode };
}

function parseRealmFromClaims(claims: Record<string, unknown>): string | null {
  const direct = normalizeClaimString(claims["realm_key"]) ?? normalizeClaimString(claims["realm"]);
  if (direct) return direct;
  const iss = normalizeClaimString(claims["iss"]);
  const match = iss?.match(/\/realms\/([^/?#]+)\/?$/);
  return match?.[1] ?? null;
}

function parseTenantFromClaims(claims: Record<string, unknown>): string | null {
  const candidates = [
    normalizeClaimString(claims["tenant_code"]),
    normalizeClaimString(claims["tenant"]),
  ];
  return candidates.find((value): value is string => Boolean(value)) ?? null;
}

function parseCompanyFromClaims(claims: Record<string, unknown>): string | null {
  const candidates = [
    normalizeClaimString(claims["company_code"]),
    normalizeClaimString(claims["company"]),
    normalizeClaimString(claims["companyCode"]),
  ];
  return candidates.find((value): value is string => Boolean(value)) ?? null;
}

function parseServiceClientId(claims: Record<string, unknown>): string | null {
  const candidates = [
    normalizeClaimString(claims["azp"]),
    normalizeClaimString(claims["client_id"]),
    normalizeClaimString(claims["clientId"]),
  ];
  return candidates.find((value): value is string => Boolean(value)) ?? null;
}

/**
 * Resolve the shared, fail-closed authorization context. Organization and
 * realm headers are routing hints only; they must agree with verified claims.
 */
export async function resolveVerifiedRequestContext(
  db: Kysely<any>,
  claims: Record<string, unknown>,
  hints: VerifiedRequestContextHints,
): Promise<VerifiedRequestContextAttempt> {
  const headerOrg = normalizeClaimString(hints.org) ?? undefined;
  const headerRealm = normalizeClaimString(hints.realm) ?? undefined;
  const realmKey = parseRealmFromClaims(claims);
  if (!realmKey) {
    return {
      ok: false,
      error: "AUTH_CONTEXT_REQUIRED",
      message: "A verified realm claim is required.",
      status: 403,
    };
  }

  if (headerRealm && headerRealm !== realmKey) {
    return {
      ok: false,
      error: "AUTH_CONTEXT_MISMATCH",
      message: "The requested realm does not match the verified token.",
      status: 403,
    };
  }

  const subject = normalizeClaimString(claims["sub"]) ?? normalizeClaimString(claims["principal_id"]);
  if (!subject) {
    return {
      ok: false,
      error: "AUTH_CONTEXT_REQUIRED",
      message: "A verified identity subject is required.",
      status: 403,
    };
  }

  const tenantCodeFromClaims = parseTenantFromClaims(claims);
  const tenantIdClaim = normalizeClaimString(claims["tenant_id"]) ?? normalizeClaimString(claims["tenant_uuid"]);
  const headerOrgScope = splitOrgHeader(headerOrg);
  const requestedTenantCode = normalizeClaimString(hints.tenantCode) ?? headerOrgScope.tenantCode;
  if (!requestedTenantCode && !normalizeClaimString(hints.tenantId)) {
    return {
      ok: false,
      error: "ORG_CONTEXT_REQUIRED",
      message: "An active organization context is required.",
      status: 403,
    };
  }
  const trustedTenantId = normalizeClaimString(hints.trustedTenantId);
  let tenantId = trustedTenantId ?? "";
  let tenantCode = "";
  let companyCode = "";

  // The host tenant-stamp is authoritative for the UUID, but it does not
  // populate the tenant code on the request context. Keep the token/host
  // binding fail-closed when both are present, then hydrate the code below
  // from the same tenant row before comparing it with X-Org/X-Tenant-Code.
  if (trustedTenantId && tenantIdClaim && trustedTenantId !== tenantIdClaim) {
    return {
      ok: false,
      error: "AUTH_CONTEXT_MISMATCH",
      message: "Requested organization is not authorized by the verified token.",
      status: 403,
    };
  }

  if (tenantCodeFromClaims) {
    const org = splitOrgHeader(tenantCodeFromClaims);
    tenantCode = org.tenantCode;
    companyCode = org.companyCode;
    if (tenantCode !== requestedTenantCode) {
      return {
        ok: false,
        error: "AUTH_CONTEXT_MISMATCH",
        message: "The requested organization does not match the verified token.",
        status: 403,
      };
    }
  } else if (tenantIdClaim) {
    const foundById = await db
      .selectFrom("master.tenant as t")
      .select(["t.id", "t.code"])
      .where("t.id", "=", tenantIdClaim)
      .where("t.realm_key", "=", realmKey)
      .executeTakeFirst();
    if (foundById) {
      tenantId = foundById.id as string;
      tenantCode = foundById.code as string;
    }
  }

  if (!tenantCode && tenantCodeFromClaims) {
    return { ok: false, error: "AUTH_CONTEXT_REQUIRED", message: "Token tenant context is invalid.", status: 403 };
  }

  if (tenantId && !tenantCode) {
    const trustedTenant = await db
      .selectFrom("master.tenant as t")
      .select(["t.id", "t.code"])
      .where("t.id", "=", tenantId)
      .where("t.realm_key", "=", realmKey)
      .executeTakeFirst();
    if (!trustedTenant) {
      return {
        ok: false,
        error: "AUTH_CONTEXT_DENIED",
        message: "The verified tenant is not available in the requested realm.",
        status: 403,
      };
    }
    tenantCode = trustedTenant.code as string;
  }

  // allowed_tenants is discovery metadata only. Tenant authorization is
  // resolved from the BFF tenant header and the DB identity binding.
  if (!tenantCode && !tenantId) {
    return { ok: false, error: "AUTH_CONTEXT_REQUIRED", message: "The verified token has no tenant authorization context.", status: 403 };
  }

  if (!tenantId) {
    const row = await db
      .selectFrom("master.tenant as t")
      .select(["t.id", "t.code"])
      .where("t.code", "=", tenantCode)
      .where("t.realm_key", "=", realmKey)
      .executeTakeFirst();
    if (!row) return { ok: false, error: "AUTH_CONTEXT_DENIED", message: "Requested organization is not available in the verified realm.", status: 403 };
    tenantId = row.id as string;
    tenantCode = (row.code as string) || tenantCode;
  }

  if (tenantIdClaim && tenantId !== tenantIdClaim) {
    return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "Requested organization is not authorized by the verified token.", status: 403 };
  }

  if (requestedTenantCode && tenantCode !== requestedTenantCode) {
    return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "The requested organization does not match the verified tenant.", status: 403 };
  }
  const hintedTenantId = normalizeClaimString(hints.tenantId);
  const hintedTenantCode = normalizeClaimString(hints.tenantCode);
  if ((hintedTenantId && hintedTenantId !== tenantId) || (hintedTenantCode && hintedTenantCode !== tenantCode)) {
    return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "The requested tenant headers do not match the verified context.", status: 403 };
  }

  // Resolve binding, active principal state, service binding, and security
  // epoch in one query. This replaces the former binding lookup followed by a
  // second principal query on every protected request.
  // A service request is not inferred from any caller-supplied header. It is
  // recognised only when the verified JWT client id matches the service client
  // bound to an active service-account principal in the same tenant. It then
  // traverses normal IAM permissions and company scope just like a user.
  const principal = await db
    .selectFrom("master.principal_identity_binding as pab")
    .innerJoin("master.principal as p", (join) => join
      .onRef("p.id", "=", "pab.principal_id")
      .onRef("p.tenant_id", "=", "pab.tenant_id"))
    .leftJoin("master.principal_profile as pp", (join) => join
      .onRef("pp.principal_id", "=", "p.id")
      .onRef("pp.tenant_id", "=", "p.tenant_id"))
    .select(["p.id", "p.auth_epoch", "p.is_service_account", "p.status", "pp.keycloak_service_client_id"])
    .where("pab.subject_id", "=", subject)
    .where("pab.realm_key", "=", realmKey)
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst() as {
      id?: string;
      auth_epoch?: number;
      is_service_account?: boolean;
      status?: string;
      keycloak_service_client_id?: string | null;
    } | undefined;
  if (!principal || principal.status !== "active") {
    return { ok: false, error: "PRINCIPAL_NOT_FOUND", message: "The bound principal is not active in the verified tenant.", status: 403 };
  }
  const principalId = principal.id;
  if (!principalId) {
    return { ok: false, error: "PRINCIPAL_NOT_FOUND", message: "No principal is bound to this verified identity in the active tenant.", status: 403 };
  }
  const serviceClientId = parseServiceClientId(claims);
  const isServicePrincipal = principal.is_service_account === true;
  if (isServicePrincipal && (!serviceClientId || serviceClientId !== principal.keycloak_service_client_id)) {
    return {
      ok: false,
      error: "SERVICE_PRINCIPAL_DENIED",
      message: "The verified service client is not bound to this service principal.",
      status: 403,
    };
  }

  const rawWorkContextType = normalizeClaimString(hints.workContextType) ?? normalizeClaimString(hints.orgContextType);
  const workContextType = rawWorkContextType?.toLowerCase();
  const workContextId = normalizeClaimString(hints.workContextId)
    ?? (workContextType === "legal_entity" ? normalizeClaimString(hints.organizationId) : undefined);
  const workContextDomain = normalizeClaimString(hints.workContextDomain)?.toLowerCase();
  const organizationId = normalizeClaimString(hints.organizationId)
    ?? (workContextType === "legal_entity" ? workContextId : undefined);
  const legalEntityId = normalizeClaimString(hints.legalEntityId);
  const companyCodeIdHint = normalizeClaimString(hints.companyCodeId);
  const companyCodeId = workContextType === "company_code" ? organizationId : companyCodeIdHint;
  if (workContextType === "company_code" && !companyCodeId) {
    return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "A company organization context requires a company code.", status: 403 };
  }
  if (companyCodeId) {
    const company = await db
      .selectFrom("master.company_code as cc")
      .select(["cc.id", "cc.code", "cc.legal_entity_id"])
      .where("cc.id", "=", companyCodeId)
      .where("cc.tenant_id", "=", tenantId)
      .where("cc.status", "=", "active")
      .executeTakeFirst();
    if (!company || (legalEntityId && company.legal_entity_id !== legalEntityId)) {
      return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "The requested company context is outside the verified tenant scope.", status: 403 };
    }
    companyCode = company.code as string;
  }

  if (hints.authEpoch !== undefined && hints.authEpoch !== Number(principal.auth_epoch)) {
    return { ok: false, error: "AUTH_CONTEXT_STALE", message: "The authenticated session epoch is stale.", status: 401 };
  }
  if (workContextType === "operating_organization") {
    if (!workContextId || (workContextDomain !== "procurement" && workContextDomain !== "sales")) {
      return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "An Operating Organization context requires an id and domain.", status: 403 };
    }
    const operatingOrganization = await db.selectFrom("master.operating_organization")
      .select(["id", "domain", "scope_version"])
      .where("tenant_id", "=", tenantId).where("id", "=", workContextId).where("status", "=", "active")
      .executeTakeFirst();
    if (!operatingOrganization || operatingOrganization.domain !== workContextDomain) {
      return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "The requested work context is outside the verified tenant scope.", status: 403 };
    }
    if (hints.scopeVersion !== undefined && Number(operatingOrganization.scope_version) !== hints.scopeVersion) {
      return { ok: false, error: "AUTH_CONTEXT_STALE", message: "The selected Operating Organization scope is stale.", status: 409 };
    }
  } else if (workContextType === "legal_entity") {
    if (!workContextId) {
      return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "A Legal Entity context requires an id.", status: 403 };
    }
    const legalEntity = await db.selectFrom("master.legal_entity").select("id")
      .where("tenant_id", "=", tenantId).where("id", "=", workContextId).executeTakeFirst();
    if (!legalEntity) {
      return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "The requested Legal Entity is outside the verified tenant scope.", status: 403 };
    }
  } else if (workContextType && workContextType !== "company_code") {
    return { ok: false, error: "AUTH_CONTEXT_MISMATCH", message: "The requested work context type is not supported.", status: 403 };
  }

  return {
    ok: true,
    context: {
      tenantId,
      tenantCode,
      companyCode: companyCode || parseCompanyFromClaims(claims) || undefined,
      companyCodeId: companyCodeId ?? undefined,
      organizationId: organizationId ?? undefined,
      legalEntityId: legalEntityId ?? undefined,
      realmKey,
      principalId,
      authEpoch: Number.isSafeInteger(principal.auth_epoch) ? principal.auth_epoch! : 0,
      subject,
      authType: isServicePrincipal ? "internal_service" : "bearer",
      serviceClientId: isServicePrincipal ? serviceClientId ?? undefined : undefined,
      correlationId: normalizeClaimString(hints.correlationId) ?? undefined,
      workspace: normalizeClaimString(claims["workspace"]) ?? normalizeClaimString(claims["workspace_id"]) ?? undefined,
      profile: normalizeClaimString(claims["profile"]) ?? normalizeClaimString(claims["profile_id"]) ?? undefined,
      workContextType: workContextType === "legal_entity" || workContextType === "operating_organization" ? workContextType : undefined,
      workContextId: workContextId ?? undefined,
      workContextDomain: workContextDomain === "procurement" || workContextDomain === "sales" ? workContextDomain : undefined,
      scopeVersion: hints.scopeVersion ?? undefined,
      headerOrg: headerOrg ?? null,
      headerRealm: headerRealm ?? null,
    },
  };
}

/**
 * Compatibility entry point for the attachment service. Attachments now use
 * the same verified context as records and lifecycle operations.
 */
export async function resolveAttachmentAuthContext(
  db: Kysely<any>,
  claims: Record<string, unknown>,
  headerOrg: string | undefined,
  headerRealm: string | undefined | null,
): Promise<AttachmentAuthContextAttempt> {
  return resolveVerifiedRequestContext(db, claims, {
    org: headerOrg,
    realm: headerRealm,
  });
}

export { ATTACHMENT_AUTH_STRICT, ATTACHMENT_MULTIPART_CLEANUP_STRICT };

// ── Tenant resolver ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveTenantId(db: Kysely<any>, xOrg: string, xRealm: string): Promise<string | null> {
  if (!xOrg) return null;
  const tenantCode = xOrg.split("--")[0];
  if (!tenantCode) return null;
  const row = await db
    .selectFrom("master.tenant as t")
    .select("t.id")
    .where("t.code", "=", tenantCode)
    .where("t.realm_key", "=", xRealm || defaultRealmKey())
    .executeTakeFirst();
  return row ? (row.id as string) : null;
}

// ── Principal resolvers ───────────────────────────────────────────────────────

/**
 * Looks up the master.principal UUID by KC sub + tenant + realm.
 * Returns null if no binding exists (no JIT provisioning).
 *
 * `realmKey` is mandatory. principal_identity_binding rows are keyed by
 * (subject_id, realm_key, tenant_id) — the same KC sub can belong to two
 * different principals across realms (e.g. `athyper` vs `platform-control`),
 * so the realm MUST be passed explicitly. Use `extractOrgHeaders(req).xRealm`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolvePrincipalIdOrNull(db: Kysely<any>, sub: string, tenantId: string, realmKey: string): Promise<string | null> {
  if (!sub) return null;
  if (!realmKey) return null;
  const row = await db
    .selectFrom("master.principal_identity_binding as pab")
    .select("pab.principal_id")
    .where("pab.subject_id", "=", sub)
    .where("pab.realm_key", "=", realmKey)
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst();
  return row ? (row.principal_id as string) : null;
}

/**
 * Resolves the master.principal UUID for a KC sub + tenant + realm.
 * JIT-provisions a new principal on first use.
 * Falls back to SYSTEM_PRINCIPAL_UUID on any provisioning failure.
 *
 * `realmKey` is mandatory and positioned before `claims` (which is optional
 * because the JIT path only consumes it for username/displayName hints).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolvePrincipalIdWithJit(
  db: Kysely<any>,
  sub: string,
  tenantId: string,
  realmKey: string,
  claims?: Record<string, unknown>,
): Promise<string> {
  const realm = realmKey;
  const existing = await db
    .selectFrom("master.principal_identity_binding as pab")
    .select("pab.principal_id")
    .where("pab.subject_id", "=", sub)
    .where("pab.realm_key", "=", realm)
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (existing) {
    const principalId = existing.principal_id as string;
    // Backfill persona for principals provisioned before this fix was in place.
    // Wrap in a transaction so the GUC set below stays in scope through the
    // INSERT — the audit trigger trg_set_updated_at() reads
    // app.current_principal_id and fails the audit-pair check if it's NULL,
    // silently rolling back the persona row and leaving the user with no
    // operations in the ActionBar.
    try {
      await db.transaction().execute(async (trx) => {
        const hasPersona = await trx
          .selectFrom("master.principal_persona as pp")
          .select("pp.id")
          .where("pp.principal_id", "=", principalId)
          .where("pp.tenant_id", "=", tenantId)
          .executeTakeFirst();
        if (hasPersona) return;
        const persona = await trx
          .selectFrom("shared.persona" as never)
          .select("id" as never)
          .where("code" as never, "=", "owner" as never)
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (!persona) return;
        await sql`SELECT set_config('app.current_principal_id', ${SYSTEM_PRINCIPAL_UUID}, true)`.execute(trx);
        await trx.insertInto("master.principal_persona" as never)
          .values({ tenant_id: tenantId, principal_id: principalId, persona_id: persona["id"], assigned_by: SYSTEM_PRINCIPAL_UUID, created_by: SYSTEM_PRINCIPAL_UUID } as never)
          .execute();
      });
    } catch (err) {
      // Don't bubble — the user can still authenticate. But warn so the
      // failure is visible in logs instead of silently producing a
      // permissionless principal.
      // eslint-disable-next-line no-console
      console.warn("[jit] principal_persona backfill failed", err);
    }
    return principalId;
  }

  try {
    const username =
      (typeof claims?.preferred_username === "string" ? claims.preferred_username : null) ??
      (typeof claims?.email === "string" ? (claims.email as string).split("@")[0] : null) ??
      sub.slice(0, 30);
    const displayName = (typeof claims?.name === "string" ? claims.name : null) ?? username;

    const principalId = await db.transaction().execute(async (trx) => {
      // Audit trigger trg_set_updated_at() reads app.current_principal_id.
      // Without this, the persona INSERT below fails the audit-pair check
      // and rolls back the entire JIT transaction.
      await sql`SELECT set_config('app.current_principal_id', ${SYSTEM_PRINCIPAL_UUID}, true)`.execute(trx);
      const p = await trx
        .insertInto("master.principal" as never)
        .values({ tenant_id: tenantId, code: username.slice(0, 50), name: displayName, principal_type: "user", is_locked: false, is_service_account: false, principal_source: "oidc_jit", status: "active", created_by: SYSTEM_PRINCIPAL_UUID } as never)
        .returning("id" as never).executeTakeFirstOrThrow();
      const newId = (p as Record<string, unknown>).id as string;
      await trx.insertInto("master.principal_identity_binding" as never)
        .values({ tenant_id: tenantId, principal_id: newId, realm_key: realm, provider_code: "keycloak", subject_id: sub, username, sync_status: "synced", idp_enabled: true, idp_email_verified: true, synced_at: new Date(), created_by: SYSTEM_PRINCIPAL_UUID } as never)
        .execute();
      // Assign the default 'owner' persona so the JIT user has full operational access.
      // Without this, checkPermissionBatch falls back to ZERO_UUID → returns not_found for
      // every permission and entity operations (including 'create') are hidden.
      const persona = await trx
        .selectFrom("shared.persona" as never)
        .select("id" as never)
        .where("code" as never, "=", "owner" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (persona) {
        await trx.insertInto("master.principal_persona" as never)
          .values({ tenant_id: tenantId, principal_id: newId, persona_id: persona["id"], assigned_by: SYSTEM_PRINCIPAL_UUID, created_by: SYSTEM_PRINCIPAL_UUID } as never)
          .execute();
      }
      return newId;
    });
    return principalId;
  } catch {
    return SYSTEM_PRINCIPAL_UUID;
  }
}

// ── Pagination ────────────────────────────────────────────────────────────────

/**
 * Parses a query integer with an explicit default and inclusive range.
 * Invalid values (including NaN) fall back before clamping.
 */
export function parseQueryInt(
  raw: unknown,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  const fallback = Number.isFinite(defaultVal) ? defaultVal : min;
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Parses ?page= and ?limit= from a query object.
 * Defaults: page=1, limit=50. Hard cap: limit=200.
 */
export function parsePagination(query: Record<string, unknown>): {
  page: number;
  limit: number;
  offset: number;
} {
  const limit = parseQueryInt(query["limit"], 50, 1, 200);
  const page  = parseQueryInt(
    query["page"],
    1,
    1,
    Math.floor(Number.MAX_SAFE_INTEGER / limit),
  );
  return { page, limit, offset: (page - 1) * limit };
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Extracts and trims the ?search= param. Returns "" when absent.
 * Intended for case-insensitive partial match (ILIKE '%term%') on picker columns.
 */
export function parseSearch(query: Record<string, unknown>): string {
  return typeof query["search"] === "string" ? query["search"].trim() : "";
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/**
 * Sets conservative HTTP cache headers for auth-gated reference endpoints.
 * Uses private (not public) because all ref routes require Authorization: Bearer —
 * shared-cache intermediaries must not serve these responses to other users.
 */
export function setCachePrivate(
  res: Parameters<RequestHandler>[1],
  maxAgeSeconds = 3600,
): void {
  res.setHeader(
    "Cache-Control",
    `private, max-age=${maxAgeSeconds}, stale-while-revalidate=300`,
  );
}

// ── Field map resolver ────────────────────────────────────────────────────────

/**
 * Returns a Map from logical field name → physical column_name for the
 * entity's effective version. Only includes active fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveFieldMap(db: Kysely<any>, entityCode: string): Promise<Map<string, string>> {
  const name = entityCode.replace(/-/g, "_");
  const rows = await db
    .selectFrom("control.entity_field as ef")
    .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
    .innerJoin("control.entity as e", "e.id", "ev.entity_id")
    .select(["ef.name", "ef.column_name", "ef.json_config"])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
    .where("ef.runtime_enabled", "=", true)
    .execute();

  const map = new Map<string, string>();
  for (const r of rows) {
    const columnName = String(r.column_name ?? "");
    const jsonConfig = r.json_config as Record<string, unknown> | null | undefined;
    const jsonPath = typeof jsonConfig?.["path"] === "string" ? jsonConfig["path"].trim() : "";
    map.set(r.name as string, columnName === "metadata" && jsonPath ? `${columnName}.${jsonPath}` : columnName);
  }
  return map;
}

/**
 * Returns a Map from physical column_name → data_type for all array-typed
 * fields on the entity's effective version.
 * Detects arrays by the `[]` suffix (e.g. text[], enum[], uuid[]) and the
 * legacy `_array` suffix (text_array, uuid_array, int_array, jsonb_array).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveArrayColumns(db: Kysely<any>, entityCode: string): Promise<Map<string, string>> {
  const name = entityCode.replace(/-/g, "_");
  const rows = await db
    .selectFrom("control.entity_field as ef")
    .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
    .innerJoin("control.entity as e", "e.id", "ev.entity_id")
    .select(["ef.column_name", "ef.data_type"])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
    .where("ef.runtime_enabled", "=", true)
    .where((eb) => eb.or([
      eb("ef.data_type", "like", "%[]"),
      eb("ef.data_type", "in", ["text_array", "uuid_array", "int_array", "jsonb_array"]),
    ]))
    .execute();

  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.column_name as string, r.data_type as string);
  }
  return map;
}

/**
 * Returns a Map from physical column_name -> data_type for JSON-typed fields
 * on the entity's effective version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveJsonColumns(db: Kysely<any>, entityCode: string): Promise<Map<string, string>> {
  const name = entityCode.replace(/-/g, "_");
  const rows = await db
    .selectFrom("control.entity_field as ef")
    .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
    .innerJoin("control.entity as e", "e.id", "ev.entity_id")
    .select(["ef.column_name", "ef.data_type"])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
    .where("ef.runtime_enabled", "=", true)
    .where("ef.data_type", "in", ["json", "jsonb"])
    .execute();

  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.column_name as string, r.data_type as string);
  }
  return map;
}

/**
 * Coerces values in mappedData to JS arrays for columns registered as array
 * types in entity_field (text_array / uuid_array / int_array / jsonb_array).
 *
 * Accepted input for each array column:
 *   - Already a JS array → passed through unchanged
 *   - JSON string starting with "[" → JSON.parse'd
 *   - Comma-separated string → split + trim (integers parsed for int_array)
 *   - null / undefined → unchanged (let DB default or NOT NULL fire)
 */
export function coerceArrayFields(
  mappedData: Record<string, unknown>,
  arrayColumns: Map<string, string>,
): void {
  for (const [col, dataType] of arrayColumns) {
    const raw = mappedData[col];
    if (raw === undefined || raw === null || Array.isArray(raw)) continue;

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) { mappedData[col] = parsed; continue; }
        } catch { /* fall through to comma-split */ }
      }
      const parts = trimmed.split(",").map((s) => s.trim()).filter((s) => s !== "");
      const isIntArray = dataType === "int_array" || dataType === "int[]" || dataType === "integer[]";
      mappedData[col] = isIntArray ? parts.map((s) => parseInt(s, 10)) : parts;
    }
  }
}

function serializeJsonValue(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed !== "") {
      try {
        return JSON.stringify(JSON.parse(trimmed));
      } catch {
        // Plain text is still a valid JSON scalar when encoded as a JSON string.
      }
    }
  }

  return JSON.stringify(raw) ?? "null";
}

/**
 * Serializes JSON/JSONB values before they are handed to node-postgres.
 *
 * node-postgres treats plain JS arrays as Postgres array literals. When the
 * target column is json/jsonb, that literal is invalid JSON. Sending canonical
 * JSON text keeps arrays, objects, and scalars valid for the DB cast.
 */
export function serializeJsonFields(
  mappedData: Record<string, unknown>,
  jsonColumns: Map<string, string>,
): void {
  for (const col of jsonColumns.keys()) {
    const raw = mappedData[col];
    if (raw === undefined || raw === null) continue;
    mappedData[col] = serializeJsonValue(raw);
  }
}

// Database business errors.

export interface RouteBusinessError {
  status: number;
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function stripPgErrorPrefix(message: string): string {
  return message.replace(/^error:\s*/i, "").trim();
}

function getPgConstraint(err: unknown, message: string): string | null {
  const record = err && typeof err === "object" ? err as Record<string, unknown> : null;
  const constraint = record && typeof record["constraint"] === "string"
    ? record["constraint"]
    : null;
  if (constraint) return constraint;

  const match = /constraint\s+"([^"]+)"/i.exec(message);
  return match?.[1] ?? null;
}

/**
 * Maps business-rule exceptions raised by PostgreSQL triggers/functions into
 * normal API errors. These are expected user-correctable failures, not 500s.
 */
export function mapPostgresBusinessError(err: unknown): RouteBusinessError | null {
  const message = stripPgErrorPrefix(getErrorMessage(err));
  const constraint = getPgConstraint(err, message);

  if (constraint === "je_doc_date_chk") {
    return {
      status: 422,
      code: "journal_entry.document_date.after_posting_date",
      message: "Document date must be on or before posting date.",
      field: "document_date",
      details: {
        message_key: "journal_entry.document_date.after_posting_date",
        db_constraint: "je_doc_date_chk",
      },
    };
  }

  const fiscalPeriodMatch = /^PERIOD_NOT_OPEN:\s*Fiscal period\s+(\d+)\/(\d+)\s+for company\s+([0-9a-f-]+)\s+has status\s+"([^"]+)"\./i.exec(message);
  if (fiscalPeriodMatch) {
    const [, fiscalYear, periodNumber, companyCodeId, status] = fiscalPeriodMatch;
    return {
      status: 422,
      code: "PERIOD_NOT_OPEN",
      message: `Fiscal period ${fiscalYear}/${periodNumber} is not open for this company (status: ${status}). Open the fiscal period before submitting the document.`,
      field: "posting_date",
      details: { fiscal_year: Number(fiscalYear), period_number: Number(periodNumber), company_code_id: companyCodeId, period_status: status },
    };
  }

  const bookPeriodMatch = /^BOOK_PERIOD_NOT_OPEN:\s*Book period\s+(\d+)\/(\d+)\s+for company\s+([0-9a-f-]+)\/book\s+([0-9a-f-]+)\s+has status\s+"([^"]+)"\./i.exec(message);
  if (bookPeriodMatch) {
    const [, fiscalYear, periodNumber, companyCodeId, bookId, status] = bookPeriodMatch;
    return {
      status: 422,
      code: "BOOK_PERIOD_NOT_OPEN",
      message: `Ledger book period ${fiscalYear}/${periodNumber} is not open for this company (status: ${status}). Open the book period before submitting the document.`,
      field: "posting_date",
      details: { fiscal_year: Number(fiscalYear), period_number: Number(periodNumber), company_code_id: companyCodeId, book_id: bookId, period_status: status },
    };
  }

  return null;
}
