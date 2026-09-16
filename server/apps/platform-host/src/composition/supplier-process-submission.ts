import { createHash, randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  ProcessSelectionEvidence,
  ProcessSelectionService,
  ProcessDocumentPort,
  ProcessAttemptCoordinate,
} from "@athyper/server-contract-governance";
import type {
  BusinessPartnerRequest,
  SubmitBusinessPartnerRequestCommand,
  SubmitBusinessPartnerRequestResponse,
} from "@athyper/server-contract-master-data";
import type { SupplierProcessSubmission } from "@athyper/server-service-master-data";
import { MasterDataError } from "@athyper/server-service-master-data";
import { processSelectionCanonical } from "@athyper/server-platform-governance";
type Tx = Transaction<Record<string, never>>;
const fingerprint = (c: SubmitBusinessPartnerRequestCommand) =>
  createHash("sha256")
    .update(
      processSelectionCanonical({
        tenantId: c.context.tenantId,
        caseId: c.requestId,
        principalId: c.context.principalId,
        expectedVersion: c.expectedVersion,
        idempotencyKey: c.idempotencyKey,
      }),
    )
    .digest("hex");
const conflict = (code: string) => new MasterDataError(409, code, code);

export function createSupplierProcessSubmission(options: {
  selection: ProcessSelectionService<Tx>;
  documents: Pick<ProcessDocumentPort<Tx>, "enqueue">;
  submitCase(
    command: SubmitBusinessPartnerRequestCommand,
    tx: Tx,
  ): Promise<BusinessPartnerRequest>;
}): SupplierProcessSubmission<Tx> {
  return {
    async lock(c, tx) {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${c.context.tenantId}:entity-case-lifecycle:${c.idempotencyKey}`},0))`.execute(
        tx,
      );
      // Same case lock as the canonical lifecycle/draft commands. Read only after acquiring it.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${c.context.tenantId}:entity-case:${c.requestId}`},0))`.execute(
        tx,
      );
    },
    async replay(c, request, tx) {
      const row = (
        await sql<{
          request_fingerprint: string;
          response: {
            process: SubmitBusinessPartnerRequestResponse["process"];
          };
        }>`SELECT request_fingerprint,response FROM governance.process_attempt
        WHERE tenant_id=${c.context.tenantId}::uuid AND idempotency_key=${c.idempotencyKey}`.execute(
          tx,
        )
      ).rows[0];
      if (row) {
        if (row.request_fingerprint !== fingerprint(c))
          throw conflict("PROCESS_SUBMISSION_IDEMPOTENCY_CONFLICT");
        return {
          request,
          case: request,
          process: row.response.process,
          replayed: true,
        };
      }
      if (
        (
          await sql`SELECT id FROM governance.process_attempt WHERE tenant_id=${c.context.tenantId}::uuid AND case_id=${c.requestId}::uuid`.execute(
            tx,
          )
        ).rows.length &&
        !(
          await sql`SELECT 1 FROM document.entity_case c WHERE c.tenant_id=${c.context.tenantId}::uuid AND c.id=${c.requestId}::uuid AND c.status='draft' AND EXISTS(SELECT 1 FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.result_code='ENTITY_CASE_RETURNED') AND EXISTS(SELECT 1 FROM governance.process_attempt a JOIN governance.cycle_run r ON r.tenant_id=a.tenant_id AND r.id=a.cycle_run_id WHERE a.tenant_id=c.tenant_id AND a.case_id=c.id AND r.status='running')`.execute(
            tx,
          )
        ).rows.length
      )
        throw conflict("PROCESS_REQUEST_ALREADY_ACCEPTED");
      return undefined;
    },
    async submit(c, _request, tx) {
      const previous = (
        await sql<{
          evidence: ProcessSelectionEvidence;
        }>`SELECT e.evidence FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE a.tenant_id=${c.context.tenantId}::uuid AND a.case_id=${c.requestId}::uuid ORDER BY a.attempt_number DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0]?.evidence;
      // Canonical lifecycle validates and creates the immutable submitted snapshot. Any later failure rolls it back.
      const request = await options.submitCase(c, tx);
      const snapshot = (
        await sql<{
          id: string;
          version_number: number;
          payload_hash: string;
        }>`SELECT s.id,s.version_number,s.payload_hash FROM snapshot.entity_snapshot_identity s JOIN document.entity_case c
        ON c.tenant_id=s.tenant_id AND c.submitted_snapshot_id=s.id WHERE c.tenant_id=${c.context.tenantId}::uuid AND c.id=${c.requestId}::uuid AND c.current_snapshot_id=s.id`.execute(
          tx,
        )
      ).rows[0];
      if (!snapshot) throw conflict("PROCESS_SUBMISSION_SNAPSHOT_MISSING");
      const preview = await options.selection.preview(
        c.context,
        c.requestId,
        tx,
      );
      if (preview.status !== "ready")
        throw new MasterDataError(
          preview.code === "PROCESS_CORRECTION_PROFILE_CHANGE_UNSUPPORTED"
            ? 409
            : 503,
          preview.code,
          preview.code === "PROCESS_CORRECTION_PROFILE_CHANGE_UNSUPPORTED"
            ? "This correction requires a different onboarding profile; changing the process for this case is not supported in this prototype. Close this proposal and create a new request."
            : "Supplier process selection is unavailable; submission was not accepted.",
        );
      const manifest = preview.selection.executionManifest;
      const coordinate: ProcessAttemptCoordinate = {
        scope: manifest.scope,
        caseId: c.requestId,
        cycleRunId: previous?.coordinate.cycleRunId ?? randomUUID(),
        selectionId: randomUUID(),
        attemptId: randomUUID(),
        attemptNumber: (previous?.coordinate.attemptNumber ?? 0) + 1,
        submissionSnapshot: {
          id: snapshot.id,
          version: snapshot.version_number,
          hash: snapshot.payload_hash,
        },
        manifest: manifest.revision,
      };
      const evidence = await options.selection.select(
        c.context,
        c.requestId,
        coordinate,
        c.idempotencyKey,
        tx,
      );
      const m = evidence.executionManifest,
        actor = c.context.principalId,
        tenant = c.context.tenantId,
        runId = coordinate.cycleRunId;
      const revision = (
        await sql<{
          template_json: {
            template: {
              tasks: { id: string; phaseId: string; name: string }[];
            };
          };
        }>`SELECT template_json FROM control.cycle_template_revision WHERE tenant_id=${tenant}::uuid AND id=${m.cycle.id}::uuid AND cycle_type_id=${m.cycle.cycleTypeId}::uuid AND revision_number=${m.cycle.version} AND template_hash=${m.cycle.hash}`.execute(
          tx,
        )
      ).rows[0];
      if (!revision) throw conflict("PROCESS_PINNED_CYCLE_UNAVAILABLE");
      const templateTasks = new Map(
        revision.template_json.template.tasks.map((t) => [t.id, t]),
      );
      if (
        templateTasks.size !== m.tasks.length ||
        m.tasks.some((t) => !templateTasks.has(t.taskTemplateId))
      )
        throw conflict("PROCESS_PINNED_TASK_MISMATCH");
      if (!previous)
        await sql`INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,template_hash,code,name,started_at,owner_principal_id,idempotency_key,data,status,status_changed_at,status_changed_by,created_by)
        VALUES(${runId}::uuid,${tenant}::uuid,${m.cycle.cycleTypeId}::uuid,${m.cycle.id}::uuid,${m.cycle.version},${m.cycle.hash},${`SUP-${runId.toUpperCase()}`},${`Supplier onboarding ${request.requestNo}`},now(),${actor}::uuid,${`supplier-process:${c.requestId}`},${JSON.stringify({ schema: "athyper.process-run/1", caseId: c.requestId, selectionId: coordinate.selectionId, attemptId: coordinate.attemptId, profile: m.profile, manifest: m.revision })}::jsonb,'running',now(),${actor}::uuid,${actor}::uuid)`.execute(
          tx,
        );
      const taskIds = new Map(
        m.tasks.map((t) => [t.taskTemplateId, randomUUID()]),
      );
      for (const task of m.tasks) {
        const template = templateTasks.get(task.taskTemplateId)!;
        const preparation = task.executionKind === "preparation";
        const state = preparation
          ? "completed"
          : task.executionKind === "document"
            ? "in_progress"
            : "blocked";
        const completion = preparation
          ? {
              schema: "athyper.process-preparation/1",
              coordinate,
              taskTemplateId: task.taskTemplateId,
              commandCode: task.commandCode,
              source: "validated_submitted_snapshot",
            }
          : {
              coordinate,
              taskTemplateId: task.taskTemplateId,
              waitingFor: "submitted_review_pack",
            };
        await sql`INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,process_attempt_id,code,name,completion_mode,is_mandatory,is_waivable,status,status_changed_at,status_changed_by,started_at,completed_at,completion_evidence,created_by)
          VALUES(${taskIds.get(task.taskTemplateId)!}::uuid,${tenant}::uuid,${runId}::uuid,${m.cycle.cycleTypeId}::uuid,${task.taskTemplateId}::uuid,${template.phaseId}::uuid,${coordinate.attemptId}::uuid,${task.code},${template.name},'manual',true,false,${state}::governance.cycle_task_status_d,now(),${actor}::uuid,${preparation || task.executionKind === "document" ? sql`now()` : null},${preparation ? sql`now()` : null},${JSON.stringify(completion)}::jsonb,${actor}::uuid)`.execute(
          tx,
        );
        if (task.predecessorTaskTemplateId)
          await sql`INSERT INTO governance.cycle_task_dependency(tenant_id,cycle_run_id,predecessor_task_id,successor_task_id,dependency_type,is_hard,created_by)
          VALUES(${tenant}::uuid,${runId}::uuid,${taskIds.get(task.predecessorTaskTemplateId)!}::uuid,${taskIds.get(task.taskTemplateId)!}::uuid,'finish_to_start',true,${actor}::uuid)`.execute(
            tx,
          );
      }
      if (!previous)
        await sql`SELECT governance.command_link_business_partner_onboarding_subject(${tenant}::uuid,${runId}::uuid,'onboarding_case',${c.requestId}::uuid,NULL::text,true,${actor}::uuid)`.execute(
          tx,
        );
      const binding = m.documents.find(
        (d) => d.purpose === "submitted_review_pack",
      );
      if (!binding) throw conflict("PROCESS_REVIEW_PACK_BINDING_MISSING");
      const job = await options.documents.enqueue(
        c.context,
        {
          coordinate,
          binding,
          sourceSnapshot: coordinate.submissionSnapshot,
          idempotencyKey: `process-review-pack:${coordinate.attemptId}`,
          requestedBy: actor,
        },
        tx,
      );
      const process: NonNullable<
        SubmitBusinessPartnerRequestResponse["process"]
      > = {
        cycleRunId: runId,
        attemptId: coordinate.attemptId,
        attemptNumber: coordinate.attemptNumber,
        selectionId: coordinate.selectionId,
        profile: m.profile.code,
        reviewPackJobId: job.jobId,
        documentStatus: "pending",
      };
      await sql`INSERT INTO governance.process_attempt(id,tenant_id,case_id,cycle_run_id,selection_id,attempt_number,submission_snapshot_id,submission_snapshot_version,submission_snapshot_hash,manifest_id,manifest_version,manifest_hash,idempotency_key,request_fingerprint,expected_case_version,response,created_by)
        VALUES(${coordinate.attemptId}::uuid,${tenant}::uuid,${c.requestId}::uuid,${runId}::uuid,${coordinate.selectionId}::uuid,${coordinate.attemptNumber},${snapshot.id}::uuid,${snapshot.version_number},${snapshot.payload_hash},${m.revision.id}::uuid,${m.revision.version},${m.revision.hash},${c.idempotencyKey},${fingerprint(c)},${c.expectedVersion},${JSON.stringify({ process })}::jsonb,${actor}::uuid)`.execute(
        tx,
      );
      return { request, case: request, process, replayed: false };
    },
  };
}
