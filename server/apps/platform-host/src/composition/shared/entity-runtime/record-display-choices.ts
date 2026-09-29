import { sql, type Kysely, type Transaction } from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { createEntityRuntimeResourceService } from "@athyper/server-platform-experience";
import {
  createSharedReferenceDirectory,
  isSharedReferenceSourceKey,
} from "@athyper/server-service-records";
import type { SharedReferenceSourceKey } from "@athyper/server-contract-master-data";

type DisplayChoices = NonNullable<
  Parameters<typeof createEntityRuntimeResourceService>[0]["displayChoices"]
>;
type Database = Kysely<Record<string, never>>;
type Choice = Awaited<ReturnType<DisplayChoices>>[number];

// These codes are the published enum/reference contracts served by the generic
// value directory. Adding a new code is a metadata/publication change, not a
// new table reader in the Entity Runtime.
const valueDirectoryCatalogs = new Set([
  "control.business_partner_block_operation",
  "control.business_partner_block_reason",
  "control.business_partner_qualification_type",
  "master.address_purpose",
  "master.address_role_qualifier",
  "master.business_partner",
  "master.business_partner_commodity_classification",
  "master.business_partner_identifier_scheme",
  "master.business_partner_tax_registration_type",
  "master.certification_type",
  "master.commodity_category",
  "master.company_code",
  "master.contact_role",
  "master.operating_organization",
  "master.org_unit",
  "master.payment_term",
  "master.tax_jurisdiction",
]);

export interface PublishedLookupProvider {
  readonly accepts: (catalog: string) => boolean;
  readonly choices: (
    database: Database,
    catalog: string,
    values: readonly string[] | undefined,
  ) => Promise<readonly Choice[]>;
}

/**
 * Providers are selected by lookup codes that have already been admitted by a
 * published entity descriptor. No provider receives a client-selected table,
 * column, or SQL fragment.
 */
export function createPublishedLookupProviders(): readonly PublishedLookupProvider[] {
  return [
    {
      accepts: isSharedReferenceSourceKey,
      async choices(database, catalog, values) {
        const directory = createSharedReferenceDirectory(database);
        if (values?.length) {
          const choices = await Promise.all(
            values.map((value) => directory.lookup({ sourceKey: catalog as SharedReferenceSourceKey, value })),
          );
          return choices.flatMap((page) =>
            page.items.map((item) => ({
              value: item.value,
              label: {
                labelKey: `lookup.${catalog}.${item.value.toLowerCase()}`,
                defaultText: item.label,
              },
            })),
          );
        }
        const page = await directory.lookup({ sourceKey: catalog as SharedReferenceSourceKey, limit: 100 });
        return page.items.map((item) => ({
          value: item.value,
          label: {
            labelKey: `lookup.${catalog}.${item.value.toLowerCase()}`,
            defaultText: item.label,
          },
        }));
      },
    },
    {
      // Published enum/reference metadata owns these domain codes. The generic
      // value directory remains the only storage implementation.
      accepts: (catalog) => valueDirectoryCatalogs.has(catalog),
      async choices(database, catalog, values) {
        const rows = (
          await sql<{ code: string; name: string }>`SELECT DISTINCT ON(code) code,name
            FROM control.lookup_value
            WHERE domain_code=${catalog}
              AND (${values ?? null}::text[] IS NULL OR code=ANY(${values ?? []}::text[]))
            ORDER BY code,tenant_id NULLS LAST`.execute(database)
        ).rows;
        return rows.map((row) => ({
          value: row.code,
          label: {
            labelKey: `lookup.${catalog}.${row.code.toLowerCase()}`,
            defaultText: row.name,
          },
        }));
      },
    },
  ];
}

/** Resolves options only through registered, descriptor-admitted providers. */
export function createRecordDisplayChoices(
  transactions: PlaneTransactionCoordinator<Transaction<Record<string, never>>>,
  providers: readonly PublishedLookupProvider[] = createPublishedLookupProviders(),
): DisplayChoices {
  return async (context, catalog, values) =>
    transactions.run("neon", context, async (transaction) => {
      const provider = providers.find(({ accepts }) => accepts(catalog));
      if (!provider) throw Error("ENTITY_LOOKUP_PROVIDER_UNREGISTERED");
      return provider.choices(
        transaction as unknown as Database,
        catalog,
        values,
      );
    });
}
