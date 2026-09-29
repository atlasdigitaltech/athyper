import { sql, type Transaction } from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { createEntityRuntimeResourceService } from "@athyper/server-platform-experience";
type DisplayChoices = NonNullable<
  Parameters<typeof createEntityRuntimeResourceService>[0]["displayChoices"]
>;
/** Registered catalog readers; catalog names are admitted from published metadata. */
export function createRecordDisplayChoices(
  transactions: PlaneTransactionCoordinator<Transaction<Record<string, never>>>,
): DisplayChoices {
  return async (context, catalog, values) => {
    return transactions.run("neon", context, async (transaction) => {
      // Closed catalog registration, never a table name supplied by the client.
      if (["master.operating_organization", "master.company_code", "master.commodity_category", "master.tax_jurisdiction", "master.org_unit", "master.business_partner", "master.payment_term"].includes(catalog)) {
        const rows = (await sql<{code:string;name:string}>`SELECT id::text AS code,name
          FROM ${sql.table(catalog)} WHERE tenant_id=${context.tenantId}::uuid
          AND id::text=ANY(${values ?? []}::text[]) ORDER BY id`.execute(transaction)).rows;
        return rows.map(row => ({value:row.code,label:{labelKey:`lookup.${catalog}.${row.code}`,defaultText:row.name}}));
      }
      if (catalog === "master.business_partner_commodity_classification") {
        const rows=(await sql<{code:string;name:string}>`SELECT c.id::text AS code,category.name
          FROM master.business_partner_commodity_classification c
          JOIN master.commodity_category category ON category.tenant_id=c.tenant_id AND category.id=c.commodity_category_id
          WHERE c.tenant_id=${context.tenantId}::uuid AND c.id::text=ANY(${values ?? []}::text[]) ORDER BY c.id`.execute(transaction)).rows;
        return rows.map(row=>({value:row.code,label:{labelKey:`lookup.${catalog}.${row.code}`,defaultText:row.name}}));
      }
      const rows =
        catalog === "shared.classification_scheme"
          ? (
              await sql<{
                code: string;
                name: string;
              }>`SELECT code,name FROM shared.classification_scheme ORDER BY code`.execute(
                transaction as never,
              )
            ).rows
          : catalog === "shared.country"
            ? (
                await sql<{
                  code: string;
                  name: string;
                }>`SELECT code,name FROM shared.country ORDER BY code`.execute(
                  transaction as never,
                )
              ).rows
            : catalog === "shared.currency"
              ? (
                  await sql<{
                    code: string;
                    name: string;
                  }>`SELECT code,name FROM shared.currency ORDER BY code`.execute(
                    transaction as never,
                  )
                ).rows
              : catalog === "master.certification_type"
                ? (
                    await sql<{
                      code: string;
                      name: string;
                    }>`SELECT id::text AS code,name FROM master.certification_type WHERE (tenant_id IS NULL OR tenant_id=${context.tenantId}::uuid) AND id::text=ANY(${values ?? []}::text[]) ORDER BY id`.execute(
                      transaction as never,
                    )
                  ).rows
                : catalog === "shared.bank_institution"
                  ? (
                      await sql<{
                        code: string;
                        name: string;
                      }>`SELECT id::text AS code,name FROM shared.bank_institution WHERE id::text=ANY(${values ?? []}::text[]) ORDER BY id`.execute(
                        transaction as never,
                      )
                    ).rows
                  : catalog === "shared.bank_branch"
                    ? (
                        await sql<{
                          code: string;
                          name: string;
                        }>`SELECT id::text AS code,name FROM shared.bank_branch WHERE id::text=ANY(${values ?? []}::text[]) ORDER BY id`.execute(
                          transaction as never,
                        )
                      ).rows
                    : (
                        await sql<{
                          code: string;
                          name: string;
                        }>`SELECT DISTINCT ON(code) code,name FROM control.lookup_value WHERE domain_code=${catalog} AND (tenant_id IS NULL OR tenant_id=${context.tenantId}::uuid) ORDER BY code,tenant_id NULLS LAST`.execute(
                          transaction as never,
                        )
                      ).rows;
      return rows.map((row) => ({
        value: row.code,
        label: {
          labelKey: `lookup.${catalog}.${row.code.toLowerCase()}`,
          defaultText: row.name,
        },
      }));
    });
  };
}
