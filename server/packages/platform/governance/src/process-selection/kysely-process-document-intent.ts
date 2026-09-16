import { randomUUID, createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { ProcessDocumentPort } from "@athyper/server-contract-governance";
import { processSelectionCanonical } from "./process-selection-service.js";

/** Transactional dispatch; P4 consumes the committed job/event and owns rendering results. */
export function createKyselyProcessDocumentIntentPort(): Pick<
  ProcessDocumentPort<Transaction<Record<string, never>>>,
  "enqueue"
> {
  return {
    async enqueue(context, intent, tx) {
      if (
        context.tenantId !== intent.coordinate.scope.tenantId ||
        context.planeKey !== intent.coordinate.scope.planeKey ||
        context.principalId !== intent.requestedBy ||
(intent.binding.purpose === "submitted_review_pack" &&
        processSelectionCanonical(intent.sourceSnapshot) !==
          processSelectionCanonical(intent.coordinate.submissionSnapshot))
      )
        throw Error("PROCESS_DOCUMENT_INTENT_SCOPE_MISMATCH");
      const hash = createHash("sha256")
        .update(processSelectionCanonical(intent))
        .digest("hex");
      const existing = (
        await sql<{
          id: string;
          intent_hash: string;
        }>`SELECT id,intent_hash FROM governance.process_document_job
      WHERE tenant_id=${context.tenantId}::uuid AND idempotency_key=${intent.idempotencyKey}`.execute(
          tx,
        )
      ).rows[0];
      if (existing) {
        if (existing.intent_hash !== hash)
          throw Error("PROCESS_DOCUMENT_INTENT_REPLAY_CONFLICT");
        return { jobId: existing.id, replayed: true };
      }
      const id = randomUUID(),
        c = intent.coordinate;
      await sql`INSERT INTO governance.process_document_job(id,tenant_id,attempt_id,case_id,cycle_run_id,selection_id,purpose,idempotency_key,intent_hash,intent,created_by)
      VALUES(${id}::uuid,${context.tenantId}::uuid,${c.attemptId}::uuid,${c.caseId}::uuid,${c.cycleRunId}::uuid,${c.selectionId}::uuid,${intent.binding.purpose},${intent.idempotencyKey},${hash},${JSON.stringify(intent)}::jsonb,${context.principalId}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,actor_id,source,payload,created_by)
      VALUES(${context.tenantId}::uuid,'process-documents','process.document.requested',${`process-document:${id}`},'process_document_job',${id}::uuid,${context.principalId}::uuid,'process-submission',${JSON.stringify({ schema: "athyper.process-document-dispatch/1", jobId: id, intentHash: hash, coordinate: c, purpose: intent.binding.purpose })}::jsonb,${context.principalId}::uuid)`.execute(
        tx,
      );
      return { jobId: id, replayed: false };
    },
  };
}
