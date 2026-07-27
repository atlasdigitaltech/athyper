/**
 * Accounting Profile Derivation Service — Phase 4
 *
 * Resolves the active acct_profile_config + entry templates for a given AP
 * invoice.  Two-step routing that matches Engine 4.13 semantics:
 *
 *   Step 1 — intent-based (preferred):
 *     Queries control.intent_to_accounting_profile_rule using the invoice's
 *     dominant business_intent_id + flow/doc predicates.  ORDER BY priority ASC
 *     (lower = more specific).  This is the only path that can distinguish
 *     AP_NON_PO_STANDARD (OPEX intent) from AP_NON_PO_CAPEX (CAPEX intent)
 *     when both configs apply to NON_PO + STANDARD.
 *
 *   Step 2 — profile-type fallback:
 *     When no intent rule matches (tenant lacks rules or lines have no intent),
 *     falls back to a direct acct_profile_config query disambiguated by
 *     profile_type (STANDARD / PREPAYMENT / CAPITALIZATION).
 *
 * Event code mapping (invoiceType → acct_profile_event.event_code):
 *   advance | down_payment  → ADVANCE_PAID
 *   retention_release       → RETENTION_RELEASED
 *   standard | credit_note | debit_note | (default) → ORDER_APPROVAL
 *
 * Returns null when no matching profile is seeded for the tenant/source/type,
 * which signals invoice-posting.service to fall back to the legacy
 * hard-coded JE construction.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Public types ──────────────────────────────────────────────────────────────

export interface EntryTemplate {
  id:               string;
  lineSeq:          number;
  description:      string;
  postingSide:      string;   // 'DEBIT' | 'CREDIT'
  accountSource:    string;   // 'FIXED' | 'FROM_INTENT' | 'FROM_CATEGORY' | 'POSTING_ROLE'
  accountCode:      string | null;
  accountLookupKey: string | null;
  accountFallback:  string | null;
  amountSource:     string;
  amountFormula:    string | null;
  amountPercentage: string | null;
  isBalancingLine:  boolean;
  appliesTo:        string[] | null;
}

export interface DerivedProfile {
  configId:  string;
  eventId:   string;
  eventCode: string;
  templates: EntryTemplate[];
}

// ── Event code mapping ────────────────────────────────────────────────────────

function mapEventCode(invoiceType: string): string {
  const t = invoiceType.toLowerCase();
  if (t === "advance" || t === "down_payment")  return "ADVANCE_PAID";
  if (t === "retention_release")                return "RETENTION_RELEASED";
  return "ORDER_APPROVAL";
}

// Profile_type used as fallback discriminator when intent routing finds nothing.
// CAPEX is only reachable via intent routing (dominantIntentId → CAPEX_GENERAL rule).
function mapProfileType(invoiceType: string): string {
  const t = invoiceType.toLowerCase();
  if (t === "advance" || t === "down_payment") return "PREPAYMENT";
  return "STANDARD";
}

// ── Derivation ────────────────────────────────────────────────────────────────

/**
 * Derives the accounting profile for an AP invoice posting.
 *
 * @param dominantIntentId — business_intent_id of the invoice line with the
 *   largest absolute net_amount.  Used for Step 1 intent-based routing.
 *   Null when lines carry no intent (triggers Step 2 profile_type fallback).
 */
export async function deriveApInvoiceProfile(
  db:               AnyDb,
  tenantId:         string,
  invoiceSource:    string,
  invoiceType:      string,
  dominantIntentId: string | null,
): Promise<DerivedProfile | null> {
  const flowCode   = invoiceSource.toUpperCase();  // non_po → NON_PO
  const docType    = invoiceType.toUpperCase();    // credit_note → CREDIT_NOTE
  const eventCode  = mapEventCode(invoiceType);

  let configId: string | null = null;

  // ── Step 1: intent_to_accounting_profile_rule ─────────────────────────────
  if (dominantIntentId) {
    const ruleResult = await sql<{ resolved_profile_config_id: string }>`
      SELECT r.resolved_profile_config_id
        FROM control.intent_to_accounting_profile_rule r
       WHERE r.tenant_id   = ${tenantId}
         AND r.is_active   = true
         AND (r.direction  IS NULL OR r.direction = 'INBOUND')
         AND  r.intent_id  = ${dominantIntentId}::uuid
         AND (r.flow_code  IS NULL OR r.flow_code = ${flowCode})
         AND (r.doc_type   IS NULL OR r.doc_type  = ${docType})
         AND  r.effective_from <= CURRENT_DATE
         AND (r.effective_to   IS NULL OR r.effective_to >= CURRENT_DATE)
       ORDER BY r.priority ASC
       LIMIT  1
    `.execute(db);
    configId = ruleResult.rows[0]?.resolved_profile_config_id ?? null;
  }

  // ── Step 2: profile_type fallback ─────────────────────────────────────────
  if (!configId) {
    const profileType = mapProfileType(invoiceType);
    const cfgResult = await sql<{ id: string }>`
      SELECT apc.id
        FROM control.acct_profile_config apc
       WHERE apc.tenant_id             = ${tenantId}
         AND apc.is_active             = true
         AND apc.subledger_type        = 'AP'
         AND apc.profile_type          = ${profileType}
         AND apc.applicable_flow_codes @> ARRAY[${flowCode}]::text[]
         AND apc.applicable_doc_types  @> ARRAY[${docType}]::text[]
       ORDER BY apc.version DESC
       LIMIT  1
    `.execute(db);
    configId = cfgResult.rows[0]?.id ?? null;
  }

  if (!configId) return null;

  // ── Resolve the event for this config ─────────────────────────────────────
  const evResult = await sql<{ event_id: string }>`
    SELECT id AS event_id
      FROM control.acct_profile_event
     WHERE profile_config_id = ${configId}::uuid
       AND tenant_id         = ${tenantId}
       AND event_code        = ${eventCode}
       AND is_active         = true
       AND creates_je        = true
     LIMIT 1
  `.execute(db);

  const eventId = evResult.rows[0]?.event_id ?? null;
  if (!eventId) return null;

  // ── Load entry templates ──────────────────────────────────────────────────
  const tmplResult = await sql<{
    id:                   string;
    line_seq:             number;
    description:          string;
    posting_side:         string;
    account_source:       string;
    account_code:         string | null;
    account_lookup_key:   string | null;
    account_fallback:     string | null;
    amount_source:        string;
    amount_formula:       string | null;
    amount_percentage:    string | null;
    is_balancing_line:    boolean;
    applies_to_doc_types: string[] | null;
  }>`
    SELECT id, line_seq, description, posting_side,
           account_source, account_code, account_lookup_key, account_fallback,
           amount_source, amount_formula, amount_percentage,
           is_balancing_line, applies_to_doc_types
      FROM control.acct_profile_entry_template
     WHERE profile_event_id = ${eventId}::uuid
       AND tenant_id        = ${tenantId}
       AND is_active        = true
     ORDER BY sort_order, line_seq
  `.execute(db);

  if (tmplResult.rows.length === 0) return null;

  return {
    configId,
    eventId,
    eventCode,
    templates: tmplResult.rows.map(r => ({
      id:               r.id,
      lineSeq:          r.line_seq,
      description:      r.description,
      postingSide:      r.posting_side,
      accountSource:    r.account_source,
      accountCode:      r.account_code,
      accountLookupKey: r.account_lookup_key,
      accountFallback:  r.account_fallback,
      amountSource:     r.amount_source,
      amountFormula:    r.amount_formula,
      amountPercentage: r.amount_percentage,
      isBalancingLine:  r.is_balancing_line,
      appliesTo:        r.applies_to_doc_types,
    })),
  };
}
