import { describe, expect, it } from "vitest";

import { compileMetaEntityRuntimeDescriptor } from "../compiler";

describe("runtime cache-policy projection", () => {
  it("maps a tenant-resolved snake-case policy to the typed runtime descriptor", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_id: "entity-master",
      version_id: "version-master",
      version_no: 1,
      version_hash: "hash-master",
      entity_code: "master_record",
      slug: "master-record",
      entity_name: "Master Record",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "master_record",
      backing_type: "table",
      fields: [],
      cache_policy: {
        mode: "stale_while_revalidate",
        fresh_for_seconds: 15,
        retain_for_seconds: 240,
        prefetch: "viewport",
        restore_scroll: true,
        invalidate_on_mutation: true,
        max_queries_per_entity: 4,
        max_rows_per_query: 150,
        storage: "memory",
        source: "tenant",
      },
    });

    expect(descriptor.cachePolicy).toEqual({
      mode: "stale_while_revalidate",
      freshForSeconds: 15,
      retainForSeconds: 240,
      prefetch: "viewport",
      restoreScroll: true,
      invalidateOnMutation: true,
      maxQueriesPerEntity: 4,
      maxRowsPerQuery: 150,
      storage: "memory",
      source: "tenant",
    });
  });

  it("uses the typed platform policy for older compiled snapshots", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "legacy",
      entity_name: "Legacy",
      slug: "legacy",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "legacy",
      fields: [],
    });

    expect(descriptor.cachePolicy).toMatchObject({
      source: "platform",
      freshForSeconds: 20,
      retainForSeconds: 300,
      maxQueriesPerEntity: 5,
      maxRowsPerQuery: 200,
    });
  });
});
