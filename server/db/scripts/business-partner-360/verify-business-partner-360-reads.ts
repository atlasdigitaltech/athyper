#!/usr/bin/env tsx
/** Read-only deployment gate. Uses the real repository under the runtime DB role. */
import { pathToFileURL } from "node:url";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { KyselyBusinessPartner360Repository } from "../../../packages/services/master-data/src/kysely-business-partner-360-repository.js";

export async function verifyBusinessPartner360Reads(options: {
  databaseUrl: string;
  businessPartnerId?: string;
}) {
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: options.databaseUrl, max: 1 }),
    }),
  });
  const repository = new KyselyBusinessPartner360Repository();
  try {
    return await db
      .transaction()
      .execute(async (tx) => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SET LOCAL statement_timeout='15s'`.execute(tx);
        // The gate must never pass because the migration/admin connection bypassed RLS.
        await sql`SET LOCAL ROLE athyperapp`.execute(tx);
        const role = (
          await sql<{
            safe: boolean;
          }>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`.execute(
            tx,
          )
        ).rows[0];
        if (!role?.safe)
          throw new Error("Runtime role must not bypass row-level security");
        // Check permissions even when the chosen fixture has no history/channels.
        for (const table of [
          "master.address",
          "master.address_link",
          "master.address_event",
          "master.contact_person",
          "master.contact_person_role",
          "master.contact_link",
          "master.contact_email",
          "master.contact_phone",
        ])
          await sql`SELECT * FROM ${sql.table(table)} LIMIT 0`.execute(tx);
        return { role: "athyperapp", dependenciesReadable: true };
      })
      .then(async (permissions) => {
        // Discover fixture coordinates using the deployment connection, then perform all
        // reads in individual runtime-role transactions so one failure cannot hide others.
        const fixture = (
          await sql<{
            id: string;
            tenant_id: string;
            company_id: string | null;
            organization_id: string | null;
          }>`SELECT bp.id::text,bp.tenant_id::text,
        (SELECT id::text FROM master.company_code WHERE tenant_id=bp.tenant_id ORDER BY id LIMIT 1) company_id,
        (SELECT id::text FROM master.operating_organization WHERE tenant_id=bp.tenant_id ORDER BY id LIMIT 1) organization_id
        FROM master.business_partner bp WHERE (${options.businessPartnerId ?? null}::uuid IS NULL OR bp.id=${options.businessPartnerId ?? null}::uuid)
        AND EXISTS(SELECT 1 FROM master.address_link a WHERE a.tenant_id=bp.tenant_id AND a.owner_id=bp.id)
        AND EXISTS(SELECT 1 FROM master.contact_person c WHERE c.tenant_id=bp.tenant_id AND c.owner_id=bp.id)
        ORDER BY bp.id LIMIT 1`.execute(db)
        ).rows[0];
        if (!fixture)
          throw new Error(
            "A representative partner with both contacts and addresses is required",
          );
        const asOf = new Date().toISOString().slice(0, 10),
          cursor = { snapshotAt: new Date().toISOString() };
        const input = {
          tenantId: fixture.tenant_id,
          businessPartnerId: fixture.id,
          asOf,
          cursor,
          limit: 5,
          category: "organization" as const,
          historical: false,
          ...(fixture.company_id ? { companyCodeId: fixture.company_id } : {}),
          ...(fixture.organization_id
            ? { operatingOrganizationId: fixture.organization_id }
            : {}),
        };
        const sections = [
          "identity",
          "contacts",
          "addresses",
          "identifiers-tax",
          "governance",
          "comments",
          "attachments",
          "roles-scope",
          "supplier-company",
          "customer-company",
          "banking",
          "qualifications-certificates",
          "credit",
          "requests",
          "activity",
          "network",
        ] as const;
        const results: { section: string; passed: boolean; error?: string }[] =
          [];
        for (const sectionCode of sections) {
          try {
            await db.transaction().execute(async (tx) => {
              await sql`SET TRANSACTION READ ONLY`.execute(tx);
              await sql`SET LOCAL statement_timeout='15s'`.execute(tx);
              await sql`SET LOCAL ROLE athyperapp`.execute(tx);
              await sql`SELECT set_config('app.current_tenant_id',${fixture.tenant_id},true)`.execute(
                tx,
              );
              if (
                sectionCode === "roles-scope" ||
                sectionCode === "supplier-company" ||
                sectionCode === "customer-company"
              )
                await repository.readRoleCompanySection(
                  { ...input, sectionCode },
                  tx,
                );
              else if (
                sectionCode === "banking" ||
                sectionCode === "qualifications-certificates" ||
                sectionCode === "credit"
              )
                await repository.readCommercialControlSection(
                  { ...input, sectionCode },
                  tx,
                );
              else if (sectionCode === "requests" || sectionCode === "activity")
                await repository.readExplainabilitySection(
                  { ...input, sectionCode },
                  tx,
                );
              else if (sectionCode === "network")
                await repository.readNetworkSection(
                  { ...input, roleLens: "all", freshAfter: asOf },
                  tx,
                );
              else {
                const page = await repository.readCommonSection(
                  { ...input, sectionCode },
                  tx,
                );
                if (
                  (sectionCode === "contacts" || sectionCode === "addresses") &&
                  !page.items.length
                )
                  throw new Error(
                    "Representative fixture has no current records",
                  );
              }
            });
            results.push({ section: sectionCode, passed: true });
          } catch (error) {
            results.push({
              section: sectionCode,
              passed: false,
              error: error instanceof Error ? error.message : "Read failed",
            });
          }
        }
        return {
          ...permissions,
          passed: results.every((r) => r.passed),
          results,
        };
      });
  } finally {
    await db.destroy();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL is required");
  const result = await verifyBusinessPartner360Reads({
    databaseUrl,
    businessPartnerId: process.env.BUSINESS_PARTNER_ID,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
