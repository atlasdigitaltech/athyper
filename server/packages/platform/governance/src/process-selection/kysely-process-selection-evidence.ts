import { sql, type Transaction } from "kysely";
import type {
  ProcessSelectionEvidence,
  ProcessSelectionEvidenceRepository,
} from "@athyper/server-contract-governance";
import {
  processSelectionCanonical,
  ProcessSelectionError,
} from "./process-selection-service.js";

export type ProcessSelectionTransaction = Transaction<Record<string, never>>;
export function createKyselyProcessSelectionEvidenceRepository(): ProcessSelectionEvidenceRepository<ProcessSelectionTransaction> {
  return {
    async get(scope, selectionId, tx) {
      const row = (
        await sql<{
          evidence: ProcessSelectionEvidence;
        }>`SELECT evidence FROM governance.process_selection_evidence
        WHERE tenant_id=${scope.tenantId}::uuid AND plane_key=${scope.planeKey}
        AND process_family=${scope.processFamily} AND operating_organization_id=${scope.operatingOrganizationId}::uuid
        AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid AND id=${selectionId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      return row?.evidence;
    },
    async append(evidence, tx) {
      const { coordinate: c } = evidence,
        s = c.scope;
      const inserted =
        await sql`INSERT INTO governance.process_selection_evidence
        (id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,case_id,cycle_run_id,attempt_id,attempt_number,idempotency_key,evidence)
        VALUES (${c.selectionId}::uuid,${s.tenantId}::uuid,${s.planeKey},${s.processFamily},${s.operatingOrganizationId}::uuid,${s.companyCodeId}::uuid,
          ${c.caseId}::uuid,${c.cycleRunId}::uuid,${c.attemptId}::uuid,${c.attemptNumber},${evidence.idempotencyKey},${JSON.stringify(evidence)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING id`.execute(tx);
      if (inserted.rows.length) return structuredClone(evidence);
      const prior = await this.get(s, c.selectionId, tx);
      const comparable = (v: ProcessSelectionEvidence) => {
        const { acceptedAt: _time, ...rest } = v;
        return processSelectionCanonical(rest);
      };
      if (!prior || comparable(prior) !== comparable(evidence))
        throw new ProcessSelectionError("PROCESS_SELECTION_EVIDENCE_CONFLICT");
      return prior;
    },
  };
}
