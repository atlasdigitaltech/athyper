/**
 * Finance Setup — Phase 2 mutation service.
 *
 * All mutations:
 *   • Resolve companyCode → companyCodeId server-side (F5 audit — code is public;
 *     UUID is internal only).
 *   • Return typed errors (MissingTenantError / NotFoundError / etc.) with
 *     .status for HTTP mapping in the route layer.
 *   • Emit a log.activity_log row via writeFinanceSetupAudit.
 *   • Refresh master.mv_company_postable_account after operations that shift
 *     control coverage — required so the readiness engine sees fresh coverage.
 *
 * Mutations covered in Phase 2:
 *   • assignGlControl        — insert into company_code_gl_account
 *   • updateGlControl        — update posting flags / requires_*
 *   • deactivateGlControl    — delete or soft-flag (posting_allowed=false)
 *   • setPrimaryChartAssignment — flip is_primary on operating assignment
 *   • Company Book assignment CRUD + explicit Company default command
 *   • toggleHouseBank        — flip bank_account_house_config.status
 */

import { sql, type Kysely } from "kysely";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

// ─── Typed errors ───────────────────────────────────────────────────────────

export class MissingTenantError extends Error {
  code   = "MISSING_TENANT";
  status = 400;
  constructor() { super("tenant_id is required"); }
}
export class MissingActorError extends Error {
  code   = "MISSING_ACTOR";
  status = 403;
  constructor() { super("principal could not be resolved"); }
}
export class CompanyNotFoundError extends Error {
  code   = "COMPANY_NOT_FOUND";
  status = 404;
  constructor(code: string) { super(`No company with code=${code} in tenant.`); }
}
export class GlAccountNotFoundError extends Error {
  code   = "GL_ACCOUNT_NOT_FOUND";
  status = 404;
  constructor(code: string) { super(`No GL account with code=${code} in operating chart.`); }
}
export class GlControlAlreadyExistsError extends Error {
  code   = "GL_CONTROL_ALREADY_EXISTS";
  status = 409;
  constructor() { super("A control row already exists for this (company, account)."); }
}
export class ResourceNotFoundError extends Error {
  code:   string;
  status: number;
  constructor(code: string, message: string) {
    super(message);
    this.code   = code;
    this.status = 404;
  }
}
export class FinanceSetupConflictError extends Error {
  code: string;
  status = 409;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export class FinanceSetupValidationError extends Error {
  code = "INVALID_INPUT";
  status = 400;
}

const CHART_ASSIGNMENT_TYPES = new Set(["operating", "local", "group", "reporting"]);

export function validateChartAssignmentType(value: string): void {
  if (!CHART_ASSIGNMENT_TYPES.has(value)) {
    throw new FinanceSetupValidationError(`Unsupported Chart assignment type: ${value}.`);
  }
}


// ─── Helpers ────────────────────────────────────────────────────────────────

async function resolveCompanyCodeId(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
): Promise<string> {
  const { rows } = await sql<{ id: string }>`
    SELECT id FROM master.company_code
     WHERE tenant_id = ${tenantId}::uuid AND code = ${companyCode}
     LIMIT 1
  `.execute(db);
  const id = rows[0]?.id;
  if (!id) throw new CompanyNotFoundError(companyCode);
  return id;
}

async function refreshCompanyPostableAccountMv(db: AnyDb): Promise<void> {
  await sql`SELECT master.fn_refresh_mv_cpa()`.execute(db);
}

export async function invalidateFinanceSetupReadiness(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  await sql`
    UPDATE governance.cycle_certification cert
       SET status = 'SUPERSEDED',
           supersession_reason = ${reason},
           updated_at = now(),
           updated_by = ${actorId}::uuid
      FROM governance.cycle_run cr
      JOIN governance.cycle_type ct
        ON ct.tenant_id = cr.tenant_id AND ct.id = cr.cycle_type_id
      JOIN master.company_code cc
        ON cc.tenant_id = cr.tenant_id AND cc.code = cr.entity_code
     WHERE cert.tenant_id = ${tenantId}::uuid
       AND cert.cycle_run_id = cr.id
       AND cc.id = ${companyCodeId}::uuid
       AND ct.type_code = 'FIN_SETUP_READINESS'
       AND cert.cert_code = 'FINANCE_POSTING_READY'
       AND cert.status IN ('CERTIFIED', 'ATTESTED')
  `.execute(db);
}


// ─── assignGlControl ────────────────────────────────────────────────────────

export interface AssignGlControlInput {
  tenantId:         string;
  actorId:          string;
  companyCode:      string;
  glAccountCode:    string;
  glAccountId?:     string;
  postingAllowed?:  boolean;
  blockedForManual?:boolean;
  blockedForAuto?:  boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
  defaultCostCenterId?:  string | null;
  defaultSiteId?:        string | null;
  correlationId?:        string;
}

export interface AssignGlControlResult {
  controlId:     string;
  glAccountId:   string;
  companyCodeId: string;
}

export async function assignGlControl(
  db: AnyDb,
  input: AssignGlControlInput,
): Promise<AssignGlControlResult> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId)  throw new MissingActorError();

  return db.transaction().execute(async (trx) => {
    const companyCodeId = await resolveCompanyCodeId(trx, input.tenantId, input.companyCode);

    // Verify the account is a posting node reached through an active, effective
    // Company Chart assignment. The MV cannot be used here because a blocked
    // existing control is intentionally absent from that projection.
    const acctQ = await sql<{ gl_account_id: string; already: boolean }>`
      SELECT ga.id AS gl_account_id,
             EXISTS (
               SELECT 1 FROM master.company_code_gl_account ccga
                WHERE ccga.company_code_id = ${companyCodeId}::uuid
                  AND ccga.gl_account_id   = ga.id
                  AND ccga.status = 'active'
             ) AS already
        FROM master.company_code_chart_assignment a
        JOIN master.chart_of_account coa ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id
        JOIN master.gl_account ga ON ga.tenant_id = coa.tenant_id AND ga.chart_of_account_id = coa.id
       WHERE a.tenant_id = ${input.tenantId}::uuid AND a.company_code_id = ${companyCodeId}::uuid
         AND a.status = 'active' AND coa.status = 'active' AND ga.status = 'active'
         AND ga.node_type = 'posting'
         AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
         AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
         AND (${input.glAccountId ?? null}::uuid IS NULL OR ga.id = ${input.glAccountId ?? null}::uuid)
         AND (${input.glAccountId ?? null}::uuid IS NOT NULL OR ga.code = ${input.glAccountCode})
       LIMIT 1
    `.execute(trx);
    const acct = acctQ.rows[0];
    if (!acct) throw new GlAccountNotFoundError(input.glAccountCode);
    if (acct.already) throw new GlControlAlreadyExistsError();

    const insertQ = await sql<{ id: string }>`
      INSERT INTO master.company_code_gl_account (
        tenant_id, company_code_id, gl_account_id,
        posting_allowed,
        blocked_for_manual, blocked_for_auto,
        requires_cost_center, requires_profit_center, requires_project,
        reconciliation_type, tax_category, default_cost_center_id, default_site_id,
        status, created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${companyCodeId}::uuid, ${acct.gl_account_id}::uuid,
        ${input.postingAllowed ?? true},
        ${input.blockedForManual ?? false}, ${input.blockedForAuto ?? false},
        ${input.requiresCostCenter ?? false}, ${input.requiresProfitCenter ?? false}, ${input.requiresProject ?? false},
        ${input.reconciliationType ?? null}, ${input.taxCategory ?? null},
        ${input.defaultCostCenterId ?? null}::uuid, ${input.defaultSiteId ?? null}::uuid,
        'active', ${input.actorId}::uuid
      )
      ON CONFLICT (tenant_id, company_code_id, gl_account_id) DO UPDATE
        SET posting_allowed = EXCLUDED.posting_allowed,
            blocked_for_manual = EXCLUDED.blocked_for_manual,
            blocked_for_auto = EXCLUDED.blocked_for_auto,
            requires_cost_center = EXCLUDED.requires_cost_center,
            requires_profit_center = EXCLUDED.requires_profit_center,
            requires_project = EXCLUDED.requires_project,
            reconciliation_type = EXCLUDED.reconciliation_type,
            tax_category = EXCLUDED.tax_category,
            default_cost_center_id = EXCLUDED.default_cost_center_id,
            default_site_id = EXCLUDED.default_site_id,
            status = 'active', updated_at = now(), updated_by = ${input.actorId}::uuid
      RETURNING id
    `.execute(trx);
    const controlId = insertQ.rows[0]!.id;

    await writeFinanceSetupAudit(trx, {
      tenantId:      input.tenantId,
      actorId:       input.actorId,
      companyCodeId,
      activityType:  "finance_setup.control_assigned",
      entityType:    "company_code_gl_account",
      entityId:      controlId,
      detail: {
        gl_account_code:   input.glAccountCode,
        company_code:      input.companyCode,
        posting_allowed:   input.postingAllowed ?? true,
        blocked_for_manual:input.blockedForManual ?? false,
        blocked_for_auto:  input.blockedForAuto ?? false,
      },
      correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company GL control changed");

    return { controlId, glAccountId: acct.gl_account_id, companyCodeId };
  }).then(async (result) => {
    await refreshCompanyPostableAccountMv(db);
    return result;
  });
}


// ─── updateGlControl ────────────────────────────────────────────────────────

export interface UpdateGlControlInput {
  tenantId:              string;
  actorId:               string;
  controlId:             string;
  companyCode:           string;
  expectedUpdatedAt:     string | null;
  postingAllowed?:       boolean;
  blockedForManual?:     boolean;
  blockedForAuto?:       boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
  defaultCostCenterId?:  string | null;
  defaultSiteId?:        string | null;
  correlationId?:        string;
}

export async function updateGlControl(
  db: AnyDb,
  input: UpdateGlControlInput,
): Promise<{ controlId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId)  throw new MissingActorError();

  return db.transaction().execute(async (trx) => {
    // Load current values so we can COALESCE and audit changed columns.
    const currentQ = await sql<{
      company_code_id:        string;
      gl_account_id:          string;
      posting_allowed:        boolean;
      blocked_for_manual:     boolean;
      blocked_for_auto:       boolean;
      requires_cost_center:   boolean;
      requires_profit_center: boolean;
      requires_project:       boolean;
      reconciliation_type:    string | null;
      tax_category:           string | null;
      default_cost_center_id: string | null;
      default_site_id:        string | null;
      updated_at:             string | null;
    }>`
      SELECT ctl.company_code_id, ctl.gl_account_id,
             posting_allowed, blocked_for_manual, blocked_for_auto,
             requires_cost_center, requires_profit_center, requires_project,
             reconciliation_type, tax_category, default_cost_center_id, default_site_id, updated_at::text
        FROM master.company_code_gl_account ctl
        JOIN master.company_code cc ON cc.tenant_id = ctl.tenant_id AND cc.id = ctl.company_code_id
       WHERE ctl.tenant_id = ${input.tenantId}::uuid
         AND ctl.id = ${input.controlId}::uuid AND lower(cc.code) = lower(${input.companyCode})
         AND EXISTS (
           SELECT 1 FROM master.gl_account ga
           JOIN master.company_code_chart_assignment a
             ON a.tenant_id = ga.tenant_id AND a.chart_of_account_id = ga.chart_of_account_id
            AND a.company_code_id = ctl.company_code_id
          WHERE ga.id = ctl.gl_account_id AND ga.status = 'active' AND ga.node_type = 'posting'
            AND a.status = 'active'
            AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
            AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
         )
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("GL_CONTROL_NOT_FOUND", `No control row with id=${input.controlId}.`);
    }
    if ((current.updated_at ?? null) !== input.expectedUpdatedAt) {
      throw new FinanceSetupConflictError("STALE_GL_CONTROL", "The GL control changed after it was loaded. Refresh and try again.");
    }

    const patch = {
      posting_allowed:        input.postingAllowed        ?? current.posting_allowed,
      blocked_for_manual:     input.blockedForManual      ?? current.blocked_for_manual,
      blocked_for_auto:       input.blockedForAuto        ?? current.blocked_for_auto,
      requires_cost_center:   input.requiresCostCenter    ?? current.requires_cost_center,
      requires_profit_center: input.requiresProfitCenter  ?? current.requires_profit_center,
      requires_project:       input.requiresProject       ?? current.requires_project,
      reconciliation_type:    input.reconciliationType   === undefined ? current.reconciliation_type : input.reconciliationType,
      tax_category:           input.taxCategory          === undefined ? current.tax_category        : input.taxCategory,
      default_cost_center_id: input.defaultCostCenterId  === undefined ? current.default_cost_center_id : input.defaultCostCenterId,
      default_site_id:        input.defaultSiteId        === undefined ? current.default_site_id : input.defaultSiteId,
    };

    await sql`
      UPDATE master.company_code_gl_account
         SET posting_allowed        = ${patch.posting_allowed},
             blocked_for_manual     = ${patch.blocked_for_manual},
             blocked_for_auto       = ${patch.blocked_for_auto},
             requires_cost_center   = ${patch.requires_cost_center},
             requires_profit_center = ${patch.requires_profit_center},
             requires_project       = ${patch.requires_project},
             reconciliation_type    = ${patch.reconciliation_type},
             tax_category           = ${patch.tax_category},
             default_cost_center_id  = ${patch.default_cost_center_id}::uuid,
             default_site_id         = ${patch.default_site_id}::uuid,
             updated_at             = now(),
             updated_by             = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.controlId}::uuid
    `.execute(trx);

    await writeFinanceSetupAudit(trx, {
      tenantId:      input.tenantId,
      actorId:       input.actorId,
      companyCodeId: current.company_code_id,
      activityType:  "finance_setup.control_updated",
      entityType:    "company_code_gl_account",
      entityId:      input.controlId,
      detail: {
        before: current,
        after:  patch,
      },
      correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, current.company_code_id, input.actorId, "Company GL control changed");

    return { controlId: input.controlId };
  }).then(async (result) => {
    await refreshCompanyPostableAccountMv(db);
    return result;
  });
}


// ─── deactivateGlControl ────────────────────────────────────────────────────

export interface DeactivateGlControlInput {
  tenantId:      string;
  actorId:       string;
  controlId:     string;
  companyCode:   string;
  expectedUpdatedAt: string | null;
  correlationId?: string;
}

export async function deactivateGlControl(
  db: AnyDb,
  input: DeactivateGlControlInput,
): Promise<{ controlId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId)  throw new MissingActorError();

  return db.transaction().execute(async (trx) => {
    const currentQ = await sql<{
      company_code_id: string;
      posting_allowed: boolean;
      updated_at: string | null;
    }>`
      SELECT ctl.company_code_id, ctl.posting_allowed, ctl.updated_at::text
        FROM master.company_code_gl_account ctl
        JOIN master.company_code cc ON cc.tenant_id = ctl.tenant_id AND cc.id = ctl.company_code_id
       WHERE ctl.tenant_id = ${input.tenantId}::uuid
         AND ctl.id = ${input.controlId}::uuid AND lower(cc.code) = lower(${input.companyCode})
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("GL_CONTROL_NOT_FOUND", `No control row with id=${input.controlId}.`);
    }
    if ((current.updated_at ?? null) !== input.expectedUpdatedAt) {
      throw new FinanceSetupConflictError("STALE_GL_CONTROL", "The GL control changed after it was loaded. Refresh and try again.");
    }

    // Soft deactivate and retain the row for audit/re-activation.
    await sql`
      UPDATE master.company_code_gl_account
         SET posting_allowed = false,
             status          = 'inactive',
             updated_at      = now(),
             updated_by      = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.controlId}::uuid
    `.execute(trx);

    await writeFinanceSetupAudit(trx, {
      tenantId:      input.tenantId,
      actorId:       input.actorId,
      companyCodeId: current.company_code_id,
      activityType:  "finance_setup.control_deactivated",
      entityType:    "company_code_gl_account",
      entityId:      input.controlId,
      detail: { previous_posting_allowed: current.posting_allowed },
      correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, current.company_code_id, input.actorId, "Company GL control deactivated");

    return { controlId: input.controlId };
  }).then(async (result) => {
    await refreshCompanyPostableAccountMv(db);
    return result;
  });
}

// ─── Chart assignment CRUD ─────────────────────────────────────────────────

export interface SaveChartAssignmentInput {
  tenantId: string;
  actorId: string;
  companyCode: string;
  chartId: string;
  assignmentType: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isPrimary?: boolean;
  status?: "active" | "inactive";
  expectedUpdatedAt?: string | null;
  correlationId?: string;
}

async function lockCompany(db: AnyDb, tenantId: string, companyCode: string): Promise<string> {
  const { rows } = await sql<{ id: string }>`
    SELECT id FROM master.company_code
     WHERE tenant_id = ${tenantId}::uuid AND lower(code) = lower(${companyCode})
     FOR UPDATE
  `.execute(db);
  const id = rows[0]?.id;
  if (!id) throw new CompanyNotFoundError(companyCode);
  return id;
}

async function operatingState(db: AnyDb, tenantId: string, companyCodeId: string): Promise<{ active: number; primary: number }> {
  const { rows } = await sql<{ active_count: number; primary_count: number }>`
    SELECT count(*) FILTER (WHERE status = 'active'
             AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
             AND (effective_to IS NULL OR effective_to >= CURRENT_DATE))::int AS active_count,
           count(*) FILTER (WHERE status = 'active' AND is_primary
             AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
             AND (effective_to IS NULL OR effective_to >= CURRENT_DATE))::int AS primary_count
      FROM master.company_code_chart_assignment
     WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid
       AND assignment_type = 'operating'
  `.execute(db);
  return { active: rows[0]?.active_count ?? 0, primary: rows[0]?.primary_count ?? 0 };
}

function assertDateOrder(effectiveFrom?: string | null, effectiveTo?: string | null): void {
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
    throw new FinanceSetupValidationError("effectiveFrom must be on or before effectiveTo.");
  }
}

export function assertPrimaryOperatingInvariant(before: { active: number; primary: number }, after: { active: number; primary: number }): void {
  if (before.active > 0 && after.active === 0) {
    throw new FinanceSetupConflictError(
      "FINAL_OPERATING_CHART",
      "The final active operating Chart cannot be deactivated without first activating a replacement.",
    );
  }
  if (after.active > 0 && after.primary !== 1) {
    throw new FinanceSetupConflictError(
      "PRIMARY_OPERATING_CHART_REQUIRED",
      "Exactly one active, effective primary operating Chart is required.",
    );
  }
}

async function ensureChartIsActive(db: AnyDb, tenantId: string, chartId: string): Promise<void> {
  const { rows } = await sql<{ id: string }>`
    SELECT id FROM master.chart_of_account
     WHERE tenant_id = ${tenantId}::uuid AND id = ${chartId}::uuid AND status = 'active'
  `.execute(db);
  if (!rows[0]) throw new ResourceNotFoundError("ACTIVE_CHART_NOT_FOUND", `No active Chart with id=${chartId}.`);
}

export async function createChartAssignment(
  db: AnyDb,
  input: SaveChartAssignmentInput,
): Promise<{ assignmentId: string }> {
  validateChartAssignmentType(input.assignmentType);
  if (input.status && !["active", "inactive"].includes(input.status)) {
    throw new FinanceSetupValidationError(`Unsupported Chart assignment status: ${input.status}.`);
  }
  assertDateOrder(input.effectiveFrom, input.effectiveTo);
  const result = await db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    await ensureChartIsActive(trx, input.tenantId, input.chartId);
    const before = await operatingState(trx, input.tenantId, companyCodeId);
    const existing = await sql<{ id: string }>`
      SELECT id FROM master.company_code_chart_assignment
       WHERE tenant_id = ${input.tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid
         AND chart_of_account_id = ${input.chartId}::uuid AND assignment_type = ${input.assignmentType}
    `.execute(trx);
    if (existing.rows[0]) {
      throw new FinanceSetupConflictError("CHART_ASSIGNMENT_EXISTS", "This Chart is already assigned with the selected type.");
    }
    const makePrimary = input.status !== "inactive"
      && (input.isPrimary === true || (input.assignmentType === "operating" && before.active === 0));
    if (makePrimary) {
      await sql`UPDATE master.company_code_chart_assignment SET is_primary = false, updated_at = now(), updated_by = ${input.actorId}::uuid
        WHERE tenant_id = ${input.tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid
          AND assignment_type = ${input.assignmentType}`.execute(trx);
    }
    const { rows } = await sql<{ id: string }>`
      INSERT INTO master.company_code_chart_assignment (
        tenant_id, code, name, company_code_id, chart_of_account_id, assignment_type,
        is_primary, effective_from, effective_to, status, created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${`${input.companyCode}:${input.assignmentType}:${input.chartId}`},
        ${`${input.companyCode} ${input.assignmentType} Chart`}, ${companyCodeId}::uuid, ${input.chartId}::uuid,
        ${input.assignmentType}, ${makePrimary}, ${input.effectiveFrom ?? null}::date,
        ${input.effectiveTo ?? null}::date, ${input.status ?? "active"}, ${input.actorId}::uuid
      ) RETURNING id
    `.execute(trx);
    const after = await operatingState(trx, input.tenantId, companyCodeId);
    assertPrimaryOperatingInvariant(before, after);
    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
      activityType: "finance_setup.chart_assignment_changed", entityType: "company_code_chart_assignment",
      entityId: rows[0]!.id, detail: { action: "create", assignment_type: input.assignmentType, chart_id: input.chartId },
      correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company Chart assignment changed");
    return { assignmentId: rows[0]!.id };
  });
  await refreshCompanyPostableAccountMv(db);
  return result;
}

export async function updateChartAssignment(
  db: AnyDb,
  assignmentId: string,
  input: SaveChartAssignmentInput,
): Promise<{ assignmentId: string }> {
  validateChartAssignmentType(input.assignmentType);
  if (input.status && !["active", "inactive"].includes(input.status)) {
    throw new FinanceSetupValidationError(`Unsupported Chart assignment status: ${input.status}.`);
  }
  assertDateOrder(input.effectiveFrom, input.effectiveTo);
  const result = await db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    await ensureChartIsActive(trx, input.tenantId, input.chartId);
    const before = await operatingState(trx, input.tenantId, companyCodeId);
    const { rows } = await sql<{ updated_at: string | null }>`
      SELECT updated_at::text FROM master.company_code_chart_assignment
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${assignmentId}::uuid
         AND company_code_id = ${companyCodeId}::uuid FOR UPDATE
    `.execute(trx);
    const current = rows[0];
    if (!current) throw new ResourceNotFoundError("CHART_ASSIGNMENT_NOT_FOUND", `No assignment with id=${assignmentId}.`);
    if ((current.updated_at ?? null) !== (input.expectedUpdatedAt ?? null)) {
      throw new FinanceSetupConflictError("STALE_CHART_ASSIGNMENT", "The Chart assignment changed after it was loaded. Refresh and try again.");
    }
    const nextPrimary = input.status !== "inactive" && input.isPrimary === true;
    if (nextPrimary) {
      await sql`UPDATE master.company_code_chart_assignment SET is_primary = false, updated_at = now(), updated_by = ${input.actorId}::uuid
        WHERE tenant_id = ${input.tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid
          AND assignment_type = ${input.assignmentType} AND id <> ${assignmentId}::uuid`.execute(trx);
    }
    await sql`
      UPDATE master.company_code_chart_assignment
         SET chart_of_account_id = ${input.chartId}::uuid, assignment_type = ${input.assignmentType},
             is_primary = ${nextPrimary}, effective_from = ${input.effectiveFrom ?? null}::date,
             effective_to = ${input.effectiveTo ?? null}::date, status = ${input.status ?? "active"},
             updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${assignmentId}::uuid
    `.execute(trx);
    const after = await operatingState(trx, input.tenantId, companyCodeId);
    assertPrimaryOperatingInvariant(before, after);
    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
      activityType: "finance_setup.chart_assignment_changed", entityType: "company_code_chart_assignment",
      entityId: assignmentId, detail: { action: "update", assignment_type: input.assignmentType, chart_id: input.chartId, status: input.status ?? "active" },
      correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company Chart assignment changed");
    return { assignmentId };
  });
  await refreshCompanyPostableAccountMv(db);
  return result;
}

export async function deactivateChartAssignment(
  db: AnyDb,
  input: {
    tenantId: string; actorId: string; companyCode: string; assignmentId: string;
    expectedUpdatedAt: string | null; correlationId?: string;
  },
): Promise<{ assignmentId: string }> {
  const { rows } = await sql<{
    chart_id: string; assignment_type: string; effective_from: string | null;
    effective_to: string | null; is_primary: boolean;
  }>`
    SELECT a.chart_of_account_id AS chart_id, a.assignment_type,
           a.effective_from::text, a.effective_to::text, a.is_primary
      FROM master.company_code_chart_assignment a
      JOIN master.company_code cc ON cc.tenant_id = a.tenant_id AND cc.id = a.company_code_id
     WHERE a.tenant_id = ${input.tenantId}::uuid AND a.id = ${input.assignmentId}::uuid
       AND lower(cc.code) = lower(${input.companyCode})
  `.execute(db);
  const row = rows[0];
  if (!row) throw new ResourceNotFoundError("CHART_ASSIGNMENT_NOT_FOUND", `No assignment with id=${input.assignmentId}.`);
  return updateChartAssignment(db, input.assignmentId, {
    tenantId: input.tenantId, actorId: input.actorId, companyCode: input.companyCode,
    chartId: row.chart_id, assignmentType: row.assignment_type,
    effectiveFrom: row.effective_from, effectiveTo: row.effective_to,
    isPrimary: row.is_primary, status: "inactive", expectedUpdatedAt: input.expectedUpdatedAt,
    correlationId: input.correlationId,
  });
}

export interface BulkGlControlsInput {
  tenantId: string; actorId: string; companyCode: string; glAccountIds: string[];
  postingAllowed?: boolean; blockedForManual?: boolean; blockedForAuto?: boolean;
  requiresCostCenter?: boolean; requiresProfitCenter?: boolean; requiresProject?: boolean;
  correlationId?: string;
}

export async function bulkUpdateGlControls(db: AnyDb, input: BulkGlControlsInput): Promise<{ updatedCount: number }> {
  const ids = [...new Set(input.glAccountIds)].filter(Boolean);
  if (ids.length === 0 || ids.length > 1000) throw new FinanceSetupValidationError("Select between 1 and 1000 GL Accounts.");
  const result = await db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    const reachable = await sql<{ id: string }>`
      SELECT DISTINCT ga.id FROM master.company_code_chart_assignment a
      JOIN master.chart_of_account coa ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id AND coa.status = 'active'
      JOIN master.gl_account ga ON ga.tenant_id = coa.tenant_id AND ga.chart_of_account_id = coa.id
      WHERE a.tenant_id = ${input.tenantId}::uuid AND a.company_code_id = ${companyCodeId}::uuid
        AND a.status = 'active' AND ga.status = 'active' AND ga.node_type = 'posting'
        AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
        AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
        AND ga.id = ANY(${ids}::uuid[])
    `.execute(trx);
    if (reachable.rows.length !== ids.length) {
      throw new FinanceSetupConflictError("UNREACHABLE_GL_ACCOUNT", "One or more selected accounts are not reachable through an active Company Chart assignment.");
    }
    await sql`
      INSERT INTO master.company_code_gl_account (
        tenant_id, company_code_id, gl_account_id, posting_allowed, blocked_for_manual,
        blocked_for_auto, requires_cost_center, requires_profit_center, requires_project, status, created_by
      ) SELECT ${input.tenantId}::uuid, ${companyCodeId}::uuid, selected.id,
          COALESCE(${input.postingAllowed ?? null}::boolean, true), COALESCE(${input.blockedForManual ?? null}::boolean, false),
          COALESCE(${input.blockedForAuto ?? null}::boolean, false), COALESCE(${input.requiresCostCenter ?? null}::boolean, false),
          COALESCE(${input.requiresProfitCenter ?? null}::boolean, false), COALESCE(${input.requiresProject ?? null}::boolean, false),
          'active', ${input.actorId}::uuid
        FROM unnest(${ids}::uuid[]) AS selected(id)
      ON CONFLICT (tenant_id, company_code_id, gl_account_id) DO UPDATE SET
        posting_allowed = COALESCE(${input.postingAllowed ?? null}::boolean, master.company_code_gl_account.posting_allowed),
        blocked_for_manual = COALESCE(${input.blockedForManual ?? null}::boolean, master.company_code_gl_account.blocked_for_manual),
        blocked_for_auto = COALESCE(${input.blockedForAuto ?? null}::boolean, master.company_code_gl_account.blocked_for_auto),
        requires_cost_center = COALESCE(${input.requiresCostCenter ?? null}::boolean, master.company_code_gl_account.requires_cost_center),
        requires_profit_center = COALESCE(${input.requiresProfitCenter ?? null}::boolean, master.company_code_gl_account.requires_profit_center),
        requires_project = COALESCE(${input.requiresProject ?? null}::boolean, master.company_code_gl_account.requires_project),
        status = 'active', updated_at = now(), updated_by = ${input.actorId}::uuid
    `.execute(trx);
    await writeFinanceSetupAudit(trx, {
      tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
      activityType: "finance_setup.controls_bulk_updated", entityType: "company_code_gl_account", entityId: null,
      detail: { gl_account_ids: ids, updated_count: ids.length, patch: {
        posting_allowed: input.postingAllowed, blocked_for_manual: input.blockedForManual,
        blocked_for_auto: input.blockedForAuto, requires_cost_center: input.requiresCostCenter,
        requires_profit_center: input.requiresProfitCenter, requires_project: input.requiresProject,
      } }, correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company GL controls changed in bulk");
    return { updatedCount: ids.length };
  });
  await refreshCompanyPostableAccountMv(db);
  return result;
}


// ─── setPrimaryChartAssignment ──────────────────────────────────────────────

export interface SetPrimaryChartAssignmentInput {
  tenantId:       string;
  actorId:        string;
  assignmentId:   string;
  correlationId?: string;
  expectedUpdatedAt?: string | null;
}

export async function setPrimaryChartAssignment(
  db: AnyDb,
  input: SetPrimaryChartAssignmentInput,
): Promise<{ assignmentId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId)  throw new MissingActorError();

  return db.transaction().execute(async (trx) => {
    const currentQ = await sql<{
      company_code_id: string;
      assignment_type: string;
      updated_at: string | null;
    }>`
      SELECT a.company_code_id, a.assignment_type, a.updated_at::text
        FROM master.company_code_chart_assignment a
        JOIN master.chart_of_account coa ON coa.tenant_id = a.tenant_id AND coa.id = a.chart_of_account_id
       WHERE a.tenant_id = ${input.tenantId}::uuid
         AND a.id      = ${input.assignmentId}::uuid
         AND a.status = 'active' AND coa.status = 'active'
         AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
         AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("CHART_ASSIGNMENT_NOT_FOUND", `No assignment with id=${input.assignmentId}.`);
    }
    if (input.expectedUpdatedAt !== undefined && (current.updated_at ?? null) !== input.expectedUpdatedAt) {
      throw new FinanceSetupConflictError("STALE_CHART_ASSIGNMENT", "The Chart assignment changed after it was loaded. Refresh and try again.");
    }
    await sql`SELECT id FROM master.company_code WHERE tenant_id = ${input.tenantId}::uuid
      AND id = ${current.company_code_id}::uuid FOR UPDATE`.execute(trx);
    const before = await operatingState(trx, input.tenantId, current.company_code_id);

    // Demote existing primary for same (company, assignment_type), then promote target.
    await sql`
      UPDATE master.company_code_chart_assignment
         SET is_primary = false, updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE tenant_id       = ${input.tenantId}::uuid
         AND company_code_id = ${current.company_code_id}::uuid
         AND assignment_type = ${current.assignment_type}
         AND id <> ${input.assignmentId}::uuid
    `.execute(trx);
    await sql`
      UPDATE master.company_code_chart_assignment
         SET is_primary = true,
             updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.assignmentId}::uuid
    `.execute(trx);
    const after = await operatingState(trx, input.tenantId, current.company_code_id);
    assertPrimaryOperatingInvariant(before, after);

    await writeFinanceSetupAudit(trx, {
      tenantId:      input.tenantId,
      actorId:       input.actorId,
      companyCodeId: current.company_code_id,
      activityType:  "finance_setup.chart_assignment_changed",
      entityType:    "company_code_chart_assignment",
      entityId:      input.assignmentId,
      detail: { action: "set_primary", assignment_type: current.assignment_type },
      correlationId: input.correlationId,
    });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, current.company_code_id, input.actorId, "Primary Company Chart changed");

    return { assignmentId: input.assignmentId };
  }).then(async (result) => {
    await refreshCompanyPostableAccountMv(db);
    return result;
  });
}


// ─── Company Book assignments + explicit default ───────────────────────────

const BOOK_CONFLICT_STRATEGIES = new Set(["highest_priority", "most_specific", "error_on_conflict"]);

export function resolveBookCurrencyPrecedence(
  overrideCurrencyCode: string | null | undefined,
  baseCurrencyCode: string,
  companyFunctionalCurrency: string,
): { currencyCode: string; source: "assignment_override" | "book_base"; companyFunctionalCurrency: string } {
  const companyCurrency = companyFunctionalCurrency.trim().toUpperCase();
  const baseCurrency = baseCurrencyCode.trim().toUpperCase();
  const overrideCurrency = overrideCurrencyCode?.trim().toUpperCase() || null;
  if (!companyCurrency || !baseCurrency) throw new FinanceSetupValidationError("Company functional currency and Book base currency are required.");
  return { currencyCode: overrideCurrency ?? baseCurrency, source: overrideCurrency ? "assignment_override" : "book_base", companyFunctionalCurrency: companyCurrency };
}

async function validateBookAssignmentCurrency(
  db: AnyDb, tenantId: string, companyCodeId: string, bookId: string, overrideCurrencyCode?: string | null,
): Promise<{ currencyCode: string; source: "assignment_override" | "book_base"; companyFunctionalCurrency: string }> {
  const { rows } = await sql<{
    base_currency_code: string; company_currency: string | null;
    base_active: boolean; company_active: boolean; override_active: boolean;
  }>`
    SELECT lb.base_currency_code, cc.functional_currency AS company_currency,
           (base_cur.is_active IS TRUE) AS base_active,
           (company_cur.is_active IS TRUE) AS company_active,
           (${overrideCurrencyCode ?? null}::text IS NULL OR override_cur.is_active IS TRUE) AS override_active
      FROM master.company_code cc
      JOIN master.ledger_book lb ON lb.tenant_id = cc.tenant_id AND lb.id = ${bookId}::uuid AND lb.status = 'active'
      LEFT JOIN shared.currency base_cur ON base_cur.code = lb.base_currency_code
      LEFT JOIN shared.currency company_cur ON company_cur.code = cc.functional_currency
      LEFT JOIN shared.currency override_cur ON override_cur.code = upper(${overrideCurrencyCode ?? null}::text)
     WHERE cc.tenant_id = ${tenantId}::uuid AND cc.id = ${companyCodeId}::uuid
  `.execute(db);
  const row = rows[0];
  if (!row) throw new ResourceNotFoundError("BOOK_NOT_FOUND", `No active Ledger Book with id=${bookId}.`);
  if (!row.base_active) throw new FinanceSetupValidationError("Ledger Book base currency must resolve to an active currency.");
  if (!row.company_currency || !row.company_active) throw new FinanceSetupValidationError("Company functional currency must resolve to an active currency.");
  if (!row.override_active) throw new FinanceSetupValidationError("Assignment override currency must resolve to an active currency.");
  return resolveBookCurrencyPrecedence(overrideCurrencyCode, row.base_currency_code, row.company_currency);
}

export interface SaveBookAssignmentInput {
  tenantId: string; actorId: string; companyCode: string; bookId: string;
  effectiveFrom: string; effectiveTo?: string | null; overrideCurrencyCode?: string | null;
  alternateCoaPrefix?: string | null; priority: number; conflictStrategy: string;
  status?: "active" | "inactive"; setAsDefault?: boolean; expectedUpdatedAt?: string | null;
  correlationId?: string;
}

function validateBookAssignmentFields(input: SaveBookAssignmentInput): void {
  assertDateOrder(input.effectiveFrom, input.effectiveTo);
  if (!BOOK_CONFLICT_STRATEGIES.has(input.conflictStrategy)) throw new FinanceSetupValidationError(`Unsupported Book conflict strategy: ${input.conflictStrategy}.`);
  if (!Number.isInteger(input.priority) || input.priority < -32768 || input.priority > 32767) throw new FinanceSetupValidationError("Book assignment priority must be a whole number between -32768 and 32767.");
  if (input.overrideCurrencyCode && !/^[A-Za-z]{3}$/.test(input.overrideCurrencyCode.trim())) throw new FinanceSetupValidationError("Override currency must be a three-letter currency code.");
}

async function writeCompanyDefaultBook(
  db: AnyDb, input: { tenantId: string; actorId: string; companyCodeId: string; assignmentId: string; bookId: string; correlationId?: string },
): Promise<void> {
  const result = await sql<{ id: string }>`UPDATE master.company_code cc SET default_ledger_book_id = ${input.bookId}::uuid,
      updated_at = now(), updated_by = ${input.actorId}::uuid
    WHERE cc.tenant_id = ${input.tenantId}::uuid AND cc.id = ${input.companyCodeId}::uuid
      AND EXISTS (SELECT 1 FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
        WHERE ba.tenant_id = cc.tenant_id AND ba.company_code_id = cc.id AND ba.id = ${input.assignmentId}::uuid
          AND ba.book_id = ${input.bookId}::uuid AND ba.status = 'active' AND lb.status = 'active'
          AND ba.effective_from <= CURRENT_DATE AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE))
    RETURNING cc.id`.execute(db);
  if (!result.rows[0]) throw new FinanceSetupConflictError("BOOK_ASSIGNMENT_NOT_EFFECTIVE", "Company default Book must have an active, effective assignment and active Ledger Book.");
  await writeFinanceSetupAudit(db, {
    tenantId: input.tenantId, actorId: input.actorId, companyCodeId: input.companyCodeId,
    activityType: "finance_setup.book_assignment_changed", entityType: "company_code_book_assignment",
    entityId: input.assignmentId, detail: { action: "set_company_default", book_id: input.bookId }, correlationId: input.correlationId,
  });
}

export async function createBookAssignment(db: AnyDb, input: SaveBookAssignmentInput): Promise<{ assignmentId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId) throw new MissingActorError();
  validateBookAssignmentFields(input);
  return db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    const currency = await validateBookAssignmentCurrency(trx, input.tenantId, companyCodeId, input.bookId, input.overrideCurrencyCode?.trim() || null);
    const existing = await sql<{ id: string }>`SELECT id FROM master.company_code_book_assignment
      WHERE tenant_id = ${input.tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid AND book_id = ${input.bookId}::uuid`.execute(trx);
    if (existing.rows[0]) throw new FinanceSetupConflictError("BOOK_ASSIGNMENT_EXISTS", "This Ledger Book is already assigned to the Company.");
    const { rows } = await sql<{ id: string }>`INSERT INTO master.company_code_book_assignment (
        tenant_id, company_code_id, book_id, alternate_coa_prefix, override_currency_code,
        effective_from, effective_to, priority, conflict_strategy, status, created_by
      ) VALUES (${input.tenantId}::uuid, ${companyCodeId}::uuid, ${input.bookId}::uuid,
        ${input.alternateCoaPrefix?.trim() || null}, ${input.overrideCurrencyCode?.trim().toUpperCase() || null},
        ${input.effectiveFrom}::date, ${input.effectiveTo ?? null}::date, ${input.priority}, ${input.conflictStrategy},
        ${input.status ?? "active"}, ${input.actorId}::uuid) RETURNING id`.execute(trx);
    const assignmentId = rows[0]!.id;
    if (input.setAsDefault) {
      if ((input.status ?? "active") !== "active") throw new FinanceSetupConflictError("DEFAULT_BOOK_INACTIVE", "An inactive assignment cannot be the Company default Book.");
      await writeCompanyDefaultBook(trx, { ...input, companyCodeId, assignmentId });
    }
    await writeFinanceSetupAudit(trx, { tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
      activityType: "finance_setup.book_assignment_changed", entityType: "company_code_book_assignment", entityId: assignmentId,
      detail: { action: "create", book_id: input.bookId, effective_currency: currency.currencyCode, currency_source: currency.source }, correlationId: input.correlationId });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company Book assignment changed");
    return { assignmentId };
  });
}

export async function updateBookAssignment(db: AnyDb, assignmentId: string, input: SaveBookAssignmentInput): Promise<{ assignmentId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId) throw new MissingActorError();
  validateBookAssignmentFields(input);
  return db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    const { rows } = await sql<{ book_id: string; updated_at: string | null; is_default: boolean }>`
      SELECT ba.book_id, ba.updated_at::text, (cc.default_ledger_book_id = ba.book_id) AS is_default
        FROM master.company_code_book_assignment ba JOIN master.company_code cc ON cc.tenant_id = ba.tenant_id AND cc.id = ba.company_code_id
       WHERE ba.tenant_id = ${input.tenantId}::uuid AND ba.company_code_id = ${companyCodeId}::uuid AND ba.id = ${assignmentId}::uuid FOR UPDATE OF ba`.execute(trx);
    const current = rows[0];
    if (!current) throw new ResourceNotFoundError("BOOK_ASSIGNMENT_NOT_FOUND", `No Book assignment with id=${assignmentId}.`);
    if (current.book_id !== input.bookId) throw new FinanceSetupConflictError("BOOK_ASSIGNMENT_BOOK_IMMUTABLE", "Change the Ledger Book by deactivating this assignment and creating another.");
    if ((current.updated_at ?? null) !== (input.expectedUpdatedAt ?? null)) throw new FinanceSetupConflictError("STALE_BOOK_ASSIGNMENT", "The Book assignment changed after it was loaded. Refresh and try again.");
    const currency = await validateBookAssignmentCurrency(trx, input.tenantId, companyCodeId, input.bookId, input.overrideCurrencyCode?.trim() || null);
    const today = new Date().toISOString().slice(0, 10);
    if (current.is_default && (input.status === "inactive" || input.effectiveFrom > today || (input.effectiveTo && input.effectiveTo < today))) throw new FinanceSetupConflictError("DEFAULT_BOOK_REQUIRED", "Select another Company default Book before making the current default inactive or ineffective.");
    await sql`UPDATE master.company_code_book_assignment SET alternate_coa_prefix = ${input.alternateCoaPrefix?.trim() || null},
        override_currency_code = ${input.overrideCurrencyCode?.trim().toUpperCase() || null}, effective_from = ${input.effectiveFrom}::date,
        effective_to = ${input.effectiveTo ?? null}::date, priority = ${input.priority}, conflict_strategy = ${input.conflictStrategy},
        status = ${input.status ?? "active"}, updated_at = now(), updated_by = ${input.actorId}::uuid
      WHERE tenant_id = ${input.tenantId}::uuid AND id = ${assignmentId}::uuid`.execute(trx);
    if (input.setAsDefault) await writeCompanyDefaultBook(trx, { ...input, companyCodeId, assignmentId });
    await writeFinanceSetupAudit(trx, { tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
      activityType: "finance_setup.book_assignment_changed", entityType: "company_code_book_assignment", entityId: assignmentId,
      detail: { action: "update", book_id: input.bookId, effective_currency: currency.currencyCode, currency_source: currency.source }, correlationId: input.correlationId });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company Book assignment changed");
    return { assignmentId };
  });
}

export async function deactivateBookAssignment(db: AnyDb, input: {
  tenantId: string; actorId: string; companyCode: string; assignmentId: string; expectedUpdatedAt: string | null; correlationId?: string;
}): Promise<{ assignmentId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId) throw new MissingActorError();
  return db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    const { rows } = await sql<{ book_id: string; updated_at: string | null; is_default: boolean }>`SELECT ba.book_id, ba.updated_at::text,
        (cc.default_ledger_book_id = ba.book_id) AS is_default FROM master.company_code_book_assignment ba
        JOIN master.company_code cc ON cc.tenant_id = ba.tenant_id AND cc.id = ba.company_code_id
      WHERE ba.tenant_id = ${input.tenantId}::uuid AND ba.company_code_id = ${companyCodeId}::uuid AND ba.id = ${input.assignmentId}::uuid FOR UPDATE OF ba`.execute(trx);
    const current = rows[0];
    if (!current) throw new ResourceNotFoundError("BOOK_ASSIGNMENT_NOT_FOUND", `No Book assignment with id=${input.assignmentId}.`);
    if ((current.updated_at ?? null) !== input.expectedUpdatedAt) throw new FinanceSetupConflictError("STALE_BOOK_ASSIGNMENT", "The Book assignment changed after it was loaded. Refresh and try again.");
    if (current.is_default) throw new FinanceSetupConflictError("DEFAULT_BOOK_REQUIRED", "Select another Company default Book before deactivating this assignment.");
    await sql`UPDATE master.company_code_book_assignment SET status = 'inactive', updated_at = now(), updated_by = ${input.actorId}::uuid
      WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.assignmentId}::uuid`.execute(trx);
    await writeFinanceSetupAudit(trx, { tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
      activityType: "finance_setup.book_assignment_changed", entityType: "company_code_book_assignment", entityId: input.assignmentId,
      detail: { action: "deactivate", book_id: current.book_id }, correlationId: input.correlationId });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company Book assignment deactivated");
    return { assignmentId: input.assignmentId };
  });
}

export interface SetCompanyDefaultBookInput {
  tenantId: string; actorId: string; companyCode: string; bookId: string; expectedUpdatedAt: string | null; correlationId?: string;
}

export async function setCompanyDefaultBook(db: AnyDb, input: SetCompanyDefaultBookInput): Promise<{ bookId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId) throw new MissingActorError();
  return db.transaction().execute(async (trx) => {
    const companyCodeId = await lockCompany(trx, input.tenantId, input.companyCode);
    const { rows } = await sql<{ assignment_id: string; updated_at: string | null; override_currency_code: string | null }>`
      SELECT ba.id AS assignment_id, ba.updated_at::text, ba.override_currency_code FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
       WHERE ba.tenant_id = ${input.tenantId}::uuid AND ba.company_code_id = ${companyCodeId}::uuid AND ba.book_id = ${input.bookId}::uuid
         AND ba.status = 'active' AND lb.status = 'active' AND ba.effective_from <= CURRENT_DATE
         AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE) FOR UPDATE OF ba`.execute(trx);
    const assignment = rows[0];
    if (!assignment) throw new FinanceSetupConflictError("BOOK_ASSIGNMENT_NOT_EFFECTIVE", "Company default Book must have an active, effective assignment and active Ledger Book.");
    if ((assignment.updated_at ?? null) !== input.expectedUpdatedAt) throw new FinanceSetupConflictError("STALE_BOOK_ASSIGNMENT", "The Book assignment changed after it was loaded. Refresh and try again.");
    await validateBookAssignmentCurrency(trx, input.tenantId, companyCodeId, input.bookId, assignment.override_currency_code);
    await writeCompanyDefaultBook(trx, { ...input, companyCodeId, assignmentId: assignment.assignment_id });
    await invalidateFinanceSetupReadiness(trx, input.tenantId, companyCodeId, input.actorId, "Company default Book changed");
    return { bookId: input.bookId };
  });
}


// ─── toggleHouseBank ────────────────────────────────────────────────────────

export interface ToggleHouseBankInput {
  tenantId:       string;
  actorId:        string;
  configId:       string;
  activate:       boolean;         // true → active, false → suspended
  correlationId?: string;
}

export async function toggleHouseBank(
  db: AnyDb,
  input: ToggleHouseBankInput,
): Promise<{ configId: string; status: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId)  throw new MissingActorError();

  return db.transaction().execute(async (trx) => {
    const currentQ = await sql<{
      bank_account_link_id: string;
      status:               string;
    }>`
      SELECT bank_account_link_id, status
        FROM master.bank_account_house_config
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.configId}::uuid
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("HOUSE_BANK_CONFIG_NOT_FOUND", `No house bank config with id=${input.configId}.`);
    }
    const nextStatus = input.activate ? "active" : "suspended";
    if (current.status === nextStatus) {
      return { configId: input.configId, status: current.status };
    }

    // Resolve owner_id (company_code_id) via link for audit.
    const linkQ = await sql<{ company_code_id: string }>`
      SELECT owner_id AS company_code_id
        FROM master.bank_account_link
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${current.bank_account_link_id}::uuid
         AND owner_type = 'company_code'
       LIMIT 1
    `.execute(trx);
    const companyCodeId = linkQ.rows[0]?.company_code_id ?? null;

    await sql`
      UPDATE master.bank_account_house_config
         SET status     = ${nextStatus},
             updated_at = now(),
             updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.configId}::uuid
    `.execute(trx);

    await writeFinanceSetupAudit(trx, {
      tenantId:      input.tenantId,
      actorId:       input.actorId,
      companyCodeId,
      activityType:  "finance_setup.house_bank_toggled",
      entityType:    "bank_account_house_config",
      entityId:      input.configId,
      detail: { previous: current.status, next: nextStatus },
      correlationId: input.correlationId,
    });

    return { configId: input.configId, status: nextStatus };
  });
}
