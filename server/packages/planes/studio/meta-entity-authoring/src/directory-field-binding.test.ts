import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, validateGraph } from "./deterministic.js";

it("refuses a scope field that is missing, computed or writable before publication", () => {
  const graph: MetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "shipment" },
    runtimeProfiles: [
      {
        profileKey: "default",
        backingKind: "virtual",
        apiExposure: "catalog_only",
        readMode: "none",
        writeMode: "none",
      },
    ],
    fields: [],
    operations: [],
    surfaces: [
      {
        id: "directory",
        surfaceKey: "directory",
        surfaceKind: "detail",
        title: "Shipments",
        layoutConfig: {
          directoryScope: {
            schemaVersion: 1,
            mode: "organization",
            fieldBinding: {
              resolver: "neon.directory.fields.v1",
              organizationField: "org_id",
            },
          },
        },
      },
    ],
  };
  const field = {
    fieldKey: "org_id",
    dataType: "uuid",
    valueOrigin: "stored",
    writeMode: "read_only",
    typeConfig: { kind: "uuid" },
  } as const;
  expect(validateGraph({ ...graph, fields: [field] }).issues).toEqual([]);
  for (const fields of [
    [],
    [{ ...field, writeMode: "editable" }],
    [{ ...field, valueOrigin: "computed" }],
  ])
    expect(() => compileGraph({ ...graph, fields } as MetaEntityGraph)).toThrow(
      "Directory scope requires an immutable stored UUID field",
    );
  expect(() => compileGraph({ ...graph, fields: [field] })).not.toThrow();
});
