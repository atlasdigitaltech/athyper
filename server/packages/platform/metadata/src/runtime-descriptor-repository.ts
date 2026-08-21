import type { PlaneKey } from "@athyper/server-foundation/context";
import type { EntityDescriptorRepository } from "@athyper/server-contract-metadata";
import { sql, type Kysely } from "kysely";
import { parseEntityRuntimeDescriptor, type RuntimeDescriptorRow } from "./descriptor-parser.js";

type Database = Kysely<Record<string, never>>;

export interface RuntimeDescriptorRepositoryOptions {
  readonly databases: Partial<Readonly<Record<PlaneKey, Database>>>;
  readonly withTenantTransaction?: <Result>(
    planeKey: PlaneKey,
    actor: { readonly tenantId: string; readonly principalId: string },
    work: (database: Database) => Promise<Result>,
  ) => Promise<Result>;
}

export function createRuntimeDescriptorRepository(options: RuntimeDescriptorRepositoryOptions): EntityDescriptorRepository {
  return {
    async findActive(coordinate) {
      const database = options.databases[coordinate.planeKey];
      if (!database) throw new Error(`No runtime metadata database registered for ${coordinate.planeKey}`);
      const execute = async (executor: Database) => sql<RuntimeDescriptorRow>`
        SELECT c.entity_code, c.release_id::text, c.release_no, c.entity_contract_hash,
               d.plane_code, d.compiled_hash, d.compiled_json
          FROM runtime_meta.release_activation_head AS head
          JOIN runtime_meta.applied_release AS applied
            ON applied.id = head.applied_release_id AND applied.status = 'active'
          JOIN runtime_meta.entity_descriptor AS d
            ON d.applied_release_id = applied.id AND d.status = 'active'
           AND d.descriptor_kind = 'entity_runtime'
          JOIN runtime_meta.entity_contract AS c
            ON c.id = d.entity_contract_id AND c.status = 'published'
         WHERE d.plane_code = ${coordinate.planeKey}
           AND c.entity_code = ${coordinate.entityCode}
           AND (c.tenant_id IS NULL OR c.tenant_id = ${coordinate.tenantId}::uuid)
         ORDER BY (c.tenant_id IS NOT NULL) DESC, c.release_no DESC
         LIMIT 1
      `.execute(executor);
      const result = options.withTenantTransaction
        ? await options.withTenantTransaction(coordinate.planeKey, coordinate, execute)
        : await execute(database);
      const row = result.rows[0];
      return row ? parseEntityRuntimeDescriptor(row) : null;
    },
  };
}
