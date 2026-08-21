/**
 * AP master fixture (audit AP-S1a — receipt + SS posting subset).
 *
 * Extends the budget fixture with the minimum master + control rows
 * needed for `handlePostReceipt` and `handlePostServiceSheet` to succeed
 * end-to-end against a live Postgres:
 *
 *   master.ledger_book                  (category='statutory', is_primary)
 *   master.company_code_book_assignment (link company → book)
 *   master.company_code_chart_assignment (link company → chart)
 *   master.gl_account × 3
 *     - GR/IR clearing  (subledger_type='gr_ir_clearing')
 *     - SES clearing    (subledger_type='ses_clearing')
 *     - expense default (reuses the budget fixture's gl_account_id)
 *   master.business_intent
 *   control.commodity_category_buy_policy
 *     → maps the budget fixture's commodity_category + business_intent
 *       to the expense gl_account so resolveInventoryOrExpenseAccount
 *       finds it during posting.
 *
 * Out of scope for AP-S1a (deferred to AP-S1b — PI posting):
 *   - master.accounting_profile + control.acct_profile_config/event/template
 *   - control.tax_group + tax_rate_schedule
 *   - matching_type ≠ NONE configuration
 *   - party-balance setup for updatePartyBalanceOnPosting
 *
 * Build on top of seedBudgetScenario from budget-fixture.ts — this module
 * adds rows to the same scenario rather than seeding a parallel tenant.
 */

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { BudgetScenario } from "./budget-fixture.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ApReceiptSeed {
  // Ledger book
  ledgerBookId:        string;
  bookAssignmentId:    string;
  // GL accounts (in addition to budget fixture's expense gl_account)
  grIrClearingGlId:    string;
  sesClearingGlId:     string;
  // Chart assignment
  chartAssignmentId:   string;
  // Buy policy chain
  businessIntentId:    string;
  buyPolicyId:         string;
}

export interface SeedApMasterOpts {
  /** Optional override for the business_intent's domain. Default 'OPEX'
   *  so the receipt posts to an expense account; flip to 'CAPEX' for
   *  asset-class tests when those land. */
  intentDomain?: "OPEX" | "CAPEX" | "ADMIN";
  /** Override the currency for the ledger book. Default matches the
   *  scenario's currency (USD). */
  bookCurrency?: string;
}

/**
 * Seed the AP master rows on top of an existing BudgetScenario.
 * Idempotent guard: throws if called twice on the same scenario (call
 * site is expected to track this; the fixture file doesn't carry state).
 */
export async function seedApMasterReceipt(
  db:   AnyDb,
  s:    BudgetScenario,
  opts: SeedApMasterOpts = {},
): Promise<ApReceiptSeed> {
  const intentDomain = opts.intentDomain ?? "OPEX";
  const bookCurrency = opts.bookCurrency ?? s.currencyCode;

  const seed: ApReceiptSeed = {
    ledgerBookId:      randomUUID(),
    bookAssignmentId:  randomUUID(),
    grIrClearingGlId:  randomUUID(),
    sesClearingGlId:   randomUUID(),
    chartAssignmentId: randomUUID(),
    businessIntentId:  randomUUID(),
    buyPolicyId:       randomUUID(),
  };

  // ── master.ledger_book ──────────────────────────────────────────────────
  // category='statutory' + is_primary=true matches resolveStatutoryBookId's
  // ORDER BY b.is_primary DESC tiebreak (post the AP-S1a fix).
  await sql`
    INSERT INTO master.ledger_book
      (id, tenant_id, code, name, description, category, reporting_standard,
       base_currency_code, is_primary, is_auto_post, is_manual_je_allowed,
       is_reversal_allowed, close_mode, sort_order, status, created_by)
    VALUES
      (${seed.ledgerBookId}::uuid, ${s.tenantId}::uuid,
       ${"BOOK-STAT-" + s.suffix}, ${"AP Fixture Stat " + s.suffix},
       'AP fixture statutory book',
       'statutory', 'ifrs',
       ${bookCurrency}::char(3), true, true, true,
       true, 'unified', 10, 'active', ${s.principalId}::uuid)
  `.execute(db);

  // ── master.company_code_book_assignment ────────────────────────────────
  await sql`
    INSERT INTO master.company_code_book_assignment
      (id, tenant_id, company_code_id, book_id, status, created_by)
    VALUES
      (${seed.bookAssignmentId}::uuid, ${s.tenantId}::uuid,
       ${s.companyCodeId}::uuid, ${seed.ledgerBookId}::uuid,
       'active', ${s.principalId}::uuid)
  `.execute(db);

  // ── master.company_code_chart_assignment ───────────────────────────────
  // Required by resolveInventoryOrExpenseAccount + resolveSubledgerAccount,
  // and by master.fn_resolve_intent_default_gl_account which filters on
  // assignment_type='operating' (NOT NULL DEFAULT 'operating' per DDL) AND
  // effective_from <= CURRENT_DATE. effective_from is nullable; leaving it
  // unset would make the resolver's `<= CURRENT_DATE` predicate evaluate
  // NULL → row excluded. Stamp CURRENT_DATE explicitly.
  await sql`
    INSERT INTO master.company_code_chart_assignment
      (id, tenant_id, company_code_id, chart_of_account_id,
       assignment_type, is_primary, effective_from,
       status, created_by)
    VALUES
      (${seed.chartAssignmentId}::uuid, ${s.tenantId}::uuid,
       ${s.companyCodeId}::uuid, ${s.chartOfAccountId}::uuid,
       'operating', true, CURRENT_DATE,
       'active', ${s.principalId}::uuid)
  `.execute(db);

  // ── master.gl_account — GR/IR clearing ─────────────────────────────────
  await sql`
    INSERT INTO master.gl_account
      (id, tenant_id, code, name, chart_of_account_id,
       account_class, normal_balance, subledger_type, status, created_by)
    VALUES
      (${seed.grIrClearingGlId}::uuid, ${s.tenantId}::uuid,
       ${"2110-" + s.suffix}, 'GR/IR Clearing',
       ${s.chartOfAccountId}::uuid,
       'liability', 'credit', 'gr_ir_clearing', 'active',
       ${s.principalId}::uuid)
  `.execute(db);

  // ── master.gl_account — SES clearing ───────────────────────────────────
  await sql`
    INSERT INTO master.gl_account
      (id, tenant_id, code, name, chart_of_account_id,
       account_class, normal_balance, subledger_type, status, created_by)
    VALUES
      (${seed.sesClearingGlId}::uuid, ${s.tenantId}::uuid,
       ${"2120-" + s.suffix}, 'SES Clearing',
       ${s.chartOfAccountId}::uuid,
       'liability', 'credit', 'ses_clearing', 'active',
       ${s.principalId}::uuid)
  `.execute(db);

  // ── master.business_intent ─────────────────────────────────────────────
  // FK target for commodity_category_buy_policy.business_intent_id (NOT NULL).
  await sql`
    INSERT INTO master.business_intent
      (id, tenant_id, code, name, domain, status, created_by)
    VALUES
      (${seed.businessIntentId}::uuid, ${s.tenantId}::uuid,
       ${"INT-" + intentDomain + "-" + s.suffix},
       ${"AP Fixture " + intentDomain + " Intent"},
       ${intentDomain}::text, 'active', ${s.principalId}::uuid)
  `.execute(db);

  // ── control.commodity_category_buy_policy ──────────────────────────────
  // Maps the budget fixture's commodity_category + the new business_intent
  // to the budget fixture's expense gl_account. resolveInventoryOrExpenseAccount
  // looks up this row when posting a receipt line; without it, the line
  // falls back to the chart-default which may not exist in the fixture.
  await sql`
    INSERT INTO control.commodity_category_buy_policy
      (id, tenant_id, commodity_category_id, business_intent_id,
       scope_type, mapping_mode, is_default, is_selectable, sort_order,
       default_gl_account_id,
       status, created_by)
    VALUES
      (${seed.buyPolicyId}::uuid, ${s.tenantId}::uuid,
       ${s.commodityCategoryId}::uuid, ${seed.businessIntentId}::uuid,
       'TENANT'::text, 'ALLOW'::text, true, true, 0,
       ${s.glAccountId}::uuid,
       'active'::shared.active_inactive_d, ${s.principalId}::uuid)
  `.execute(db);

  return seed;
}

// ──────────────────────────────────────────────────────────────────────────────
// Schema readiness (A-S0)
// ──────────────────────────────────────────────────────────────────────────────
//
// `master.accounting_profile` is defined in
// blueprints/modules/ap_non_po/005_accounting_profile_ddl.sql, not the
// core DDL. Tests that use seedApMasterProfile must run on a DB where
// the blueprint has been applied. This assertion runs in test beforeAll
// so the failure surfaces as a clear instruction instead of a confusing
// seed-time error from a downstream INSERT.

export async function assertAccountingProfileTableExists(db: AnyDb): Promise<void> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
        FROM information_schema.tables
       WHERE table_schema = 'master'
         AND table_name   = 'accounting_profile'
    ) AS exists
  `.execute(db);
  if (result.rows[0]?.exists !== true) {
    throw new Error(
      "master.accounting_profile table is not present. " +
      "Apply the AP NON_PO blueprint DDL before running profile-path tests: " +
      "pnpm --filter @athyper/db run db:setup:blueprints " +
      "(or apply server/db/seed/blueprints/modules/ap_non_po/005_accounting_profile_ddl.sql manually).",
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PI posting extension (AP-S1b)
// ──────────────────────────────────────────────────────────────────────────────
//
// handlePostInvoice's legacy fallback path (used when no accounting_profile
// chain is seeded) needs an AP control account discoverable via
// gl_account.subledger_type='ap'. The accounting_profile chain itself is
// deliberately NOT seeded here — the legacy path is the supported flow for
// tenants without profile configuration, and matching its assumptions keeps
// the fixture tight.
//
// AP-Q (out of scope for this fixture): exercising the profile-driven path
// (Phase 4 engine) needs master.accounting_profile + control.acct_profile_
// config/event/entry_template seeding, which is its own ~1-day fixture.
// Filed as a future extension.

export interface ApPiSeed {
  apControlGlId: string;
  /** Only present when opts.includeWht is true. */
  whtPayableGlId: string | null;
}

export interface SeedApMasterPiOpts {
  /** Set to true to also seed a WHT payable account (subledger_type='wht_payable').
   *  Required only when the test will create PI lines with non-zero
   *  withholding_tax_amount. Default false — keeps the smoke test tight. */
  includeWht?: boolean;
}

export async function seedApMasterPi(
  db:   AnyDb,
  s:    BudgetScenario,
  opts: SeedApMasterPiOpts = {},
): Promise<ApPiSeed> {
  const apControlGlId = randomUUID();
  const whtPayableGlId = opts.includeWht ? randomUUID() : null;

  // AP control — resolveApControlAccount() looks for subledger_type='ap'
  // joined via company_code_chart_assignment to the company. That chart
  // assignment was seeded in seedApMasterReceipt, so this row plugs in.
  await sql`
    INSERT INTO master.gl_account
      (id, tenant_id, code, name, chart_of_account_id,
       account_class, normal_balance, subledger_type, status, created_by)
    VALUES
      (${apControlGlId}::uuid, ${s.tenantId}::uuid,
       ${"2100-" + s.suffix}, 'AP Control (Trade Payables)',
       ${s.chartOfAccountId}::uuid,
       'liability', 'credit', 'ap', 'active',
       ${s.principalId}::uuid)
  `.execute(db);

  if (opts.includeWht && whtPayableGlId) {
    await sql`
      INSERT INTO master.gl_account
        (id, tenant_id, code, name, chart_of_account_id,
         account_class, normal_balance, subledger_type, status, created_by)
      VALUES
        (${whtPayableGlId}::uuid, ${s.tenantId}::uuid,
         ${"2150-" + s.suffix}, 'WHT Payable',
         ${s.chartOfAccountId}::uuid,
         'liability', 'credit', 'wht_payable', 'active',
         ${s.principalId}::uuid)
    `.execute(db);
  }

  return { apControlGlId, whtPayableGlId };
}

/**
 * Tear down rows seeded by seedApMasterPi. The GL accounts are deleted
 * by cleanupBudgetScenario's master.gl_account WHERE tenant_id sweep,
 * so this helper is currently a no-op — it exists for symmetry with
 * the AP-S1a seeder + for future expansion (e.g. when AP-S1b grows to
 * cover the accounting_profile chain).
 */
export async function cleanupApMasterPi(
  _db: AnyDb,
  _s:  BudgetScenario,
): Promise<void> {
  // No-op for now. The GL account rows seeded above are tenant-scoped and
  // get caught by the budget fixture's master.gl_account cleanup.
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4 accounting-profile-engine fixture (A-S1)
// ──────────────────────────────────────────────────────────────────────────────
//
// Seeds the four-table chain needed for handlePostInvoice to take the
// profile-driven path (instead of the legacy fallback):
//
//   master.accounting_profile      (identity)
//   control.acct_profile_config    (versioned config)
//   control.acct_profile_event     (ORDER_APPROVAL event)
//   control.acct_profile_entry_template × 2 (Dr expense + Cr AP control)
//
// Plus a separate helper for intent-routing:
//
//   seedApMasterIntentMapping — seeds master.business_intent with
//     metadata._coa_defaults.ifrs_code + a master.gl_account with that
//     code as its natural key. master.fn_resolve_intent_default_gl_account
//     reads the metadata and joins on gl_account.code.

export interface ApProfileSeed {
  accountingProfileId: string;
  acctProfileConfigId: string;
  acctProfileEventId:  string;
  drTemplateId:        string;
  crTemplateId:        string;
  fallbackGlId:        string;
  /** GL code written to entry_template.account_fallback — the last-resort
   *  path when intent and category both fail to resolve. A-T1 asserts the
   *  JE Dr line gl_account_id is NOT this account. */
  fallbackGlCode:      string;
}

export interface SeedApMasterProfileOpts {
  profileCode?:         string;              // default 'AP_TEST_STANDARD'
  applicableDocTypes?:  string[];            // default ['STANDARD','CREDIT_NOTE']
  matchingType?:        "NONE" | "TWO_WAY" | "THREE_WAY" | "FOUR_WAY";
  /** Override the GL code used for the entry_template.account_fallback
   *  GL account. Default 'IFRS-E-OPEX-GENERAL-' + scenario.suffix. */
  fallbackGlCode?:      string;
}

export async function seedApMasterProfile(
  db:   AnyDb,
  s:    BudgetScenario,
  opts: SeedApMasterProfileOpts = {},
): Promise<ApProfileSeed> {
  const profileCode        = opts.profileCode        ?? "AP_TEST_STANDARD";
  const applicableDocTypes = opts.applicableDocTypes ?? ["STANDARD", "CREDIT_NOTE"];
  const matchingType       = opts.matchingType       ?? "NONE";
  const fallbackGlCode     = opts.fallbackGlCode     ?? `FALLBACK-${s.suffix}`;

  const seed: ApProfileSeed = {
    accountingProfileId: randomUUID(),
    acctProfileConfigId: randomUUID(),
    acctProfileEventId:  randomUUID(),
    drTemplateId:        randomUUID(),
    crTemplateId:        randomUUID(),
    fallbackGlId:        randomUUID(),
    fallbackGlCode,
  };

  // Fallback GL account — entry_template.account_fallback is a GL code
  // string; the resolver looks it up by code on the chart, so the
  // gl_account.code must match exactly.
  await sql`
    INSERT INTO master.gl_account
      (id, tenant_id, code, name, chart_of_account_id,
       account_class, normal_balance, status, created_by)
    VALUES
      (${seed.fallbackGlId}::uuid, ${s.tenantId}::uuid,
       ${fallbackGlCode}::text, 'AP Profile Fallback',
       ${s.chartOfAccountId}::uuid,
       'expense', 'debit', 'active', ${s.principalId}::uuid)
  `.execute(db);

  // master.accounting_profile (identity)
  await sql`
    INSERT INTO master.accounting_profile
      (id, tenant_id, code, name, direction, subledger_type, status, created_by)
    VALUES
      (${seed.accountingProfileId}::uuid, ${s.tenantId}::uuid,
       ${profileCode}::text, ${profileCode + ' (test)'}::text,
       'INBOUND', 'AP', 'active', ${s.principalId}::uuid)
  `.execute(db);

  // control.acct_profile_config — STANDARD AP profile for NON_PO flow.
  // status uses the active_inactive_d domain so 'active' is the literal value.
  await sql`
    INSERT INTO control.acct_profile_config
      (id, tenant_id, accounting_profile_id,
       direction, profile_type, subledger_type,
       applicable_flow_codes, applicable_doc_types,
       matching_type, version,
       status, created_by)
    VALUES
      (${seed.acctProfileConfigId}::uuid, ${s.tenantId}::uuid,
       ${seed.accountingProfileId}::uuid,
       'INBOUND', 'STANDARD', 'AP',
       ARRAY['NON_PO']::text[], ${applicableDocTypes}::text[],
       ${matchingType}::text, 1,
       'active'::text, ${s.principalId}::uuid)
  `.execute(db);

  // control.acct_profile_event — ORDER_APPROVAL event (the event_code
  // mapEventCode produces for invoiceType='standard'|'credit_note').
  await sql`
    INSERT INTO control.acct_profile_event
      (id, tenant_id, profile_config_id,
       event_code, event_name, creates_je,
       status, created_by)
    VALUES
      (${seed.acctProfileEventId}::uuid, ${s.tenantId}::uuid,
       ${seed.acctProfileConfigId}::uuid,
       'ORDER_APPROVAL', 'AP Test Invoice Posting', true,
       'active'::shared.active_inactive_d, ${s.principalId}::uuid)
  `.execute(db);

  // Dr template — FROM_INTENT / LINE_AMOUNT, account_fallback set so the
  // resolver's last-resort path lands on a distinct GL from the intent path.
  await sql`
    INSERT INTO control.acct_profile_entry_template
      (id, tenant_id, profile_event_id, line_seq, description,
       posting_side, account_source, account_fallback,
       amount_source, is_balancing_line, sort_order,
       status, created_by)
    VALUES
      (${seed.drTemplateId}::uuid, ${s.tenantId}::uuid,
       ${seed.acctProfileEventId}::uuid, 10, 'Dr Expense (intent-mapped)',
       'DEBIT', 'FROM_INTENT', ${fallbackGlCode}::text,
       'LINE_AMOUNT', false, 10,
       'active'::shared.active_inactive_d, ${s.principalId}::uuid)
  `.execute(db);

  // Cr template — POSTING_ROLE 'ap_trade_payable' resolves to gl_account
  // with subledger_type='ap' (the AP control GL seeded by seedApMasterPi).
  // REMAINDER + is_balancing_line=true balances the JE.
  await sql`
    INSERT INTO control.acct_profile_entry_template
      (id, tenant_id, profile_event_id, line_seq, description,
       posting_side, account_source, account_lookup_key, account_fallback,
       amount_source, is_balancing_line, sort_order,
       status, created_by)
    VALUES
      (${seed.crTemplateId}::uuid, ${s.tenantId}::uuid,
       ${seed.acctProfileEventId}::uuid, 20, 'Cr AP Control (balancing)',
       'CREDIT', 'POSTING_ROLE', 'ap_trade_payable', ${fallbackGlCode}::text,
       'REMAINDER', true, 20,
       'active'::shared.active_inactive_d, ${s.principalId}::uuid)
  `.execute(db);

  return seed;
}

/**
 * FK-safe cleanup. intent_to_accounting_profile_rule has NO ON DELETE CASCADE
 * per control/03_constraints.sql:713-720 — must be deleted BEFORE the
 * config it references.
 */
export async function cleanupApMasterProfile(
  db: AnyDb,
  s:  BudgetScenario,
): Promise<void> {
  const stmts: Array<() => Promise<unknown>> = [
    () => sql`DELETE FROM control.intent_to_accounting_profile_rule WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM control.acct_profile_entry_template       WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM control.acct_profile_event                WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM control.acct_profile_config               WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.accounting_profile                 WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
  ];
  for (const stmt of stmts) {
    try { await stmt(); } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[ap-master-fixture] profile cleanup:", err instanceof Error ? err.message : err);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Intent → GL mapping (A-T1 / A-T2)
// ──────────────────────────────────────────────────────────────────────────────
//
// master.fn_resolve_intent_default_gl_account reads:
//   business_intent.metadata #>> '{_coa_defaults, ifrs_code}'   (or usgaap_code)
// and joins to:
//   master.gl_account WHERE code = <that code> AND chart matches
//
// Per Q-A3 resolution (master/05_functions.sql:4136). The chart_of_account
// must have code='COA-IFRS' for the function to pick ifrs_code (already
// guaranteed by the budget fixture).

export interface ApIntentMapping {
  businessIntentId:  string;
  intentGlId:        string;
  intentGlCode:      string;
}

export interface SeedApMasterIntentMappingOpts {
  intentCode?:       string;                       // default 'INT-OPEX-' + suffix
  intentDomain?:     "OPEX" | "CAPEX" | "ADMIN";   // default 'OPEX'
  /** Override the GL code that the intent metadata points at. Default
   *  'INTENT-' + suffix. Must be distinct from any other GL the fixture
   *  has seeded so A-T1 can prove the intent path was taken. */
  intentGlCode?:     string;
}

export async function seedApMasterIntentMapping(
  db:   AnyDb,
  s:    BudgetScenario,
  opts: SeedApMasterIntentMappingOpts = {},
): Promise<ApIntentMapping> {
  const intentDomain = opts.intentDomain ?? "OPEX";
  const intentCode   = opts.intentCode   ?? `INT-${intentDomain}-${s.suffix}`;
  const intentGlCode = opts.intentGlCode ?? `INTENT-${s.suffix}`;

  const businessIntentId = randomUUID();
  const intentGlId       = randomUUID();

  // GL account the intent metadata points at. Must exist on the chart
  // the company is assigned to (the budget fixture's chart).
  await sql`
    INSERT INTO master.gl_account
      (id, tenant_id, code, name, chart_of_account_id,
       account_class, normal_balance, status, created_by)
    VALUES
      (${intentGlId}::uuid, ${s.tenantId}::uuid,
       ${intentGlCode}::text, ${'Intent-mapped GL (' + intentDomain + ')'}::text,
       ${s.chartOfAccountId}::uuid,
       'expense', 'debit', 'active', ${s.principalId}::uuid)
  `.execute(db);

  // business_intent with metadata._coa_defaults.ifrs_code pointing at the
  // GL code above. The resolver function reads this metadata path
  // (master/05_functions.sql:4185-4189).
  await sql`
    INSERT INTO master.business_intent
      (id, tenant_id, code, name, domain,
       metadata,
       status, created_by)
    VALUES
      (${businessIntentId}::uuid, ${s.tenantId}::uuid,
       ${intentCode}::text, ${'AP Profile ' + intentDomain + ' Intent'}::text,
       ${intentDomain}::text,
       ${JSON.stringify({ _coa_defaults: { ifrs_code: intentGlCode } })}::jsonb,
       'active', ${s.principalId}::uuid)
  `.execute(db);

  return { businessIntentId, intentGlId, intentGlCode };
}

export async function cleanupApMasterIntentMapping(
  db: AnyDb,
  s:  BudgetScenario,
): Promise<void> {
  try {
    await sql`DELETE FROM master.business_intent WHERE tenant_id = ${s.tenantId}::uuid AND code LIKE 'INT-%'`.execute(db);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ap-master-fixture] intent mapping cleanup:", err instanceof Error ? err.message : err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// AP matching tolerance fixture (B-S2)
// ──────────────────────────────────────────────────────────────────────────────
//
// Seeds three rows in control.match_tolerance_config keyed on
//   (entity_name='purchase_invoice', match_type, tenant_id, company_code_id)
// One row each for tolerance_type IN ('quantity_pct','price_pct','amount_abs').
// Permissive defaults so happy-path tests match cleanly; tighten via opts
// for variance tests.

export interface ApMatchingSeed {
  qtyToleranceId:    string;
  priceToleranceId:  string;
  amountToleranceId: string;
}

export interface SeedApMasterMatchingOpts {
  matchType?:        "three_way" | "two_way" | "no_match" | "evaluated_receipt";
  qtyTolerance?:     number;   // percent; default 5
  priceTolerance?:   number;   // percent; default 5
  amountTolerance?:  number;   // absolute; default 10
}

export async function seedApMasterMatching(
  db:   AnyDb,
  s:    BudgetScenario,
  opts: SeedApMasterMatchingOpts = {},
): Promise<ApMatchingSeed> {
  const matchType        = opts.matchType       ?? "three_way";
  const qtyTolerance     = opts.qtyTolerance    ?? 5;
  const priceTolerance   = opts.priceTolerance  ?? 5;
  const amountTolerance  = opts.amountTolerance ?? 10;

  const qtyToleranceId    = randomUUID();
  const priceToleranceId  = randomUUID();
  const amountToleranceId = randomUUID();

  // Per resolveTolerance() at invoice-match.service.ts:96-108, the lookup
  // joins on (entity_name='purchase_invoice', match_type, tenant_id?,
  // company_code_id?) and reads tolerance_type + tolerance_value. Three
  // rows total per scenario.
  await sql`
    INSERT INTO control.match_tolerance_config
      (id, tenant_id, company_code_id, entity_name, match_type,
       tolerance_type, tolerance_value, is_active, created_by)
    VALUES
      (${qtyToleranceId}::uuid,   ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       'purchase_invoice', ${matchType}::text,
       'quantity_pct', ${qtyTolerance}::numeric, true, ${s.principalId}::uuid),
      (${priceToleranceId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       'purchase_invoice', ${matchType}::text,
       'price_pct', ${priceTolerance}::numeric, true, ${s.principalId}::uuid),
      (${amountToleranceId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       'purchase_invoice', ${matchType}::text,
       'amount_abs', ${amountTolerance}::numeric, true, ${s.principalId}::uuid)
  `.execute(db);

  return { qtyToleranceId, priceToleranceId, amountToleranceId };
}

export async function cleanupApMasterMatching(
  db: AnyDb,
  s:  BudgetScenario,
): Promise<void> {
  try {
    await sql`
      DELETE FROM control.match_tolerance_config
       WHERE tenant_id = ${s.tenantId}::uuid
    `.execute(db);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ap-master-fixture] matching cleanup:", err instanceof Error ? err.message : err);
  }
}

/**
 * Tear down rows seeded by seedApMasterReceipt for a given scenario.
 * Call BEFORE cleanupBudgetScenario so the FK chain unwinds correctly
 * (chart_assignment + book_assignment ride on company_code which the
 * budget cleanup deletes).
 */
export async function cleanupApMasterReceipt(
  db: AnyDb,
  s:  BudgetScenario,
): Promise<void> {
  const stmts: Array<() => Promise<unknown>> = [
    // Buy policy → business_intent → gl_accounts (clearing) → chart/book assignments → book.
    // gl_accounts share the chart_of_account_id from the budget fixture
    // so they get cleaned up under master.gl_account WHERE tenant_id by
    // budget cleanup. We delete them here too for safety in case budget
    // cleanup runs out of order.
    () => sql`DELETE FROM control.commodity_category_buy_policy WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.business_intent             WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.company_code_chart_assignment WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.company_code_book_assignment  WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.ledger_book                   WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
  ];

  for (const stmt of stmts) {
    try {
      await stmt();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[ap-master-fixture] cleanup error:", err instanceof Error ? err.message : err);
    }
  }
}
