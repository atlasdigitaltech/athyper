/**
 * Business Partner Management Routes
 *
 * BP-first master-data entry points:
 *   POST /api/records/business_partner/check-duplicates
 *   POST /api/records/business_partner/intake
 *   POST /api/records/business_partner/extend
 *
 * Supplier and customer remain thin roles of master.business_partner. Company
 * code extension rows hold the AP/AR operating settings.
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
  emitOutboxEvent,
} from "@athyper/svc-shared";

export interface BusinessPartnerManagementDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

export interface BusinessPartnerDuplicateCheckInput {
  name?: string;
  legal_name?: string;
  registration_no?: string;
  registration_country_code?: string;
  tax_number?: string;
  identifiers?: Array<{ scheme?: string; value?: string }>;
}

type DuplicateSeverity = "blocker" | "warning" | "info";
type DuplicateMatchType = "exact_match" | "strong_match" | "weak_match";

interface DuplicateMatch {
  business_partner_id: string;
  business_partner_code: string;
  supplier_id?: string | null;
  supplier_code?: string | null;
  customer_id?: string | null;
  customer_code?: string | null;
  role_codes: string[];
  supplier_company_code_ids: string[];
  customer_company_code_ids: string[];
  href: string;
  code: string;
  name: string;
  match_type: DuplicateMatchType;
  severity: DuplicateSeverity;
  matched_field: string;
  score: number;
  recommended_action: "edit_existing" | "extend_role" | "extend_company_code" | "review";
}

export interface DuplicateCheckResult {
  notices: Array<{
    code: string;
    level: "blocked" | "warning" | "info";
    message: string;
    action_hint?: string;
  }>;
  matches: DuplicateMatch[];
  blocking: boolean;
  duplicate_policy: {
    source: "control.entity.identity_config.duplicate_check" | "control.entity.feature_flags.duplicate_check";
    exact_fields: string[];
    strong_name_threshold: number;
    weak_name_threshold: number;
    block_on_exact: boolean;
  };
}

interface BpCandidateRow {
  business_partner_id: string;
  bp_code: string;
  name: string;
  legal_name: string | null;
  supplier_id: string | null;
  supplier_code: string | null;
  customer_id: string | null;
  customer_code: string | null;
  supplier_company_code_ids: string[] | null;
  customer_company_code_ids: string[] | null;
  score?: number | string | null;
}

interface DuplicatePolicy {
  source: "control.entity.identity_config.duplicate_check" | "control.entity.feature_flags.duplicate_check";
  exact_fields: string[];
  strong_name_threshold: number;
  weak_name_threshold: number;
  block_on_exact: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP_URL_SCHEME_RE = /^https?:\/\//i;
const HIERARCHICAL_SCHEME_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const SCHEME_LIKE_PREFIX_RE = /^([a-z][a-z\d+.-]*):(.*)$/i;
const PORT_WITH_OPTIONAL_PATH_RE = /^\d+(?:[/?#].*)?$/;
const PARTNER_CATEGORIES = new Set(["organization", "individual", "government", "internal"]);

const BP_IDENTITY_FIELDS = new Set([
  "name", "display_name", "legal_name", "legal_form",
  "registration_no", "registration_country_code", "tax_residence_country_code",
  "website_url", "description", "long_description", "external_ref",
  "aliases", "tags", "business_types", "founded_year",
  "employee_count_band", "annual_revenue_band", "partner_category",
]);

type BusinessPartnerRole = "supplier" | "customer" | "business_partner";
type ExtensionType =
  | "supplier_role"
  | "customer_role"
  | "supplier_company_code"
  | "customer_company_code";

interface BusinessPartnerIntakeBody {
  role?: BusinessPartnerRole;
  business_partner?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  identifiers?: Record<string, unknown>[];
  tax_profiles?: Record<string, unknown>[];
  company_code_id?: string;
  company_code_profile?: Record<string, unknown>;
}

interface BusinessPartnerExtensionBody {
  business_partner_id?: string;
  business_partner_code?: string;
  extension_type?: ExtensionType;
  company_code_id?: string;
  supplier?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  supplier_profile?: Record<string, unknown>;
  customer_profile?: Record<string, unknown>;
}

class BusinessPartnerValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "BusinessPartnerValidationError";
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function invalidWebsiteUrl(): never {
  throw new BusinessPartnerValidationError(
    "INVALID_WEBSITE_URL",
    "Website must be a valid http or https URL.",
    "website_url",
  );
}

function normalizeWebsiteUrl(value: unknown): string | null {
  const raw = str(value);
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
  const raw = str(value);
  if (!raw) return null;

  const countryCode = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new BusinessPartnerValidationError(
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
    const raw = str(value);
    if (!raw) return null;
    const category = raw.toLowerCase();
    if (!PARTNER_CATEGORIES.has(category)) {
      throw new BusinessPartnerValidationError(
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

function maybeDateNowCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function cleanRegNo(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function pick(obj: Record<string, unknown>, fields: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!fields.has(k)) continue;
    const normalized = normalizeBpIdentityValue(k, v);
    if (normalized !== undefined && normalized !== null && normalized !== "") out[k] = normalized;
  }
  return out;
}

function firstRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function normalizeBusinessPartnerIntakeBody(raw: Record<string, unknown>): BusinessPartnerIntakeBody {
  const draft = asRecord(raw["draft"]);
  if (Object.keys(draft).length === 0) {
    return raw as BusinessPartnerIntakeBody;
  }

  const rawRole = str(raw["role"]) ?? str(draft["role"]);
  const role: BusinessPartnerRole =
    rawRole === "supplier" || rawRole === "customer" || rawRole === "business_partner"
      ? rawRole
      : "business_partner";

  const identifiers = firstRecordArray(raw["identifiers"]);
  const taxProfiles = firstRecordArray(raw["tax_profiles"]);
  const scheme = str(draft["scheme"]) ?? str(draft["identifier_scheme"]);
  const value = str(draft["value"]) ?? str(draft["identifier_value"]);
  if (scheme && value) {
    identifiers.push({
      scheme,
      value,
      issuing_authority: draft["issuing_authority"] ?? undefined,
      is_primary: draft["is_primary"] === true,
    });
  }

  const taxNumber = str(draft["tax_number"]) ?? str(draft["tax_id"]) ?? str(draft["tax_identifier"]);
  const vatNumber = str(draft["vat_number"]) ?? str(draft["vat_id"]);
  const countryCode =
    str(draft["country_code"]) ??
    str(draft["tax_country_code"]) ??
    str(draft["registration_country_code"]);
  if ((taxNumber || vatNumber) && countryCode) {
    taxProfiles.push({
      country_code: countryCode.toUpperCase(),
      tax_number: taxNumber,
      vat_number: vatNumber,
    });
  }

  const rolePayload = {
    customer_type: draft["customer_type"],
    is_key_account: draft["is_key_account"],
    risk_rating: draft["risk_rating"],
    supplier_type: draft["supplier_type"],
    commodity_category_id: draft["commodity_category_id"],
    payment_term_id: draft["payment_term_id"],
    payment_method_id: draft["payment_method_id"],
    is_payment_ready: draft["is_payment_ready"],
  };

  return {
    role,
    business_partner: {
      ...pick(draft, BP_IDENTITY_FIELDS),
      partner_category: draft["partner_category"] ?? "organization",
    },
    supplier: role === "supplier" ? rolePayload : undefined,
    customer: role === "customer" ? rolePayload : undefined,
    identifiers,
    tax_profiles: taxProfiles,
    company_code_id: str(raw["company_code_id"]) ?? str(draft["company_code_id"]),
    company_code_profile: asRecord(raw["company_code_profile"]),
  };
}

function normalizeBusinessPartnerExtensionBody(raw: Record<string, unknown>): BusinessPartnerExtensionBody {
  const draft = asRecord(raw["draft"]);
  if (Object.keys(draft).length === 0) {
    return raw as BusinessPartnerExtensionBody;
  }

  const extensionType = str(raw["extension_type"]) ?? str(draft["extension_type"]);
  const typedExtensionType: ExtensionType | undefined =
    extensionType === "supplier_role" ||
    extensionType === "customer_role" ||
    extensionType === "supplier_company_code" ||
    extensionType === "customer_company_code"
      ? extensionType
      : undefined;

  const currencyCode = str(draft["currency_code"])?.toUpperCase();
  const profile = currencyCode ? { currency_code: currencyCode } : {};

  return {
    business_partner_id:
      str(raw["business_partner_id"]) ??
      str(draft["business_partner_id"]) ??
      str(draft["code"]) ??
      str(draft["business_partner_code"]),
    business_partner_code:
      str(raw["business_partner_code"]) ??
      str(draft["business_partner_code"]),
    extension_type: typedExtensionType,
    company_code_id: str(raw["company_code_id"]) ?? str(draft["company_code_id"]),
    supplier: asRecord(raw["supplier"]),
    customer: asRecord(raw["customer"]),
    supplier_profile: typedExtensionType?.startsWith("supplier") ? profile : asRecord(raw["supplier_profile"]),
    customer_profile: typedExtensionType?.startsWith("customer") ? profile : asRecord(raw["customer_profile"]),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDuplicatePolicy(db: Kysely<any>): Promise<DuplicatePolicy> {
  const defaults: DuplicatePolicy = {
    source: "control.entity.identity_config.duplicate_check",
    exact_fields: ["registration_no", "identifier", "tax_number"],
    strong_name_threshold: 0.85,
    weak_name_threshold: 0.55,
    block_on_exact: true,
  };

  const row = await db
    .selectFrom("control.entity as e")
    .select(["e.identity_config", "e.feature_flags"])
    .where("e.entity_code", "=", "business_partner")
    .where("e.tenant_id", "is", null)
    .executeTakeFirst() as { identity_config?: unknown; feature_flags?: unknown } | undefined;

  const identityConfig = asRecord(row?.identity_config);
  const flags = asRecord(row?.feature_flags);
  const identityCfg = asRecord(identityConfig["duplicate_check"]);
  const legacyCfg = asRecord(flags["duplicate_check"]);
  const hasIdentityCfg = Object.keys(identityCfg).length > 0;
  const cfg = hasIdentityCfg ? identityCfg : legacyCfg;
  const exactFieldsRaw = cfg["exact_fields"] ?? cfg["fields"];
  const exactFields = Array.isArray(exactFieldsRaw)
    ? exactFieldsRaw.filter((v): v is string => typeof v === "string")
    : defaults.exact_fields;

  return {
    source: hasIdentityCfg ? "control.entity.identity_config.duplicate_check" : "control.entity.feature_flags.duplicate_check",
    exact_fields: exactFields.length > 0 ? exactFields : defaults.exact_fields,
    strong_name_threshold: typeof cfg["strong_name_threshold"] === "number"
      ? cfg["strong_name_threshold"]
      : defaults.strong_name_threshold,
    weak_name_threshold: typeof cfg["weak_name_threshold"] === "number"
      ? cfg["weak_name_threshold"]
      : defaults.weak_name_threshold,
    block_on_exact: typeof cfg["block_on_exact"] === "boolean"
      ? cfg["block_on_exact"]
      : defaults.block_on_exact,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateBusinessCode(
  db: Kysely<any>,
  tenantId: string,
  sequence: "business_partner" | "supplier" | "customer",
  principalId?: string,
): Promise<string> {
  void principalId;
  if (sequence === "business_partner") {
    try {
      const result = await sql<{ code: string }>`
        SELECT control.next_entity_number(
          ${tenantId}::uuid,
          'business_partner',
          'code',
          NULL,
          NULL,
          NULL,
          NULL,
          CURRENT_DATE
        ) AS code
      `.execute(db);
      const code = result.rows[0]?.code;
      if (code) return code;
    } catch {
      // Canonical entity numbering may not be seeded in early environments.
    }
  }

  const prefix = sequence === "supplier" ? "SUP" : sequence === "customer" ? "CUS" : "BP";
  return maybeDateNowCode(prefix);
}

function rolesFor(row: BpCandidateRow): string[] {
  const roles: string[] = ["business_partner"];
  if (row.supplier_id) roles.push("supplier");
  if (row.customer_id) roles.push("customer");
  return roles;
}

function bestCode(row: BpCandidateRow): string {
  return row.bp_code || row.supplier_code || row.customer_code || row.business_partner_id;
}

function candidateToMatch(
  row: BpCandidateRow,
  matchedField: string,
  matchType: DuplicateMatchType,
  severity: DuplicateSeverity,
  score: number,
): DuplicateMatch {
  const roleCodes = rolesFor(row);
  const supplierCompanyCodes = row.supplier_company_code_ids ?? [];
  const customerCompanyCodes = row.customer_company_code_ids ?? [];
  const recommendedAction =
    roleCodes.length <= 1
      ? "extend_role"
      : supplierCompanyCodes.length > 0 || customerCompanyCodes.length > 0
        ? "edit_existing"
        : "extend_company_code";
  const code = bestCode(row);

  return {
    business_partner_id: row.business_partner_id,
    business_partner_code: row.bp_code,
    supplier_id: row.supplier_id,
    supplier_code: row.supplier_code,
    customer_id: row.customer_id,
    customer_code: row.customer_code,
    role_codes: roleCodes,
    supplier_company_code_ids: supplierCompanyCodes,
    customer_company_code_ids: customerCompanyCodes,
    href: `/app/business_partner/${encodeURIComponent(row.bp_code || row.business_partner_id)}`,
    code,
    name: row.name,
    match_type: matchType,
    severity,
    matched_field: matchedField,
    score,
    recommended_action: recommendedAction,
  };
}

function pushNotice(
  notices: DuplicateCheckResult["notices"],
  code: string,
  level: "blocked" | "warning" | "info",
  message: string,
  action_hint?: string,
): void {
  if (notices.some((n) => n.code === code && n.message === message)) return;
  notices.push({ code, level, message, action_hint });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichCandidatesByBpIds(db: Kysely<any>, tenantId: string, bpIds: string[]): Promise<BpCandidateRow[]> {
  if (bpIds.length === 0) return [];
  const idList = sql.join(bpIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await sql<BpCandidateRow>`
    SELECT
      bp.id::text AS business_partner_id,
      bp.code AS bp_code,
      bp.name,
      bp.legal_name,
      s.id::text AS supplier_id,
      s.supplier_code,
      c.id::text AS customer_id,
      c.customer_code,
      COALESCE(array_remove(array_agg(DISTINCT scp.company_code_id::text), NULL), '{}') AS supplier_company_code_ids,
      COALESCE(array_remove(array_agg(DISTINCT ccp.company_code_id::text), NULL), '{}') AS customer_company_code_ids
    FROM master.business_partner bp
    LEFT JOIN master.supplier s
      ON s.tenant_id = bp.tenant_id
     AND s.business_partner_id = bp.id
     AND s.status <> 'archived'
    LEFT JOIN master.customer c
      ON c.tenant_id = bp.tenant_id
     AND c.business_partner_id = bp.id
     AND c.status <> 'archived'
    LEFT JOIN master.company_code_supplier_profile scp
      ON scp.tenant_id = bp.tenant_id
     AND scp.supplier_id = s.id
     AND scp.status <> 'archived'
    LEFT JOIN master.company_code_customer_profile ccp
      ON ccp.tenant_id = bp.tenant_id
     AND ccp.customer_id = c.id
     AND ccp.status <> 'archived'
    WHERE bp.tenant_id = ${tenantId}::uuid
      AND bp.status <> 'archived'
      AND bp.id = ANY(ARRAY[${idList}])
    GROUP BY bp.id, bp.code, bp.name, bp.legal_name, s.id, s.supplier_code, c.id, c.customer_code
  `.execute(db);
  return result.rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkBusinessPartnerDuplicates(
  db: Kysely<any>,
  tenantId: string,
  input: BusinessPartnerDuplicateCheckInput,
): Promise<DuplicateCheckResult> {
  const policy = await loadDuplicatePolicy(db);
  const notices: DuplicateCheckResult["notices"] = [];
  const matchMap = new Map<string, DuplicateMatch>();

  const addRows = (
    rows: BpCandidateRow[],
    matchedField: string,
    matchType: DuplicateMatchType,
    severity: DuplicateSeverity,
    defaultScore: number,
  ) => {
    for (const row of rows) {
      const score = row.score == null ? defaultScore : Number(row.score);
      const key = `${row.business_partner_id}:${matchedField}:${matchType}`;
      if (!matchMap.has(key)) {
        matchMap.set(key, candidateToMatch(row, matchedField, matchType, severity, Number.isFinite(score) ? score : defaultScore));
      }
    }
  };

  const registrationNo = str(input.registration_no);
  const registrationCountry = str(input.registration_country_code)?.toUpperCase();
  if (registrationNo) {
    const cleaned = cleanRegNo(registrationNo);
    const result = registrationCountry
      ? await sql<BpCandidateRow>`
          SELECT
            bp.id::text AS business_partner_id,
            bp.code AS bp_code,
            bp.name,
            bp.legal_name,
            s.id::text AS supplier_id,
            s.supplier_code,
            c.id::text AS customer_id,
            c.customer_code,
            COALESCE(array_remove(array_agg(DISTINCT scp.company_code_id::text), NULL), '{}') AS supplier_company_code_ids,
            COALESCE(array_remove(array_agg(DISTINCT ccp.company_code_id::text), NULL), '{}') AS customer_company_code_ids
          FROM master.business_partner bp
          LEFT JOIN master.supplier s ON s.tenant_id = bp.tenant_id AND s.business_partner_id = bp.id AND s.status <> 'archived'
          LEFT JOIN master.customer c ON c.tenant_id = bp.tenant_id AND c.business_partner_id = bp.id AND c.status <> 'archived'
          LEFT JOIN master.company_code_supplier_profile scp ON scp.tenant_id = bp.tenant_id AND scp.supplier_id = s.id AND scp.status <> 'archived'
          LEFT JOIN master.company_code_customer_profile ccp ON ccp.tenant_id = bp.tenant_id AND ccp.customer_id = c.id AND ccp.status <> 'archived'
          WHERE bp.tenant_id = ${tenantId}::uuid
            AND bp.status <> 'archived'
            AND upper(bp.registration_country_code::text) = ${registrationCountry}
            AND upper(regexp_replace(coalesce(bp.registration_no, ''), '\\s+', '', 'g')) = ${cleaned}
          GROUP BY bp.id, bp.code, bp.name, bp.legal_name, s.id, s.supplier_code, c.id, c.customer_code
        `.execute(db)
      : await sql<BpCandidateRow>`
          SELECT
            bp.id::text AS business_partner_id,
            bp.code AS bp_code,
            bp.name,
            bp.legal_name,
            s.id::text AS supplier_id,
            s.supplier_code,
            c.id::text AS customer_id,
            c.customer_code,
            COALESCE(array_remove(array_agg(DISTINCT scp.company_code_id::text), NULL), '{}') AS supplier_company_code_ids,
            COALESCE(array_remove(array_agg(DISTINCT ccp.company_code_id::text), NULL), '{}') AS customer_company_code_ids
          FROM master.business_partner bp
          LEFT JOIN master.supplier s ON s.tenant_id = bp.tenant_id AND s.business_partner_id = bp.id AND s.status <> 'archived'
          LEFT JOIN master.customer c ON c.tenant_id = bp.tenant_id AND c.business_partner_id = bp.id AND c.status <> 'archived'
          LEFT JOIN master.company_code_supplier_profile scp ON scp.tenant_id = bp.tenant_id AND scp.supplier_id = s.id AND scp.status <> 'archived'
          LEFT JOIN master.company_code_customer_profile ccp ON ccp.tenant_id = bp.tenant_id AND ccp.customer_id = c.id AND ccp.status <> 'archived'
          WHERE bp.tenant_id = ${tenantId}::uuid
            AND bp.status <> 'archived'
            AND upper(regexp_replace(coalesce(bp.registration_no, ''), '\\s+', '', 'g')) = ${cleaned}
          GROUP BY bp.id, bp.code, bp.name, bp.legal_name, s.id, s.supplier_code, c.id, c.customer_code
        `.execute(db);

    addRows(result.rows, "registration_no", "exact_match", policy.block_on_exact ? "blocker" : "warning", 1);
    for (const row of result.rows) {
      pushNotice(
        notices,
        "DUPLICATE_REGISTRATION_NO",
        policy.block_on_exact ? "blocked" : "warning",
        `Business partner ${row.bp_code} has the same registration number.`,
        "Open the existing BP and use Extension Mode when another role or company code is needed.",
      );
    }
  }

  const identifiers = Array.isArray(input.identifiers) ? input.identifiers : [];
  for (const ident of identifiers) {
    const scheme = str(ident.scheme);
    const value = str(ident.value);
    if (!scheme || !value) continue;

    const rows = (await sql<{ business_partner_id: string }>`
      WITH matched AS (
        SELECT DISTINCT COALESCE(
          CASE WHEN pi.owner_type = 'business_partner' THEN pi.owner_id END,
          s.business_partner_id,
          c.business_partner_id
        )::text AS business_partner_id
        FROM master.party_identifier pi
        LEFT JOIN master.supplier s
          ON s.tenant_id = pi.tenant_id
         AND pi.owner_type = 'supplier'
         AND s.id = pi.owner_id
        LEFT JOIN master.customer c
          ON c.tenant_id = pi.tenant_id
         AND pi.owner_type = 'customer'
         AND c.id = pi.owner_id
        WHERE pi.tenant_id = ${tenantId}::uuid
          AND lower(pi.scheme) = lower(${scheme})
          AND btrim(pi.value) = btrim(${value})
          AND pi.status = 'active'
      )
      SELECT business_partner_id
      FROM matched
      WHERE business_partner_id IS NOT NULL
    `.execute(db)).rows.map((r) => r.business_partner_id);

    const enriched = await enrichCandidatesByBpIds(db, tenantId, rows);
    addRows(enriched, `identifier.${scheme}`, "exact_match", policy.block_on_exact ? "blocker" : "warning", 1);
    for (const row of enriched) {
      pushNotice(
        notices,
        "DUPLICATE_IDENTIFIER",
        policy.block_on_exact ? "blocked" : "warning",
        `Business partner ${row.bp_code} has the same ${scheme} identifier.`,
        "Open the existing BP and extend the needed role instead of creating a duplicate.",
      );
    }
  }

  const taxNumber = str(input.tax_number);
  if (taxNumber) {
    const rows = (await sql<{ business_partner_id: string }>`
      SELECT DISTINCT owner_id::text AS business_partner_id
      FROM master.party_tax_profile
      WHERE tenant_id = ${tenantId}::uuid
        AND owner_type = 'business_partner'
        AND status = 'active'
        AND (
          btrim(coalesce(tax_id, '')) = btrim(${taxNumber})
          OR btrim(coalesce(vat_id, '')) = btrim(${taxNumber})
          OR btrim(coalesce(state_tax_id, '')) = btrim(${taxNumber})
          OR btrim(coalesce(sales_tax_id, '')) = btrim(${taxNumber})
          OR btrim(coalesce(service_tax_id, '')) = btrim(${taxNumber})
          OR btrim(coalesce(regional_tax_id, '')) = btrim(${taxNumber})
        )
    `.execute(db)).rows.map((r) => r.business_partner_id);

    const enriched = await enrichCandidatesByBpIds(db, tenantId, rows);
    addRows(enriched, "tax_number", "exact_match", policy.block_on_exact ? "blocker" : "warning", 1);
    for (const row of enriched) {
      pushNotice(
        notices,
        "DUPLICATE_TAX_NUMBER",
        policy.block_on_exact ? "blocked" : "warning",
        `Business partner ${row.bp_code} has the same tax number.`,
        "Open the existing BP and use Extension Mode when needed.",
      );
    }
  }

  const legalName = str(input.legal_name);
  if (legalName && legalName.length > 2) {
    const normalised = normalizeName(legalName);
    const result = await sql<BpCandidateRow>`
      SELECT
        bp.id::text AS business_partner_id,
        bp.code AS bp_code,
        bp.name,
        bp.legal_name,
        s.id::text AS supplier_id,
        s.supplier_code,
        c.id::text AS customer_id,
        c.customer_code,
        COALESCE(array_remove(array_agg(DISTINCT scp.company_code_id::text), NULL), '{}') AS supplier_company_code_ids,
        COALESCE(array_remove(array_agg(DISTINCT ccp.company_code_id::text), NULL), '{}') AS customer_company_code_ids
      FROM master.business_partner bp
      LEFT JOIN master.supplier s ON s.tenant_id = bp.tenant_id AND s.business_partner_id = bp.id AND s.status <> 'archived'
      LEFT JOIN master.customer c ON c.tenant_id = bp.tenant_id AND c.business_partner_id = bp.id AND c.status <> 'archived'
      LEFT JOIN master.company_code_supplier_profile scp ON scp.tenant_id = bp.tenant_id AND scp.supplier_id = s.id AND scp.status <> 'archived'
      LEFT JOIN master.company_code_customer_profile ccp ON ccp.tenant_id = bp.tenant_id AND ccp.customer_id = c.id AND ccp.status <> 'archived'
      WHERE bp.tenant_id = ${tenantId}::uuid
        AND bp.status <> 'archived'
        AND upper(regexp_replace(coalesce(bp.legal_name, bp.name), '\\s+', ' ', 'g')) = ${normalised}
      GROUP BY bp.id, bp.code, bp.name, bp.legal_name, s.id, s.supplier_code, c.id, c.customer_code
    `.execute(db);

    addRows(result.rows, "legal_name", "strong_match", "warning", 0.95);
    for (const row of result.rows) {
      pushNotice(
        notices,
        "SIMILAR_LEGAL_NAME",
        "warning",
        `Business partner ${row.bp_code} has the same legal name.`,
        "Review the existing BP before continuing.",
      );
    }
  }

  const name = str(input.name);
  if (name && name.length > 3) {
    try {
      const result = await sql<BpCandidateRow>`
        SELECT
          bp.id::text AS business_partner_id,
          bp.code AS bp_code,
          bp.name,
          bp.legal_name,
          s.id::text AS supplier_id,
          s.supplier_code,
          c.id::text AS customer_id,
          c.customer_code,
          COALESCE(array_remove(array_agg(DISTINCT scp.company_code_id::text), NULL), '{}') AS supplier_company_code_ids,
          COALESCE(array_remove(array_agg(DISTINCT ccp.company_code_id::text), NULL), '{}') AS customer_company_code_ids,
          similarity(coalesce(bp.legal_name, bp.name), ${name}) AS score
        FROM master.business_partner bp
        LEFT JOIN master.supplier s ON s.tenant_id = bp.tenant_id AND s.business_partner_id = bp.id AND s.status <> 'archived'
        LEFT JOIN master.customer c ON c.tenant_id = bp.tenant_id AND c.business_partner_id = bp.id AND c.status <> 'archived'
        LEFT JOIN master.company_code_supplier_profile scp ON scp.tenant_id = bp.tenant_id AND scp.supplier_id = s.id AND scp.status <> 'archived'
        LEFT JOIN master.company_code_customer_profile ccp ON ccp.tenant_id = bp.tenant_id AND ccp.customer_id = c.id AND ccp.status <> 'archived'
        WHERE bp.tenant_id = ${tenantId}::uuid
          AND bp.status <> 'archived'
          AND similarity(coalesce(bp.legal_name, bp.name), ${name}) >= ${policy.weak_name_threshold}
          AND similarity(coalesce(bp.legal_name, bp.name), ${name}) < 0.95
        GROUP BY bp.id, bp.code, bp.name, bp.legal_name, s.id, s.supplier_code, c.id, c.customer_code
        ORDER BY score DESC
        LIMIT 8
      `.execute(db);

      for (const row of result.rows) {
        const score = Number(row.score ?? 0);
        const severity: DuplicateSeverity = score >= policy.strong_name_threshold ? "warning" : "info";
        addRows([row], "name", score >= policy.strong_name_threshold ? "strong_match" : "weak_match", severity, score);
        if (severity === "warning") {
          pushNotice(
            notices,
            "SIMILAR_NAME",
            "warning",
            `Business partner ${row.bp_code} has a similar name.`,
            "Review the existing BP before continuing.",
          );
        }
      }
    } catch {
      // pg_trgm may not be available in developer databases; exact checks still run.
    }
  }

  const matches = [...matchMap.values()]
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  const blocking = matches.some((m) => m.severity === "blocker");

  return {
    notices,
    matches,
    blocking,
    duplicate_policy: {
      source: policy.source,
      exact_fields: policy.exact_fields,
      strong_name_threshold: policy.strong_name_threshold,
      weak_name_threshold: policy.weak_name_threshold,
      block_on_exact: policy.block_on_exact,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveBusinessPartner(db: Kysely<any>, tenantId: string, value: string): Promise<{ id: string; code: string; name: string } | null> {
  const query = db
    .selectFrom("master.business_partner as bp")
    .select(["bp.id", "bp.code", "bp.name"])
    .where("bp.tenant_id", "=", tenantId)
    .where("bp.status", "!=", "archived");

  const row = UUID_RE.test(value)
    ? await query.where("bp.id", "=", value).executeTakeFirst()
    : await query.where("bp.code", "=", value).executeTakeFirst();

  return row ? { id: String(row.id), code: String(row.code), name: String(row.name) } : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCompanyCode(db: Kysely<any>, tenantId: string, companyCodeId: string): Promise<boolean> {
  const row = await db
    .selectFrom("master.company_code as cc")
    .select("cc.id")
    .where("cc.tenant_id", "=", tenantId)
    .where("cc.id", "=", companyCodeId)
    .executeTakeFirst();
  return !!row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSupplierRole(
  trx: Kysely<any>,
  tenantId: string,
  principalId: string,
  businessPartnerId: string,
  supplierInput: Record<string, unknown>,
): Promise<{ supplier_id: string; supplier_code: string; created: boolean }> {
  const existing = await trx
    .selectFrom("master.supplier as s")
    .select(["s.id", "s.supplier_code"])
    .where("s.tenant_id", "=", tenantId)
    .where("s.business_partner_id", "=", businessPartnerId)
    .where("s.status", "!=", "archived")
    .executeTakeFirst() as { id: string; supplier_code: string } | undefined;

  if (existing) {
    return { supplier_id: String(existing.id), supplier_code: String(existing.supplier_code), created: false };
  }

  const supplierCode = await generateBusinessCode(trx, tenantId, "supplier", principalId);
  const now = new Date().toISOString();
  const inserted = await trx
    .insertInto("master.supplier" as never)
    .values({
      business_partner_id: businessPartnerId,
      supplier_code: supplierCode,
      supplier_type: str(supplierInput["supplier_type"]) ?? "general",
      commodity_category_id: supplierInput["commodity_category_id"] ?? null,
      payment_term_id: supplierInput["payment_term_id"] ?? null,
      payment_method_id: supplierInput["payment_method_id"] ?? null,
      is_payment_ready: supplierInput["is_payment_ready"] === true,
      status: "onboarding",
      tenant_id: tenantId,
      created_by: principalId,
      created_at: now,
    } as never)
    .returning(["id", "supplier_code"] as never[])
    .executeTakeFirstOrThrow() as Record<string, unknown>;

  const supplierId = String(inserted["id"]);
  await sql`
    INSERT INTO master.supplier_qualification (
      tenant_id, supplier_id, onboarding_status, is_approved_supplier,
      is_preferred_supplier, is_blocked, sanctions_status, aml_kyc_status,
      risk_tier, profile_completeness_pct, status, created_by, created_at
    )
    VALUES (
      ${tenantId}::uuid, ${supplierId}::uuid, 'pending', false,
      false, false, 'not_checked', 'not_started',
      'low', 0, 'active', ${principalId}::uuid, now()
    )
    ON CONFLICT (tenant_id, supplier_id) DO NOTHING
  `.execute(trx);

  return { supplier_id: supplierId, supplier_code: String(inserted["supplier_code"]), created: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCustomerRole(
  trx: Kysely<any>,
  tenantId: string,
  principalId: string,
  businessPartnerId: string,
  customerInput: Record<string, unknown>,
): Promise<{ customer_id: string; customer_code: string; created: boolean }> {
  const existing = await trx
    .selectFrom("master.customer as c")
    .select(["c.id", "c.customer_code"])
    .where("c.tenant_id", "=", tenantId)
    .where("c.business_partner_id", "=", businessPartnerId)
    .where("c.status", "!=", "archived")
    .executeTakeFirst() as { id: string; customer_code: string } | undefined;

  if (existing) {
    return { customer_id: String(existing.id), customer_code: String(existing.customer_code), created: false };
  }

  const customerCode = await generateBusinessCode(trx, tenantId, "customer", principalId);
  const now = new Date().toISOString();
  const inserted = await trx
    .insertInto("master.customer" as never)
    .values({
      business_partner_id: businessPartnerId,
      customer_code: customerCode,
      customer_type: str(customerInput["customer_type"]) ?? "corporate",
      is_key_account: customerInput["is_key_account"] === true,
      risk_rating: customerInput["risk_rating"] ?? null,
      status: "prospect",
      tenant_id: tenantId,
      created_by: principalId,
      created_at: now,
    } as never)
    .returning(["id", "customer_code"] as never[])
    .executeTakeFirstOrThrow() as Record<string, unknown>;

  const customerId = String(inserted["id"]);
  await sql`
    INSERT INTO master.customer_qualification (
      tenant_id, customer_id, credit_status, kyc_status, aml_sanctions_status,
      is_dunning_eligible, is_statement_eligible, status, created_by, created_at
    )
    VALUES (
      ${tenantId}::uuid, ${customerId}::uuid, 'not_assessed', 'not_started', 'not_checked',
      true, true, 'active', ${principalId}::uuid, now()
    )
    ON CONFLICT (tenant_id, customer_id) DO NOTHING
  `.execute(trx);

  return { customer_id: customerId, customer_code: String(inserted["customer_code"]), created: true };
}

export function createBusinessPartnerManagementRoute(router: Router, deps: BusinessPartnerManagementDeps): Router {
  const { db, auth, logger } = deps;

  const checkDuplicatesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      const result = await checkBusinessPartnerDuplicates(db, tenantId, req.body as BusinessPartnerDuplicateCheckInput);
      res.json(result);
    } catch (err) {
      logger?.error("business_partner_check_duplicates_error", { err: String(err) });
      next(err);
    }
  };

  const intakeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = normalizeBusinessPartnerIntakeBody(req.body as Record<string, unknown>);

      const role = body.role ?? (body.supplier ? "supplier" : body.customer ? "customer" : "business_partner");
      const roleInput = role === "supplier" ? asRecord(body.supplier) : role === "customer" ? asRecord(body.customer) : {};
      const bpInput = {
        ...pick(roleInput, BP_IDENTITY_FIELDS),
        ...pick(asRecord(body.business_partner), BP_IDENTITY_FIELDS),
      };
      const primaryTaxNumber = (body.tax_profiles ?? [])
        .map((tax) => str(tax["tax_number"]) ?? str(tax["tax_id"]) ?? str(tax["vat_number"]) ?? str(tax["vat_id"]))
        .find(Boolean);

      const duplicateResult = await checkBusinessPartnerDuplicates(db, tenantId, {
        name: str(bpInput["name"]),
        legal_name: str(bpInput["legal_name"]),
        registration_no: str(bpInput["registration_no"]),
        registration_country_code: str(bpInput["registration_country_code"]),
        tax_number: primaryTaxNumber,
        identifiers: (body.identifiers ?? []).map((id) => ({ scheme: str(id["scheme"]), value: str(id["value"]) })),
      });
      if (duplicateResult.blocking) {
        res.status(409).json({
          error: "DUPLICATE_BP_BLOCKED",
          message: "An existing business partner matches the submitted identity.",
          duplicate_check: duplicateResult,
        });
        return;
      }

      const result = await db.transaction().execute(async (trx) => {
        const now = new Date().toISOString();
        const bpCode = await generateBusinessCode(trx, tenantId, "business_partner", principalId);
        const insertedBp = await trx
          .insertInto("master.business_partner" as never)
          .values({
            ...bpInput,
            code: bpCode,
            name: bpInput["name"] ?? bpInput["legal_name"] ?? bpCode,
            partner_category: bpInput["partner_category"] ?? "organization",
            status: "active",
            tenant_id: tenantId,
            created_by: principalId,
            created_at: now,
          } as never)
          .returning(["id", "code"] as never[])
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        const businessPartnerId = String(insertedBp["id"]);

        for (const ident of body.identifiers ?? []) {
          const scheme = str(ident["scheme"]);
          const value = str(ident["value"]);
          if (!scheme || !value) continue;
          await trx
            .insertInto("master.party_identifier" as never)
            .values({
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              scheme,
              value,
              issuing_authority: ident["issuing_authority"] ?? null,
              is_primary: ident["is_primary"] === true,
              is_verified: false,
              status: "active",
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        for (const tax of body.tax_profiles ?? []) {
          const countryCode = str(tax["country_code"])?.toUpperCase();
          if (!countryCode) continue;
          await trx
            .insertInto("master.party_tax_profile" as never)
            .values({
              owner_type: "business_partner",
              owner_id: businessPartnerId,
              country_code: countryCode,
              tax_id: tax["tax_id"] ?? tax["tax_number"] ?? null,
              vat_id: tax["vat_id"] ?? tax["vat_number"] ?? null,
              vat_registered: tax["vat_registered"] === true || tax["is_vat_registered"] === true,
              status: "active",
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        let roleResult: Record<string, unknown> = {};
        if (role === "supplier") {
          roleResult = await ensureSupplierRole(trx, tenantId, principalId, businessPartnerId, roleInput);
        } else if (role === "customer") {
          roleResult = await ensureCustomerRole(trx, tenantId, principalId, businessPartnerId, roleInput);
        }

        await emitOutboxEvent(trx, {
          tenantId,
          topic: "master-data",
          entityId: businessPartnerId,
          eventType: "business_partner.created",
          payload: { business_partner_code: bpCode, role },
          actorId: principalId,
        });

        return {
          business_partner_id: businessPartnerId,
          business_partner_code: bpCode,
          role,
          ...roleResult,
        };
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof BusinessPartnerValidationError) {
        res.status(422).json({ error: err.code, message: err.message, field: err.field });
        return;
      }
      logger?.error("business_partner_intake_error", { err: String(err) });
      next(err);
    }
  };

  const extendHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = normalizeBusinessPartnerExtensionBody(req.body as Record<string, unknown>);

      const bpRef = str(body.business_partner_id) ?? str(body.business_partner_code);
      const extensionType = body.extension_type;
      if (!bpRef || !extensionType) {
        res.status(422).json({ error: "EXTENSION_INPUT_REQUIRED", message: "business_partner_id/business_partner_code and extension_type are required." });
        return;
      }

      const bp = await resolveBusinessPartner(db, tenantId, bpRef);
      if (!bp) {
        res.status(404).json({ error: "BUSINESS_PARTNER_NOT_FOUND", message: "Business partner was not found for this tenant." });
        return;
      }

      if ((extensionType === "supplier_company_code" || extensionType === "customer_company_code")) {
        if (!body.company_code_id || !(await ensureCompanyCode(db, tenantId, body.company_code_id))) {
          res.status(422).json({ error: "COMPANY_CODE_REQUIRED", message: "A valid company_code_id is required for company-code extension." });
          return;
        }
      }

      const result = await db.transaction().execute(async (trx) => {
        const now = new Date().toISOString();

        if (extensionType === "supplier_role") {
          const supplier = await ensureSupplierRole(trx, tenantId, principalId, bp.id, asRecord(body.supplier));
          return { business_partner_id: bp.id, business_partner_code: bp.code, extension_type: extensionType, ...supplier };
        }

        if (extensionType === "customer_role") {
          const customer = await ensureCustomerRole(trx, tenantId, principalId, bp.id, asRecord(body.customer));
          return { business_partner_id: bp.id, business_partner_code: bp.code, extension_type: extensionType, ...customer };
        }

        if (extensionType === "supplier_company_code") {
          const supplier = await ensureSupplierRole(trx, tenantId, principalId, bp.id, asRecord(body.supplier));
          const profile = asRecord(body.supplier_profile);
          const inserted = await sql<{ id: string; status: string }>`
            INSERT INTO master.company_code_supplier_profile (
              tenant_id, supplier_id, company_code_id, is_blocked, block_reason, currency_code,
              default_accounting_profile_id, payment_term_id, payment_method_id,
              preferred_remittance_bank_link_id, tax_group_id, default_wht_tax_group_id,
              default_dimension_set_id, invoice_hold_policy_id, status, created_by, created_at
            )
            VALUES (
              ${tenantId}::uuid, ${supplier.supplier_id}::uuid, ${body.company_code_id}::uuid,
              false, NULL, ${str(profile["currency_code"]) ?? null},
              ${profile["default_accounting_profile_id"] ?? null}::uuid,
              ${profile["payment_term_id"] ?? null}::uuid,
              ${profile["payment_method_id"] ?? null}::uuid,
              ${profile["preferred_remittance_bank_link_id"] ?? null}::uuid,
              ${profile["tax_group_id"] ?? null}::uuid,
              ${profile["default_wht_tax_group_id"] ?? null}::uuid,
              ${profile["default_dimension_set_id"] ?? null}::uuid,
              ${profile["invoice_hold_policy_id"] ?? null}::uuid,
              'active', ${principalId}::uuid, ${now}::timestamptz
            )
            ON CONFLICT (tenant_id, supplier_id, company_code_id)
            DO UPDATE SET
              updated_by = EXCLUDED.created_by,
              updated_at = now()
            RETURNING id::text, status
          `.execute(trx);
          return {
            business_partner_id: bp.id,
            business_partner_code: bp.code,
            extension_type: extensionType,
            ...supplier,
            company_code_supplier_profile_id: inserted.rows[0]?.id,
            status: inserted.rows[0]?.status ?? "active",
          };
        }

        const customer = await ensureCustomerRole(trx, tenantId, principalId, bp.id, asRecord(body.customer));
        const profile = asRecord(body.customer_profile);
        const inserted = await sql<{ id: string; status: string }>`
          INSERT INTO master.company_code_customer_profile (
            tenant_id, customer_id, company_code_id, credit_limit, credit_limit_currency_code,
            credit_rating, is_blocked, block_reason, default_accounting_profile_id,
            tax_group_id, default_receipt_method_id, default_dimension_set_id,
            payment_term_id, currency_code, statement_cycle_code, dunning_policy_id,
            status, created_by, created_at
          )
          VALUES (
            ${tenantId}::uuid, ${customer.customer_id}::uuid, ${body.company_code_id}::uuid,
            ${profile["credit_limit"] ?? null}::numeric,
            ${str(profile["credit_limit_currency_code"]) ?? null},
            ${str(profile["credit_rating"]) ?? null},
            false, NULL,
            ${profile["default_accounting_profile_id"] ?? null}::uuid,
            ${profile["tax_group_id"] ?? null}::uuid,
            ${profile["default_receipt_method_id"] ?? null}::uuid,
            ${profile["default_dimension_set_id"] ?? null}::uuid,
            ${profile["payment_term_id"] ?? null}::uuid,
            ${str(profile["currency_code"]) ?? null},
            ${str(profile["statement_cycle_code"]) ?? null},
            ${profile["dunning_policy_id"] ?? null}::uuid,
            'active', ${principalId}::uuid, ${now}::timestamptz
          )
          ON CONFLICT (tenant_id, customer_id, company_code_id)
          DO UPDATE SET
            updated_by = EXCLUDED.created_by,
            updated_at = now()
          RETURNING id::text, status
        `.execute(trx);
        return {
          business_partner_id: bp.id,
          business_partner_code: bp.code,
          extension_type: extensionType,
          ...customer,
          company_code_customer_profile_id: inserted.rows[0]?.id,
          status: inserted.rows[0]?.status ?? "active",
        };
      });

      logger?.info("business_partner.extended", {
        tenantId,
        businessPartnerId: result.business_partner_id,
        extensionType,
        principalId,
      });

      res.status(200).json(result);
    } catch (err) {
      logger?.error("business_partner_extend_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/business_partner/check-duplicates", checkDuplicatesHandler);
  router.post("/records/business_partner/intake", intakeHandler);
  router.post("/records/business_partner/extend", extendHandler);

  return router;
}
