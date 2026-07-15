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
 *   • setPrimaryBook         — flip is_primary on ledger_book
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
  try {
    await sql`SELECT master.fn_refresh_mv_cpa()`.execute(db);
  } catch {
    // Non-fatal — MV refresh may be scheduled elsewhere. Silent.
  }
}


// ─── assignGlControl ────────────────────────────────────────────────────────

export interface AssignGlControlInput {
  tenantId:         string;
  actorId:          string;
  companyCode:      string;
  glAccountCode:    string;
  postingAllowed?:  boolean;
  blockedForManual?:boolean;
  blockedForAuto?:  boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
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

    // Verify the GL account is postable in this company.
    const acctQ = await sql<{ gl_account_id: string; already: boolean }>`
      SELECT mv.gl_account_id,
             EXISTS (
               SELECT 1 FROM master.company_code_gl_account ccga
                WHERE ccga.company_code_id = ${companyCodeId}::uuid
                  AND ccga.gl_account_id   = mv.gl_account_id
             ) AS already
        FROM master.mv_company_postable_account mv
       WHERE mv.tenant_id       = ${input.tenantId}::uuid
         AND mv.company_code_id = ${companyCodeId}::uuid
         AND mv.account_code    = ${input.glAccountCode}
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
        reconciliation_type, tax_category,
        created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${companyCodeId}::uuid, ${acct.gl_account_id}::uuid,
        ${input.postingAllowed ?? true},
        ${input.blockedForManual ?? false}, ${input.blockedForAuto ?? false},
        ${input.requiresCostCenter ?? false}, ${input.requiresProfitCenter ?? false}, ${input.requiresProject ?? false},
        ${input.reconciliationType ?? null}, ${input.taxCategory ?? null},
        ${input.actorId}::uuid
      )
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
  postingAllowed?:       boolean;
  blockedForManual?:     boolean;
  blockedForAuto?:       boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
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
    }>`
      SELECT company_code_id, gl_account_id,
             posting_allowed, blocked_for_manual, blocked_for_auto,
             requires_cost_center, requires_profit_center, requires_project,
             reconciliation_type, tax_category
        FROM master.company_code_gl_account
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id = ${input.controlId}::uuid
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("GL_CONTROL_NOT_FOUND", `No control row with id=${input.controlId}.`);
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
    }>`
      SELECT company_code_id, posting_allowed
        FROM master.company_code_gl_account
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.controlId}::uuid
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("GL_CONTROL_NOT_FOUND", `No control row with id=${input.controlId}.`);
    }

    // Soft deactivate: set posting_allowed=false. Keeps row for audit trail
    // and prevents re-insert conflicts if user changes their mind.
    await sql`
      UPDATE master.company_code_gl_account
         SET posting_allowed = false,
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

    return { controlId: input.controlId };
  }).then(async (result) => {
    await refreshCompanyPostableAccountMv(db);
    return result;
  });
}


// ─── setPrimaryChartAssignment ──────────────────────────────────────────────

export interface SetPrimaryChartAssignmentInput {
  tenantId:       string;
  actorId:        string;
  assignmentId:   string;
  correlationId?: string;
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
    }>`
      SELECT company_code_id, assignment_type
        FROM master.company_code_chart_assignment
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.assignmentId}::uuid
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("CHART_ASSIGNMENT_NOT_FOUND", `No assignment with id=${input.assignmentId}.`);
    }

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
         SET is_primary = true, status = 'active',
             updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.assignmentId}::uuid
    `.execute(trx);

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

    return { assignmentId: input.assignmentId };
  }).then(async (result) => {
    await refreshCompanyPostableAccountMv(db);
    return result;
  });
}


// ─── setPrimaryBook ─────────────────────────────────────────────────────────

export interface SetPrimaryBookInput {
  tenantId:       string;
  actorId:        string;
  bookId:         string;
  correlationId?: string;
}

export async function setPrimaryBook(
  db: AnyDb,
  input: SetPrimaryBookInput,
): Promise<{ bookId: string }> {
  if (!input.tenantId) throw new MissingTenantError();
  if (!input.actorId)  throw new MissingActorError();

  return db.transaction().execute(async (trx) => {
    const currentQ = await sql<{ company_code_id: string }>`
      SELECT company_code_id FROM master.ledger_book
       WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.bookId}::uuid
       FOR UPDATE
    `.execute(trx);
    const current = currentQ.rows[0];
    if (!current) {
      throw new ResourceNotFoundError("BOOK_NOT_FOUND", `No ledger book with id=${input.bookId}.`);
    }

    await sql`
      UPDATE master.ledger_book
         SET is_primary = false, updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE tenant_id       = ${input.tenantId}::uuid
         AND company_code_id = ${current.company_code_id}::uuid
         AND id <> ${input.bookId}::uuid
    `.execute(trx);
    await sql`
      UPDATE master.ledger_book
         SET is_primary = true, status = 'active',
             updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.bookId}::uuid
    `.execute(trx);

    await writeFinanceSetupAudit(trx, {
      tenantId:      input.tenantId,
      actorId:       input.actorId,
      companyCodeId: current.company_code_id,
      activityType:  "finance_setup.book_assignment_changed",
      entityType:    "ledger_book",
      entityId:      input.bookId,
      detail: { action: "set_primary" },
      correlationId: input.correlationId,
    });

    return { bookId: input.bookId };
  });
}


// ─── toggleHouseBank ────────────────────────────────────────────────────────

export interface ToggleHouseBankInput {
  tenantId:       string;
  actorId:        string;
  configId:       string;
  activate:       boolean;         // true → status='active', false → status='inactive'
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
    const nextStatus = input.activate ? "active" : "inactive";
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
