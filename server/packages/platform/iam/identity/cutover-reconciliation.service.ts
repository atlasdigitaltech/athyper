import { sql } from "kysely";
import type { PlaneDatabaseRegistry, RuntimePlaneKey } from "../runtime/plane-database-registry.js";

export interface PlaneCutoverEvidence {
  plane: RuntimePlaneKey;
  identitySamples: number;
  identityMismatches: number;
  sessionSamples: number;
  sessionMismatches: number;
  authorizationSamples: number;
  authorizationMismatches: number;
  ready: boolean;
}

export class CutoverReconciliationService {
  constructor(private readonly databases: PlaneDatabaseRegistry) {}

  async report(since: Date, minimumSamples = 1): Promise<PlaneCutoverEvidence[]> {
    return Promise.all((["admin", "neon", "mesh"] as const).map(async (plane) => {
      const binding = this.databases.forPlane(plane);
      const result = await sql<any>`SELECT
        (SELECT count(*) FROM ops.identity_admission_shadow_comparison WHERE observed_at >= ${since})::int AS identity_samples,
        (SELECT count(*) FROM ops.identity_admission_shadow_comparison WHERE observed_at >= ${since} AND comparison_status <> 'match')::int AS identity_mismatches,
        (SELECT count(*) FROM ops.authorization_session_shadow_comparison WHERE observed_at >= ${since})::int AS session_samples,
        (SELECT count(*) FROM ops.authorization_session_shadow_comparison WHERE observed_at >= ${since} AND comparison_status <> 'match')::int AS session_mismatches,
        (SELECT count(*) FROM ops.authorization_shadow_comparison WHERE observed_at >= ${since})::int AS authorization_samples,
        (SELECT count(*) FROM ops.authorization_shadow_comparison WHERE observed_at >= ${since} AND comparison_status <> 'match')::int AS authorization_mismatches
      `.execute(binding.db);
      const row = result.rows[0];
      const evidence = {
        plane,
        identitySamples: Number(row.identity_samples),
        identityMismatches: Number(row.identity_mismatches),
        sessionSamples: Number(row.session_samples),
        sessionMismatches: Number(row.session_mismatches),
        authorizationSamples: Number(row.authorization_samples),
        authorizationMismatches: Number(row.authorization_mismatches),
      };
      return {
        ...evidence,
        ready: evidence.identitySamples >= minimumSamples
          && evidence.sessionSamples >= minimumSamples
          && (plane === "admin" || evidence.authorizationSamples >= minimumSamples)
          && evidence.identityMismatches === 0
          && evidence.sessionMismatches === 0
          && evidence.authorizationMismatches === 0,
      };
    }));
  }

  async assertZeroMismatches(since: Date, minimumSamples = 1): Promise<PlaneCutoverEvidence[]> {
    const report = await this.report(since, minimumSamples);
    const failed = report.filter((item) => !item.ready);
    if (failed.length) throw new Error(`WAVE7_CUTOVER_GATE_FAILED:${failed.map((item) => item.plane).join(",")}`);
    return report;
  }
}
