import { CompiledQuery, type Kysely } from "kysely";

import type { CanonicalDecisionRequest } from "../authorization-evaluator/index.js";
import type {
  OperationScopeQualificationEvidence,
  OperationScopeRolloutResolver,
} from "./operation-scope-shadow.js";

type AnyDb = Kysely<Record<string, never>>;

interface RolloutRow {
  plane_code: "neon" | "mesh";
  entity_code: string;
  source_entity_operation_id: string;
  source_release_hash: string;
  source_artifact_hash: string;
  mode: "legacy" | "shadow" | "active";
  certification_status: "qualified" | "rejected" | null;
  sample_count: string | number | null;
  mismatch_count: string | number | null;
  candidate_error_count: string | number | null;
  observed_from: Date | string | null;
  observed_through: Date | string | null;
}

/** Plane-local resolver. Missing, stale, or incompletely certified rows fail
 * closed to the legacy path; active evidence is revalidated by the comparator. */
export class SqlOperationScopeRolloutResolver implements OperationScopeRolloutResolver {
  constructor(
    private readonly db: AnyDb,
    private readonly expectedPlane: "neon" | "mesh",
  ) {}

  async resolve(request: CanonicalDecisionRequest) {
    if (request.subject.plane !== this.expectedPlane || request.mode === "registered_capability") return null;
    const result = await this.db.executeQuery<RolloutRow>(CompiledQuery.raw(`
      SELECT r.plane_code,r.entity_code,r.source_entity_operation_id::text,
             r.source_release_hash,r.source_artifact_hash,r.mode,c.status certification_status,
             c.sample_count,c.mismatch_count,c.candidate_error_count,
             c.observed_from,c.observed_through
        FROM ops.authorization_operation_rollout r
        LEFT JOIN ops.authorization_parity_certification c ON c.id=r.certification_id
       WHERE r.plane_code=$1 AND r.source_entity_operation_id=$2::uuid
       LIMIT 1
    `, [this.expectedPlane, request.entityOperationId]));
    const row = result.rows[0];
    if (!row) return null;
    const coordinate = {
      plane: row.plane_code,
      entityCode: row.entity_code,
      sourceEntityOperationId: row.source_entity_operation_id,
      sourceReleaseHash: row.source_release_hash,
      sourceArtifactHash: row.source_artifact_hash,
    };
    let qualification: OperationScopeQualificationEvidence | undefined;
    if (row.mode === "active" && row.certification_status === "qualified"
        && row.observed_from && row.observed_through) {
      qualification = {
        ...coordinate,
        sampleCount: Number(row.sample_count),
        mismatchCount: Number(row.mismatch_count),
        candidateErrorCount: Number(row.candidate_error_count),
        observedFrom: new Date(row.observed_from),
        observedThrough: new Date(row.observed_through),
      };
    }
    return { coordinate, mode: row.mode, ...(qualification ? { qualification } : {}) };
  }
}
