/**
 * Budget lifecycle integration test fixture (audit P0-S6.a).
 *
 * Builds the minimal master + ledger object graph the budget-transaction
 * service needs to exercise its RESERVE → COMMIT → CONSUME → RELEASE
 * ladder against a live PostgreSQL:
 *
 *   tenant → principal → legal_entity → company_code → site → warehouse
 *          → business_partner → supplier
 *          → commodity_category → item
 *          → chart_of_account → gl_account (expense)
 *          → cost_center
 *          → fiscal_period (covers CURRENT_DATE, status='open')
 *          → budget_profile → budget_allocation
 *
 * Plus three document factories that emit accounting_distribution rows
 * with budget_allocation_id populated, so the resolver finds them:
 *
 *   createPurchaseRequisition  — PR header + lines + AD rows
 *   createCommitmentFromPR     — PO header + procurement + lines + AD rows,
 *                                linked back to the source PR lines.
 *   createPurchaseInvoiceFromPO — PI header + lines + AD rows, optionally
 *                                tied to a commitment.
 *
 * The factories are intentionally light: they bypass the production
 * line-write services to keep the integration suite self-contained and
 * to stay decoupled from validation paths that would otherwise change
 * over time. The point of the suite is to verify the budget service
 * behaviour, not to re-test the line-write services.
 *
 * Filename intentionally lives under __tests__/_fixtures/ — the
 * underscore-prefixed directory keeps vitest from picking it up as a
 * spec while letting integration tests import it as a sibling helper.
 */

import { randomUUID, createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { handleApproveCommitment } from "../../p2p/purchase_order/commitment-approve.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

// ──────────────────────────────────────────────────────────────────────────────
// Scenario shape
// ──────────────────────────────────────────────────────────────────────────────

export interface BudgetScenario {
  suffix:              string;

  // Master IDs
  tenantId:            string;
  principalId:         string;
  legalEntityId:       string;
  companyCodeId:       string;
  siteId:              string;
  warehouseId:         string;
  businessPartnerId:   string;
  supplierId:          string;
  commodityCategoryId: string;
  itemId:              string;
  chartOfAccountId:    string;
  glAccountId:         string;
  costCenterId:        string;
  fiscalPeriodId:      string;
  budgetProfileId:     string;
  budgetAllocationId:  string;

  // Knobs (echoed back so tests can assert against them)
  fiscalYear:          number;
  periodNumber:        number;
  allocatedAmount:     number;
  overspendPolicy:     string;
  tolerancePct:        number;
  currencyCode:        string;

  // Tracking ids of documents created by the factories below.
  // Tests can read these to delete in cleanup, or skip when the suite
  // already cleans up by tenant_id.
  createdRequisitionIds: string[];
  createdCommitmentIds:  string[];
  createdInvoiceIds:     string[];
}

export interface SeedBudgetScenarioOpts {
  allocatedAmount?:     number;          // default 100_000
  overspendPolicy?:     "BLOCK" | "WARN" | "ALLOW" | "ESCALATE";
  tolerancePct?:        number;          // default 0
  allocationStatus?:    "active" | "draft" | "suspended" | "exhausted" | "closed" | "cancelled";
  fiscalPeriodStatus?:  "open" | "soft_close" | "hard_close" | "closed" | "future";
  fiscalYear?:          number;          // default current year
  periodNumber?:        number;          // default current month
  currencyCode?:        string;          // default 'USD'
  countryCode?:         string;          // default 'US'
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed
// ──────────────────────────────────────────────────────────────────────────────

export async function seedBudgetScenario(
  db:   AnyDb,
  opts: SeedBudgetScenarioOpts = {},
): Promise<BudgetScenario> {
  const now             = new Date();
  const fiscalYear      = opts.fiscalYear      ?? now.getUTCFullYear();
  const periodNumber    = opts.periodNumber    ?? Math.min(now.getUTCMonth() + 1, 12);
  const allocatedAmount = opts.allocatedAmount ?? 100_000;
  const overspendPolicy = opts.overspendPolicy ?? "BLOCK";
  const tolerancePct    = opts.tolerancePct    ?? 0;
  const allocationStatus   = opts.allocationStatus    ?? "active";
  const fiscalPeriodStatus = opts.fiscalPeriodStatus  ?? "open";
  const currencyCode    = opts.currencyCode    ?? "USD";
  const countryCode     = opts.countryCode     ?? "US";

  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);

  const s: BudgetScenario = {
    suffix,
    tenantId:            randomUUID(),
    principalId:         randomUUID(),
    legalEntityId:       randomUUID(),
    companyCodeId:       randomUUID(),
    siteId:              randomUUID(),
    warehouseId:         randomUUID(),
    businessPartnerId:   randomUUID(),
    supplierId:          randomUUID(),
    commodityCategoryId: randomUUID(),
    itemId:              randomUUID(),
    chartOfAccountId:    randomUUID(),
    glAccountId:         randomUUID(),
    costCenterId:        randomUUID(),
    fiscalPeriodId:      randomUUID(),
    budgetProfileId:     randomUUID(),
    budgetAllocationId:  randomUUID(),
    fiscalYear,
    periodNumber,
    allocatedAmount,
    overspendPolicy,
    tolerancePct,
    currencyCode,
    createdRequisitionIds: [],
    createdCommitmentIds:  [],
    createdInvoiceIds:     [],
  };

  // shared reference data is upsert-only — multiple parallel scenarios
  // share the same country/currency rows without conflict.
  await sql`INSERT INTO shared.country  (code, name, created_by) VALUES (${countryCode}, ${countryCode}, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(db);
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES (${currencyCode}, ${currencyCode}, 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(db);

  await sql`
    INSERT INTO master.tenant
      (id, code, name, display_name, realm_key, tenant_type, status, created_by)
    VALUES
      (${s.tenantId}::uuid, ${"budfx_" + suffix}, ${"BudFx " + suffix}, ${"BudFx " + suffix},
       'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.principal
      (id, tenant_id, code, name, principal_type, status, created_by)
    VALUES
      (${s.principalId}::uuid, ${s.tenantId}::uuid, ${"actor_" + suffix},
       'BudFx Actor', 'user', 'active', ${SYSTEM_ACTOR}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.legal_entity
      (id, tenant_id, code, name, entity_type, country_code,
       functional_currency, reporting_currency, status, created_by)
    VALUES
      (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'BudFx LE',
       'standalone', ${countryCode}, ${currencyCode}, ${currencyCode}, 'active',
       ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.company_code
      (id, tenant_id, code, name, legal_entity_id,
       functional_currency, country_code, status, created_by)
    VALUES
      (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'BudFx CC',
       ${s.legalEntityId}::uuid, ${currencyCode}, ${countryCode}, 'active',
       ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.site
      (id, tenant_id, code, name, company_code_id, site_type, country_code, status, created_by)
    VALUES
      (${s.siteId}::uuid, ${s.tenantId}::uuid, ${"SITE" + suffix}, 'BudFx Site',
       ${s.companyCodeId}::uuid, 'plant', ${countryCode}, 'active',
       ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.warehouse
      (id, tenant_id, code, name, site_id, status, created_by)
    VALUES
      (${s.warehouseId}::uuid, ${s.tenantId}::uuid, ${"WH" + suffix}, 'BudFx WH',
       ${s.siteId}::uuid, 'active', ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.business_partner
      (id, tenant_id, code, name, status, created_by)
    VALUES
      (${s.businessPartnerId}::uuid, ${s.tenantId}::uuid, ${"BP" + suffix}, 'BudFx BP',
       'active', ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.supplier
      (id, tenant_id, business_partner_id, supplier_code, status, created_by)
    VALUES
      (${s.supplierId}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId}::uuid,
       ${"SUP" + suffix}, 'active', ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.commodity_category
      (id, tenant_id, code, name, root_category_id, created_by)
    VALUES
      (${s.commodityCategoryId}::uuid, ${s.tenantId}::uuid, ${"CAT" + suffix}, 'BudFx Cat',
       ${s.commodityCategoryId}::uuid, ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.item
      (id, tenant_id, code, name, company_code_id, commodity_category_id,
       valuation_method, uom_code, status, created_by)
    VALUES
      (${s.itemId}::uuid, ${s.tenantId}::uuid, ${"ITM" + suffix}, 'BudFx Item',
       ${s.companyCodeId}::uuid, ${s.commodityCategoryId}::uuid,
       'weighted_avg', 'EA', 'active', ${s.principalId}::uuid)
  `.execute(db);

  // Chart + one expense account so accounting_distribution has something
  // to point at when source_doc_type='purchase_invoice_line' resolves a
  // posting account during the JE-atomicity test.
  //
  // Code MUST be 'COA-IFRS' (or 'COA-GAAP'): master.fn_resolve_intent_default_gl_account
  // dispatches on this code to pick ifrs_code vs usgaap_code from
  // business_intent.metadata->_coa_defaults. Any other code returns NULL
  // from the resolver and silently falls through to the category path.
  // chart_of_account.code is UNIQUE per (tenant_id, code); each test seeds
  // a fresh tenant so 'COA-IFRS' is unique within the test's tenant.
  await sql`
    INSERT INTO master.chart_of_account
      (id, tenant_id, code, name, status, created_by)
    VALUES
      (${s.chartOfAccountId}::uuid, ${s.tenantId}::uuid, 'COA-IFRS', 'BudFx COA (IFRS)',
       'active', ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.gl_account
      (id, tenant_id, code, name, chart_of_account_id,
       account_class, normal_balance, status, created_by)
    VALUES
      (${s.glAccountId}::uuid, ${s.tenantId}::uuid, ${"6100-" + suffix}, 'BudFx Expense',
       ${s.chartOfAccountId}::uuid, 'expense', 'debit', 'active', ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.cost_center
      (id, tenant_id, code, name, company_code_id, status, created_by)
    VALUES
      (${s.costCenterId}::uuid, ${s.tenantId}::uuid, ${"CCTR" + suffix}, 'BudFx CC',
       ${s.companyCodeId}::uuid, 'active', ${s.principalId}::uuid)
  `.execute(db);

  // Fiscal period covering today so deriveCurrentPeriodNumber resolves
  // without a closed-period failure (unless the test asks for one).
  const periodStart = formatDate(new Date(Date.UTC(fiscalYear, periodNumber - 1, 1)));
  const periodEnd   = formatDate(new Date(Date.UTC(fiscalYear, periodNumber, 0)));
  await sql`
    INSERT INTO master.fiscal_period
      (id, tenant_id, code, name, company_code_id,
       fiscal_year, period_number,
       start_date, end_date,
       status, created_by)
    VALUES
      (${s.fiscalPeriodId}::uuid, ${s.tenantId}::uuid,
       ${"FP-" + fiscalYear + "-" + String(periodNumber).padStart(2, "0") + "-" + suffix},
       ${"FP " + fiscalYear + "/" + periodNumber},
       ${s.companyCodeId}::uuid,
       ${fiscalYear}::smallint, ${periodNumber}::smallint,
       ${periodStart}::date, ${periodEnd}::date,
       ${fiscalPeriodStatus}::text, ${s.principalId}::uuid)
  `.execute(db);

  // Budget profile (envelope) — its running totals must be >= allocation totals
  // (the bp_reserved_lte_total constraint enforces it later when allocations
  // bump reserved_amount). Start the profile sized to the allocation.
  await sql`
    INSERT INTO master.budget_profile
      (id, tenant_id, code, name, company_code_id,
       currency_code, fiscal_year,
       total_amount, overspend_policy, status, created_by)
    VALUES
      (${s.budgetProfileId}::uuid, ${s.tenantId}::uuid,
       ${"BP-" + suffix}, ${"BudFx Profile " + suffix},
       ${s.companyCodeId}::uuid,
       ${currencyCode}::char(3), ${fiscalYear}::smallint,
       ${allocatedAmount}::numeric, ${overspendPolicy}::text,
       'active'::text, ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO master.budget_allocation
      (id, tenant_id, code, name,
       budget_profile_id, company_code_id,
       fiscal_year, currency_code,
       cost_center_id, gl_account_id,
       allocated_amount, overspend_policy, tolerance_pct,
       status, created_by)
    VALUES
      (${s.budgetAllocationId}::uuid, ${s.tenantId}::uuid,
       ${"BA-" + suffix}, ${"BudFx Allocation " + suffix},
       ${s.budgetProfileId}::uuid, ${s.companyCodeId}::uuid,
       ${fiscalYear}::smallint, ${currencyCode}::char(3),
       ${s.costCenterId}::uuid, ${s.glAccountId}::uuid,
       ${allocatedAmount}::numeric,
       ${overspendPolicy}::text, ${tolerancePct}::numeric,
       ${allocationStatus}::text, ${s.principalId}::uuid)
  `.execute(db);

  return s;
}

// ──────────────────────────────────────────────────────────────────────────────
// Document factories
// ──────────────────────────────────────────────────────────────────────────────

export interface LineSpec {
  quantity:  number;
  unitPrice: number;
  description?: string;
  /** Override the scenario's default allocation for this line's AD row.
   *  null means "AD row written with budget_allocation_id=NULL" (used for
   *  the BUDGET_ALLOCATION_NOT_FOUND test). */
  allocationOverride?: string | null;
}

export interface PurchaseRequisitionResult {
  requisitionId: string;
  lineIds:       string[];
}

export async function createPurchaseRequisition(
  db: AnyDb,
  s:  BudgetScenario,
  lines: LineSpec[],
  status: "draft" | "pending_approval" | "approved" = "pending_approval",
): Promise<PurchaseRequisitionResult> {
  const requisitionId = randomUUID();
  const lineIds: string[] = [];
  const totalEstimated   = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  await sql`
    INSERT INTO document.purchase_requisition
      (id, tenant_id, company_code_id, requisition_number,
       document_date, currency_code, base_currency_code, fiscal_year, period_number,
       total_estimated_amount, requested_by, status, created_by)
    VALUES
      (${requisitionId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       ${"PR-" + s.suffix + "-" + shortId()},
       CURRENT_DATE,
       ${s.currencyCode}::char(3), ${s.currencyCode}::char(3),
       ${s.fiscalYear}::smallint, ${s.periodNumber}::smallint,
       ${totalEstimated}::numeric,
       ${s.principalId}::uuid, ${status}::text, ${s.principalId}::uuid)
  `.execute(db);

  for (let i = 0; i < lines.length; i += 1) {
    const line   = lines[i]!;
    const lineId = randomUUID();
    lineIds.push(lineId);
    const lineNo = i + 1;

    await sql`
      INSERT INTO document.purchase_requisition_line
        (id, tenant_id, purchase_requisition_id, line_no,
         item_id, item_description, commodity_category_id,
         uom_code, quantity, estimated_unit_price, currency_code,
         created_by)
      VALUES
        (${lineId}::uuid, ${s.tenantId}::uuid, ${requisitionId}::uuid, ${lineNo}::smallint,
         ${s.itemId}::uuid, ${line.description ?? "BudFx PR line"}, ${s.commodityCategoryId}::uuid,
         'EA', ${line.quantity}::numeric, ${line.unitPrice}::numeric, ${s.currencyCode}::char(3),
         ${s.principalId}::uuid)
    `.execute(db);

    await insertDefaultAd(db, s, {
      sourceDocType: "purchase_requisition_line",
      sourceDocId:   requisitionId,
      sourceLineId:  lineId,
      amount:        line.quantity * line.unitPrice,
      allocationOverride: line.allocationOverride,
    });
  }

  s.createdRequisitionIds.push(requisitionId);
  return { requisitionId, lineIds };
}

export interface CommitmentResult {
  commitmentId: string;
  lineIds:      string[];
  procurementId: string;
}

export interface CommitmentLineSpec extends LineSpec {
  /** Optional link back to a requisition_line — populated when the PO is
   *  created from a PR (the production flow does this; we mirror it). */
  requisitionLineId?: string;
}

export async function createCommitmentFromPR(
  db: AnyDb,
  s:  BudgetScenario,
  prResult: PurchaseRequisitionResult,
  lineOverrides?: CommitmentLineSpec[],
  status: "draft" | "pending_approval" | "approved" = "pending_approval",
): Promise<CommitmentResult> {
  // Default: mirror each PR line 1:1 at the PR's estimated unit_price.
  const lines: CommitmentLineSpec[] = lineOverrides ?? (await loadPrLineSpecs(db, s, prResult));

  const commitmentId  = randomUUID();
  const procurementId = randomUUID();
  const lineIds: string[] = [];
  const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  await sql`
    INSERT INTO document.commitment
      (id, tenant_id, company_code_id,
       commitment_number, commitment_type,
       document_date, effective_date,
       currency_code, base_currency_code, total_amount,
       fiscal_year, period_number,
       site_id, status, description, created_by)
    VALUES
      (${commitmentId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       ${"PO-" + s.suffix + "-" + shortId()}, 'purchase_order',
       CURRENT_DATE, CURRENT_DATE,
       ${s.currencyCode}::char(3), ${s.currencyCode}::char(3), ${totalAmount}::numeric,
       ${s.fiscalYear}::smallint, ${s.periodNumber}::smallint,
       ${s.siteId}::uuid, ${status}::text, 'BudFx PO', ${s.principalId}::uuid)
  `.execute(db);

  await sql`
    INSERT INTO document.commitment_procurement
      (id, tenant_id, commitment_id, supplier_id, requisition_id, created_by)
    VALUES
      (${procurementId}::uuid, ${s.tenantId}::uuid, ${commitmentId}::uuid,
       ${s.supplierId}::uuid, ${prResult.requisitionId}::uuid, ${s.principalId}::uuid)
  `.execute(db);

  for (let i = 0; i < lines.length; i += 1) {
    const line   = lines[i]!;
    const lineId = randomUUID();
    lineIds.push(lineId);
    const lineNo = i + 1;

    await sql`
      INSERT INTO document.commitment_line
        (id, tenant_id, commitment_id, line_no,
         requisition_line_id,
         item_id, item_description, commodity_category_id,
         uom_code, quantity, unit_price, currency_code,
         site_id, status, created_by)
      VALUES
        (${lineId}::uuid, ${s.tenantId}::uuid, ${commitmentId}::uuid, ${lineNo}::smallint,
         ${line.requisitionLineId ?? null}::uuid,
         ${s.itemId}::uuid, ${line.description ?? "BudFx PO line"}, ${s.commodityCategoryId}::uuid,
         'EA', ${line.quantity}::numeric, ${line.unitPrice}::numeric, ${s.currencyCode}::char(3),
         ${s.siteId}::uuid, 'open', ${s.principalId}::uuid)
    `.execute(db);

    await insertDefaultAd(db, s, {
      sourceDocType: "commitment_line",
      sourceDocId:   commitmentId,
      sourceLineId:  lineId,
      amount:        line.quantity * line.unitPrice,
      allocationOverride: line.allocationOverride,
    });
  }

  s.createdCommitmentIds.push(commitmentId);
  return { commitmentId, lineIds, procurementId };
}

// ──────────────────────────────────────────────────────────────────────────────
// PO + schedule_line factories (B-S1)
// ──────────────────────────────────────────────────────────────────────────────

export interface ScheduleLineSpec {
  /** Defaults to the commitment_line's quantity. */
  scheduledQuantity?: number;
  /** ISO date string. Defaults to CURRENT_DATE. */
  scheduledDate?:     string;
  /** Default 'delivery' — also valid: 'billing_milestone' | 'release_window' */
  scheduleKind?:      "delivery" | "billing_milestone" | "release_window";
}

export async function createScheduleLineForCommitmentLine(
  db:                AnyDb,
  s:                 BudgetScenario,
  commitmentId:      string,
  commitmentLineId:  string,
  defaultQuantity:   number,
  opts:              ScheduleLineSpec = {},
): Promise<string> {
  const scheduleLineId   = randomUUID();
  const scheduledQty     = opts.scheduledQuantity ?? defaultQuantity;
  const scheduledDate    = opts.scheduledDate     ?? formatDate(new Date());
  const scheduleKind     = opts.scheduleKind      ?? "delivery";

  // source_doc_type / source_doc_id / source_line_id per
  // document/01v_tables_schedule_line.sql:36-39. Defaults at INSERT:
  //   is_current_version = true; status = 'active'; fulfilled_quantity = 0.
  // getCurrentSchedules filters on (is_current_version=true,
  // terminal_status IS NULL), which the defaults satisfy.
  await sql`
    INSERT INTO document.schedule_line
      (id, tenant_id, source_doc_type, source_doc_id, source_line_id,
       schedule_no, schedule_kind,
       scheduled_quantity, scheduled_date,
       created_by)
    VALUES
      (${scheduleLineId}::uuid, ${s.tenantId}::uuid,
       'commitment_line'::text, ${commitmentId}::uuid, ${commitmentLineId}::uuid,
       1::smallint, ${scheduleKind}::text,
       ${scheduledQty}::numeric, ${scheduledDate}::date,
       ${s.principalId}::uuid)
  `.execute(db);
  return scheduleLineId;
}

export interface ApprovedCommitmentResult extends CommitmentResult {
  scheduleLineIds:    string[];
  schedulesWritten:   number;
}

/**
 * Full PR → approved-PO flow with schedule_lines.
 *   1. createCommitmentFromPR(status='pending_approval')
 *   2. One schedule_line per commitment_line covering full qty
 *   3. handleApproveCommitment — writes ledger.commitment_schedule + stamps
 *      approved_at on the commitment header.
 *
 * The caller still needs to update document.commitment.status='approved'
 * if the test needs it — handleApproveCommitment leaves status alone per
 * the dispatcher contract (status updates are the transition's
 * responsibility). This factory stamps it for convenience.
 */
export async function createApprovedCommitmentWithSchedules(
  db:                AnyDb,
  s:                 BudgetScenario,
  prResult:          PurchaseRequisitionResult,
  lineOverrides?:    CommitmentLineSpec[],
  scheduleOverrides?: ScheduleLineSpec[],
): Promise<ApprovedCommitmentResult> {
  const po = await createCommitmentFromPR(db, s, prResult, lineOverrides, "pending_approval");

  // One schedule_line per commitment_line.
  const scheduleLineIds: string[] = [];
  const linesQuantities = await sql<{ id: string; quantity: number }>`
    SELECT id::text, quantity
      FROM document.commitment_line
     WHERE tenant_id    = ${s.tenantId}::uuid
       AND commitment_id = ${po.commitmentId}::uuid
     ORDER BY line_no
  `.execute(db);
  for (let i = 0; i < linesQuantities.rows.length; i += 1) {
    const row = linesQuantities.rows[i]!;
    const sid = await createScheduleLineForCommitmentLine(
      db, s, po.commitmentId, row.id, Number(row.quantity),
      scheduleOverrides?.[i] ?? {},
    );
    scheduleLineIds.push(sid);
  }

  // Find the real transition id so claimHookExecution's FK is satisfied.
  const transitionRow = await sql<{ id: string }>`
    SELECT lt.id::text
      FROM control.lifecycle_transition lt
      JOIN control.lifecycle       lc ON lc.id = lt.lifecycle_id AND lc.tenant_id IS NULL
      JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
      JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
     WHERE lc.code  = 'purchase_order'
       AND fs.code  = 'pending_approval'
       AND ts.code  = 'approved'
       AND lt.tenant_id IS NULL
     LIMIT 1
  `.execute(db);
  const transitionId = transitionRow.rows[0]?.id;
  if (!transitionId) {
    throw new Error(
      "createApprovedCommitmentWithSchedules: no purchase_order pending_approval→approved transition seeded. " +
      "Verify db:setup:system ran.",
    );
  }

  const executionToken = createHash("sha256")
    .update(`${transitionId}:${po.commitmentId}:1`)
    .digest("hex");

  const approveResult = await handleApproveCommitment(db, {
    tenantId:       s.tenantId,
    commitmentId:   po.commitmentId,
    principalId:    s.principalId,
    executionToken,
    transitionId,
  });
  if (!approveResult.ok) {
    throw new Error(
      `createApprovedCommitmentWithSchedules: handleApproveCommitment failed: ` +
      `${approveResult.error?.code} ${approveResult.error?.message}`,
    );
  }

  // Stamp commitment.status='approved' so downstream matching code sees
  // the PO as ready for matching against an invoice.
  await sql`
    UPDATE document.commitment
       SET status            = 'approved',
           status_changed_at = now(),
           status_changed_by = ${s.principalId}::uuid,
           updated_at        = now(),
           updated_by        = ${s.principalId}::uuid
     WHERE id        = ${po.commitmentId}::uuid
       AND tenant_id = ${s.tenantId}::uuid
  `.execute(db);

  return {
    ...po,
    scheduleLineIds,
    schedulesWritten: approveResult.schedulesWritten ?? 0,
  };
}

export interface PurchaseInvoiceResult {
  invoiceId: string;
  lineIds:   string[];
}

export interface InvoiceLineSpec extends LineSpec {
  commitmentLineId?: string;
  /** Per-line business_intent_id. Used by handlePostInvoice's dominant-intent
   *  routing (Step 1 of deriveApInvoiceProfile) and by FROM_INTENT account
   *  resolution in buildJeLinesFromProfile. */
  businessIntentId?: string;
}

export interface CreateInvoiceOpts {
  /** When set, the PI is bound to this PO (PO-based flow). */
  commitmentId?:  string;
  status?:        "draft" | "pending_approval" | "approved" | "posted";
  invoiceSource?: "po_based" | "non_po";
  /** Backdated PI support (audit P5-S2). When set, override the scenario's
   *  default fiscal_year / period_number / posting_date so the test can
   *  point the PI at a period different from CURRENT_DATE's. */
  fiscalYear?:    number;
  periodNumber?:  number;
  postingDate?:   string;   // ISO 'YYYY-MM-DD'
  /** invoice_type column on document.purchase_invoice. Default 'standard'.
   *  Credit-note inversion: pass 'credit_note' AND set isCreditNote=true. */
  invoiceType?:   string;
  isCreditNote?:  boolean;
}

export async function createPurchaseInvoiceFromPO(
  db: AnyDb,
  s:  BudgetScenario,
  lines: InvoiceLineSpec[],
  opts: CreateInvoiceOpts = {},
): Promise<PurchaseInvoiceResult> {
  const invoiceId = randomUUID();
  const lineIds: string[] = [];
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const fiscalYear   = opts.fiscalYear   ?? s.fiscalYear;
  const periodNumber = opts.periodNumber ?? s.periodNumber;
  const postingDate  = opts.postingDate  ?? null;

  // line_count is NOT NULL DEFAULT 0 on document.purchase_invoice and the
  // posting service refuses lines.length=0 invoices by reading this column,
  // so the fixture must populate it. Same idea on the line: gross_amount
  // is NOT NULL DEFAULT 0 and the invariant checker compares it against
  // header.total_amount, so per-line gross must be set when subtotal != 0.
  await sql`
    INSERT INTO document.purchase_invoice
      (id, tenant_id, company_code_id,
       code, invoice_source, invoice_type, is_credit_note,
       supplier_id, supplier_invoice_number, supplier_invoice_date,
       commitment_id,
       document_date, posting_date, received_date,
       currency_code, base_currency_code,
       subtotal_amount, total_amount,
       line_count,
       fiscal_year, period_number,
       status, created_by)
    VALUES
      (${invoiceId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       ${"PI-" + s.suffix + "-" + shortId()},
       ${opts.invoiceSource ?? (opts.commitmentId ? "po_based" : "non_po")}::text,
       ${opts.invoiceType ?? "standard"}::text,
       ${opts.isCreditNote ?? false}::boolean,
       ${s.supplierId}::uuid,
       ${"SUPINV-" + shortId()}, COALESCE(${postingDate}::date, CURRENT_DATE),
       ${opts.commitmentId ?? null}::uuid,
       COALESCE(${postingDate}::date, CURRENT_DATE),
       COALESCE(${postingDate}::date, CURRENT_DATE),
       COALESCE(${postingDate}::date, CURRENT_DATE),
       ${s.currencyCode}::char(3), ${s.currencyCode}::char(3),
       ${subtotal}::numeric, ${subtotal}::numeric,
       ${lines.length}::smallint,
       ${fiscalYear}::smallint, ${periodNumber}::smallint,
       ${opts.status ?? "approved"}::text, ${s.principalId}::uuid)
  `.execute(db);

  for (let i = 0; i < lines.length; i += 1) {
    const line   = lines[i]!;
    const lineId = randomUUID();
    lineIds.push(lineId);
    const lineNo = i + 1;

    const lineGross = line.quantity * line.unitPrice;  // no tax in this fixture
    await sql`
      INSERT INTO document.purchase_invoice_line
        (id, tenant_id, purchase_invoice_id, line_no,
         commitment_line_id,
         item_id, item_description, commodity_category_id, business_intent_id,
         uom_code, quantity, unit_price, currency_code,
         gross_amount,
         created_by)
      VALUES
        (${lineId}::uuid, ${s.tenantId}::uuid, ${invoiceId}::uuid, ${lineNo}::smallint,
         ${line.commitmentLineId ?? null}::uuid,
         ${s.itemId}::uuid, ${line.description ?? "BudFx PI line"}, ${s.commodityCategoryId}::uuid,
         ${line.businessIntentId ?? null}::uuid,
         'EA', ${line.quantity}::numeric, ${line.unitPrice}::numeric, ${s.currencyCode}::char(3),
         ${lineGross}::numeric,
         ${s.principalId}::uuid)
    `.execute(db);

    await insertDefaultAd(db, s, {
      sourceDocType: "purchase_invoice_line",
      sourceDocId:   invoiceId,
      sourceLineId:  lineId,
      amount:        line.quantity * line.unitPrice,
      glAccountId:   s.glAccountId,
      allocationOverride: line.allocationOverride,
    });
  }

  s.createdInvoiceIds.push(invoiceId);
  return { invoiceId, lineIds };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface AdInsertOpts {
  sourceDocType: "purchase_requisition_line" | "commitment_line" | "purchase_invoice_line";
  sourceDocId:   string;
  sourceLineId:  string;
  amount:        number;
  glAccountId?:  string;
  /** undefined → use scenario default; null → write NULL (unresolved test);
   *  string    → override allocation (multi-allocation test). */
  allocationOverride?: string | null;
}

async function insertDefaultAd(db: AnyDb, s: BudgetScenario, opts: AdInsertOpts): Promise<void> {
  const allocationId =
    opts.allocationOverride === undefined ? s.budgetAllocationId : opts.allocationOverride;

  await sql`
    INSERT INTO document.accounting_distribution
      (tenant_id, source_doc_type, source_doc_id, source_line_id,
       distribution_no, distribution_basis, split_pct,
       distributed_amount, currency_code,
       account_source, gl_account_id,
       cost_center_id, budget_allocation_id,
       created_by)
    VALUES
      (${s.tenantId}::uuid, ${opts.sourceDocType}::text, ${opts.sourceDocId}::uuid, ${opts.sourceLineId}::uuid,
       1::smallint, 'PERCENT'::text, 100.0000::numeric,
       ${opts.amount}::numeric, ${s.currencyCode}::char(3),
       ${opts.glAccountId ? "OVERRIDE" : "PENDING"}::text, ${opts.glAccountId ?? null}::uuid,
       ${s.costCenterId}::uuid, ${allocationId}::uuid,
       ${s.principalId}::uuid)
  `.execute(db);
}

async function loadPrLineSpecs(
  db: AnyDb,
  s:  BudgetScenario,
  prResult: PurchaseRequisitionResult,
): Promise<CommitmentLineSpec[]> {
  const rows = await sql<{
    id: string; quantity: number; estimated_unit_price: number; item_description: string;
  }>`
    SELECT id::text, quantity, estimated_unit_price, item_description
      FROM document.purchase_requisition_line
     WHERE tenant_id = ${s.tenantId}::uuid
       AND purchase_requisition_id = ${prResult.requisitionId}::uuid
     ORDER BY line_no
  `.execute(db);
  return rows.rows.map((r) => ({
    quantity:           Number(r.quantity),
    unitPrice:          Number(r.estimated_unit_price),
    description:        r.item_description,
    requisitionLineId:  r.id,
  }));
}

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle transition lookup
// ──────────────────────────────────────────────────────────────────────────────
//
// The budget service claims a row in control.lifecycle_transition_execution
// which carries a NOT NULL FK to control.lifecycle_transition(id). Tests
// can't synthesise a uuid — they need a real platform-seeded transition.
//
// `findP2pTransitionId` returns the id of the platform-global transition for
// a given lifecycle code + from-state code + to-state code. Throws when the
// lookup misses so the failure is obvious in CI.

export interface FindTransitionOpts {
  lifecycleCode: "purchase_requisition" | "purchase_order" | "purchase_invoice"
               | "purchase_order_confirmation" | "delivery_note"
               | "receipt" | "service_sheet" | "payment_entry";
  fromCode: string;
  toCode:   string;
}

export async function findP2pTransitionId(
  db:   AnyDb,
  opts: FindTransitionOpts,
): Promise<string> {
  const result = await sql<{ id: string }>`
    SELECT lt.id::text AS id
      FROM control.lifecycle_transition lt
      JOIN control.lifecycle       lc ON lc.id = lt.lifecycle_id AND lc.tenant_id IS NULL
      JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
      JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
     WHERE lc.code   = ${opts.lifecycleCode}::text
       AND fs.code   = ${opts.fromCode}::text
       AND ts.code   = ${opts.toCode}::text
       AND lt.tenant_id IS NULL
     LIMIT 1
  `.execute(db);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(
      `findP2pTransitionId: no transition for lifecycle='${opts.lifecycleCode}' ` +
      `${opts.fromCode}→${opts.toCode}. Verify db:setup:system ran.`,
    );
  }
  return id;
}

// ──────────────────────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────────────────────

export async function cleanupBudgetScenario(db: AnyDb, s: BudgetScenario): Promise<void> {
  // Tear down in FK-safe order. Best-effort; swallow + log so a partially
  // seeded scenario from a failed test can still drain.
  const stmts: Array<() => Promise<unknown>> = [
    // Ledger artefacts the budget service might have written.
    () => sql`DELETE FROM ledger.budget_transaction WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM control.lifecycle_transition_execution WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    // Document AD rows then headers + lines.
    () => sql`DELETE FROM document.accounting_distribution WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.purchase_invoice_line WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.purchase_invoice WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.commitment_line WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.commitment_procurement WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.commitment WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.purchase_requisition_line WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM document.purchase_requisition WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    // Master.
    () => sql`DELETE FROM master.budget_allocation WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.budget_profile WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.fiscal_period WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.cost_center WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.gl_account WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.chart_of_account WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.item WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.commodity_category WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.supplier WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.business_partner WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.warehouse WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.site WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.company_code WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.legal_entity WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.principal WHERE tenant_id = ${s.tenantId}::uuid`.execute(db),
    () => sql`DELETE FROM master.tenant WHERE id = ${s.tenantId}::uuid`.execute(db),
  ];

  for (const stmt of stmts) {
    try {
      await stmt();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[budget-fixture] cleanup error:", err instanceof Error ? err.message : err);
    }
  }
}
