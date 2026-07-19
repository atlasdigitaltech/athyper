import type { Kysely } from "kysely";
import type { EntityQueryScopeExpansion, EntityQueryScopeResolver } from "./entity-query.types.js";

/**
 * Expands a verified active-organization context to the physical scope axis
 * compiled for an entity. The expansion is performed against tenant-stamped
 * master data and is therefore safe to use as an authorization predicate.
 */
export class KyselyEntityQueryScopeResolver implements EntityQueryScopeResolver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: Kysely<any>) {}

  async resolve(input: Parameters<EntityQueryScopeResolver["resolve"]>[0]): Promise<EntityQueryScopeExpansion> {
    const { context, descriptor } = input;
    const columns = new Set([...descriptor.fields.values()].map((field) => field.column));
    const hasCompanyCode = columns.has("company_code_id");
    const hasLegalEntity = columns.has("legal_entity_id");

    // Directly enforceable contexts do not need an expansion query.
    if ((context.companyCodeId && hasCompanyCode) || (context.legalEntityId && hasLegalEntity)) {
      return {};
    }

    if (context.legalEntityId && hasCompanyCode) {
      const rows = await this.db
        .selectFrom("master.company_code as cc" as never)
        .select("cc.id" as never)
        .where("cc.tenant_id" as never, "=", context.tenantId as never)
        .where("cc.legal_entity_id" as never, "=", context.legalEntityId as never)
        .execute() as Array<{ id: string }>;
      return { companyCodeIds: rows.map((row) => row.id) };
    }

    if (context.companyCodeId && hasLegalEntity) {
      const row = await this.db
        .selectFrom("master.company_code as cc" as never)
        .select("cc.legal_entity_id" as never)
        .where("cc.tenant_id" as never, "=", context.tenantId as never)
        .where("cc.id" as never, "=", context.companyCodeId as never)
        .executeTakeFirst() as { legal_entity_id: string } | undefined;
      return { legalEntityIds: row ? [row.legal_entity_id] : [] };
    }

    return {};
  }
}
