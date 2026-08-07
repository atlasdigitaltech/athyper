import { sql } from "kysely";
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";
import type { SessionShadowRecord, SessionShadowSink } from "./session-cutover.js";

export class SqlSessionShadowSink implements SessionShadowSink {
  constructor(private readonly databases: PlaneDatabaseRegistry) {}

  async append(record: SessionShadowRecord): Promise<void> {
    const binding = this.databases.forPlane(record.plane);
    await binding.db.transaction().execute(async (trx) => {
      await sql`SELECT
        set_config('app.database_plane', ${binding.databasePlane}, true),
        set_config('app.current_tenant_id', ${record.tenantId}, true),
        set_config('app.current_principal_id', ${record.principalId}, true)
      `.execute(trx);
      await sql`INSERT INTO ops.authorization_session_shadow_comparison(
        tenant_id, plane_code, principal_id, request_id, comparison_status,
        mismatch_areas, legacy_result, candidate_result, candidate_error,
        legacy_fingerprint, candidate_fingerprint, resolver_revision
      ) VALUES (
        ${record.tenantId}::uuid, ${binding.databasePlane}, ${record.principalId}::uuid,
        ${record.requestId}, ${record.status}, ${record.mismatchAreas}::text[],
        ${JSON.stringify(record.legacyResult)}::jsonb,
        ${record.candidateResult ? JSON.stringify(record.candidateResult) : null}::jsonb,
        ${record.candidateError ?? null}, ${record.legacyFingerprint},
        ${record.candidateFingerprint ?? null}, ${record.resolverRevision}
      )`.execute(trx);
    });
  }
}
