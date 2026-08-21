/**
 * Resolver: purchase_invoice.header_defaults
 *
 * Produces a create-time header patch for Purchase Invoice by reading
 * control.entity_field.defaults. It does not own field-specific default
 * logic; each target still delegates to its configured resolver.
 */

import { sql } from "kysely";
import {
  asResolverCode,
  type EntityFieldDefaults,
  type ResolverContract,
} from "@athyper/cascade";
import { registerResolver, type ResolverContext, type ServerResolver } from "./registry.js";
import { runResolver } from "./runner.js";
import {
  commitmentHeaderToDefaultsPatch,
  loadCommitmentHeader,
} from "../loaders/commitment-header-loader.js";

const ENTITY_CODE = "purchase_invoice";

export interface PurchaseInvoiceHeaderDefaultsInput {
  company_code_id?:        string | null;
  supplier_id?:            string | null;
  commitment_id?:          string | null;
  invoice_type?:           string | null;
  credited_invoice_id?:    string | null;
  debited_invoice_id?:     string | null;
  retention_invoice_id?:   string | null;
  reversal_of_id?:         string | null;
  [key: string]:           unknown;
}

export type PurchaseInvoiceHeaderDefaults = Record<string, unknown>;

const CONTRACT: ResolverContract = {
  code:            asResolverCode("purchase_invoice.header_defaults"),
  description:     "Resolves Purchase Invoice create-time header defaults from Meta Entity source-change metadata.",
  requiredSources: ["company_code_id"],
  outputType:      "object",
};

const impl: ServerResolver<PurchaseInvoiceHeaderDefaults> = async (inputs, ctx) => {
  return resolvePurchaseInvoiceHeaderDefaults(inputs, ctx);
};

const COMMITMENT_CONTRACT: ResolverContract = {
  code:            asResolverCode("purchase_invoice.commitment_defaults"),
  description:     "Resolves Purchase Invoice header defaults inherited from a referenced commitment / PO.",
  requiredSources: ["commitment_id"],
  outputType:      "object",
};

const commitmentImpl: ServerResolver<PurchaseInvoiceHeaderDefaults> = async (inputs, ctx) => {
  return resolvePurchaseInvoiceCommitmentDefaults(inputs, ctx);
};

const COMMITMENT_FIELD_CONTRACT: ResolverContract = {
  code:            asResolverCode("purchase_invoice.commitment_default"),
  description:     "Resolves one Purchase Invoice target field from the referenced commitment / PO.",
  requiredSources: ["commitment_id", "target_field"],
  outputType:      "string",
};

const commitmentFieldImpl: ServerResolver<unknown> = async (inputs, ctx) => {
  const target = readString(inputs["target_field"]);
  if (!target) return null;
  const patch = await resolvePurchaseInvoiceCommitmentDefaults(inputs, ctx);
  return patch[target] ?? null;
};

const REFERENCE_CONTRACT: ResolverContract = {
  code:            asResolverCode("purchase_invoice.reference_defaults"),
  description:     "Resolves Purchase Invoice header defaults inherited from an original invoice reference.",
  requiredSources: ["invoice_type"],
  outputType:      "object",
};

const referenceImpl: ServerResolver<PurchaseInvoiceHeaderDefaults> = async (inputs, ctx) => {
  return resolvePurchaseInvoiceReferenceDefaults(inputs, ctx);
};

const REFERENCE_FIELD_CONTRACT: ResolverContract = {
  code:            asResolverCode("purchase_invoice.reference_default"),
  description:     "Resolves one Purchase Invoice target field from the original invoice reference.",
  requiredSources: ["invoice_type", "target_field"],
  outputType:      "string",
};

const referenceFieldImpl: ServerResolver<unknown> = async (inputs, ctx) => {
  const target = readString(inputs["target_field"]);
  if (!target) return null;
  const patch = await resolvePurchaseInvoiceReferenceDefaults(inputs, ctx);
  return patch[target] ?? null;
};

export async function resolvePurchaseInvoiceHeaderDefaults(
  inputs: PurchaseInvoiceHeaderDefaultsInput,
  ctx:    ResolverContext,
): Promise<PurchaseInvoiceHeaderDefaults> {
  const explicit = new Set(Object.keys(inputs).filter((key) => !isBlank(inputs[key])));
  const values = normalizeInputs(inputs);

  mergeMissing(values, await resolvePurchaseInvoiceReferenceDefaults(values, ctx), explicit);
  mergeMissing(values, await resolvePurchaseInvoiceCommitmentDefaults(values, ctx), explicit);

  const defaultsByField = await loadPurchaseInvoiceFieldDefaults(ctx);
  const patch: PurchaseInvoiceHeaderDefaults = {};

  for (const [target, defaults] of Object.entries(defaultsByField)) {
    if (!isBlank(values[target])) continue;

    const rules = defaults.on_source_change ?? [];
    for (const rule of rules) {
      if (rule.action !== "rederive") continue;
      if (!rule.layers.includes("server_on_save")) continue;
      if (!rule.resolver || rule.resolver === CONTRACT.code) continue;
      if (!rule.sources.every((source) => !isBlank(values[source]))) continue;

      const result = await runResolver(rule.resolver, buildResolverInputs(values, target), ctx);
      if (result.ok && !isBlank(result.value)) {
        if (isPatchValue(result.value)) {
          for (const [field, value] of Object.entries(result.value)) {
            values[field] = value;
            if (!explicit.has(field)) patch[field] = value;
          }
        } else {
          values[target] = result.value;
          if (!explicit.has(target)) patch[target] = result.value;
        }
        break;
      }
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (!explicit.has(key) && !isBlank(value) && !Object.prototype.hasOwnProperty.call(inputs, key)) {
      patch[key] = value;
    }
  }

  return patch;
}

export async function resolvePurchaseInvoiceCommitmentDefaults(
  inputs: Record<string, unknown>,
  ctx:    ResolverContext,
): Promise<PurchaseInvoiceHeaderDefaults> {
  const commitmentId = readString(inputs["commitment_id"]);
  if (!commitmentId) return {};

  const snapshot = await loadCommitmentHeader(ctx.db, ctx.tenantId, commitmentId);
  if (!snapshot) return {};

  return compactPatch(commitmentHeaderToDefaultsPatch(snapshot));
}

export async function resolvePurchaseInvoiceReferenceDefaults(
  inputs: Record<string, unknown>,
  ctx:    ResolverContext,
): Promise<PurchaseInvoiceHeaderDefaults> {
  const referenceInvoiceId = resolveReferenceInvoiceId(inputs);
  if (!referenceInvoiceId) return {};

  const row = await sql<{
    id:                  string;
    company_code_id:     string;
    supplier_id:         string | null;
    commitment_id:       string | null;
    currency_code:       string | null;
    base_currency_code:  string | null;
    payment_term_id:     string | null;
    tax_mode:            string | null;
    match_type:          string | null;
    status:              string | null;
  }>`
    SELECT
      id,
      company_code_id,
      supplier_id,
      commitment_id,
      currency_code,
      base_currency_code,
      payment_term_id,
      tax_mode,
      match_type,
      status
    FROM document.purchase_invoice
   WHERE id        = ${referenceInvoiceId}::uuid
     AND tenant_id = ${ctx.tenantId}::uuid
   LIMIT 1
  `.execute(ctx.db);

  const ref = row.rows[0];
  if (!ref) return {};

  return compactPatch({
    company_code_id:     ref.company_code_id,
    supplier_id:         ref.supplier_id,
    commitment_id:       ref.commitment_id,
    currency_code:       ref.currency_code,
    base_currency_code:  ref.base_currency_code,
    payment_term_id:     ref.payment_term_id,
    tax_mode:            ref.tax_mode,
    match_type:          ref.match_type,
  });
}

async function loadPurchaseInvoiceFieldDefaults(
  ctx: ResolverContext,
): Promise<Record<string, EntityFieldDefaults>> {
  const rows = await sql<{ name: string; defaults: EntityFieldDefaults | null }>`
    SELECT ef.name, ef.defaults
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e          ON e.id  = ev.entity_id
     WHERE e.name       = ${ENTITY_CODE}
       AND e.tenant_id  IS NULL
        AND e.runtime_enabled = true
        AND e.status    = 'ACTIVE'
        AND e.is_active = true
        AND ev.status    = 'EFFECTIVE'
        AND ef.is_active = true
        AND ef.runtime_enabled = true
        AND ef.defaults IS NOT NULL
  `.execute(ctx.db);

  const map: Record<string, EntityFieldDefaults> = {};
  for (const row of rows.rows) {
    if (row.defaults && typeof row.defaults === "object") {
      map[row.name] = row.defaults;
    }
  }
  return map;
}

function normalizeInputs(inputs: PurchaseInvoiceHeaderDefaultsInput): Record<string, unknown> {
  const invoiceType = readString(inputs.invoice_type);
  return {
    ...inputs,
    company_code_id:       readString(inputs.company_code_id),
    supplier_id:           readString(inputs.supplier_id),
    commitment_id:         readString(inputs.commitment_id),
    invoice_type:          invoiceType,
    credited_invoice_id:   readString(inputs.credited_invoice_id),
    debited_invoice_id:    readString(inputs.debited_invoice_id),
    retention_invoice_id:  readString(inputs.retention_invoice_id),
  };
}

function buildResolverInputs(
  values: Record<string, unknown>,
  targetField: string,
): Record<string, unknown> {
  return {
    ...values,
    entity_code:  ENTITY_CODE,
    target_field: targetField,
  };
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function isPatchValue(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && (
        Object.prototype.hasOwnProperty.call(value, "exchange_rate")
        || Object.prototype.hasOwnProperty.call(value, "fx_rate_snapshot")
        || Object.prototype.hasOwnProperty.call(value, "payment_exchange_rate")
        || Object.prototype.hasOwnProperty.call(value, "payment_fx_rate_snapshot")
      ),
  );
}

function mergeMissing(
  values: Record<string, unknown>,
  patch: PurchaseInvoiceHeaderDefaults,
  explicit: ReadonlySet<string>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (explicit.has(key)) continue;
    if (isBlank(value)) continue;
    if (isBlank(values[key])) values[key] = value;
  }
}

function compactPatch(values: Record<string, unknown>): PurchaseInvoiceHeaderDefaults {
  const out: PurchaseInvoiceHeaderDefaults = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isBlank(value)) out[key] = value;
  }
  return out;
}

function resolveReferenceInvoiceId(inputs: Record<string, unknown>): string | null {
  const invoiceType = readString(inputs["invoice_type"]);
  if (invoiceType === "credit_note") {
    return readString(inputs["credited_invoice_id"]) ?? readString(inputs["reversal_of_id"]);
  }
  if (invoiceType === "debit_note") {
    return readString(inputs["debited_invoice_id"]) ?? readString(inputs["reversal_of_id"]);
  }
  if (invoiceType === "retention_release") {
    return readString(inputs["retention_invoice_id"]) ?? readString(inputs["reversal_of_id"]);
  }
  return readString(inputs["reversal_of_id"]);
}

export function registerPurchaseInvoiceHeaderDefaults(): void {
  registerResolver(CONTRACT, impl);
  registerResolver(COMMITMENT_CONTRACT, commitmentImpl);
  registerResolver(COMMITMENT_FIELD_CONTRACT, commitmentFieldImpl);
  registerResolver(REFERENCE_CONTRACT, referenceImpl);
  registerResolver(REFERENCE_FIELD_CONTRACT, referenceFieldImpl);
}

export { CONTRACT as purchaseInvoiceHeaderDefaultsContract };
export { COMMITMENT_CONTRACT as purchaseInvoiceCommitmentDefaultsContract };
export { REFERENCE_CONTRACT as purchaseInvoiceReferenceDefaultsContract };
export { COMMITMENT_FIELD_CONTRACT as purchaseInvoiceCommitmentDefaultContract };
export { REFERENCE_FIELD_CONTRACT as purchaseInvoiceReferenceDefaultContract };
