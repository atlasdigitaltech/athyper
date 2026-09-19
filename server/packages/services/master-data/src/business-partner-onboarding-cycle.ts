import { randomUUID } from "node:crypto";
import type { BusinessPartnerRequest } from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;

export interface BusinessPartnerOnboardingCycleEvent {
  readonly tenantId: string;
  readonly principalId: string;
  readonly eventCode: string;
  readonly request: BusinessPartnerRequest;
  readonly invitationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BusinessPartnerOnboardingCycleCoordinator<TransactionType> {
  advance(input: BusinessPartnerOnboardingCycleEvent, transaction: TransactionType): Promise<void>;
  advanceForBusinessPartner(input:{readonly tenantId:string;readonly principalId:string;readonly businessPartnerId:string;readonly eventCode:string;readonly metadata?:Readonly<Record<string,unknown>>},transaction:TransactionType):Promise<void>;
}

interface TemplateTask {
  readonly id: string;
  readonly phaseId: string;
  readonly code: string;
  readonly name: string;
  readonly completionMode: "manual" | "system" | "hybrid";
  readonly isMandatory: boolean;
  readonly isWaivable: boolean;
  readonly applicability?: Readonly<Record<string, unknown>>;
}

interface TemplateDependency {
  readonly predecessorTemplateId: string;
  readonly successorTemplateId: string;
  readonly dependencyType: "finish_to_start" | "finish_to_finish";
  readonly isHard: boolean;
}

/** Event adapter between governed Business Partner cases and the generic cycle runtime. */
export class KyselyBusinessPartnerOnboardingCycleCoordinator implements BusinessPartnerOnboardingCycleCoordinator<Tx> {
  constructor(private readonly completion?: (tenantId:string, runId:string, tx:Tx) => Promise<{ready:boolean}>) {}
  private async ready(tenantId:string,runId:string,tx:Tx){return (this.completion ? await this.completion(tenantId,runId,tx) : (await sql<{result:{ready:boolean}}>`SELECT governance.evaluate_cycle_completion(${tenantId}::uuid,${runId}::uuid) result`.execute(tx)).rows[0]!.result).ready;}
  async advance(input: BusinessPartnerOnboardingCycleEvent, transaction: Tx): Promise<void> {
    if (["configure_company", "change_bank", "activate_supplier"].includes(input.request.kind) && input.request.targetBusinessPartnerId) {
      const runs=(await sql<{id:string}>`SELECT DISTINCT r.id FROM governance.cycle_run r JOIN governance.process_attempt a ON a.tenant_id=r.tenant_id AND a.cycle_run_id=r.id JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE r.tenant_id=${input.tenantId}::uuid AND r.status IN('running','blocked') AND c.status='materialized' AND c.target_entity_id=${input.request.targetBusinessPartnerId}::uuid AND e.evidence->'coordinate'->'scope'->>'operatingOrganizationId'=${input.request.operatingOrganizationId ?? null} AND e.evidence->'coordinate'->'scope'->>'companyCodeId' IS NOT DISTINCT FROM ${input.request.companyCodeId ?? null}`.execute(transaction)).rows;
      for (const run of runs) await sql`SELECT governance.command_link_supplier_onboarding_work(${input.tenantId}::uuid,${run.id}::uuid,${input.request.id}::uuid,${input.principalId}::uuid)`.execute(transaction);
    }
    if(input.eventCode==="business_partner.supplier.activated"&&input.request.targetBusinessPartnerId){await this.advanceForBusinessPartner({tenantId:input.tenantId,principalId:input.principalId,businessPartnerId:input.request.targetBusinessPartnerId,eventCode:input.eventCode,metadata:input.metadata},transaction);return;}
    if (input.request.kind !== "new_partner" || input.request.requestedRole !== "supplier") return;
    // Internal draft persistence and preflight validation do not start onboarding.
    // Submission runs in its own transaction and still requires a published template.
    const internal = input.request.source.kind === "manual";
    if (internal && ["business_partner.case.created", "business_partner.case.updated", "business_partner.case.validated"].includes(input.eventCode)) return;
    if (internal && (await sql`SELECT id FROM governance.process_attempt WHERE tenant_id=${input.tenantId}::uuid AND case_id=${input.request.id}::uuid LIMIT 1`.execute(transaction)).rows.length) return;
    const template = (await sql<Row>`SELECT revision.*,type.code type_code,type.name type_name
      FROM control.cycle_type type
      JOIN control.cycle_template_revision revision ON revision.tenant_id=type.tenant_id AND revision.cycle_type_id=type.id
     WHERE type.tenant_id=${input.tenantId}::uuid AND type.code='BP_SUPPLIER_ONBOARDING' AND type.status='active'
     ORDER BY revision.revision_number DESC LIMIT 1`.execute(transaction)).rows[0];
    if (!template) throw new MasterDataError(503, "BUSINESS_PARTNER_ONBOARDING_TEMPLATE_UNAVAILABLE", "Published supplier onboarding cycle template is unavailable");

    const preview = object(template["template_json"]);
    const draft = object(preview["template"]);
    const tasks = array<TemplateTask>(draft["tasks"]);
    const dependencies = array<TemplateDependency>(draft["dependencies"]);
    if (!tasks.length) throw new MasterDataError(503, "BUSINESS_PARTNER_ONBOARDING_TEMPLATE_INVALID", "Published supplier onboarding cycle contains no tasks");

    const idempotencyKey = `business-partner-onboarding:${input.request.id}`;
    let run = (await sql<Row>`SELECT * FROM governance.cycle_run WHERE tenant_id=${input.tenantId}::uuid AND idempotency_key=${idempotencyKey} FOR UPDATE`.execute(transaction)).rows[0];
    if (!run) {
      if (internal && input.eventCode !== "business_partner.case.submitted")
        throw new MasterDataError(409, "BUSINESS_PARTNER_ONBOARDING_NOT_STARTED", "Submit the saved request before advancing onboarding.");
      const runId = randomUUID();
      const taskIds = new Map(tasks.map(task => [task.id, randomUUID()]));
      await sql`INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,template_hash,code,name,started_at,owner_principal_id,idempotency_key,data,status,status_changed_at,status_changed_by,created_by,updated_at,updated_by)
        VALUES(${runId}::uuid,${input.tenantId}::uuid,${String(template["cycle_type_id"])}::uuid,${String(template["id"])}::uuid,${Number(template["revision_number"])},${String(template["template_hash"])},${`BPONB-${input.request.requestNo.replace(/[^A-Za-z0-9_.-]/g, "-").toUpperCase()}`},${`Supplier onboarding ${input.request.requestNo}`},now(),${input.principalId}::uuid,${idempotencyKey},${JSON.stringify({ caseId: input.request.id, requestNo: input.request.requestNo, eventSchema: "athyper.business-partner-onboarding-event/1" })}::jsonb,'running',now(),${input.principalId}::uuid,${input.principalId}::uuid,now(),${input.principalId}::uuid)`.execute(transaction);
      for (const task of tasks) {
        const hasPredecessor = dependencies.some(edge => edge.successorTemplateId === task.id && edge.isHard);
        await sql`INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,code,name,completion_mode,is_mandatory,is_waivable,status,status_changed_at,status_changed_by,completion_evidence,created_by,updated_at,updated_by)
          VALUES(${taskIds.get(task.id)!}::uuid,${input.tenantId}::uuid,${runId}::uuid,${String(template["cycle_type_id"])}::uuid,${task.id}::uuid,${task.phaseId}::uuid,${task.code},${task.name},${task.completionMode}::control.cycle_completion_mode_d,${task.isMandatory},${task.isWaivable},${hasPredecessor ? "pending" : "ready"}::governance.cycle_task_status_d,now(),${input.principalId}::uuid,'{}'::jsonb,${input.principalId}::uuid,now(),${input.principalId}::uuid)`.execute(transaction);
      }
      for (const edge of dependencies) await sql`INSERT INTO governance.cycle_task_dependency(tenant_id,cycle_run_id,predecessor_task_id,successor_task_id,dependency_type,is_hard,created_by)
        VALUES(${input.tenantId}::uuid,${runId}::uuid,${taskIds.get(edge.predecessorTemplateId)!}::uuid,${taskIds.get(edge.successorTemplateId)!}::uuid,${edge.dependencyType}::control.cycle_dependency_type_d,${edge.isHard},${input.principalId}::uuid)`.execute(transaction);
      await sql`SELECT governance.command_link_business_partner_onboarding_subject(${input.tenantId}::uuid,${runId}::uuid,'onboarding_case',${input.request.id}::uuid,NULL::text,true,${input.principalId}::uuid)`.execute(transaction);
      run = { id: runId, status: "running" };
    }
    const runId = String(run["id"]);
    if (input.invitationId) await sql`SELECT governance.command_link_business_partner_onboarding_subject(${input.tenantId}::uuid,${runId}::uuid,'supplier_invitation',NULL::uuid,${`business_partner_invitation:${input.invitationId}`},false,${input.principalId}::uuid)`.execute(transaction);

    await this.completeEligibleTasks(input, runId, tasks, transaction);
    if (await this.ready(input.tenantId,runId,transaction)) await sql`UPDATE governance.cycle_run run SET status='completed',completed_at=now(),status_changed_at=now(),status_changed_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid,version=version+1
      WHERE run.tenant_id=${input.tenantId}::uuid AND run.id=${runId}::uuid AND run.status IN ('running','blocked')`.execute(transaction);
  }

  async advanceForBusinessPartner(input:{readonly tenantId:string;readonly principalId:string;readonly businessPartnerId:string;readonly eventCode:string;readonly metadata?:Readonly<Record<string,unknown>>},transaction:Tx):Promise<void>{
    const run=(await sql<Row>`SELECT run.id FROM governance.cycle_run run JOIN control.cycle_type type ON type.tenant_id=run.tenant_id AND type.id=run.cycle_type_id
      JOIN governance.cycle_subject subject ON subject.tenant_id=run.tenant_id AND subject.cycle_run_id=run.id AND subject.is_primary
      JOIN document.entity_case governed_case ON governed_case.tenant_id=subject.tenant_id AND governed_case.id=subject.entity_case_id
      WHERE run.tenant_id=${input.tenantId}::uuid AND type.code='BP_SUPPLIER_ONBOARDING' AND run.status IN('running','blocked') AND governed_case.target_entity_id=${input.businessPartnerId}::uuid
      AND (${String(input.metadata?.["operatingOrganizationId"] ?? "")}='' OR EXISTS(SELECT 1 FROM snapshot.entity_snapshot snapshot WHERE snapshot.tenant_id=governed_case.tenant_id AND snapshot.snapshot_id=governed_case.current_snapshot_id AND snapshot.payload_json->>'operatingOrganizationId'=${String(input.metadata?.["operatingOrganizationId"] ?? "")} AND snapshot.payload_json->>'companyCodeId' IS NOT DISTINCT FROM ${typeof input.metadata?.["companyCodeId"] === "string" ? input.metadata["companyCodeId"] : null}))
      ORDER BY run.started_at DESC LIMIT 1 FOR UPDATE OF run`.execute(transaction)).rows[0];
    if(!run)return;
    const runId=String(run["id"]),codes=externalTaskCodes(input.eventCode);
    for(const code of codes){
      const task=(await sql<Row>`SELECT * FROM governance.cycle_task WHERE tenant_id=${input.tenantId}::uuid AND cycle_run_id=${runId}::uuid AND code=${code} AND status IN('ready','in_progress','blocked') FOR UPDATE`.execute(transaction)).rows[0];
      if(!task)continue;
      await sql`UPDATE governance.cycle_task SET status='completed',started_at=COALESCE(started_at,now()),completed_at=now(),completion_evidence=${JSON.stringify({eventCode:input.eventCode,eventAt:new Date().toISOString(),businessPartnerId:input.businessPartnerId,...(input.metadata??{})})}::jsonb,status_changed_at=now(),status_changed_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid,version=version+1 WHERE tenant_id=${input.tenantId}::uuid AND id=${String(task["id"])}::uuid`.execute(transaction);
      await unlock({tenantId:input.tenantId,principalId:input.principalId} as BusinessPartnerOnboardingCycleEvent,runId,String(task["id"]),transaction);
    }
    if (await this.ready(input.tenantId,runId,transaction)) await sql`UPDATE governance.cycle_run run SET status='completed',completed_at=now(),status_changed_at=now(),status_changed_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid,version=version+1 WHERE run.tenant_id=${input.tenantId}::uuid AND run.id=${runId}::uuid AND run.status IN('running','blocked')`.execute(transaction);
  }

  private async completeEligibleTasks(input: BusinessPartnerOnboardingCycleEvent, runId: string, templates: readonly TemplateTask[], transaction: Tx): Promise<void> {
    // Iterate because a single domain event may complete a task and unlock its successor.
    for (let pass = 0; pass < templates.length; pass += 1) {
      const rows = (await sql<Row>`SELECT task.* FROM governance.cycle_task task
        WHERE task.tenant_id=${input.tenantId}::uuid AND task.cycle_run_id=${runId}::uuid ORDER BY task.created_at,task.id FOR UPDATE`.execute(transaction)).rows;
      let changed = false;
      for (const row of rows) {
        const status = String(row["status"]), code = String(row["code"]);
        if (!['ready','in_progress','blocked'].includes(status) || !matches(code, input)) continue;
        const blocked = code === "DUPLICATE_REVIEW" && input.request.duplicateSummary["blocking"] === true;
        const evidence = { eventCode: input.eventCode, eventAt: new Date().toISOString(), requestVersion: input.request.rowVersion, ...(code === "DUPLICATE_REVIEW" ? { duplicateSummary: input.request.duplicateSummary } : {}), ...(input.metadata ?? {}) };
        await sql`UPDATE governance.cycle_task SET status=${blocked ? "blocked" : "completed"}::governance.cycle_task_status_d,started_at=COALESCE(started_at,now()),completed_at=${blocked ? null : new Date().toISOString()}::timestamptz,completion_evidence=${JSON.stringify(evidence)}::jsonb,status_changed_at=now(),status_changed_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid,version=version+1 WHERE tenant_id=${input.tenantId}::uuid AND id=${String(row["id"])}::uuid`.execute(transaction);
        if (blocked) await sql`UPDATE governance.cycle_run SET status='blocked',status_changed_at=now(),status_changed_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid,version=version+1 WHERE tenant_id=${input.tenantId}::uuid AND id=${runId}::uuid AND status='running'`.execute(transaction);
        else await unlock(input, runId, String(row["id"]), transaction);
        changed = true;
      }
      if (!changed) break;
    }
  }
}

function matches(taskCode: string, input: BusinessPartnerOnboardingCycleEvent): boolean {
  if (taskCode === "INVITATION") return input.eventCode === "business_partner_invitation.supplier.accepted" || ((input.eventCode === "business_partner.case.created" || (input.request.source.kind === "manual" && input.eventCode === "business_partner.case.submitted")) && input.request.registrationMode !== "self_service");
  if (taskCode === "REGISTRATION" || taskCode === "DUPLICATE_REVIEW") return input.eventCode === "business_partner.case.submitted";
  return false; // Case approval cannot certify supplier qualification.
}

function externalTaskCodes(eventCode:string):readonly string[]{switch(eventCode){case"business_partner.qualification.approved":return["QUALIFICATION"];case"business_partner.bank_registration.protected":return["BANK_REGISTRATION"];case"business_partner.bank_verification.verified":case"business_partner.bank_verification.applied":return["BANK_VERIFICATION"];case"business_partner.supplier.readiness.completed":return["SUPPLIER_READINESS"];case"business_partner.supplier.activated":return["SUPPLIER_READINESS","ACTIVATION"];default:return[];}}

async function unlock(input: BusinessPartnerOnboardingCycleEvent, runId: string, predecessorId: string, transaction: Tx): Promise<void> {
  await sql`UPDATE governance.cycle_task successor SET status='ready',status_changed_at=now(),status_changed_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid,version=successor.version+1
    WHERE successor.tenant_id=${input.tenantId}::uuid AND successor.cycle_run_id=${runId}::uuid AND successor.status='pending'
      AND EXISTS(SELECT 1 FROM governance.cycle_task_dependency edge WHERE edge.tenant_id=successor.tenant_id AND edge.cycle_run_id=successor.cycle_run_id AND edge.predecessor_task_id=${predecessorId}::uuid AND edge.successor_task_id=successor.id)
      AND NOT EXISTS(SELECT 1 FROM governance.cycle_task_dependency edge JOIN governance.cycle_task predecessor ON predecessor.tenant_id=edge.tenant_id AND predecessor.id=edge.predecessor_task_id WHERE edge.tenant_id=successor.tenant_id AND edge.cycle_run_id=successor.cycle_run_id AND edge.successor_task_id=successor.id AND edge.is_hard AND predecessor.status NOT IN ('completed','waived'))`.execute(transaction);
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array<T>(value: unknown): readonly T[] { return Array.isArray(value) ? value as readonly T[] : []; }
