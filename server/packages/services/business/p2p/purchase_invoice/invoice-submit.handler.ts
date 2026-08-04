/**
 * Purchase Invoice Submit Preparation
 *
 * Called by the lifecycle orchestrator after it locks the invoice.
 *
 * Steps:
 *   1. Load and validate invoice (must be in 'draft' status with at least 1 line)
 *   2. Resolve workflow template via control.workflow_definition rules
 *   3. Create or resolve document.workflow_request idempotently
 *   4. Create workflow stages and first-stage work items
 *   5. Dispatch metadata-driven flow-field bindings
 *   6. Return the workflow_request_id patch and preparation context
 *
 * This service never changes invoice status. The lifecycle orchestrator owns
 * draft → pending_approval and the associated hooks/audit fields.
 *
 * Schema notes:
 *   - Routing: control.workflow_definition  (entity_type + rules jsonb)
 *   - Templates: control.workflow_template  (tenant_id IS NULL = platform-global)
 *   - Stages: control.workflow_template_stage (joined by workflow_template_id + stage_no)
 *   - Rules: control.workflow_template_rule   (assign_to jsonb: {type, value})
 *     assign_to.type: "requester" | "principal" | "role" | "group" | "field"
 *
 * workflow_definition.tenant_id: NOT NULL — '00000000-0000-0000-0000-000000000000'
 * is used as the platform-default sentinel for seeds that predate tenant provisioning.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { matchInvoice } from "./invoice-match.service.js";
import { validatePurchaseInvoiceInvariants } from "./invoice-invariants.service.js";
import { seedRetentionFromPricingComponents } from "../../ap/purchase_invoice/retention-advance-seeder.service.js";
import { dispatchFlowFieldBindings } from "../../../workflow/flow-field-dispatcher.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

interface TemplateStage {
  id:       string;
  stage_no: number;
  name:     string;
  mode:     string;
  quorum:   Record<string, unknown> | null;
}

interface WorkflowTemplate {
  id:        string;
  behaviors: Record<string, unknown>;
  stages:    TemplateStage[];
}

const V_NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Resolves a workflow_template for the given entity + operation by evaluating
 * the workflow_definition rules against the entity payload.
 * Tenant-specific definitions take priority over the nil-UUID platform default.
 */
async function resolveWorkflowTemplate(
  db:          AnyDb,
  tenantId:    string,
  entityName:  string,
  entityPayload: Record<string, unknown>,
): Promise<WorkflowTemplate | null> {
  const defResult = await sql<{ rules: unknown }>`
    SELECT rules
    FROM   control.workflow_definition
    WHERE  entity_type = ${entityName}
      AND  is_active   = true
      AND  (tenant_id = ${tenantId}::uuid OR tenant_id = ${V_NIL}::uuid)
    ORDER BY (tenant_id = ${tenantId}::uuid) DESC
    LIMIT  1
  `.execute(db);

  const def = defResult.rows[0];
  if (!def) return null;

  const rules = Array.isArray(def.rules) ? (def.rules as Array<{
    condition: Record<string, unknown> | null;
    template_code: string;
    priority: number;
  }>) : [];
  rules.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

  let templateCode: string | null = null;
  for (const rule of rules) {
    if (!rule.condition) { templateCode = rule.template_code; break; }
    const cond = rule.condition as { field?: string; operator?: string; value?: unknown };
    if (cond.field && cond.operator) {
      const fieldVal = Number(entityPayload[cond.field] ?? 0);
      const refVal   = Number(cond.value ?? 0);
      let matches = false;
      if      (cond.operator === "gte") matches = fieldVal >= refVal;
      else if (cond.operator === "gt")  matches = fieldVal > refVal;
      else if (cond.operator === "lte") matches = fieldVal <= refVal;
      else if (cond.operator === "lt")  matches = fieldVal < refVal;
      else if (cond.operator === "eq")  matches = fieldVal === refVal;
      if (matches) { templateCode = rule.template_code; break; }
    }
  }
  if (!templateCode) return null;

  const tmplResult = await sql<{ id: string; behaviors: Record<string, unknown> }>`
    SELECT id, behaviors
    FROM   control.workflow_template
    WHERE  code      = ${templateCode}
      AND  is_active = true
      AND  (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
    ORDER BY tenant_id NULLS LAST
    LIMIT  1
  `.execute(db);

  const tmpl = tmplResult.rows[0];
  if (!tmpl) return null;

  const stages = await sql<TemplateStage>`
    SELECT id, stage_no, name, mode, quorum
    FROM   control.workflow_template_stage
    WHERE  workflow_template_id = ${tmpl.id}
    ORDER  BY stage_no
  `.execute(db);

  return {
    id:        tmpl.id,
    behaviors: (tmpl.behaviors as Record<string, unknown>) ?? {},
    stages:    stages.rows,
  };
}

/**
 * Resolves the set of approver principal_ids for a given template stage.
 * assign_to.type values: "requester" | "self" | "principal" | "direct" | "role" | "group" | "field"
 */
async function resolveApprovers(
  db:          AnyDb,
  tenantId:    string,
  templateId:  string,
  stageNo:     number,
  invoiceRow:  Record<string, unknown>,
  principalId: string | null,
): Promise<string[]> {
  const rules = await sql<{ assign_to: Record<string, unknown> | null }>`
    SELECT assign_to
    FROM   control.workflow_template_rule
    WHERE  workflow_template_id = ${templateId}
      AND  (stage_no = ${stageNo} OR stage_no IS NULL)
    ORDER  BY priority
  `.execute(db);

  const ids = new Set<string>();

  for (const rule of rules.rows) {
    const at   = rule.assign_to ?? {};
    const type = String(at["type"] ?? "");
    const val  = String(at["value"] ?? "");

    switch (type) {
      case "requester":
      case "self":
        if (principalId) ids.add(principalId);
        break;
      case "principal":
      case "direct":
        if (val) ids.add(val);
        break;
      case "role": {
        const rows = await sql<{ principal_id: string }>`
          SELECT prm.principal_id
          FROM   master.principal_role_member prm
          JOIN   master.role r ON r.id = prm.role_id
          WHERE  r.tenant_id = ${tenantId} AND r.code = ${val} AND r.is_active = true
        `.execute(db);
        rows.rows.forEach((r) => ids.add(r.principal_id));
        break;
      }
      case "group": {
        const rows = await sql<{ principal_id: string }>`
          SELECT agm.principal_id
          FROM master.auth_current_group_member_v agm
          JOIN master.auth_group g
            ON g.id = agm.group_id
           AND g.tenant_id = agm.tenant_id
           AND g.plane_code = agm.plane_code
          WHERE g.tenant_id = ${tenantId}
            AND g.plane_code = 'neon'
            AND g.code = ${val}
            AND g.status = 'active'
        `.execute(db);
        rows.rows.forEach((m) => ids.add(m.principal_id));
        break;
      }
      case "field": {
        const fv = invoiceRow[val];
        if (typeof fv === "string" && fv) ids.add(fv);
        break;
      }
    }
  }

  return Array.from(ids);
}

export interface PurchaseInvoiceSubmitPreparation {
  statusPatch: Readonly<Record<string, unknown>>;
  context: Readonly<{
    workflowRequestId: string;
    workflowTemplateId: string;
    stageCount: number;
    commentsCreated: number;
  }>;
}

export class PurchaseInvoiceSubmitPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PurchaseInvoiceSubmitPreparationError";
  }
}

export async function preparePurchaseInvoiceSubmit(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string | null,
  body:        Record<string, unknown>,
  logger?:     { info(e: string, f?: Record<string, unknown>): void; warn(e: string, f?: Record<string, unknown>): void },
): Promise<PurchaseInvoiceSubmitPreparation> {
  // The submit-for-approval flow declares its inputs in control.entity_flow_field.
  // The 'notes' binding carries metadata.target = { kind: 'comment',
  // comment_intent: 'submission_note', ... } so dispatchFlowFieldBindings
  // routes the value into document.comment. Nothing here hardcodes that mapping.

  return runInTransaction(db, async (trx) => {

    // Step 1: Load invoice + validate
    const invoiceResult = await sql<Record<string, unknown>>`
      SELECT * FROM document.purchase_invoice
      WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
      LIMIT 1 FOR UPDATE
    `.execute(trx);

    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      throw new PurchaseInvoiceSubmitPreparationError("INVOICE_NOT_FOUND", "Invoice not found", 404);
    }

    const currentStatus = String(invoice["status"] ?? "").toLowerCase();
    if (currentStatus !== "draft") {
      throw new PurchaseInvoiceSubmitPreparationError(
        "INVALID_STATUS",
        `Invoice is in '${currentStatus}' — only draft invoices can be submitted`,
        422,
      );
    }

    const lineCountRows = await sql<{ line_count: string }>`
      SELECT COUNT(*)::text AS line_count
        FROM document.purchase_invoice_line
       WHERE tenant_id = ${tenantId}::uuid
         AND purchase_invoice_id = ${invoiceId}::uuid
    `.execute(trx);
    const lineCount = Number(lineCountRows.rows[0]?.line_count ?? 0);
    if (lineCount === 0) {
      throw new PurchaseInvoiceSubmitPreparationError(
        "NO_LINES",
        "Invoice must have at least one line before submitting",
        422,
      );
    }

    // Auto-resolve match_status for non-PO invoices (sets match_status = 'unmatched').
    // PO-based invoices are matched at post time; non-PO invoices have no PO to match against.
    const invoiceSource = String(invoice["invoice_source"] ?? "");
    if (invoiceSource === "non_po" || invoiceSource === "one_time_supplier") {
      await matchInvoice(trx, tenantId, invoiceId, principalId, logger);
    }

    // Validate cross-entity invariants BEFORE any status change. Aggregates
    // ALL violations into a single 422 so the user can fix everything in one
    // pass rather than chasing repeated submit failures.
    const invariants = await validatePurchaseInvoiceInvariants(trx, tenantId, invoiceId, { phase: "submit" });
    if (!invariants.ok) {
      throw new PurchaseInvoiceSubmitPreparationError(
        "INVOICE_INVARIANT_VIOLATION",
        `${invariants.violations.length} invariant violation(s) prevent submit.`,
        422,
        { violations: invariants.violations },
      );
    }

    // Identity now resolves from purchase_invoice header fields and live master joins.
    const snapActor = principalId ?? V_NIL;

    // Seed retention PTA rows from PC retention components (P2 v1.2).
    // Runs BEFORE status change so PTA rows exist before workflow inspects them. Idempotent
    // via ON CONFLICT (invoice_id, clause_code, line_id, sequence). Withholding
    // skipped pending PTA clause_type CHECK extension (see service).
    await seedRetentionFromPricingComponents(trx, tenantId, invoiceId, snapActor, logger);

    const now = new Date();

    // Step 2: Resolve workflow template via workflow_definition rules
    const template = await resolveWorkflowTemplate(trx, tenantId, "purchase_invoice", invoice);

    if (!template || template.stages.length === 0) {
      throw new PurchaseInvoiceSubmitPreparationError(
        "WORKFLOW_TEMPLATE_NOT_FOUND",
        "No active purchase-invoice approval workflow is configured.",
        422,
      );
    }

    // Create or resolve the workflow request. Self-approval, when allowed,
    // is a separate lifecycle decision; preparation never skips the submitted state.
    const wreqResult = await sql<{ id: string }>`
      INSERT INTO document.workflow_request (
        tenant_id, workflow_type, workflow_template_id, entity_type, entity_id,
        entity_snapshot, requested_by, status, created_by, created_at
      ) VALUES (
        ${tenantId}, 'approval', ${template.id},
        'purchase_invoice', ${invoiceId},
        ${JSON.stringify(invoice)}::jsonb,
        ${principalId ?? V_NIL},
        'pending',
        ${principalId ?? V_NIL},
        ${now}
      )
      ON CONFLICT (tenant_id, entity_type, entity_id)
        WHERE status = 'pending'
      DO NOTHING
      RETURNING id
    `.execute(trx);

    let wreqId: string;
    if (wreqResult.rows[0]) {
      wreqId = wreqResult.rows[0].id;
    } else {
      const existing = await sql<{ id: string }>`
        SELECT id FROM document.workflow_request
        WHERE tenant_id = ${tenantId} AND entity_type = 'purchase_invoice'
          AND entity_id = ${invoiceId} AND status = 'pending'
        LIMIT 1
      `.execute(trx);
      if (!existing.rows[0]) {
        throw new PurchaseInvoiceSubmitPreparationError(
          "WORKFLOW_REQUEST_CONFLICT",
          "Another workflow request is already pending for this invoice",
          409,
        );
      }
      wreqId = existing.rows[0].id;
    }

    // Step 5: Create workflow stages
    for (const stage of template.stages) {
      const isStageActive = stage.stage_no === 1;
      await sql`
        INSERT INTO document.workflow_stage (
          tenant_id, workflow_request_id, template_stage_id,
          stage_no, name, mode, quorum, status, started_at, created_by, created_at
        ) VALUES (
          ${tenantId}, ${wreqId}, ${stage.id},
          ${stage.stage_no}, ${stage.name}, ${stage.mode},
          ${stage.quorum ? JSON.stringify(stage.quorum) : null}::jsonb,
          ${isStageActive ? "active" : "pending"},
          ${isStageActive ? now : null},
          ${principalId ?? V_NIL},
          ${now}
        )
        ON CONFLICT (workflow_request_id, stage_no) DO NOTHING
      `.execute(trx);
    }

    // Step 6: Create work_items for stage 1 approvers
    const stage1 = template.stages.find((s) => s.stage_no === 1);
    if (stage1) {
      const approvers = await resolveApprovers(
        trx, tenantId, template.id, stage1.stage_no, invoice, principalId,
      );

      const stageRow = await sql<{ id: string }>`
        SELECT id FROM document.workflow_stage
        WHERE workflow_request_id = ${wreqId} AND stage_no = 1
        LIMIT 1
      `.execute(trx);
      const stageDbId = stageRow.rows[0]?.id;

      if (stageDbId && approvers.length > 0) {
        for (const approverId of approvers) {
          await sql`
            INSERT INTO event.work_item (
              tenant_id, workflow_request_id, workflow_stage_id,
              task_type, designated_id, assignee_id,
              status, created_by, created_at
            ) VALUES (
              ${tenantId}, ${wreqId}, ${stageDbId},
              'approval', ${approverId}, ${approverId},
              'pending', ${principalId ?? V_NIL}, ${now}
            )
            ON CONFLICT DO NOTHING
          `.execute(trx);
        }
      }
    }

    const dispatched = await dispatchFlowFieldBindings(trx, {
      tenantId,
      entityName: "purchase_invoice",
      entityId:   invoiceId,
      flowCode:   "submit_for_approval",
      stepKey:    "submit",
      draft:      body,
      principalId,
      workflowRequestId: wreqId,
    });

    logger?.info("ap_invoice_submit_prepared", {
      tenantId, invoiceId, wreqId,
      stages: template.stages.length,
      commentsCreated: dispatched.commentsCreated,
    });
    return {
      statusPatch: { workflow_request_id: wreqId },
      context: {
        workflowRequestId: wreqId,
        workflowTemplateId: template.id,
        stageCount: template.stages.length,
        commentsCreated: dispatched.commentsCreated,
      },
    };
  });
}

async function runInTransaction<T>(
  db: AnyDb,
  work: (trx: AnyDb) => Promise<T>,
): Promise<T> {
  return (db as { isTransaction?: boolean }).isTransaction === true
    ? work(db)
    : db.transaction().execute((trx) => work(trx));
}

/** @deprecated Submit must enter through the records lifecycle orchestrator. */
export async function handleSubmitForApproval(
  _db: AnyDb,
  _tenantId: string,
  _invoiceId: string,
  _principalId: string | null,
  _body: Record<string, unknown>,
): Promise<HandlerResult> {
  return {
    status: 409,
    body: {
      error: "LIFECYCLE_ORCHESTRATOR_REQUIRED",
      message: "Purchase-invoice submit must run through the lifecycle orchestrator.",
    },
  };
}
