/** Plan by default; update only missing codes on approved links with matching local publications. */
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { resolveMeshExternalReferenceCode } from "../../../packages/planes/neon/src/mesh-external-reference-code.js";

export async function backfillMeshExternalReferenceCodes(options: {
  databaseUrl: string;
  apply?: boolean;
}) {
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: options.databaseUrl, max: 1 }),
    }),
  });
  try {
    return await db.transaction().execute(async (tx) => {
      await sql`SET LOCAL statement_timeout='15s'`.execute(tx);
      const links = (
        await sql<Record<string, unknown>>`
      SELECT l.* FROM control.mesh_business_partner_account_link l
      JOIN master.external_reference r ON r.tenant_id=l.tenant_id AND r.id=l.external_reference_id
        AND r.owner_id=l.business_partner_id AND r.external_id=l.source_network_account_id::text
      JOIN control.owner_type o ON o.id=r.owner_type_id AND o.code='business_partner'
      WHERE l.status='active' AND l.approved_by IS NOT NULL AND r.status='active'
        AND r.source_system_code='athyper_mesh' AND r.external_entity_code='network_account'
        AND NULLIF(btrim(r.external_code),'') IS NULL
      ORDER BY l.tenant_id,l.id FOR UPDATE OF r,l
    `.execute(tx)
      ).rows;
      const changes: { referenceId: string; code: string }[] = [];
      let skipped = 0;
      for (const link of links) {
        const code = await resolveMeshExternalReferenceCode(link, tx);
        if (!code) {
          skipped++;
          continue;
        }
        if (options.apply)
          await sql`UPDATE master.external_reference SET external_code=${code},updated_at=clock_timestamp(),updated_by=${link["approved_by"]}::uuid
        WHERE tenant_id=${link["tenant_id"]}::uuid AND id=${link["external_reference_id"]}::uuid AND NULLIF(btrim(external_code),'') IS NULL`.execute(
            tx,
          );
        changes.push({
          referenceId: String(link["external_reference_id"]),
          code,
        });
      }
      return { mode: options.apply ? "applied" : "plan", changes, skipped };
    });
  } finally {
    await db.destroy();
  }
}
