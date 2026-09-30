import { sql } from "kysely";
import type { RecordCollectionScopeSqlCompiler } from "@athyper/server-service-records";

export const studioRecordScopeSqlCompilers: readonly RecordCollectionScopeSqlCompiler[] =
  [
    {
      kind: "studio.metadata_entity.catalog.v1",
      compile(descriptor, _tenantId, constraint) {
        if (constraint.kind !== "studio.metadata_entity.catalog.v1")
          throw new Error("Metadata-entity scope kind mismatch");
        if (
          descriptor.planeKey !== "studio" ||
          descriptor.storage.schema !== "metadata" ||
          descriptor.storage.object !== "entity"
        )
          throw new Error(
            "Metadata-entity catalog scope cannot be applied to this descriptor",
          );
        return sql`(${sql.ref("entity.tenant_id")} IS NULL OR ${sql.ref("entity.tenant_id")} = ${constraint.tenantId}::uuid)`;
      },
    },
  ];
