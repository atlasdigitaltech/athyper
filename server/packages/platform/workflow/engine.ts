/**
 * WorkflowEngine — core workflow processing service.
 *
 * Responsibilities:
 *   - shouldRequireWorkflow: evaluate control.workflow_definition rules
 *   - createRequest: create workflow_request + stages + work_items in a transaction
 *   - processAction: approve/reject/delegate on a work_item
 *   - evaluateQuorum: advance or close stages after each action
 *   - getInbox / getInboxCount: actor's pending work_items
 *   - getRequestDetail: full approval context for a request
 *   - getActivity: audit.audit_log (inbox_routing_event) for a request
 *
 * DB constraint relied upon:
 *   wreq_one_pending_per_entity_uix  — one pending workflow_request per entity.
 *   The engine checks for an existing pending request before inserting (idempotent).
 */

import { appendAuditEvent, Inbox } from "@athyper/svc-audit";
import { emitOutboxEvent } from "@athyper/svc-shared";
import { sql, type Kysely, type Transaction } from "kysely";
import { evaluateRuntimeCondition } from "./gate-evaluator.js";
import type { ApproverResolverService } from "./approver-resolver.service.js";
import {
  ConventionWorkflowSourceEntityAdapter,
  type WorkflowSourceEntityAdapter,
} from "./source-entity-adapter.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowEngineDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
  /**
   * Optional approver resolver. When present the engine delegates assign_to
   * resolution to it, enabling role_based, group_based, and hierarchy_based
   * strategies. Without it the engine falls back to treating assign_to.value
   * as a direct principal or group UUID.
   */
  approverResolver?: ApproverResolverService;
  sourceEntityAdapter?: WorkflowSourceEntityAdapter;
}

interface CompiledStage {
  stage_no: number;
  name?: string;
  mode?: string;
  quorum?: { strategy: string; required?: number } | null;
  sla_policy_id?: string | null;
  template_stage_id?: string | null;
  rules?: CompiledRule[];
}

interface CompiledTemplate {
  stages: CompiledStage[];
  behaviors: Record<string, unknown>;
}

interface CompiledRule {
  priority?: number;
  conditions?: unknown;
  assign_to: { type: string; value?: string };
}

export interface ShouldRequireResult {
  required: boolean;
  definitionId?: string;
  templateCode?: string;
  workflowType?: string;
}

export interface CreateRequestParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  entityVersionId?: string;
  /**
   * Full entity payload used for JSONLogic rule evaluation + entity_snapshot.
   * companyCodeId and legalEntityId are merged in automatically — callers do
   * not need to duplicate them inside payload.
   */
  payload: Record<string, unknown>;
  /**
   * Company code UUID at the time of submission.
   * Injected as `company_code_id` into the JSONLogic evaluation context so
   * workflow definitions can branch by company without a dedicated column.
   */
  companyCodeId?: string;
  /**
   * Legal entity UUID at the time of submission.
   * Injected as `legal_entity_id` into the JSONLogic evaluation context.
   */
  legalEntityId?: string;
  requestedBy: string;
  correlationId?: string;
  /** Override approvers from policy engine (Phase 5). */
  overrideApprovers?: Array<{ type: string; value: string }>;
}

export interface CreateRequestResult {
  id: string;
  /** true when an existing pending request was returned (idempotent). */
  isExisting: boolean;
  status: string;
}

export interface ProcessActionParams {
  workItemId: string;
  actorId: string;
  tenantId: string;
  /** approve | reject | return | escalate | delegate | acknowledge | flag | read | request_info | comment */
  action: string;
  comment?: string;
  /** Required when action === 'delegate'. */
  delegateTo?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";
const TERMINAL_STATUSES = new Set(["completed", "skipped", "escalated"]);
const DECISION_ACTIONS = new Set(["approve", "reject", "return"]);
const POSITIVE_DECISIONS = new Set(["approve"]);
const NEGATIVE_DECISIONS = new Set(["reject", "return"]);
const SIDE_EFFECT_ACTIONS = new Set(["acknowledge", "read", "request_info", "flag", "comment", "escalate"]);

// ── Engine ────────────────────────────────────────────────────────────────────

export class WorkflowEngine {
  constructor(private readonly deps: WorkflowEngineDeps) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): Kysely<any> { return this.deps.db; }

  private get sourceEntityAdapter(): WorkflowSourceEntityAdapter {
    return this.deps.sourceEntityAdapter ?? new ConventionWorkflowSourceEntityAdapter(this.deps.logger);
  }

  // ── shouldRequireWorkflow ──────────────────────────────────────────────────

  /**
   * Evaluate control.workflow_definition rules against an entity payload.
   *
   * evaluationPayload should already contain org-context fields
   * (company_code_id, legal_entity_id, tenant_id) so JSONLogic conditions
   * can branch at sub-tenant level. Use buildEvaluationPayload() to construct it.
   */
  async shouldRequireWorkflow(
    entityType: string,
    tenantId: string,
    evaluationPayload: Record<string, unknown>,
  ): Promise<ShouldRequireResult> {
    const now = new Date();
    const defs = await this.db
      .selectFrom("control.workflow_definition as wd")
      .select(["wd.id", "wd.rules"])
      .where("wd.tenant_id", "in", [tenantId, "00000000-0000-0000-0000-000000000000"])
      .where("wd.entity_type", "=", entityType)
      .where("wd.is_active", "=", true)
      .where("wd.effective_from", "<=", now)
      .where((eb) =>
        eb.or([
          eb("wd.effective_to", "is", null),
          eb("wd.effective_to", ">", now),
        ]),
      )
      .orderBy(sql<number>`case when wd.tenant_id = ${tenantId} then 0 else 1 end`, "asc")
      .orderBy("wd.effective_from", "asc")
      .execute();

    for (const def of defs) {
      const rules = (
        typeof def.rules === "string" ? JSON.parse(def.rules) : def.rules
      ) as Array<{
        condition?: unknown;
        template_code: string;
        workflow_type?: string;
        priority?: number;
      }>;

      const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
      for (const rule of sorted) {
        if (rule.condition == null || evaluateRuntimeCondition(rule.condition, evaluationPayload)) {
          return {
            required: true,
            definitionId: def.id as string,
            templateCode: rule.template_code,
            workflowType: rule.workflow_type ?? "approval",
          };
        }
      }
    }
    return { required: false };
  }

  // ── createRequest ──────────────────────────────────────────────────────────

  async createRequest(params: CreateRequestParams): Promise<CreateRequestResult> {
    const {
      tenantId,
      entityType,
      entityId,
      entityVersionId,
      payload,
      companyCodeId,
      legalEntityId,
      requestedBy,
      correlationId,
      overrideApprovers,
    } = params;

    // Build evaluation payload: merge org-context fields so JSONLogic conditions
    // can branch by company code / legal entity without them needing to be in
    // the caller's payload explicitly.
    const evaluationPayload: Record<string, unknown> = {
      ...payload,
      tenant_id: tenantId,
      ...(companyCodeId ? { company_code_id: companyCodeId } : {}),
      ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
    };

    // Idempotency: return existing pending request if one exists
    const existing = await this.db
      .selectFrom("document.workflow_request as wr")
      .select(["wr.id", "wr.status"])
      .where("wr.tenant_id", "=", tenantId)
      .where("wr.entity_type", "=", entityType)
      .where("wr.entity_id", "=", entityId)
      .where("wr.status", "=", "pending")
      .executeTakeFirst();

    if (existing) {
      return { id: existing.id as string, isExisting: true, status: existing.status as string };
    }

    // Find matching workflow definition + template
    const wfReq = await this.shouldRequireWorkflow(entityType, tenantId, evaluationPayload);
    if (!wfReq.required || !wfReq.definitionId || !wfReq.templateCode) {
      throw Object.assign(
        new Error("NO_WORKFLOW_DEFINITION: no active definition matches this entity"),
        { code: 422 },
      );
    }

    const template = await this.db
      .selectFrom("control.workflow_template as wt")
      .select([
        "wt.id",
        "wt.code",
        "wt.compiled_json",
        "wt.compiled_hash",
        "wt.behaviors",
        "wt.sla_policy_id",
      ])
      .where("wt.code", "=", wfReq.templateCode)
      .where((eb) =>
        eb.or([
          eb("wt.tenant_id", "=", tenantId),
          eb("wt.tenant_id", "is", null),
        ]),
      )
      .where("wt.is_active", "=", true)
      // Prefer tenant-specific over platform-global
      .orderBy("wt.tenant_id", (ob) => ob.desc().nullsLast())
      .executeTakeFirst();

    if (!template) {
      throw Object.assign(
        new Error(`TEMPLATE_NOT_FOUND: '${wfReq.templateCode}'`),
        { code: 422 },
      );
    }
    let compiledJson = (
      typeof template.compiled_json === "string"
        ? JSON.parse(template.compiled_json)
        : template.compiled_json
    ) as CompiledTemplate | null;

    // Platform seed templates are intentionally stored in normalized stage/rule
    // tables. Build an immutable request snapshot from those rows when a
    // precompiled artifact has not been published yet.
    if (!compiledJson?.stages?.length) {
      const stageRows = await this.db
        .selectFrom("control.workflow_template_stage as wts")
        .select(["wts.id", "wts.stage_no", "wts.name", "wts.mode", "wts.quorum", "wts.sla_policy_id"])
        .where("wts.workflow_template_id", "=", template.id)
        .orderBy("wts.stage_no", "asc")
        .execute();
      const ruleRows = await this.db
        .selectFrom("control.workflow_template_rule as wtr")
        .select(["wtr.stage_no", "wtr.priority", "wtr.conditions", "wtr.assign_to"])
        .where("wtr.workflow_template_id", "=", template.id)
        .orderBy("wtr.priority", "asc")
        .execute();
      compiledJson = {
        behaviors: {},
        stages: stageRows.map((stage) => ({
          stage_no: Number(stage.stage_no),
          name: stage.name as string,
          mode: stage.mode as string,
          quorum: parseJsonValue(stage.quorum) as CompiledStage["quorum"],
          sla_policy_id: stage.sla_policy_id as string | null,
          template_stage_id: stage.id as string,
          rules: ruleRows
            .filter((rule) => rule.stage_no == null || Number(rule.stage_no) === Number(stage.stage_no))
            .map((rule) => ({
              priority: Number(rule.priority),
              conditions: parseJsonValue(rule.conditions),
              assign_to: parseJsonValue(rule.assign_to) as CompiledRule["assign_to"],
            })),
        })),
      };
    }

    if (!compiledJson.stages.length) {
      throw Object.assign(new Error(`TEMPLATE_EMPTY: '${wfReq.templateCode}' has no stages`), { code: 422 });
    }

    const behaviors = (
      typeof template.behaviors === "string"
        ? JSON.parse(template.behaviors)
        : template.behaviors
    ) as Record<string, unknown> ?? {};

    const createWithin = async (trx: Transaction<any>): Promise<CreateRequestResult> => {
      // Insert workflow_request
      const reqRow = await trx
        .insertInto("document.workflow_request" as never)
        .values({
          tenant_id: tenantId,
          workflow_type: wfReq.workflowType ?? "approval",
          workflow_definition_id: wfReq.definitionId,
          workflow_template_id: template.id,
          template_snapshot: JSON.stringify({ ...compiledJson, behaviors }),
          entity_type: entityType,
          entity_id: entityId,
          entity_version_id: entityVersionId ?? null,
          entity_snapshot:
            behaviors["capture_entity_snapshot"] !== false
              ? JSON.stringify(payload)
              : null,
          requested_by: requestedBy,
          requested_at: new Date(),
          status: "pending",
          metadata: "{}",
          correlation_id: correlationId ?? null,
          created_by: requestedBy,
        } as never)
        .returning("id" as never)
        .executeTakeFirstOrThrow();

      const requestId = (reqRow as Record<string, unknown>).id as string;

      // Insert all workflow_stage rows upfront (version-pinned from compiledJson)
      for (const stage of compiledJson.stages ?? []) {
        await trx
          .insertInto("document.workflow_stage" as never)
          .values({
            tenant_id: tenantId,
            workflow_request_id: requestId,
            template_stage_id: stage.template_stage_id ?? null,
            stage_no: stage.stage_no,
            name: stage.name ?? null,
            mode: stage.mode ?? "serial",
            quorum: stage.quorum != null ? JSON.stringify(stage.quorum) : null,
            sla_policy_id: stage.sla_policy_id ?? template.sla_policy_id ?? null,
            status: "pending",
            created_by: requestedBy,
          } as never)
          .execute();
      }

      // Activate stage 1
      const stage1Row = await trx
        .selectFrom("document.workflow_stage as ws")
        .select(["ws.id", "ws.sla_policy_id"])
        .where("ws.workflow_request_id", "=", requestId)
        .where("ws.stage_no", "=", 1)
        .executeTakeFirstOrThrow();

      const stage1 = stage1Row as Record<string, unknown>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trx.updateTable("document.workflow_stage") as any)
        .set({
          status: "active",
          started_at: new Date(),
          updated_at: new Date(),
          updated_by: requestedBy,
        })
        .where("id", "=", stage1.id)
        .execute();

      // Create work_items for stage 1
      const stage1Compiled = compiledJson.stages?.[0];
      const rules = overrideApprovers
        ? overrideApprovers.map((a, i) => ({ priority: i + 1, assign_to: { type: a.type, value: a.value } }))
        : (stage1Compiled?.rules ?? []);

      await this.createWorkItems(trx, {
        tenantId,
        requestId,
        stageId: stage1.id as string,
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        stageNo: stage1Compiled?.stage_no ?? 1,
        stageName: stage1Compiled?.name ?? "Approval",
        stageMode: stage1Compiled?.mode ?? "serial",
        rules,
        payload: evaluationPayload,
        slaPolicyId: stage1.sla_policy_id as string | null,
        createdBy: requestedBy,
      });

      await this.logEvent(trx, {
        tenantId,
        eventType: "request_created",
        entityType,
        entityId: requestId,
        actorId: requestedBy,
        instanceId: requestId,
        toStatus: "pending",
        correlationId,
        detail: {
          definition_id: wfReq.definitionId,
          template_code: wfReq.templateCode,
        },
      });

      return { id: requestId, isExisting: false, status: "pending" };
    };

    if (
      !isKyselyTransaction(this.db)
      && typeof (this.db as { transaction?: unknown }).transaction === "function"
    ) {
      return this.db.transaction().execute((trx) => createWithin(trx));
    }
    return createWithin(this.db as unknown as Transaction<any>);
  }

  // ── processAction ──────────────────────────────────────────────────────────

  async processAction(params: ProcessActionParams): Promise<void> {
    const { workItemId, actorId, tenantId, action, comment, delegateTo } = params;

    await this.db.transaction().execute(async (trx) => {
      await setTransactionPrincipal(trx, actorId);
      // Lock work_item row for the duration of the transaction
      const itemRow = await trx
        .selectFrom("event.work_item as wi")
        .selectAll()
        .where("wi.id", "=", workItemId)
        .where("wi.tenant_id", "=", tenantId)
        .forUpdate()
        .executeTakeFirst();

      if (!itemRow) {
        throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: 404 });
      }
      const wi = itemRow as Record<string, unknown>;

      if (TERMINAL_STATUSES.has(wi.status as string)) {
        throw Object.assign(new Error("WORK_ITEM_ALREADY_CLOSED"), { code: 409 });
      }

      const auth = await this.authorizeWorkItemAction(trx, {
        tenantId,
        actorId,
        workItem: wi,
      });

      if (!auth.allowed) {
        throw Object.assign(new Error("NOT_AUTHORIZED_FOR_WORK_ITEM"), { code: 403 });
      }

      // Load request for behaviors + entity context
      const reqRow = await trx
        .selectFrom("document.workflow_request as wr")
        .select([
          "wr.requested_by",
          "wr.template_snapshot",
          "wr.entity_type",
          "wr.entity_id",
          "wr.entity_snapshot",
        ])
        .where("wr.id", "=", wi.workflow_request_id)
        .executeTakeFirst();

      if (!reqRow) {
        throw Object.assign(new Error("REQUEST_NOT_FOUND"), { code: 404 });
      }
      const req = reqRow as Record<string, unknown>;

      const snapshot = (
        typeof req.template_snapshot === "string"
          ? JSON.parse(req.template_snapshot)
          : req.template_snapshot
      ) as CompiledTemplate;
      const behaviors = snapshot?.behaviors ?? {};

      if (!DECISION_ACTIONS.has(action) && action !== "delegate" && !SIDE_EFFECT_ACTIONS.has(action)) {
        throw Object.assign(new Error("INVALID_WORK_ITEM_ACTION"), { code: 400 });
      }

      // Self-approval guard
      if (
        behaviors["allow_self_approval"] === false &&
        actorId === (req.requested_by as string) &&
        action === "approve"
      ) {
        throw Object.assign(new Error("SELF_APPROVAL_NOT_ALLOWED"), { code: 422 });
      }

      // Delegate: reassign the work_item, not a terminal decision
      if (action === "delegate") {
        if (!delegateTo) {
          throw Object.assign(new Error("DELEGATE_TARGET_REQUIRED"), { code: 400 });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (trx.updateTable("event.work_item") as any)
          .set({
            assignee_id: delegateTo,
            status: "assigned",
            assigned_at: new Date(),
            updated_at: new Date(),
            updated_by: actorId,
          })
          .where("id", "=", workItemId)
          .execute();

        await this.logEvent(trx, {
          tenantId,
          eventType: "item_reassigned",
          entityType: req.entity_type as string,
          entityId: wi.workflow_request_id as string,
          actorId,
          instanceId: wi.workflow_request_id as string,
          stepInstanceId: workItemId,
          action,
          comment,
          detail: { delegate_to: delegateTo },
        });
        return;
      }

      if (SIDE_EFFECT_ACTIONS.has(action)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (trx.updateTable("event.work_item") as any)
          .set({
            updated_at: new Date(),
            updated_by: actorId,
          })
          .where("id", "=", workItemId)
          .execute();

        await this.logEvent(trx, {
          tenantId,
          eventType: `item_${action}`,
          entityType: req.entity_type as string,
          entityId: wi.workflow_request_id as string,
          actorId,
          instanceId: wi.workflow_request_id as string,
          stepInstanceId: workItemId,
          action,
          comment,
          detail: { side_effect: true },
        });
        return;
      }

      await this.enforceSerialDecisionOrder(trx, {
        tenantId,
        workItem: wi,
        action,
      });

      // Terminal decision
      const newStatus = "completed";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trx.updateTable("event.work_item") as any)
        .set({
          status: newStatus,
          decision: action,
          reason: comment ?? null,
          completed_at: new Date(),
          // Claim group/team assignment on first action
          ...(auth.claimed
            ? { assignee_id: actorId, assigned_at: new Date() }
            : {}),
          updated_at: new Date(),
          updated_by: actorId,
        })
        .where("id", "=", workItemId)
        .execute();

      await this.logEvent(trx, {
        tenantId,
        eventType: "item_completed",
        entityType: req.entity_type as string,
        entityId: wi.workflow_request_id as string,
        actorId,
        instanceId: wi.workflow_request_id as string,
        stepInstanceId: workItemId,
        action,
        comment,
        toStatus: newStatus,
        detail: { decision: action },
      });

      // Quorum check for stage-linked work items
      if (wi.workflow_stage_id) {
        const entityPayload = (
          typeof req.entity_snapshot === "string"
            ? JSON.parse(req.entity_snapshot)
            : req.entity_snapshot
        ) as Record<string, unknown> ?? {};

        await this.evaluateQuorum(trx, {
          stageId: wi.workflow_stage_id as string,
          requestId: wi.workflow_request_id as string,
          tenantId,
          actorId,
          entityType: req.entity_type as string,
          sourceEntityId: req.entity_id as string,
          entityPayload,
          behaviors,
          templateSnapshot: snapshot,
        });
      }
    });
  }

  // ── evaluateQuorum ─────────────────────────────────────────────────────────

  private async authorizeWorkItemAction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      actorId: string;
      workItem: Record<string, unknown>;
    },
  ): Promise<{ allowed: boolean; claimed: boolean }> {
    const { tenantId, actorId, workItem } = params;

    if (actorId === SYSTEM_ACTOR) return { allowed: true, claimed: false };

    const assigneeId = workItem.assignee_id as string | null;
    if (assigneeId === actorId) return { allowed: true, claimed: false };

    if (assigneeId) {
      const delegated = await this.hasActiveDelegation(trx, {
        tenantId,
        actorId,
        delegatorId: assigneeId,
      });
      if (delegated) return { allowed: true, claimed: false };
    }

    const groupId = workItem.assignee_group_id as string | null;
    if (groupId && assigneeId == null) {
      const isMember = await this.isGroupMember(trx, { tenantId, actorId, groupId });
      if (isMember) return { allowed: true, claimed: true };
    }

    const teamId = workItem.assignee_team_id as string | null;
    if (teamId && assigneeId == null) {
      const isMember = await this.isTeamMember(trx, { tenantId, actorId, teamId });
      if (isMember) return { allowed: true, claimed: true };
    }

    return { allowed: false, claimed: false };
  }

  private async isGroupMember(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: { tenantId: string; actorId: string; groupId: string },
  ): Promise<boolean> {
    const row = await trx
      .selectFrom("master.auth_current_group_member_v as agm" as never)
      .select("agm.group_id" as never)
      .where("agm.tenant_id" as never, "=", params.tenantId as never)
      .where("agm.principal_id" as never, "=", params.actorId as never)
      .where("agm.group_id" as never, "=", params.groupId as never)
      .executeTakeFirst();

    return !!row;
  }

  private async isTeamMember(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: { tenantId: string; actorId: string; teamId: string },
  ): Promise<boolean> {
    const result = await sql<{ team_id: string }>`
      SELECT tm.team_id
        FROM master.team_member AS tm
        JOIN master.team AS t
          ON t.tenant_id = tm.tenant_id
         AND t.id = tm.team_id
       WHERE tm.tenant_id = ${params.tenantId}::uuid
         AND tm.principal_id = ${params.actorId}::uuid
         AND tm.team_id = ${params.teamId}::uuid
         AND tm.left_at IS NULL
         AND t.status = 'active'
         AND t.effective_from <= CURRENT_DATE
         AND (t.effective_until IS NULL OR t.effective_until > CURRENT_DATE)
       LIMIT 1
    `.execute(trx);

    return result.rows.length > 0;
  }

  private async hasActiveDelegation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: { tenantId: string; actorId: string; delegatorId: string },
  ): Promise<boolean> {
    const row = await trx
      .selectFrom("master.auth_delegation as dg" as never)
      .select("dg.id" as never)
      .where("dg.tenant_id" as never, "=", params.tenantId as never)
      .where("dg.delegate_id" as never, "=", params.actorId as never)
      .where("dg.delegator_id" as never, "=", params.delegatorId as never)
      .where("dg.status" as never, "=", "active" as never)
      .where("dg.effective_from" as never, "<=", new Date() as never)
      .where("dg.effective_until" as never, ">", new Date() as never)
      .executeTakeFirst();

    return !!row;
  }

  private async enforceSerialDecisionOrder(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      action: string;
      workItem: Record<string, unknown>;
    },
  ): Promise<void> {
    const { tenantId, action, workItem } = params;
    if (!DECISION_ACTIONS.has(action) || !workItem.workflow_stage_id) return;

    const stage = await trx
      .selectFrom("document.workflow_stage as serial_ws" as never)
      .select(["serial_ws.id", "serial_ws.mode"] as never[])
      .where("serial_ws.id" as never, "=", workItem.workflow_stage_id as never)
      .where("serial_ws.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!stage || stage["mode"] !== "serial") return;

    const firstOpen = await trx
      .selectFrom("event.work_item as serial_wi" as never)
      .select(["serial_wi.id", "serial_wi.order_index"] as never[])
      .where("serial_wi.tenant_id" as never, "=", tenantId as never)
      .where("serial_wi.workflow_stage_id" as never, "=", workItem.workflow_stage_id as never)
      .where("serial_wi.status" as never, "in" as never, ["pending", "assigned", "in_progress"] as never)
      .orderBy("serial_wi.order_index" as never, "asc" as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!firstOpen || firstOpen["id"] === workItem.id) return;

    const currentOrder = Number(workItem.order_index ?? 0);
    const firstOrder = Number(firstOpen["order_index"] ?? 0);
    if (currentOrder > firstOrder) {
      throw Object.assign(new Error("WORK_ITEM_NOT_ACTIVE_SERIAL_ORDER"), { code: 409 });
    }
  }

  private async evaluateQuorum(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      stageId: string;
      requestId: string;
      tenantId: string;
      actorId: string;
      entityType: string;
      sourceEntityId: string;
      entityPayload: Record<string, unknown>;
      behaviors: Record<string, unknown>;
      templateSnapshot: CompiledTemplate;
    },
  ): Promise<void> {
    const {
      stageId,
      requestId,
      tenantId,
      actorId,
      entityType,
      sourceEntityId,
      entityPayload,
      behaviors,
      templateSnapshot,
    } = params;

    // Lock stage for serialized quorum evaluation
    const stageRow = await trx
      .selectFrom("document.workflow_stage as ws")
      .selectAll()
      .where("ws.id", "=", stageId)
      .forUpdate()
      .executeTakeFirst();

    if (!stageRow) return;
    const ws = stageRow as Record<string, unknown>;
    if (ws.status !== "active") return;

    // Count work_item decisions for this stage
    const items = await trx
      .selectFrom("event.work_item as wi")
      .select(["wi.status", "wi.decision"])
      .where("wi.workflow_stage_id", "=", stageId)
      .execute();

    const total    = items.length;
    const positive = items.filter((i) => POSITIVE_DECISIONS.has((i as Record<string, unknown>).decision as string)).length;
    const negative = items.filter((i) => NEGATIVE_DECISIONS.has((i as Record<string, unknown>).decision as string)).length;
    const pending  = items.filter((i) => {
      const decision = (i as Record<string, unknown>).decision as string;
      return !POSITIVE_DECISIONS.has(decision) && !NEGATIVE_DECISIONS.has(decision);
    }).length;

    const quorum = ws.quorum != null
      ? (typeof ws.quorum === "string" ? JSON.parse(ws.quorum) : ws.quorum) as { strategy: string; required?: number }
      : null;

    let stageComplete = false;
    let outcome: "approved" | "rejected" = "approved";

    // Early reject if behavior enabled and any negative vote exists
    if (behaviors["early_reject_on_quorum_fail"] && negative > 0) {
      stageComplete = true;
      outcome = "rejected";
    } else if (!quorum || quorum.strategy === "unanimous") {
      if (pending === 0) {
        stageComplete = true;
        outcome = negative > 0 ? "rejected" : "approved";
      }
    } else if (quorum.strategy === "count") {
      const required = quorum.required ?? 1;
      if (positive >= required) {
        stageComplete = true;
        outcome = "approved";
      } else if (total - negative < required) {
        // Not enough remaining approvals possible
        stageComplete = true;
        outcome = "rejected";
      }
    } else if (quorum.strategy === "percent") {
      const required = quorum.required ?? 100;
      if (total > 0) {
        if ((positive / total) * 100 >= required) {
          stageComplete = true;
          outcome = "approved";
        } else if (((total - negative) / total) * 100 < required) {
          stageComplete = true;
          outcome = "rejected";
        }
      }
    }

    if (!stageComplete) return;

    // Close this stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (trx.updateTable("document.workflow_stage") as any)
      .set({
        status: "completed",
        outcome,
        completed_at: new Date(),
        updated_at: new Date(),
        updated_by: actorId,
      })
      .where("id", "=", stageId)
      .execute();

    await this.logEvent(trx, {
      tenantId,
      eventType: "stage_completed",
      entityType,
      entityId: requestId,
      actorId,
      instanceId: requestId,
      stepInstanceId: stageId,
      toStatus: "completed",
      detail: { outcome, stage_no: ws.stage_no },
    });

    const stageNo = ws.stage_no as number;

    if (outcome === "approved") {
      // Try to activate the next stage
      const nextStageRow = await trx
        .selectFrom("document.workflow_stage as ws")
        .select(["ws.id", "ws.stage_no", "ws.mode", "ws.sla_policy_id"])
        .where("ws.workflow_request_id", "=", requestId)
        .where("ws.stage_no", "=", stageNo + 1)
        .executeTakeFirst();

      if (nextStageRow) {
        const ns = nextStageRow as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (trx.updateTable("document.workflow_stage") as any)
          .set({
            status: "active",
            started_at: new Date(),
            updated_at: new Date(),
            updated_by: actorId,
          })
          .where("id", "=", ns.id)
          .execute();

        const nextCompiledStage = templateSnapshot.stages?.find(
          (s) => s.stage_no === ns.stage_no,
        );

        await this.createWorkItems(trx, {
          tenantId,
          requestId,
          stageId: ns.id as string,
          sourceEntityType: entityType,
          sourceEntityId,
          stageNo: Number(ns.stage_no),
          stageName: nextCompiledStage?.name ?? `Stage ${String(ns.stage_no)}`,
          stageMode: ns.mode as string ?? "serial",
          rules: nextCompiledStage?.rules ?? [],
          payload: entityPayload,
          slaPolicyId: ns.sla_policy_id as string | null,
          createdBy: actorId,
        });

        await this.logEvent(trx, {
          tenantId,
          eventType: "stage_activated",
          entityType,
          entityId: requestId,
          actorId,
          instanceId: requestId,
          detail: { stage_no: ns.stage_no },
        });
        return;
      }
    }

    // No next stage (or stage rejected) — close the request
    const requestStatus = outcome === "approved" ? "approved" : "rejected";
    const requestDecision = outcome === "approved" ? "approve" : "reject";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (trx.updateTable("document.workflow_request") as any)
      .set({
        status: requestStatus,
        decision: requestDecision,
        decided_by: actorId,
        decided_at: new Date(),
        updated_at: new Date(),
        updated_by: actorId,
      })
      .where("id", "=", requestId)
      .execute();

    if (outcome === "rejected") {
      await (trx.updateTable("event.work_item") as any)
        .set({
          status: "skipped",
          completed_at: new Date(),
          updated_at: new Date(),
          updated_by: actorId,
        })
        .where("workflow_request_id", "=", requestId)
        .where("status", "in", ["pending", "assigned", "in_progress"])
        .execute();
    }

    const sourceOutcome = outcome === "rejected"
      && items.some((item) => (item as Record<string, unknown>).decision === "return")
      ? "returned" as const
      : outcome;

    await this.sourceEntityAdapter.completeWorkflow(trx, {
      tenantId,
      workflowRequestId: requestId,
      entityType,
      entityId: sourceEntityId,
      outcome: sourceOutcome,
      actorId,
    });

    await this.logEvent(trx, {
      tenantId,
      eventType: "request_completed",
      entityType,
      entityId: requestId,
      actorId,
      instanceId: requestId,
      toStatus: requestStatus,
      detail: { outcome: sourceOutcome, workflow_outcome: outcome, final_stage_no: stageNo },
    });
  }

  // ── createWorkItems ────────────────────────────────────────────────────────

  private async createWorkItems(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      requestId: string;
      stageId: string;
      sourceEntityType: string;
      sourceEntityId: string;
      stageNo: number;
      stageName: string;
      stageMode: string;
      rules: CompiledRule[];
      payload: Record<string, unknown>;
      slaPolicyId: string | null;
      createdBy: string;
    },
  ): Promise<void> {
    const {
      tenantId,
      requestId,
      stageId,
      sourceEntityType,
      sourceEntityId,
      stageNo,
      stageName,
      stageMode,
      rules,
      payload,
      slaPolicyId,
      createdBy,
    } = params;

    // Use ApproverResolverService when available (supports role/group/hierarchy strategies)
    // Fall back to synchronous inline resolution for backward compatibility.
    let assignees: Array<{ type: string; id: string }>;
    if (this.deps.approverResolver) {
      assignees = await this.deps.approverResolver.resolveFromRules(rules, {
        trx,
        tenantId,
        requestedBy: createdBy,
        payload,
      });
    } else {
      assignees = this.resolveAssignees(rules, payload);
    }

    if (assignees.length === 0) {
      this.deps.logger?.error("workflow_no_assignees", {
        stageId,
        requestId,
        ruleCount: rules.length,
      });
      throw Object.assign(new Error("WORKFLOW_STAGE_HAS_NO_ASSIGNEES"), { code: 422 });
    }

    const dueAt = slaPolicyId ? await this.computeDueAt(trx, slaPolicyId) : null;
    let orderIndex = 1;

    for (const assignee of assignees) {
      const inserted = await trx
        .insertInto("event.work_item" as never)
        .values({
          tenant_id: tenantId,
          task_type: "approval",
          workflow_request_id: requestId,
          workflow_stage_id: stageId,
          designated_id:
            assignee.type === "principal"
              ? assignee.id || null
              : null,
          designated_group_id:
            assignee.type === "group" ? assignee.id || null : null,
          assignee_id:
            assignee.type === "principal"
              ? assignee.id || null
              : null,
          assignee_group_id:
            assignee.type === "group"
              ? assignee.id || null
              : null,
          assignee_team_id:
            assignee.type === "team" ? assignee.id || null : null,
          order_index: stageMode === "serial" ? orderIndex++ : 1,
          status: "pending",
          assigned_at: new Date(),
          due_at: dueAt,
          metadata: "{}",
          created_by: createdBy,
        } as never)
        .returning("id" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      const workItemId = inserted?.["id"];
      if (assignee.type === "principal" && typeof workItemId === "string") {
        await this.emitWorkItemAssignedOutbox(trx, {
          tenantId,
          requestId,
          workItemId,
          stageId,
          stageNo,
          stageName,
          assigneeId: assignee.id,
          sourceEntityType,
          sourceEntityId,
          documentNumber: documentNumberFromPayload(payload, sourceEntityId),
          actorId: createdBy,
        });
      }
    }
  }

  private async emitWorkItemAssignedOutbox(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      requestId: string;
      workItemId: string;
      stageId: string;
      stageNo: number;
      stageName: string;
      assigneeId: string;
      sourceEntityType: string;
      sourceEntityId: string;
      documentNumber: string;
      actorId: string;
    },
  ): Promise<void> {
    const label = readableEntityLabel(params.sourceEntityType);
    const subject = `${label} approval needed`;
    const body = `${label} ${params.documentNumber} is waiting for your approval at ${params.stageName}.`;

    await emitOutboxEvent(trx, {
      tenantId: params.tenantId,
      topic: "wf",
      eventType: "wf.work_item.assigned",
      eventKey: `wf:work_item_assigned:${params.workItemId}:${params.assigneeId}`,
      entityType: params.sourceEntityType,
      entityId: params.sourceEntityId,
      aggregateId: params.requestId,
      aggregateType: "workflow_request",
      actorId: params.actorId,
      payload: {
        recipient_id: params.assigneeId,
        assigneeId: params.assigneeId,
        actor_id: params.actorId,
        workflowRequestId: params.requestId,
        workflowStageId: params.stageId,
        workItemId: params.workItemId,
        stageNo: params.stageNo,
        stageName: params.stageName,
        entity_type: params.sourceEntityType,
        entity_id: params.sourceEntityId,
        document_number: params.documentNumber,
        subject,
        title: subject,
        body,
        rendered_text: body,
        rendered_html: `<p>${escapeHtml(body)}</p>`,
        channels: ["email", "push"],
      },
    });
  }

  // ── resolveAssignees ───────────────────────────────────────────────────────

  private resolveAssignees(
    rules: CompiledRule[],
    payload: Record<string, unknown>,
  ): Array<{ type: string; id: string }> {
    const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const rule of sorted) {
      const matches =
        rule.conditions == null || evaluateRuntimeCondition(rule.conditions, payload);
      if (matches) {
        const at = rule.assign_to;
        const id = String(at.value ?? "");
        switch (at.type) {
          case "direct_principal":
          case "principal":
          case "requester":
            return id ? [{ type: "principal", id }] : [];
          case "group_based":
          case "group":
            return id ? [{ type: "group", id }] : [];
          case "team_based":
          case "team":
            return id ? [{ type: "team", id }] : [];
          default:
            return id ? [{ type: at.type, id }] : [];
        }
      }
    }
    return [];
  }

  // ── computeDueAt ───────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async computeDueAt(trx: Transaction<any>, slaPolicyId: string): Promise<Date | null> {
    const policy = await trx
      .selectFrom("control.workflow_sla_policy as sp")
      .select("sp.timers")
      .where("sp.id", "=", slaPolicyId)
      .executeTakeFirst();

    if (!policy) return null;
    const timers = (
      typeof policy.timers === "string" ? JSON.parse(policy.timers) : policy.timers
    ) as Array<{ after_minutes: number }>;
    if (!timers.length) return null;

    const first = timers.reduce((min, t) =>
      t.after_minutes < min.after_minutes ? t : min,
    );
    const due = new Date();
    due.setMinutes(due.getMinutes() + first.after_minutes);
    return due;
  }

  // ── getInboxCount ──────────────────────────────────────────────────────────

  async getInboxCount(params: { principalId: string; tenantId: string }): Promise<number> {
    const { principalId, tenantId } = params;
    const row = await this.db
      .selectFrom("event.work_item as wi")
      .select(this.db.fn.count("wi.id").as("count"))
      .where("wi.tenant_id", "=", tenantId)
      .where("wi.assignee_id", "=", principalId)
      .where("wi.status", "in", ["pending", "assigned", "in_progress"])
      .executeTakeFirst();
    return Number((row as Record<string, unknown>)?.count ?? 0);
  }

  // ── getInbox ───────────────────────────────────────────────────────────────

  async getInbox(params: {
    principalId: string;
    tenantId: string;
    limit: number;
    offset: number;
    view?: "assigned" | "delegated" | "escalated" | "completed";
  }): Promise<{ items: unknown[]; total: number }> {
    const { principalId, tenantId, limit, offset, view = "assigned" } = params;

    let base = this.db
      .selectFrom("event.work_item as wi")
      .innerJoin(
        "document.workflow_request as wr",
        "wr.id",
        "wi.workflow_request_id",
      )
      .leftJoin(
        "document.workflow_stage as ws",
        "ws.id",
        "wi.workflow_stage_id",
      )
      .where("wi.tenant_id", "=", tenantId);

    if (view === "assigned") {
      base = base
        .where("wi.assignee_id", "=", principalId)
        .where("wi.status", "in", ["pending", "assigned", "in_progress"]);
    } else if (view === "delegated") {
      base = base
        .where("wi.designated_id", "=", principalId)
        .where("wi.assignee_id", "!=", principalId)
        .where("wi.status", "in", ["assigned", "in_progress"]);
    } else if (view === "escalated") {
      base = base
        .where((eb) => eb.or([
          eb("wi.assignee_id", "=", principalId),
          eb("wi.designated_id", "=", principalId),
        ]))
        .where("wi.status", "=", "escalated");
    } else {
      base = base
        .where((eb) => eb.or([
          eb("wi.assignee_id", "=", principalId),
          eb("wi.designated_id", "=", principalId),
        ]))
        .where("wi.status", "in", ["completed", "skipped"]);
    }

    const [items, countRow] = await Promise.all([
      base
        .select([
          "wi.id",
          "wi.workflow_request_id as workflowRequestId",
          "wi.workflow_stage_id as workflowStageId",
          "wi.task_type as taskType",
          "wi.status",
          "wi.assigned_at as assignedAt",
          "wi.due_at as dueAt",
          "wi.decision",
          "wr.entity_type as entityType",
          "wr.entity_id as entityId",
          "wr.workflow_type as workflowType",
          "wr.requested_by as requestedBy",
          "wr.requested_at as requestedAt",
          "ws.stage_no as stageNo",
          "ws.name as stageName",
        ])
        .orderBy("wi.due_at", (ob) => ob.asc().nullsLast())
        .orderBy("wi.assigned_at", "asc")
        .limit(limit)
        .offset(offset)
        .execute(),
      base
        .select(this.db.fn.count("wi.id").as("total"))
        .executeTakeFirst(),
    ]);

    return {
      items,
      total: Number((countRow as Record<string, unknown>)?.total ?? 0),
    };
  }

  // ── getRequestDetail ───────────────────────────────────────────────────────

  async getRequestDetail(params: {
    requestId: string;
    tenantId: string;
  }): Promise<{
    request: unknown;
    stages: unknown[];
    workItems: unknown[];
    behaviors: Record<string, unknown>;
  } | null> {
    const { requestId, tenantId } = params;

    const requestRow = await this.db
      .selectFrom("document.workflow_request as wr")
      .select([
        "wr.id",
        "wr.tenant_id as tenantId",
        "wr.workflow_type as workflowType",
        "wr.entity_type as entityType",
        "wr.entity_id as entityId",
        "wr.status",
        "wr.decision",
        "wr.requested_by as requestedBy",
        "wr.requested_at as requestedAt",
        "wr.decided_by as decidedBy",
        "wr.decided_at as decidedAt",
        "wr.reason",
        "wr.template_snapshot as templateSnapshot",
        "wr.entity_snapshot as entitySnapshot",
        "wr.created_at as createdAt",
        "wr.updated_at as updatedAt",
      ])
      .where("wr.id", "=", requestId)
      .where("wr.tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!requestRow) return null;
    const req = requestRow as Record<string, unknown>;

    const snapshot = (
      typeof req.templateSnapshot === "string"
        ? JSON.parse(req.templateSnapshot)
        : req.templateSnapshot
    ) as CompiledTemplate;
    const behaviors = snapshot?.behaviors ?? {};

    const [stages, workItems] = await Promise.all([
      this.db
        .selectFrom("document.workflow_stage as ws")
        .select([
          "ws.id",
          "ws.stage_no as stageNo",
          "ws.name",
          "ws.mode",
          "ws.quorum",
          "ws.status",
          "ws.outcome",
          "ws.started_at as startedAt",
          "ws.completed_at as completedAt",
        ])
        .where("ws.workflow_request_id", "=", requestId)
        .orderBy("ws.stage_no", "asc")
        .execute(),
      this.db
        .selectFrom("event.work_item as wi")
        .select([
          "wi.id",
          "wi.workflow_stage_id as workflowStageId",
          "wi.task_type as taskType",
          "wi.designated_id as designatedId",
          "wi.assignee_id as assigneeId",
          "wi.assignee_group_id as assigneeGroupId",
          "wi.assignee_team_id as assigneeTeamId",
          "wi.order_index as orderIndex",
          "wi.status",
          "wi.decision",
          "wi.reason",
          "wi.assigned_at as assignedAt",
          "wi.completed_at as completedAt",
          "wi.due_at as dueAt",
        ])
        .where("wi.workflow_request_id", "=", requestId)
        .orderBy("wi.order_index", "asc")
        .execute(),
    ]);

    return {
      request: { ...req, templateSnapshot: undefined, entitySnapshot: undefined },
      stages,
      workItems,
      behaviors,
    };
  }

  // ── getActivity ────────────────────────────────────────────────────────────

  async getActivity(params: {
    requestId: string;
    tenantId: string;
    limit?: number;
  }): Promise<unknown[]> {
    const { requestId, tenantId, limit = 100 } = params;
    const result = await sql<{
      id:                 string;
      eventType:          string | null;
      fromStatus:         string | null;
      toStatus:           string | null;
      action:             string | null;
      actorId:            string | null;
      comment:            string | null;
      severity:           string | null;
      detail:             unknown;
      transitionName:     string | null;
      createdAt:          string | Date;
    }>`
      SELECT id,
             context->>'workflow_event_type'  AS "eventType",
             old_values->>'status'            AS "fromStatus",
             new_values->>'status'            AS "toStatus",
             context->>'action'               AS "action",
             actor_principal_id               AS "actorId",
             context->>'comment'              AS "comment",
             context->>'severity'             AS "severity",
             context->'detail'                AS "detail",
             context->>'transition_name'      AS "transitionName",
             occurred_at                      AS "createdAt"
      FROM   audit.audit_log
      WHERE  tenant_id             = ${tenantId}::uuid
        AND  event_contract_code   = 'inbox_routing_event'
        AND  context->>'instance_id' = ${requestId}
      ORDER  BY occurred_at ASC
      LIMIT  ${limit}
    `.execute(this.db);
    return result.rows;
  }

  // ── logEvent ───────────────────────────────────────────────────────────────

  private async logEvent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      eventType: string;
      entityType: string;
      entityId: string;
      actorId?: string;
      instanceId: string;
      stepInstanceId?: string;
      fromStatus?: string;
      toStatus?: string;
      action?: string;
      comment?: string;
      correlationId?: string;
      detail?: Record<string, unknown>;
    },
  ): Promise<void> {
    void appendAuditEvent(trx, {
      event_code:     eventTypeToInboxCode(params.eventType),
      operation:      "execute",
      entity_type:    params.entityType,
      entity_id:      params.entityId,
      old_values:     params.fromStatus ? { status: params.fromStatus } : null,
      new_values:     params.toStatus   ? { status: params.toStatus }   : null,
      correlation_id: params.correlationId ?? null,
      context: {
        workflow_event_type: params.eventType,
        instance_id:         params.instanceId,
        step_instance_id:    params.stepInstanceId ?? null,
        action:              params.action ?? null,
        comment:             params.comment ?? null,
        severity:            "info",
        detail:              params.detail ?? null,
      },
    });
  }
}

function readableEntityLabel(entityType: string): string {
  const normalized = entityType.replace(/^document\./, "").replace(/_/g, " ").trim();
  return normalized
    ? normalized.replace(/\b\w/g, (char) => char.toUpperCase())
    : "Workflow item";
}

function documentNumberFromPayload(payload: Record<string, unknown>, fallback: string): string {
  for (const key of ["code", "invoice_number", "document_number", "name"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isKyselyTransaction(db: unknown): boolean {
  return (db as { isTransaction?: unknown }).isTransaction === true;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function eventTypeToInboxCode(eventType: string): string {
  if (
    eventType === "request_created" ||
    eventType === "stage_activated"  ||
    eventType === "item_reassigned"
  ) return Inbox.ASSIGNED;
  if (eventType === "request_completed" || eventType === "stage_completed") return Inbox.ACTION_TAKEN;
  if (eventType.startsWith("item_")) return Inbox.ACTION_TAKEN;
  return Inbox.ACTION_TAKEN;
}

async function setTransactionPrincipal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Transaction<any>,
  actorId: string,
): Promise<void> {
  if (typeof (trx as { executeQuery?: unknown }).executeQuery !== "function") return;
  await sql`SELECT set_config('app.current_principal_id', ${actorId}, true)`.execute(trx);
}
