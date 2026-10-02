import { sql } from "kysely";
import type { RecordTransaction } from "@athyper/server-service-records";
import type { VerifiedProfileSourceReader, VerifiedProfileSourceSnapshot } from "../identity/verified-profile-source.js";

/** The bounded SECURITY DEFINER reader proves completeness and holds the same
 * parent-row fence as HR links and legacy identity/Employee writes. */
export function createKyselyProfileSourceReader(): VerifiedProfileSourceReader<RecordTransaction> {
  return {
    async lockAndRead(input, transaction) {
      if (!['neon','studio','mesh'].includes(input.context.planeKey))
        throw Error("ENTITY_SOURCE_PLANE_UNAVAILABLE");
      const result = input.context.planeKey === 'neon' ? await sql<{snapshot:VerifiedProfileSourceSnapshot}>`
        SELECT master.entity_profile_source_v1(${input.context.tenantId}::uuid,
          ${input.ownerPrincipalId}::uuid) AS snapshot
      `.execute(transaction) : await sql<{snapshot:VerifiedProfileSourceSnapshot}>`
        SELECT master.entity_projected_profile_source_v1(${input.context.tenantId}::uuid,
          ${input.ownerPrincipalId}::uuid) AS snapshot
      `.execute(transaction);
      if (!result.rows[0]?.snapshot) throw Error("ENTITY_SOURCE_EVIDENCE_UNAVAILABLE");
      return result.rows[0].snapshot;
    },
  };
}
