import { expect, it } from "vitest";
import { buildSharedReferenceGraph } from "./graph-builder.js";

const definition = {
  entityCode: "synthetic_reference",
  title: "References",
  storageObject: "reference",
  codeField: "code",
  titleField: "name",
  fields: [
    { key: "id", label: "ID", type: "uuid" as const },
    { key: "code", label: "Code", type: "string" as const },
    { key: "name", label: "Name", type: "string" as const },
  ],
  columns: ["code", "name"],
  searchFields: ["code"],
  sections: [{ key: "details", label: "Details", fields: ["code", "name"] }],
};
it.each(["studio", "neon", "mesh"] as const)(
  "v2 changes only the read operation's enrollment hint on %s",
  (plane) => {
    const legacy = buildSharedReferenceGraph(definition, plane);
    expect(buildSharedReferenceGraph(definition, plane, 1)).toEqual(legacy);
    expect(
      legacy.operations.every((operation) => operation.fieldKeys?.length === 3),
    ).toBe(true);
    const native = buildSharedReferenceGraph(definition, plane, 2);
    expect(native).toEqual({
      ...legacy,
      operations: legacy.operations.map((operation) => ({
        ...operation,
        fieldKeys: [],
      })),
    });
    expect(() =>
      buildSharedReferenceGraph(definition, plane, 3 as never),
    ).toThrow("REFERENCE_GRAPH_VERSION_UNSUPPORTED");
  },
);
