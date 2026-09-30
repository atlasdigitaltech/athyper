import { sql } from "kysely";
import type { RecordCollectionScopeSqlCompiler } from "@athyper/server-service-records";

export const meshRecordScopeSqlCompilers: readonly RecordCollectionScopeSqlCompiler[] =
  [
    {
      kind: "mesh.network_relationship.actor_account.v1",
      compile(descriptor, tenantId, constraint) {
        if (constraint.kind !== "mesh.network_relationship.actor_account.v1")
          throw new Error("Network-relationship scope kind mismatch");
        if (
          descriptor.planeKey !== "mesh" ||
          descriptor.storage.schema !== "mesh" ||
          descriptor.storage.object !== "network_relationship"
        )
          throw new Error(
            "Network-relationship collection scope cannot be applied to this descriptor",
          );
        return sql`(
      (${sql.ref("network_relationship.buyer_tenant_id")} = ${tenantId}::uuid AND ${sql.ref("network_relationship.buyer_account_id")} = ${constraint.networkAccountId}::uuid)
      OR
      (${sql.ref("network_relationship.supplier_tenant_id")} = ${tenantId}::uuid AND ${sql.ref("network_relationship.supplier_account_id")} = ${constraint.networkAccountId}::uuid)
    )`;
      },
    },
  ];
