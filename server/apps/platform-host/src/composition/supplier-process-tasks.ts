import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { ProcessSelectionEvidence } from "@athyper/server-contract-governance";
import type { ProcessTaskBinding } from "@athyper/server-contract-control-admin";
import type {
  ApprovalRequest,
  ApproverResolutionEvidence,
  CompiledWorkflowDefinition,
  WorkflowStageDraft,
} from "@athyper/server-contract-workflow";
import {
  createApproverResolver,
  createTaskApprovalRunner,
  scheduleSla,
  taskCaseActions,
  type SlaPolicy,
} from "@athyper/server-platform-workflow";
import { processSelectionCanonical } from "@athyper/server-platform-governance";
import { HttpError } from "@athyper/server-runtime-http";
import { readSupplierProcessWorkflow } from "./supplier-process-workflow.js";
import type { createSupplierProcessEditPolicy } from "./supplier-process-edit-policy.js";
import type { PatchBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";

type Tx = Transaction<Record<string, never>>;
type Human = Extract<
  ProcessTaskBinding,
  { executionKind: "review" | "approval" }
>;
type Accepted = {
  evidence: ProcessSelectionEvidence;
  created_by: string;
  status: string;
  row_version: string;
  submitted_snapshot_id: string;
};
function fail(code: string, status = 409): never {
  throw new HttpError(status, code, code);
}
const hash = (v: unknown) =>
  createHash("sha256").update(processSelectionCanonical(v)).digest("hex");
export type SupplierTaskVote = {
  attemptId: string;
  cycleTaskId: string;
  workflowRequestId: string;
  workflowStageId: string;
  workItemId: string;
  expectedWorkItemVersion: number;
  idempotencyKey: string;
  action: "accept_review" | "approve" | "return" | "reject";
  reason?: string;
};
export type SupplierTaskInformationCommand = {
  attemptId: string; workItemId: string; expectedWorkItemVersion: number;
  action: "request" | "respond" | "resolve" | "escalate"; text?: string; idempotencyKey: string;
};
export type SupplierTaskEscalationCommand = { attemptId: string; workItemId: string; expectedWorkItemVersion: number; reason: string; idempotencyKey: string };

/** P3 domain adapter: existing workflow owner handles levels; this owner alone maps a final task to the case command. */
export function createSupplierProcessTasks(options: {
  authorizer: Authorizer;
  editPolicy?: ReturnType<typeof createSupplierProcessEditPolicy>;
}) {
  async function accepted(
    context: VerifiedRequestContext,
    caseId: string,
    permission: string,
    tx: Tx,
  ): Promise<Accepted> {
    if (context.planeKey !== "neon") fail("PROCESS_PLANE_INVALID", 403);
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:entity-case:${caseId}`},0))`.execute(
      tx,
    );
    const row = (
      await sql<Accepted>`SELECT e.evidence,c.created_by,c.status,c.row_version,c.submitted_snapshot_id FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id WHERE a.tenant_id=${context.tenantId}::uuid AND a.case_id=${caseId}::uuid ORDER BY a.attempt_number DESC LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    if (!row) fail("PROCESS_ATTEMPT_NOT_FOUND", 404);
    const scope = row.evidence.coordinate.scope;
    const access = await options.authorizer.authorize({
      context,
      permissionCode: permission,
      resource: {
        tenantId: context.tenantId,
        entityCode: "entity_case",
        resourceCode: "entity_case",
        recordId: caseId,
        requestId: caseId,
        authorizationTarget: "existing",
        operatingOrganizationId: scope.operatingOrganizationId,
        ...(scope.companyCodeId ? { companyCodeId: scope.companyCodeId } : {}),
        makerCheckerEnforced: true,
        submittedBy: row.evidence.actorPrincipalId,
      },
    });
    if (!access.allowed)
      throw new HttpError(
        403,
        "PROCESS_TASK_FORBIDDEN",
        access.reason ?? "PROCESS_TASK_FORBIDDEN",
      );
    return row;
  }
  async function gate(row: Accepted, tx: Tx) {
    const c = row.evidence.coordinate;
    if (
      !["submitted", "in_review"].includes(row.status) ||
      row.submitted_snapshot_id !== c.submissionSnapshot.id
    )
      fail("PROCESS_ATTEMPT_STALE");
    const ready = (
      await sql`SELECT id FROM governance.process_document_job WHERE tenant_id=${c.scope.tenantId}::uuid AND attempt_id=${c.attemptId}::uuid AND purpose='submitted_review_pack' AND status='ready'`.execute(
        tx,
      )
    ).rows.length;
    if (!ready) fail("PROCESS_REVIEW_DOCUMENT_NOT_READY");
  }
  async function resolve(
    row: Accepted,
    stage: WorkflowStageDraft,
    tx: Tx,
  ): Promise<ApproverResolutionEvidence> {
    const c = row.evidence.coordinate,
      scope = c.scope;
    const directory = {
      async byRole(tenantId: string, roleCode: string) {
        const rows = await sql<{
          principal_id: string;
        }>`SELECT principal_id FROM document.process_case_reviewers(${tenantId}::uuid,${c.caseId}::uuid,${roleCode})`.execute(
          tx,
        );
        return rows.rows
          .map((r) => r.principal_id)
          .filter((id) => id !== row.created_by);
      },
      async byGroup(): Promise<readonly string[]> {
        return fail("PROCESS_REVIEWER_SELECTOR_UNSUPPORTED");
      },
      async hierarchy(): Promise<readonly string[]> {
        return fail("PROCESS_REVIEWER_SELECTOR_UNSUPPORTED");
      },
    };
    // Named scoped roles are the published pilot authority; direct UUID selectors must never bypass it.
    if (
      [
        ...stage.approvers,
        ...(stage.fallback ?? []),
        ...(stage.escalation ?? []),
      ].some((s) => s.kind !== "role")
    )
      fail("PROCESS_REVIEWER_SELECTOR_UNSUPPORTED");
    return createApproverResolver(directory, "supplier-scoped-role/1").resolve({
      tenantId: scope.tenantId,
      subjectPrincipalId: row.evidence.actorPrincipalId,
      selectors: stage.approvers,
      ...(stage.fallback ? { fallback: stage.fallback } : {}),
    });
  }
  async function configuration(row: Accepted, binding: Human, tx: Tx) {
    const definition = await readSupplierProcessWorkflow(
      binding.workflow,
      row.evidence.coordinate.scope,
      tx,
    );
    if (!definition) fail("PROCESS_PINNED_WORKFLOW_UNAVAILABLE");
    const policy = (
      await sql<{
        definition: { sla: SlaPolicy };
      }>`SELECT definition FROM control.process_selection_catalog_revision WHERE tenant_id=${row.evidence.coordinate.scope.tenantId}::uuid AND id=${binding.reviewerPolicy.id}::uuid AND version=${binding.reviewerPolicy.version} AND content_hash=${binding.reviewerPolicy.hash}`.execute(
        tx,
      )
    ).rows[0];
    if (
      !policy ||
      definition.stages.some(
        (s) => s.slaPolicyCode !== policy.definition.sla.code,
      )
    )
      fail("PROCESS_PINNED_SLA_UNAVAILABLE");
    return { definition, sla: policy.definition.sla };
  }
  function runner(
    row: Accepted,
    binding: Human,
    taskId: string,
    definition: CompiledWorkflowDefinition,
    sla: SlaPolicy,
    actor: string,
    tx: Tx,
  ) {
    const c = row.evidence.coordinate,
      tenant = c.scope.tenantId;
    async function persist(request: ApprovalRequest, create: boolean) {
      if (create)
        await sql`INSERT INTO document.workflow_request(id,tenant_id,entity_type,entity_id,requested_by,definition_code,definition_version,compiled_artifact_hash,template_snapshot,metadata,created_by)
        VALUES(${request.id}::uuid,${tenant}::uuid,'cycle_task',${taskId},${row.evidence.actorPrincipalId}::uuid,${definition.code},${definition.version},${definition.artifactHash},${JSON.stringify(definition)}::jsonb,${JSON.stringify({ process: { ...c, cycleTaskId: taskId, taskTemplateId: binding.taskTemplateId, outcomeScope: binding.outcomeScope, executionKind: binding.executionKind, reviewerPolicy: binding.reviewerPolicy }, approval: request })}::jsonb,${actor}::uuid)`.execute(
          tx,
        );
      else
        await sql`UPDATE document.workflow_request SET metadata=jsonb_set(metadata,'{approval}',${JSON.stringify(request)}::jsonb),status=${request.status}::document.workflow_request_status_d,decision=${request.status === "approved" ? "approve" : null}::document.workflow_decision_d,decided_by=${request.status === "approved" ? actor : null}::uuid,decided_at=${request.status === "approved" ? sql`now()` : null},updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${request.id}::uuid`.execute(
          tx,
        );
      for (const [index, stage] of request.stages.entries()) {
        const d = definition.stages[index]!;
        const prior = create
          ? undefined
          : (
              await sql<{
                quorum: Record<string, unknown>;
              }>`SELECT quorum FROM document.workflow_stage WHERE tenant_id=${tenant}::uuid AND id=${stage.id}::uuid`.execute(
                tx,
              )
            ).rows[0]?.quorum;
        const schedule =
          typeof prior?.["dueAt"] === "string"
            ? {
                policyCode: String(prior["policyCode"]),
                policyVersion: Number(prior["policyVersion"]),
                dueAt: prior["dueAt"],
                remindersAt: prior["remindersAt"] as string[],
                ...(typeof prior["escalateAt"] === "string"
                  ? { escalateAt: prior["escalateAt"] }
                  : {}),
              }
            : scheduleSla(sla, new Date());
        const eligibleCount = stage.eligibilityEvidence.candidates.length;
        const required =
          stage.quorum.kind === "all"
            ? eligibleCount
            : stage.quorum.kind === "any"
              ? 1
              : stage.quorum.kind === "count"
                ? stage.quorum.value!
                : Math.ceil((eligibleCount * stage.quorum.value!) / 100);
        const quorumEvidence = {
          ...stage.quorum,
          required,
          eligibleCount,
          eligibilityEvidence: stage.eligibilityEvidence,
          chosenAssigneePrincipalIds: stage.eligibilityEvidence.candidates.map(
            (c) => c.principalId,
          ),
          reviewerPolicy: binding.reviewerPolicy,
          escalation: d.escalation ?? [],
          sla,
          ...(stage.status === "pending" ? {} : schedule),
        };

        if (create)
          await sql`INSERT INTO document.workflow_stage(id,tenant_id,workflow_request_id,stage_no,stage_code,name,mode,quorum,sla_policy_code,status,started_at,created_by) VALUES(${stage.id}::uuid,${tenant}::uuid,${request.id}::uuid,${index + 1},${stage.code},${d.name},${d.mode}::document.workflow_stage_mode_d,${JSON.stringify(quorumEvidence)}::jsonb,${sla.code},${stage.status}::document.workflow_stage_status_d,${stage.status === "active" ? sql`now()` : null},${actor}::uuid)`.execute(
            tx,
          );
        else
          await sql`UPDATE document.workflow_stage SET quorum=${JSON.stringify(quorumEvidence)}::jsonb,status=${stage.status}::document.workflow_stage_status_d,started_at=CASE WHEN ${stage.status}<>'pending' THEN COALESCE(started_at,now()) ELSE NULL END,completed_at=CASE WHEN ${stage.status}='completed' THEN COALESCE(completed_at,now()) ELSE NULL END,outcome=CASE WHEN ${stage.status}='completed' THEN 'approved' ELSE NULL END,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${stage.id}::uuid`.execute(
            tx,
          );
        if (stage.status === "completed")
          await sql`UPDATE document.work_item SET status='cancelled',completed_at=now(),row_version=row_version+1,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND cycle_task_id=${taskId}::uuid AND payload->>'workflowStageId'=${stage.id} AND status IN('open','claimed')`.execute(
            tx,
          );
        if (stage.status !== "active") continue;
        for (const candidate of stage.eligibilityEvidence.candidates) {
          const payload = {
            ...c,
            cycleTaskId: taskId,
            taskTemplateId: binding.taskTemplateId,
            workflowRequestId: request.id,
            workflowStageId: stage.id,
            outcomeScope: binding.outcomeScope,
            action:
              binding.executionKind === "review" ? "accept_review" : "approve",
            eligibility_evidence: {
              ...stage.eligibilityEvidence,
              candidates: [candidate],
              selectedPrincipalId: candidate.principalId,
            },
            reviewerPolicy: binding.reviewerPolicy,
            sla: schedule,
            remindersAt: schedule.remindersAt,
          };
          const item = (
            await sql<{
              id: string;
            }>`INSERT INTO document.work_item(tenant_id,work_type_code,title,source_entity_code,source_entity_id,source_action_code,cycle_task_id,assignee_principal_id,due_at,payload,created_by)
            SELECT ${tenant}::uuid,'business_partner_case.approval',${`${binding.code}: ${d.name}`},'business_partner_case',${c.caseId}::uuid,'process_task_decide',${taskId}::uuid,${candidate.principalId}::uuid,${schedule.dueAt}::timestamptz,${JSON.stringify(payload)}::jsonb,${actor}::uuid WHERE NOT EXISTS(SELECT 1 FROM document.work_item WHERE tenant_id=${tenant}::uuid AND cycle_task_id=${taskId}::uuid AND payload->>'workflowStageId'=${stage.id} AND assignee_principal_id=${candidate.principalId}::uuid) RETURNING id`.execute(
              tx,
            )
          ).rows[0];
          if (item)
            await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by) VALUES(${tenant}::uuid,'workflow','workflow.work_item.created',${`process-task:${item.id}`},'business_partner_case',${c.caseId}::uuid,'workflow.work_item',${item.id}::uuid,${actor}::uuid,'supplier-process.tasks',${JSON.stringify({ work_item_id: item.id, title: `${binding.code}: ${d.name}`, status: "open", priority: "normal", due_at: schedule.dueAt, stage_code: stage.code, entity_type: "business_partner_case", entity_id: c.caseId, recipient_principal_ids: [candidate.principalId] })}::jsonb,${actor}::uuid)`.execute(
              tx,
            );
        }
      }
    }
    return createTaskApprovalRunner<Tx>({
      resolve: (s) => resolve(row, s, tx),
      persistence: {
        async get(t, id) {
          return (
            (
              await sql<{
                approval: ApprovalRequest;
              }>`SELECT metadata->'approval' approval FROM document.workflow_request WHERE tenant_id=${t}::uuid AND id=${id}::uuid AND entity_type='cycle_task' AND entity_id=${taskId} AND metadata->'process'->>'attemptId'=${c.attemptId} FOR UPDATE`.execute(
                tx,
              )
            ).rows[0]?.approval ?? null
          );
        },
        async create(r) {
          await persist(r, true);
        },
        async save(r) {
          await persist(r, false);
        },
      },
    });
  }
  async function advance(row: Accepted, actor: string, tx: Tx) {
    await gate(row, tx);
    const c = row.evidence.coordinate,
      tenant = c.scope.tenantId;
    const tasks = (
      await sql<{
        id: string;
        task_template_id: string;
        status: string;
      }>`SELECT id,task_template_id,status FROM governance.cycle_task WHERE tenant_id=${tenant}::uuid AND cycle_run_id=${c.cycleRunId}::uuid AND process_attempt_id=${c.attemptId}::uuid`.execute(
        tx,
      )
    ).rows;
    for (const binding of row.evidence.executionManifest.tasks) {
      const task =
        tasks.find((t) => t.task_template_id === binding.taskTemplateId) ??
        fail("PROCESS_TASK_MISSING");
      if (task.status === "completed") continue;
      if (binding.executionKind === "document") {
        await sql`UPDATE governance.cycle_task SET status='completed',completed_at=now(),completion_evidence=completion_evidence||${JSON.stringify({ coordinate: c, documentPurpose: "submitted_review_pack", gate: "ready" })}::jsonb,version=version+1,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${task.id}::uuid`.execute(
          tx,
        );
        continue;
      }
      if (binding.executionKind === "preparation")
        fail("PROCESS_PREPARATION_INCOMPLETE");
      const existing = (
        await sql<{
          id: string;
        }>`SELECT id FROM document.workflow_request WHERE tenant_id=${tenant}::uuid AND entity_type='cycle_task' AND entity_id=${task.id} AND metadata->'process'->>'attemptId'=${c.attemptId}`.execute(
          tx,
        )
      ).rows[0];
      if (existing)
        return {
          workflowRequestId: existing.id,
          cycleTaskId: task.id,
          replayed: true,
        };
      const { definition, sla } = await configuration(row, binding, tx);
      const request = await runner(
        row,
        binding,
        task.id,
        definition,
        sla,
        actor,
        tx,
      ).start(
        {
          tenantId: tenant,
          taskId: task.id,
          makerIds: [row.created_by, row.evidence.actorPrincipalId],
          definition,
        },
        tx,
      );
      await sql`UPDATE governance.cycle_task SET status='in_progress',started_at=now(),version=version+1,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${task.id}::uuid`.execute(
        tx,
      );
      return {
        workflowRequestId: request.id,
        cycleTaskId: task.id,
        replayed: false,
      };
    }
    return { complete: true };
  }
  return {
    async editPreview(context: VerifiedRequestContext, caseId: string, command: Omit<PatchBusinessPartnerRequestCommand, "context" | "requestId">, tx: Tx) {
      if (!options.editPolicy) fail("TASK_EDIT_POLICY_UNAVAILABLE", 503);
      return options.editPolicy.preview({ ...command, context, requestId: caseId }, tx);
    },
    async escalate(context: VerifiedRequestContext, caseId: string, command: SupplierTaskEscalationCommand, tx: Tx) {
      await accepted(context, caseId, "neon.relationship.entity_case.decide", tx);
      return (await sql<{ result: unknown }>`SELECT document.command_process_task_escalate(
        ${context.tenantId}::uuid,${caseId}::uuid,${command.workItemId}::uuid,${command.attemptId}::uuid,
        ${command.expectedWorkItemVersion},${command.reason},${command.idempotencyKey},${context.principalId}::uuid) result`.execute(tx)).rows[0]?.result;
    },
    async information(context: VerifiedRequestContext, caseId: string, command: SupplierTaskInformationCommand, tx: Tx) {
      await accepted(context, caseId, command.action === "respond"
        ? "neon.relationship.entity_case.read" : "neon.relationship.entity_case.decide", tx);
      return (await sql<{ result: unknown }>`SELECT document.command_process_task_information(
        ${context.tenantId}::uuid,${caseId}::uuid,${command.workItemId}::uuid,${command.attemptId}::uuid,
        ${command.action},${command.expectedWorkItemVersion},${command.text ?? null},${command.idempotencyKey},${context.principalId}::uuid) result`.execute(tx)).rows[0]?.result;
    },
    async cancel(
      context: VerifiedRequestContext,
      caseId: string,
      command: {
        attemptId: string;
        expectedVersion: number;
        reason: string;
        idempotencyKey: string;
      },
      tx: Tx,
    ) {
      const row = await accepted(
        context,
        caseId,
        "neon.relationship.entity_case.submit",
        tx,
      );
      if (command.attemptId !== row.evidence.coordinate.attemptId)
        fail("PROCESS_ATTEMPT_STALE");
      if (!command.reason.trim() || command.reason.length > 2000)
        fail("PROCESS_DECISION_REASON_REQUIRED", 400);
      const result =
        await sql`SELECT * FROM document.command_entity_case_lifecycle(${context.tenantId}::uuid,${caseId}::uuid,'cancel',${command.expectedVersion},${row.evidence.coordinate.cycleRunId}::uuid,NULL::uuid,${command.reason},${command.idempotencyKey},${context.principalId}::uuid,NULL::uuid)`.execute(
          tx,
        );
      return result.rows[0];
    },
    async start(context: VerifiedRequestContext, caseId: string, tx: Tx) {
      const row = await accepted(
        context,
        caseId,
        "neon.relationship.entity_case.submit",
        tx,
      );
      return advance(row, context.principalId, tx);
    },
    async view(context: VerifiedRequestContext, caseId: string, tx: Tx) {
      const row = await accepted(
          context,
          caseId,
          "neon.relationship.entity_case.read",
          tx,
        ),
        c = row.evidence.coordinate;
      const executions = (
        await sql<
          Record<string, unknown>
        >`SELECT w.id workflow_request_id,w.entity_id cycle_task_id,w.status,w.metadata->'process' binding,s.id workflow_stage_id,s.stage_code,s.status stage_status,s.quorum,i.id work_item_id,i.row_version work_item_version,i.status work_item_status,i.assignee_principal_id,i.claimant_principal_id,i.due_at,i.payload->>'action' action FROM document.workflow_request w JOIN document.workflow_stage s ON s.tenant_id=w.tenant_id AND s.workflow_request_id=w.id LEFT JOIN document.work_item i ON i.tenant_id=w.tenant_id AND i.payload->>'workflowStageId'=s.id::text AND i.cycle_task_id::text=w.entity_id WHERE w.tenant_id=${context.tenantId}::uuid AND w.entity_type='cycle_task' AND w.metadata->'process'->>'attemptId'=${c.attemptId} ORDER BY w.created_at,s.stage_no,i.id`.execute(
          tx,
        )
      ).rows;
      const history = (
        await sql`SELECT a.id attempt_id,a.attempt_number,a.submission_snapshot_id,a.selection_id,e.evidence->'effectiveProfile' profile FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE a.tenant_id=${context.tenantId}::uuid AND a.case_id=${caseId}::uuid ORDER BY a.attempt_number`.execute(
          tx,
        )
      ).rows;
      const closure = (
        await sql`SELECT result_code,result_evidence,recorded_at FROM document.entity_case_command_evidence WHERE tenant_id=${context.tenantId}::uuid AND entity_case_id=${caseId}::uuid AND result_code IN('ENTITY_CASE_RETURNED','ENTITY_CASE_REJECTED','ENTITY_CASE_CANCELLED') ORDER BY after_version DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      const allowed = async (permission: string) => {
        try {
          await accepted(context, caseId, permission, tx);
          return true;
        } catch (error) {
          if (error instanceof HttpError && error.statusCode === 403)
            return false;
          throw error;
        }
      };
      const reviewerEligible =
        (
          await sql`SELECT principal_id FROM document.process_case_reviewers(${context.tenantId}::uuid,${caseId}::uuid,NULL) WHERE principal_id=${context.principalId}::uuid`.execute(
            tx,
          )
        ).rows.length > 0;
      const canDecide =
        reviewerEligible &&
        (await allowed("neon.relationship.entity_case.decide"));
      const canSubmit = await allowed("neon.relationship.entity_case.submit");
      let reviewReady = false;
      try {
        await gate(row, tx);
        reviewReady = true;
      } catch (error) {
        if (!(error instanceof HttpError && error.statusCode === 409))
          throw error;
      }
      const tasks = (
        await sql<{ id: string; task_template_id: string; code: string; name: string; status: string; owner_principal_id: string | null; completion_evidence: unknown }>`SELECT id,task_template_id,code,name,status,owner_principal_id,completion_evidence FROM governance.cycle_task WHERE tenant_id=${context.tenantId}::uuid AND cycle_run_id=${c.cycleRunId}::uuid ORDER BY created_at,id`.execute(
          tx,
        )
      ).rows;
      const historicalReviews = (
        await sql`SELECT a.id attempt_id,a.attempt_number,w.entity_id cycle_task_id,s.stage_code,s.status stage_status,i.id work_item_id,i.status work_item_status,i.outcome FROM governance.process_attempt a JOIN document.workflow_request w ON w.tenant_id=a.tenant_id AND w.metadata->'process'->>'attemptId'=a.id::text JOIN document.workflow_stage s ON s.tenant_id=w.tenant_id AND s.workflow_request_id=w.id LEFT JOIN document.work_item i ON i.tenant_id=w.tenant_id AND i.payload->>'workflowStageId'=s.id::text AND i.cycle_task_id::text=w.entity_id WHERE a.tenant_id=${context.tenantId}::uuid AND a.case_id=${caseId}::uuid AND a.id<>${c.attemptId}::uuid ORDER BY a.attempt_number,s.stage_no,i.id`.execute(
          tx,
        )
      ).rows;
      const activity = (
        await sql`SELECT id,result_code,recorded_at,result_evidence FROM document.entity_case_command_evidence WHERE tenant_id=${context.tenantId}::uuid AND entity_case_id=${caseId}::uuid ORDER BY recorded_at,id`.execute(
          tx,
        )
      ).rows;
      // Recipient-only projection: case readers do not acquire another person's delivery ledger.
      const communications = (
        await sql`SELECT d.id,d.channel,d.status,d.created_at,d.delivered_at,m.event_code,m.payload->'communication' pin FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id WHERE d.tenant_id=${context.tenantId}::uuid AND d.recipient_id=${context.principalId}::uuid AND m.plane_key='neon' AND m.payload->'communication'->>'caseId'=${caseId} ORDER BY d.created_at,d.id`.execute(
          tx,
        )
      ).rows;
      const information = (await sql<{
        id: string; work_item_id: string; attempt_id: string; requested_by: string; respondent_id: string;
        question: string; response: string | null; state: string; due_at: string; pause_started_at: string | null; kind: string; escalated_at: string | null; escalated_to: string | null; escalation_reason: string | null;
      }>`SELECT id,work_item_id,attempt_id,requested_by,respondent_id,question,response,state,due_at,pause_started_at,kind,escalated_at,escalated_to,escalation_reason
        FROM document.process_task_information WHERE tenant_id=${context.tenantId}::uuid AND case_id=${caseId}::uuid ORDER BY created_at,id`.execute(tx)).rows;
      const escalations = (await sql`SELECT id,attempt_id,previous_work_item_id,replacement_work_item_id,supervisor_id,mode,reason,created_at
        FROM document.process_task_assignment_history WHERE tenant_id=${context.tenantId}::uuid AND case_id=${caseId}::uuid ORDER BY created_at,id`.execute(tx)).rows;
      return {
        information: information.map(x => ({...x, escalationEnabled: x.kind === "clarification" && x.state === "open" && !x.escalated_at && x.requested_by === context.principalId && row.evidence.executionManifest.tasks.some(t => (t.executionKind === "review" || t.executionKind === "approval") && !!t.informationPolicy?.overdueSupervisorRole && executions.some(i => i.work_item_id === x.work_item_id && i.cycle_task_id === tasks.find(task => task.task_template_id === t.taskTemplateId)?.id))})),
        escalations,
        coordinate: c,
        selection: {
          requestedRequirement: row.evidence.requestedRequirement,
          candidateProfile: row.evidence.candidateProfile,
          effectiveProfile: row.evidence.effectiveProfile,
          winningRuleId: row.evidence.winningRuleId,
          reason: row.evidence.reason,
          minimumControls: row.evidence.minimumControls,
          policy: row.evidence.policy,
          manifest: row.evidence.executionManifest,
        },
        reviewReady,
        tasks,
        activity,
        communications,
        executions: executions.map((i) => {
          const task = tasks.find(t => t.id === i.cycle_task_id);
          const binding = row.evidence.executionManifest.tasks.find(t => t.taskTemplateId === task?.task_template_id);
          const human = binding?.executionKind === "review" || binding?.executionKind === "approval";
          const actions = human ? [binding.executionKind === "review" ? "accept_review" : "approve", ...taskCaseActions(binding.caseAuthority)] : [];
          const waiting = information.some(x => x.work_item_id === i.work_item_id && x.kind !== "consultation" && ["open", "answered"].includes(x.state));
          return ({
          ...i,
          taskKind: binding?.executionKind,
          outcomeScope: binding?.outcomeScope,
          informationEnabled: human && binding.informationPolicy?.schema === "athyper.task-information-policy/1"
            && canDecide && reviewReady && row.created_by !== context.principalId
            && i.assignee_principal_id === context.principalId && (!i.claimant_principal_id || i.claimant_principal_id === context.principalId)
            && i.stage_status === "active" && ["open", "claimed"].includes(String(i.work_item_status)),
          waitingForInformation: waiting,
          escalationMode: human && binding.escalationPolicy?.schema === "athyper.task-escalation-policy/1"
            && canDecide && reviewReady && row.created_by !== context.principalId
            && i.assignee_principal_id === context.principalId && (!i.claimant_principal_id || i.claimant_principal_id === context.principalId)
            && i.stage_status === "active" && ["open", "claimed"].includes(String(i.work_item_status)) ? binding.escalationPolicy.mode : null,
          allowedActions:
            canDecide &&
            reviewReady &&
            row.created_by !== context.principalId &&
            i.assignee_principal_id === context.principalId &&
            (!i.claimant_principal_id ||
              i.claimant_principal_id === context.principalId) &&
            i.stage_status === "active" &&
            ["open", "claimed"].includes(String(i.work_item_status))
              ? actions.filter(action => !waiting || ["return", "reject"].includes(action))
              : [],
        }); }),
        history,
        historicalReviews,
        closure,
        caseStatus: row.status,
        canCancel:
          canSubmit &&
          context.principalId === row.created_by &&
          ["draft", "submitted", "in_review", "approved"].includes(row.status),
        principalId: context.principalId,
      };
    },
    async decide(
      context: VerifiedRequestContext,
      caseId: string,
      command: SupplierTaskVote,
      tx: Tx,
    ) {
      const row = await accepted(
          context,
          caseId,
          "neon.relationship.entity_case.decide",
          tx,
        ),
        c = row.evidence.coordinate,
        tenant = context.tenantId,
        actor = context.principalId;
      if (command.attemptId !== c.attemptId) fail("PROCESS_ATTEMPT_STALE");
      const fingerprint = hash({ caseId, actor, ...command });
      const item = (
        await sql<{
          row_version: string;
          status: string;
          assignee_principal_id: string;
          claimant_principal_id: string | null;
          payload: Record<string, unknown>;
          outcome: { fingerprint?: string; receipt?: unknown } | null;
        }>`SELECT row_version,status,assignee_principal_id,claimant_principal_id,payload,outcome FROM document.work_item WHERE tenant_id=${tenant}::uuid AND id=${command.workItemId}::uuid AND cycle_task_id=${command.cycleTaskId}::uuid AND source_entity_id=${caseId}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (
        !item ||
        item.assignee_principal_id !== actor ||
        (item.claimant_principal_id && item.claimant_principal_id !== actor)
      )
        fail("PROCESS_WORK_ITEM_FORBIDDEN", 403);
      if (item.outcome?.fingerprint === fingerprint)
        return { receipt: item.outcome.receipt, replayed: true };
      await gate(row, tx);
      if (
        !["open", "claimed"].includes(item.status) ||
        Number(item.row_version) !== command.expectedWorkItemVersion
      )
        fail("PROCESS_WORK_ITEM_CONFLICT");
      if (
        item.payload["attemptId"] !== c.attemptId ||
        item.payload["workflowRequestId"] !== command.workflowRequestId ||
        item.payload["workflowStageId"] !== command.workflowStageId ||
        (!["return", "reject"].includes(command.action) &&
          item.payload["action"] !== command.action)
      )
        fail("PROCESS_TASK_BINDING_INVALID");
      const binding = row.evidence.executionManifest.tasks.find(
        (t) => t.taskTemplateId === item.payload["taskTemplateId"],
      );
      if (
        !binding ||
        (binding.executionKind !== "review" &&
          binding.executionKind !== "approval")
      )
        fail("PROCESS_HUMAN_TASK_REQUIRED");
      const allowedActions = [binding.executionKind === "review" ? "accept_review" : "approve",
        ...taskCaseActions(binding.caseAuthority)];
      if (!allowedActions.includes(command.action)) fail("PROCESS_TASK_ACTION_FORBIDDEN", 403);
      const { definition, sla } = await configuration(row, binding, tx);
      const workflow = (
        await sql<{
          approval: ApprovalRequest;
        }>`SELECT metadata->'approval' approval FROM document.workflow_request WHERE tenant_id=${tenant}::uuid AND id=${command.workflowRequestId}::uuid AND entity_id=${command.cycleTaskId}`.execute(
          tx,
        )
      ).rows[0]?.approval;
      const stageIndex =
        workflow?.stages.findIndex((s) => s.id === command.workflowStageId) ??
        -1;
      if (
        stageIndex < 0 ||
        !(
          await resolve(row, definition.stages[stageIndex]!, tx)
        ).candidates.some((p) => p.principalId === actor)
      )
        fail("PROCESS_REVIEWER_NO_LONGER_ELIGIBLE", 403);
      // Mark this item first; persistence cancels only remaining open items at a completed level.
      await sql`UPDATE document.work_item SET status='completed',completed_at=now(),row_version=row_version+1,outcome=${JSON.stringify({ decision: command.action, decidedBy: actor, idempotencyKey: command.idempotencyKey })}::jsonb,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${command.workItemId}::uuid`.execute(
        tx,
      );
      if (command.action === "return" || command.action === "reject") {
        if (!command.reason?.trim() || command.reason.length > 2000)
          fail("PROCESS_DECISION_REASON_REQUIRED", 400);
        if (workflow?.stages[stageIndex]?.status !== "active")
          fail("PROCESS_WORK_ITEM_CONFLICT");
        await sql`SELECT document.command_entity_case_lifecycle(${tenant}::uuid,${caseId}::uuid,${command.action},${Number(row.row_version)},${c.cycleRunId}::uuid,${command.cycleTaskId}::uuid,${command.reason},${command.idempotencyKey},${actor}::uuid,NULL::uuid)`.execute(
          tx,
        );
        const receipt = {
          coordinate: c,
          cycleTaskId: command.cycleTaskId,
          workflowRequestId: command.workflowRequestId,
          outcome: command.action === "return" ? "returned" : "rejected",
          caseApproved: false,
        };
        await sql`UPDATE document.work_item SET outcome=${JSON.stringify({ fingerprint, receipt, decision: command.action, decidedBy: actor, idempotencyKey: command.idempotencyKey })}::jsonb,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${command.workItemId}::uuid`.execute(
          tx,
        );
        return { receipt, replayed: false };
      }
      const result = await runner(
        row,
        binding,
        command.cycleTaskId,
        definition,
        sla,
        actor,
        tx,
      ).accept(
        {
          tenantId: tenant,
          definition,
          workflowRequestId: command.workflowRequestId,
          workflowStageId: command.workflowStageId,
          principalId: actor,
          makerIds: [row.created_by, row.evidence.actorPrincipalId],
        },
        tx,
      );
      if (result.outcome === "task_accepted") {
        if (binding.outcomeScope === "case_final_decision")
          await sql`SELECT document.command_entity_case_lifecycle(${tenant}::uuid,${caseId}::uuid,'approve',${Number(row.row_version)},${c.cycleRunId}::uuid,${command.cycleTaskId}::uuid,${command.reason ?? null},${`task-final:${command.idempotencyKey}`},${actor}::uuid,NULL::uuid)`.execute(
            tx,
          );
        else {
          await sql`UPDATE governance.cycle_task SET status='completed',completed_at=now(),completion_evidence=${JSON.stringify({ coordinate: c, workflowRequestId: command.workflowRequestId, outcomeScope: "task", outcome: "accepted" })}::jsonb,version=version+1,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${command.cycleTaskId}::uuid`.execute(
            tx,
          );
          await advance(row, actor, tx);
        }
      }
      const receipt = {
        coordinate: c,
        cycleTaskId: command.cycleTaskId,
        workflowRequestId: command.workflowRequestId,
        outcome: result.outcome,
        outcomeScope: binding.outcomeScope,
        caseApproved:
          result.outcome === "task_accepted" &&
          binding.outcomeScope === "case_final_decision",
      };
      await sql`UPDATE document.work_item SET outcome=${JSON.stringify({ fingerprint, receipt, decision: command.action, decidedBy: actor, idempotencyKey: command.idempotencyKey })}::jsonb,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${command.workItemId}::uuid`.execute(
        tx,
      );
      await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by)
        VALUES(${tenant}::uuid,'workflow','workflow.work_item.completed',${`process-task-completed:${command.workItemId}`},'business_partner_case',${caseId}::uuid,'workflow.work_item',${command.workItemId}::uuid,${actor}::uuid,'supplier-process.tasks',${JSON.stringify({ work_item_id: command.workItemId, title: binding.code, priority: "normal", source_action_code: "process_task_decide", entity_type: "business_partner_case", entity_id: caseId, status: "completed", recipient_principal_ids: [actor], process: receipt })}::jsonb,${actor}::uuid)`.execute(
        tx,
      );
      return { receipt, replayed: false };
    },
  };
}
