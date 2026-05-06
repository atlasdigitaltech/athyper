/**
 * Supplier Intake Route — composite multi-entity onboarding
 *
 * POST /api/records/supplier/check-duplicates  — pre-submit duplicate check
 * POST /api/records/supplier/intake            — composite transactional create
 *
 * The composite route inserts master.supplier plus all related child / link
 * rows in one DB transaction. If any restricted section (tax, banking,
 * governance) fails a permission check the whole request is rejected before
 * the transaction starts.
 *
 * Security
 *   Protected fields (code, status, approval / risk / AML flags) are stripped
 *   from the client payload and set by the server.
 *   Tax profile writes require  supplier.tax.submit.
 *   Banking writes require      supplier.banking.submit.
 *   Governance writes require   supplier.governance.write.
 *   is_verified on bank accounts is always forced to false at intake.
 *
 * Idempotency
 *   Client sends Idempotency-Key header (wizard's stable flowRunId).
 *   Second submission with the same key within 60 min returns the cached result.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { URL } from "node:url";
import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdWithJit,
  resolveFieldMap,
  emitOutboxEvent,
} from "@athyper/svc-shared";
import { checkPermission } from "@athyper/svc-iam";
import { checkBusinessPartnerDuplicates } from "./business-partner-management.route.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface SupplierIntakeDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTECTED_SUPPLIER_FIELDS = new Set([
  "code", "supplier_code", "status",
  "is_approved_supplier", "is_preferred_supplier",
  "is_blocked", "risk_tier", "sanctions_status", "aml_kyc_status",
  "profile_completeness_pct", "onboarding_status",
  "is_payment_ready", "anticipated_risk_tier",
  // BP identity fields are split out and written to master.business_partner
  "business_partner_id",
]);

// Fields that belong on master.business_partner, not master.supplier
const BP_IDENTITY_FIELDS = new Set([
  "name", "display_name", "legal_name", "legal_form",
  "registration_no", "registration_country_code", "tax_residence_country_code",
  "website_url", "description", "long_description", "external_ref",
  "aliases", "tags", "business_types", "founded_year",
  "employee_count_band", "annual_revenue_band", "partner_category",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripProtected(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!PROTECTED_SUPPLIER_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function stripChildSystemFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  delete out["status"];
  delete out["status_changed_at"];
  delete out["status_changed_by"];
  return out;
}

function remapFields(
  data: Record<string, unknown>,
  fieldMap: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[fieldMap.get(k) ?? k] = v;
  }
  return out;
}

class IntakeValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "IntakeValidationError";
  }
}

type PhoneParts = {
  e164: string;
  callingCode: string | null;
  nationalNumber: string | null;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const HTTP_URL_SCHEME_RE = /^https?:\/\//i;
const HIERARCHICAL_SCHEME_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const SCHEME_LIKE_PREFIX_RE = /^([a-z][a-z\d+.-]*):(.*)$/i;
const PORT_WITH_OPTIONAL_PATH_RE = /^\d+(?:[/?#].*)?$/;
const PARTNER_CATEGORIES = new Set(["organization", "individual", "government", "internal"]);

function invalidWebsiteUrl(): never {
  throw new IntakeValidationError(
    "INVALID_WEBSITE_URL",
    "Website must be a valid http or https URL.",
    "website_url",
  );
}

function normalizeWebsiteUrl(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;

  let candidate = raw;
  if (!HTTP_URL_SCHEME_RE.test(raw)) {
    if (HIERARCHICAL_SCHEME_RE.test(raw)) invalidWebsiteUrl();
    const schemeLike = SCHEME_LIKE_PREFIX_RE.exec(raw);
    if (schemeLike && !PORT_WITH_OPTIONAL_PATH_RE.test(schemeLike[2] ?? "")) invalidWebsiteUrl();
    candidate = `https://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    invalidWebsiteUrl();
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    invalidWebsiteUrl();
  }

  return parsed.href;
}

function normalizeBpCountryCode(value: unknown, field: string): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;

  const countryCode = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new IntakeValidationError(
      "INVALID_COUNTRY_CODE",
      `${field} must be a two-letter ISO country code.`,
      field,
    );
  }

  return countryCode;
}

function normalizeBpIdentityValue(field: string, value: unknown): unknown {
  if (field === "website_url") return normalizeWebsiteUrl(value);
  if (field === "registration_country_code" || field === "tax_residence_country_code") {
    return normalizeBpCountryCode(value, field);
  }
  if (field === "partner_category") {
    const raw = stringOrNull(value);
    if (!raw) return null;
    const category = raw.toLowerCase();
    if (!PARTNER_CATEGORIES.has(category)) {
      throw new IntakeValidationError(
        "INVALID_PARTNER_CATEGORY",
        "Partner category must be organization, individual, government, or internal.",
        field,
      );
    }
    return category;
  }
  if (typeof value === "string") return value.trim() || null;
  return value;
}

function upperCountry(value: unknown): string | null {
  const raw = stringOrNull(value);
  return raw ? raw.toUpperCase() : null;
}

function sanitizeContactPurpose(value: unknown): string {
  const raw = stringOrNull(value);
  if (!raw) return "notification";
  return ["billing", "support", "notification", "marketing", "verification"].includes(raw)
    ? raw
    : "notification";
}

function splitEmail(value: string): { local: string | null; domain: string | null } {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) {
    throw new IntakeValidationError("INVALID_EMAIL_FORMAT", `Invalid email address: ${value}`, "email");
  }
  return {
    local: normalized.slice(0, at),
    domain: normalized.slice(at + 1),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function normalizePhoneForCountry(
  db: Kysely<any>,
  countryCode: string | null,
  rawValue: string,
  field: string,
): Promise<PhoneParts> {
  const compact = rawValue.trim().replace(/[()\s.-]/g, "");
  if (!compact) {
    throw new IntakeValidationError("INVALID_PHONE_FORMAT", "Phone number cannot be blank.", field);
  }

  const canonicalInput = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  let e164 = canonicalInput.startsWith("+") ? canonicalInput : "";
  let callingCode: string | null = null;
  let nationalNumber: string | null = null;

  if (!e164 && countryCode) {
    const country = await db
      .selectFrom("shared.country as c")
      .select(["c.calling_code", "c.phone_trunk_prefix"])
      .where("c.code", "=", countryCode)
      .executeTakeFirst();

    callingCode = stringOrNull(country?.calling_code);
    if (callingCode) {
      let national = canonicalInput.replace(/\D/g, "");
      const trunk = stringOrNull(country?.phone_trunk_prefix);
      if (trunk && national.startsWith(trunk)) national = national.slice(trunk.length);
      e164 = national.startsWith(callingCode) ? `+${national}` : `+${callingCode}${national}`;
      nationalNumber = e164.slice(callingCode.length + 1);
    }
  }

  if (!e164) {
    throw new IntakeValidationError(
      "PHONE_COUNTRY_REQUIRED",
      "Phone and fax numbers must use +country-code format when no country is available.",
      field,
    );
  }

  if (!/^\+[1-9]\d{1,14}$/.test(e164)) {
    throw new IntakeValidationError("INVALID_PHONE_FORMAT", `Phone number must be E.164 compatible: ${rawValue}`, field);
  }

  if (countryCode) {
    const validation = await sql<{ valid: boolean }>`
      SELECT shared.fn_validate_phone(${countryCode}, ${e164}) AS valid
    `.execute(db);
    if (validation.rows[0]?.valid === false) {
      throw new IntakeValidationError(
        "INVALID_COUNTRY_PHONE_FORMAT",
        `Phone number does not match the selected country format: ${rawValue}`,
        field,
      );
    }
  }

  if (!callingCode) {
    const resolved = await sql<{ country_code: string; calling_code: string }>`
      SELECT country_code::text, calling_code
      FROM shared.fn_resolve_calling_code(${e164})
    `.execute(db);
    callingCode = stringOrNull(resolved.rows[0]?.calling_code);
    nationalNumber = callingCode ? e164.slice(callingCode.length + 1) : null;
  }

  return { e164, callingCode, nationalNumber };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertIntakeContactChannel(
  db: Kysely<any>,
  args: {
    tenantId: string;
    principalId: string;
    ownerType: string;
    ownerId: string;
    channelType: "email" | "phone" | "fax";
    value: unknown;
    purpose?: unknown;
    isPrimary?: boolean;
    countryCode?: string | null;
    name?: unknown;
    metadata?: Record<string, unknown>;
    createdAt: string;
  },
): Promise<void> {
  const rawValue = stringOrNull(args.value);
  if (!rawValue) return;

  const purpose = sanitizeContactPurpose(args.purpose);
  const metadata = args.metadata ?? {};
  let storedValue = rawValue;
  let emailParts: { local: string | null; domain: string | null } | null = null;
  let phoneParts: PhoneParts | null = null;

  if (args.channelType === "email") {
    emailParts = splitEmail(rawValue);
    storedValue = rawValue.trim().toLowerCase();
  } else {
    phoneParts = await normalizePhoneForCountry(db, args.countryCode ?? null, rawValue, String(args.name ?? args.channelType));
    storedValue = phoneParts.e164;
  }

  const insertedLink = await db
    .insertInto("master.contact_link" as never)
    .values({
      tenant_id: args.tenantId,
      owner_type: args.ownerType,
      owner_id: args.ownerId,
      channel_type: args.channelType,
      value: storedValue,
      purpose,
      name: stringOrNull(args.name),
      is_primary: args.isPrimary ?? false,
      is_verified: false,
      metadata,
      status: "active",
      created_by: args.principalId,
      created_at: args.createdAt,
    } as never)
    .returning(["id"] as never[])
    .executeTakeFirst();

  if (!insertedLink) return;
  const contactLinkId = String((insertedLink as Record<string, unknown>)["id"]);

  if (emailParts) {
    await db
      .insertInto("master.contact_email" as never)
      .values({
        tenant_id: args.tenantId,
        contact_link_id: contactLinkId,
        local_part: emailParts.local,
        domain: emailParts.domain,
        created_by: args.principalId,
        created_at: args.createdAt,
      } as never)
      .execute();
  }

  if (phoneParts) {
    await db
      .insertInto("master.contact_phone" as never)
      .values({
        tenant_id: args.tenantId,
        contact_link_id: contactLinkId,
        e164: phoneParts.e164,
        calling_code: phoneParts.callingCode,
        national_number: phoneParts.nationalNumber,
        created_by: args.principalId,
        created_at: args.createdAt,
      } as never)
      .execute();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasPermission(
  db: Kysely<any>,
  tenantId: string,
  principalId: string,
  code: string,
): Promise<boolean> {
  const result = await checkPermission(db, tenantId, principalId, code);
  return result.decision === "allow";
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveNumberingCompanyId(db: Kysely<any>, tenantId: string, principalId: string): Promise<string> {
  const preferred = await db
    .selectFrom("master.principal_profile as pp")
    .innerJoin("master.company_code as c", (join) =>
      join
        .onRef("c.tenant_id", "=", "pp.tenant_id")
        .onRef("c.id", "=", "pp.default_company_code_id"))
    .select("c.id")
    .where("pp.tenant_id", "=", tenantId)
    .where("pp.principal_id", "=", principalId)
    .where("c.is_active", "=", true)
    .executeTakeFirst();

  if (preferred?.id) return String(preferred.id);

  const firstActive = await db
    .selectFrom("master.company_code as c")
    .select("c.id")
    .where("c.tenant_id", "=", tenantId)
    .where("c.is_active", "=", true)
    .orderBy("c.code", "asc")
    .executeTakeFirst();

  return firstActive?.id ? String(firstActive.id) : ZERO_UUID;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateSupplierCode(db: Kysely<any>, tenantId: string, principalId: string): Promise<string> {
  const companyId = await resolveNumberingCompanyId(db, tenantId, principalId);

  try {
    const result = await sql<{ code: string }>`
      SELECT master.fn_next_document_number(
        ${tenantId}::uuid,
        ${companyId}::uuid,
        'supplier'
      ) AS code
    `.execute(db);

    const code = result.rows[0]?.code;
    if (code) return code;
  } catch {
    // Numbering series may not be seeded in early developer environments.
  }

  return `SUP-${Date.now().toString(36).toUpperCase()}`;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createSupplierIntakeRoute(router: Router, deps: SupplierIntakeDeps): Router {
  const { db, auth, logger } = deps;

  // ── POST /api/records/supplier/check-duplicates ──────────────────────────
  const checkDuplicatesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      const body = req.body as {
        name?: string;
        legal_name?: string;
        registration_no?: string;
        registration_country_code?: string;
        tax_number?: string;
        identifiers?: Array<{ scheme: string; value: string }>;
      };

      const {
        name = "", legal_name = "", registration_no = "",
        registration_country_code = "", tax_number = "",
        identifiers = [],
      } = body;

      const result = await checkBusinessPartnerDuplicates(db, tenantId, {
        name,
        legal_name,
        registration_no,
        registration_country_code,
        tax_number,
        identifiers,
      });
      res.json(result);
      return;

      const notices: Array<{ code: string; level: string; message: string; action_hint?: string }> = [];
      const matches: Array<{
        supplier_id: string; code: string; name: string;
        match_type: string; severity: string; matched_field: string; score: number;
      }> = [];

      // ── Exact: registration country + number ─────────────────────────────
      // Query supplier_app_index — identity columns live on business_partner,
      // not on the thin master.supplier table.
      if (registration_country_code && registration_no) {
        const rows = await db
          .selectFrom("master.supplier_app_index as s")
          .select(["s.supplier_id", "s.supplier_code", "s.name"])
          .where("s.tenant_id", "=", tenantId)
          .where("s.registration_country_code", "=", String(registration_country_code))
          .where("s.registration_no", "=", String(registration_no))
          .where("s.supplier_status", "!=", "archived")
          .execute();

        for (const row of rows) {
          matches.push({
            supplier_id: String(row.supplier_id), code: String(row.supplier_code), name: String(row.name),
            match_type: "exact_match", severity: "blocker",
            matched_field: "registration_no", score: 1.0,
          });
          notices.push({
            code: "DUPLICATE_REGISTRATION_NO", level: "blocked",
            message: `Supplier with registration number "${String(registration_no)}" already exists: ${String(row.supplier_code)} — ${String(row.name)}.`,
          });
        }
      }

      // ── Exact: identifier scheme + value ─────────────────────────────────
      const idArray = Array.isArray(identifiers) ? identifiers : [];
      for (const ident of idArray) {
        if (!ident.scheme || !ident.value) continue;
        const rows = (await sql<{
          supplier_id: string;
          supplier_code: string;
          name: string;
        }>`
          SELECT s.supplier_id::text, s.supplier_code, s.name
          FROM master.party_identifier pi
          JOIN master.supplier_app_index s
            ON s.tenant_id = pi.tenant_id
           AND (
              (pi.owner_type = 'business_partner' AND s.business_partner_id = pi.owner_id)
              OR
              (pi.owner_type = 'supplier' AND s.supplier_id = pi.owner_id)
           )
          WHERE s.tenant_id = ${tenantId}::uuid
            AND pi.scheme = ${ident.scheme}
            AND pi.value = ${ident.value}
            AND s.supplier_status != 'archived'
        `.execute(db)).rows;

        for (const row of rows) {
          if (!matches.find(m => m.supplier_id === String(row.supplier_id) && m.matched_field === `identifier.${ident.scheme}`)) {
            matches.push({
              supplier_id: String(row.supplier_id), code: String(row.supplier_code), name: String(row.name),
              match_type: "exact_match", severity: "blocker",
              matched_field: `identifier.${ident.scheme}`, score: 1.0,
            });
            notices.push({
              code: "DUPLICATE_IDENTIFIER", level: "blocked",
              message: `Existing supplier ${String(row.supplier_code)} has the same ${ident.scheme} value "${ident.value}".`,
            });
          }
        }
      }

      // ── Strong: exact normalised legal name ───────────────────────────────
      if (legal_name && String(legal_name).trim().length > 2) {
        const normalised = String(legal_name).trim().toUpperCase().replace(/\s+/g, " ");
        const rows = await db
          .selectFrom("master.supplier_app_index as s")
          .select(["s.supplier_id", "s.supplier_code", "s.name", "s.legal_name"])
          .where("s.tenant_id", "=", tenantId)
          .where(sql`UPPER(TRIM(s.legal_name))`, "=", normalised)
          .where("s.supplier_status", "!=", "archived")
          .execute();

        for (const row of rows) {
          if (!matches.find(m => m.supplier_id === String(row.supplier_id))) {
            matches.push({
              supplier_id: String(row.supplier_id), code: String(row.supplier_code), name: String(row.name),
              match_type: "strong_match", severity: "warning",
              matched_field: "legal_name", score: 0.95,
            });
            notices.push({
              code: "SIMILAR_LEGAL_NAME", level: "warning",
              message: `Supplier ${String(row.supplier_code)} has an identical legal name "${String(row.legal_name ?? "")}". Verify this is not a duplicate.`,
            });
          }
        }
      }

      // ── Weak: fuzzy name similarity (pg_trgm via search_text index) ──────
      if (name && String(name).trim().length > 3) {
        try {
          const rows = await sql<{ supplier_id: string; supplier_code: string; name: string; similarity: number }>`
            SELECT s.supplier_id::text, s.supplier_code, s.name,
                   similarity(s.name, ${String(name)}) AS similarity
            FROM master.supplier_app_index s
            WHERE s.tenant_id = ${tenantId}::uuid
              AND s.supplier_status != 'archived'
              AND similarity(s.name, ${String(name)}) >= 0.4
              AND similarity(s.name, ${String(name)}) < 0.95
            ORDER BY similarity DESC
            LIMIT 5
          `.execute(db);

          for (const row of rows.rows) {
            if (!matches.find(m => m.supplier_id === row.supplier_id)) {
              const sim = Number(row.similarity);
              matches.push({
                supplier_id: row.supplier_id, code: row.supplier_code, name: row.name,
                match_type: "weak_match", severity: sim >= 0.7 ? "warning" : "info",
                matched_field: "name", score: sim,
              });
              if (sim >= 0.7) {
                notices.push({
                  code: "SIMILAR_NAME", level: "warning",
                  message: `Supplier with similar name exists: ${row.supplier_code} — "${row.name}". Confirm this is a different supplier.`,
                });
              }
            }
          }
        } catch {
          // pg_trgm not available — skip fuzzy match silently
        }
      }

      res.json({ notices, matches });
    } catch (err) {
      logger?.error("supplier_check_duplicates_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/records/supplier/intake ───────────────────────────────────
  const intakeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const bodyIdempotencyKey =
        typeof req.body?.idempotency_key === "string"
          ? req.body.idempotency_key.trim()
          : "";

      // Idempotency key is mandatory. Prefer the header, but accept the
      // composite payload field as a compatibility fallback through relays.
      const idempotencyKey =
        (req.headers["idempotency-key"] as string | undefined)?.trim()
        || bodyIdempotencyKey;
      if (!idempotencyKey) {
        res.status(422).json({
          error: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key header or idempotency_key payload field is required.",
        });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      // Return cached result for duplicate submissions
      const cached = await db
        .selectFrom("control.intake_idempotency as ii")
        .select(["ii.result_payload"])
        .where("ii.tenant_id", "=", tenantId)
        .where("ii.entity_code", "=", "supplier")
        .where("ii.idempotency_key", "=", idempotencyKey)
        .where("ii.expires_at", ">", sql`now()`)
        .executeTakeFirst();

      if (cached) {
        res.status(200).json(cached.result_payload);
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, claims);

      const body = req.body as {
        supplier?: Record<string, unknown>;
        identifiers?: Record<string, unknown>[];
        certifications?: Record<string, unknown>[];
        tax_profiles?: Record<string, unknown>[];
        qualification?: Record<string, unknown>;
        contacts?: Record<string, unknown>[];
        contact_channels?: Record<string, unknown>[];
        addresses?: Record<string, unknown>[];
        bank_accounts?: Record<string, unknown>[];
        governance?: Record<string, unknown>[];
      };

      const rawSupplierForGate = body.supplier ?? {};
      const duplicateGate = await checkBusinessPartnerDuplicates(db, tenantId, {
        name: typeof rawSupplierForGate["name"] === "string" ? rawSupplierForGate["name"] : "",
        legal_name: typeof rawSupplierForGate["legal_name"] === "string" ? rawSupplierForGate["legal_name"] : "",
        registration_no: typeof rawSupplierForGate["registration_no"] === "string" ? rawSupplierForGate["registration_no"] : "",
        registration_country_code: typeof rawSupplierForGate["registration_country_code"] === "string" ? rawSupplierForGate["registration_country_code"] : "",
        tax_number: typeof rawSupplierForGate["tax_number"] === "string" ? rawSupplierForGate["tax_number"] : "",
        identifiers: (body.identifiers ?? []).map((id) => ({
          scheme: typeof id["scheme"] === "string" ? id["scheme"] : undefined,
          value: typeof id["value"] === "string" ? id["value"] : undefined,
        })),
      });
      if (duplicateGate.blocking) {
        res.status(409).json({
          error: "DUPLICATE_BP_BLOCKED",
          message: "An existing business partner matches the submitted supplier identity.",
          duplicate_check: duplicateGate,
        });
        return;
      }

      const taxProfiles   = body.tax_profiles   ?? [];
      const bankAccounts  = body.bank_accounts   ?? [];
      const governance    = body.governance      ?? [];

      // Section-level permission checks (before starting the transaction)
      if (taxProfiles.length > 0) {
        const ok = await hasPermission(db, tenantId, principalId, "supplier.tax.submit");
        if (!ok) {
          res.status(403).json({ error: "FORBIDDEN", section: "tax_profiles", required_permission: "supplier.tax.submit" });
          return;
        }
      }
      if (bankAccounts.length > 0) {
        const ok = await hasPermission(db, tenantId, principalId, "supplier.banking.submit");
        if (!ok) {
          res.status(403).json({ error: "FORBIDDEN", section: "bank_accounts", required_permission: "supplier.banking.submit" });
          return;
        }
      }
      if (governance.length > 0) {
        const ok = await hasPermission(db, tenantId, principalId, "supplier.governance.write");
        if (!ok) {
          res.status(403).json({ error: "FORBIDDEN", section: "governance", required_permission: "supplier.governance.write" });
          return;
        }
      }

      // Resolve physical column maps for all entities touched by the transaction
      const [
        supplierFieldMap,
        identifierFieldMap,
        taxProfileFieldMap,
        certificationFieldMap,
        contactPersonFieldMap,
        governanceFieldMap,
      ] = await Promise.all([
        resolveFieldMap(db, "supplier"),
        resolveFieldMap(db, "business_partner_identifier"),
        resolveFieldMap(db, "business_partner_tax_profile"),
        resolveFieldMap(db, "business_partner_certification"),
        resolveFieldMap(db, "business_partner_contact_person"),
        resolveFieldMap(db, "business_partner_governance"),
      ]);

      const supplierCode = await generateSupplierCode(db, tenantId, principalId);

      // ── Transaction ───────────────────────────────────────────────────────
      const result = await db.transaction().execute(async (trx) => {
        const now = new Date().toISOString();
        const rawSupplier = body.supplier ?? {};

        // 1. Extract BP identity fields from the intake payload
        const bpFields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawSupplier)) {
          if (!BP_IDENTITY_FIELDS.has(k)) continue;
          const normalized = normalizeBpIdentityValue(k, v);
          if (normalized !== undefined && normalized !== null && normalized !== "") bpFields[k] = normalized;
        }

        // 2. Insert master.business_partner (identity root)
        const insertedBp = await trx
          .insertInto("master.business_partner" as never)
          .values({
            ...bpFields,
            code: supplierCode,  // use same code as the supplier role for 1:1 trace
            name: bpFields["name"] ?? supplierCode,
            partner_category: bpFields["partner_category"] ?? "organization",
            status: "active",
            tenant_id: tenantId,
            created_by: principalId,
            created_at: now,
          } as never)
          .returning(["id"] as never[])
          .executeTakeFirstOrThrow();

        const businessPartnerId = String((insertedBp as Record<string, unknown>)["id"]);

        // 3. Insert master.supplier (thin AP role)
        const supplierInput = stripProtected(rawSupplier);
        // Strip BP identity fields from the supplier insert — they live on business_partner
        for (const k of Object.keys(supplierInput)) {
          if (BP_IDENTITY_FIELDS.has(k)) delete supplierInput[k];
        }
        const supplierRow = remapFields(supplierInput, supplierFieldMap);

        const insertedSupplier = await trx
          .insertInto("master.supplier" as never)
          .values({
            ...supplierRow,
            supplier_code: supplierCode,
            business_partner_id: businessPartnerId,
            status: "onboarding",
            tenant_id: tenantId,
            created_by: principalId,
            created_at: now,
          } as never)
          .returning(["id", "supplier_code", "status"] as never[])
          .executeTakeFirstOrThrow();

        const supplierId = String((insertedSupplier as Record<string, unknown>)["id"]);

        // 2. BP-owned party_identifier rows
        for (const ident of body.identifiers ?? []) {
          await trx
            .insertInto("master.party_identifier" as never)
            .values({
              ...remapFields(stripChildSystemFields(ident), identifierFieldMap),
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 4. BP-owned party_tax_profile rows (strip protected; map columns)
        for (const tax of taxProfiles) {
          await trx
            .insertInto("master.party_tax_profile" as never)
            .values({
              ...remapFields(stripProtected(tax), taxProfileFieldMap),
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 5. supplier_qualification singleton — all defaults, ignore client payload
        await trx
          .insertInto("master.supplier_qualification" as never)
          .values({
            supplier_id: supplierId,
            onboarding_status: "pending",
            is_approved_supplier: false,
            is_preferred_supplier: false,
            is_blocked: false,
            sanctions_status: "not_checked",
            aml_kyc_status: "not_started",
            risk_tier: "low",
            profile_completeness_pct: 0,
            status: "active",
            tenant_id: tenantId,
            created_by: principalId,
            created_at: now,
          } as never)
          .execute();

        // 6. BP-owned party_contact_person rows -- collect IDs for contact_channels linking
        const contactPersonIds: string[] = [];
        for (const contact of body.contacts ?? []) {
          const contactValues = remapFields(contact, contactPersonFieldMap);
          const inlineEmail = contactValues["contact_email"] ?? contact["contact_email"];
          const inlinePhone = contactValues["contact_phone"] ?? contact["contact_phone"];
          const inlineFax = contactValues["contact_fax"] ?? contact["contact_fax"];
          const contactCountryCode =
            upperCountry(contact["country_code"])
            ?? upperCountry(rawSupplier["registration_country_code"])
            ?? upperCountry(bpFields["registration_country_code"])
            ?? upperCountry(bpFields["tax_residence_country_code"]);

          delete contactValues["contact_email"];
          delete contactValues["contact_phone"];
          delete contactValues["contact_fax"];
          delete contactValues["country_code"];

          if (contactValues["contact_role"] === "primary") {
            contactValues["contact_role"] = "general";
            contactValues["is_primary"] = true;
          }
          if (!contactValues["status"]) delete contactValues["status"];

          const inserted = await trx
            .insertInto("master.party_contact_person" as never)
            .values({
              ...contactValues,
              party_type: "business_partner",
              party_id: businessPartnerId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .executeTakeFirst();

          if (inserted) {
            const contactPersonId = String((inserted as Record<string, unknown>)["id"]);
            contactPersonIds.push(contactPersonId);

            await insertIntakeContactChannel(trx, {
              tenantId,
              principalId,
              ownerType: "business_partner_contact_person",
              ownerId: contactPersonId,
              channelType: "email",
              value: inlineEmail,
              purpose: "notification",
              isPrimary: true,
              name: "Email",
              createdAt: now,
            });
            await insertIntakeContactChannel(trx, {
              tenantId,
              principalId,
              ownerType: "business_partner_contact_person",
              ownerId: contactPersonId,
              channelType: "phone",
              value: inlinePhone,
              purpose: "notification",
              isPrimary: true,
              countryCode: contactCountryCode,
              name: "Phone",
              createdAt: now,
            });
            await insertIntakeContactChannel(trx, {
              tenantId,
              principalId,
              ownerType: "business_partner_contact_person",
              ownerId: contactPersonId,
              channelType: "fax",
              value: inlineFax,
              purpose: "notification",
              isPrimary: true,
              countryCode: contactCountryCode,
              name: "Fax",
              createdAt: now,
            });
          }
        }

        // 7. contact_link rows (email / phone / fax channels)
        for (const ch of body.contact_channels ?? []) {
          const refIdx = ch["contact_ref_index"];
          const contactPersonId =
            typeof refIdx === "number" && contactPersonIds[refIdx]
              ? contactPersonIds[refIdx]
              : contactPersonIds[0];

          if (!contactPersonId) continue;

          const channelType = ch["channel_type"] === "fax" ? "fax" : ch["channel_type"] === "phone" ? "phone" : "email";
          const fallbackCountryCode =
            upperCountry(ch["country_code"])
            ?? upperCountry(rawSupplier["registration_country_code"])
            ?? upperCountry(bpFields["registration_country_code"])
            ?? upperCountry(bpFields["tax_residence_country_code"]);

          await insertIntakeContactChannel(trx, {
            tenantId,
            principalId,
            ownerType: "business_partner_contact_person",
            ownerId: contactPersonId,
            channelType,
            value: ch["value"],
            purpose: ch["purpose"] ?? "notification",
            isPrimary: typeof ch["is_primary"] === "boolean" ? ch["is_primary"] : false,
            countryCode: fallbackCountryCode,
            name: ch["label"] ?? ch["name"] ?? channelType,
            createdAt: now,
          });
        }

        // 8. address + address_link rows
        for (const [addrIndex, addr] of (body.addresses ?? []).entries()) {
          const countryCode = typeof addr["country_code"] === "string"
            ? String(addr["country_code"]).toUpperCase()
            : null;
          const addressEmail = addr["address_email"] ?? addr["contact_email"];
          const addressPhone = addr["address_phone"] ?? addr["contact_phone"];
          const addressFax = addr["address_fax"] ?? addr["contact_fax"];

          const insertedAddr = await trx
            .insertInto("master.address" as never)
            .values({
              address_type: addr["address_type"] ?? null,
              line1:        addr["line1"]        ?? addr["address_line1"] ?? null,
              line2:        addr["line2"]        ?? addr["address_line2"] ?? null,
              city:         addr["city"]         ?? null,
              region:       addr["region"]       ?? addr["state_region"]  ?? null,
              postal_code:  addr["postal_code"]  ?? null,
              country_code: countryCode,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .executeTakeFirst();

          if (!insertedAddr) continue;
          const addressId = String((insertedAddr as Record<string, unknown>)["id"]);

          const insertedAddressLink = await trx
            .insertInto("master.address_link" as never)
            .values({
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              address_id: addressId,
              purpose: addr["purpose"] ?? "legal",
              is_primary: addr["is_primary"] ?? false,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .execute();
          const addressLinkId = insertedAddressLink[0]
            ? String((insertedAddressLink[0] as Record<string, unknown>)["id"])
            : null;

          const channelMetadata = {
            source: "supplier_intake_address",
            address_id: addressId,
            address_link_id: addressLinkId,
            address_ref_index: addrIndex,
            address_type: addr["address_type"] ?? null,
          };

          await insertIntakeContactChannel(trx, {
            tenantId,
            principalId,
            ownerType: "business_partner",
            ownerId: businessPartnerId,
            channelType: "email",
            value: addressEmail,
            purpose: "notification",
            isPrimary: false,
            name: "Address Email",
            metadata: channelMetadata,
            createdAt: now,
          });
          await insertIntakeContactChannel(trx, {
            tenantId,
            principalId,
            ownerType: "business_partner",
            ownerId: businessPartnerId,
            channelType: "phone",
            value: addressPhone,
            purpose: "notification",
            isPrimary: false,
            countryCode,
            name: "Address Phone",
            metadata: channelMetadata,
            createdAt: now,
          });
          await insertIntakeContactChannel(trx, {
            tenantId,
            principalId,
            ownerType: "business_partner",
            ownerId: businessPartnerId,
            channelType: "fax",
            value: addressFax,
            purpose: "notification",
            isPrimary: false,
            countryCode,
            name: "Address Fax",
            metadata: channelMetadata,
            createdAt: now,
          });
        }

        // 9. certification rows
        for (const cert of body.certifications ?? []) {
          await trx
            .insertInto("master.certification" as never)
            .values({
              ...remapFields(stripChildSystemFields(cert), certificationFieldMap),
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 10. bank_account + bank_account_link rows (is_verified always false at intake)
        for (const ba of bankAccounts) {
          const insertedAcct = await trx
            .insertInto("master.bank_account" as never)
            .values({
              bank_name_override: ba["bank_name_override"] ?? ba["bank_name"] ?? null,
              bank_country_override: ba["bank_country_override"]
                ?? bpFields["registration_country_code"]
                ?? bpFields["tax_residence_country_code"]
                ?? null,
              account_id_value: ba["account_id_value"] ?? ba["account_number"],
              currency_code: ba["currency_code"],
              account_holder_name: ba["account_holder_name"]
                ?? bpFields["legal_name"]
                ?? bpFields["name"]
                ?? supplierCode,
              account_id_type: ba["account_id_type"] ?? "LOCAL",
              bic_override: ba["bic_override"] ?? null,
              is_verified: false,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .executeTakeFirst();

          if (!insertedAcct) continue;
          const bankAccountId = String((insertedAcct as Record<string, unknown>)["id"]);

          await trx
            .insertInto("master.bank_account_link" as never)
            .values({
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              bank_account_id: bankAccountId,
              purpose: ba["purpose"] ?? "default",
              is_primary: ba["is_primary"] ?? false,
              effective_from: ba["effective_from"] ?? null,
              effective_until: ba["effective_until"] ?? null,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 11. party_governance_relation rows
        for (const gov of governance) {
          await trx
            .insertInto("master.party_governance_relation" as never)
            .values({
              ...remapFields(stripChildSystemFields(gov), governanceFieldMap),
              party_type: "business_partner",
              party_id: businessPartnerId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 12. Workflow event
        await emitOutboxEvent(trx, {
          tenantId,
          topic: "workflow",
          entityId: supplierId,
          eventType: "supplier_request.submitted",
          payload: { supplier_code: supplierCode, created_by: principalId },
          actorId: principalId,
        });

        return {
          supplier_id: supplierId,
          supplier_code: supplierCode,
          business_partner_id: businessPartnerId,
          status: "onboarding",
        };
      });

      // Store idempotency record (best-effort — failure does not roll back)
      try {
        await db
          .insertInto("control.intake_idempotency" as never)
          .values({
            tenant_id: tenantId,
            entity_code: "supplier",
            idempotency_key: idempotencyKey,
            result_payload: result,
          } as never)
          .execute();
      } catch {
        logger?.warn("supplier_intake_idempotency_store_failed", { idempotencyKey });
      }

      logger?.info("supplier.intake.submitted", {
        tenantId,
        supplierId: result.supplier_id,
        supplierCode: result.supplier_code,
        principalId,
        sections: {
          identifiers:      (body.identifiers      ?? []).length,
          certifications:   (body.certifications   ?? []).length,
          tax_profiles:     taxProfiles.length,
          contacts:         (body.contacts         ?? []).length,
          contact_channels: (body.contact_channels ?? []).length,
          addresses:        (body.addresses        ?? []).length,
          bank_accounts:    bankAccounts.length,
          governance:       governance.length,
        },
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof IntakeValidationError) {
        res.status(422).json({ error: err.code, message: err.message, field: err.field });
        return;
      }
      logger?.error("supplier_intake_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/supplier/check-duplicates", checkDuplicatesHandler);
  router.post("/records/supplier/intake", intakeHandler);

  return router;
}
