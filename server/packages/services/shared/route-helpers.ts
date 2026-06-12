/**
 * Shared route helpers used across all platform route files.
 *
 * Exports: auth (verifyBearer), UUID validation (isUuid), constants,
 * header extraction (extractOrgHeaders), tenant + principal resolution,
 * and field-map resolver.
 */

import type { RequestHandler } from "express";
import type { Kysely } from "kysely";

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
    xOrg:   (req.headers["x-org"]   as string) ?? "",
    xRealm:
      (req.headers["x-realm-key"] as string | undefined)
      ?? (req.headers["x-realm"] as string | undefined)
      ?? defaultRealmKey(),
  };
}

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
    try {
      const hasPersona = await db
        .selectFrom("master.principal_persona as pp")
        .select("pp.id")
        .where("pp.principal_id", "=", principalId)
        .where("pp.tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!hasPersona) {
        const persona = await db
          .selectFrom("shared.persona" as never)
          .select("id" as never)
          .where("code" as never, "=", "owner" as never)
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (persona) {
          await db.insertInto("master.principal_persona" as never)
            .values({ tenant_id: tenantId, principal_id: principalId, persona_id: persona["id"], assigned_by: SYSTEM_PRINCIPAL_UUID, created_by: SYSTEM_PRINCIPAL_UUID } as never)
            .execute();
        }
      }
    } catch { /* best-effort — principal already usable */ }
    return principalId;
  }

  try {
    const username =
      (typeof claims?.preferred_username === "string" ? claims.preferred_username : null) ??
      (typeof claims?.email === "string" ? (claims.email as string).split("@")[0] : null) ??
      sub.slice(0, 30);
    const displayName = (typeof claims?.name === "string" ? claims.name : null) ?? username;

    const principalId = await db.transaction().execute(async (trx) => {
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
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
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
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
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
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
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
