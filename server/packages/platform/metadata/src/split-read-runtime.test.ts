import { expect, it } from "vitest";
import { prepareSplitReadRuntime } from "./split-read-runtime.js";
const sample = (entityCode: string) => {
  const core: any = {
      entityCode,
      plane: "neon",
      storage: {
        readObject: "master.read_model",
        sourceObjects: ["master.read_model"],
        idField: "id",
        tenantField: "tenant_id",
        genericWriteEnabled: false,
      },
      fields: [
        {
          key: "id",
          dataType: "uuid",
          nullable: false,
          readPolicy: "authorized_projection",
          binding: { sourceObject: "master.read_model", column: "id" },
        },
        {
          key: "tenant_id",
          dataType: "uuid",
          nullable: false,
          readPolicy: "authorized_projection",
          binding: { sourceObject: "master.read_model", column: "tenant_id" },
        },
        {
          key: "name",
          dataType: "string",
          nullable: false,
          readPolicy: "authorized_projection",
          label: { defaultText: "Name" },
          binding: { sourceObject: "master.read_model", column: "name" },
        },
      ],
      listPresentation: {
        title: "Samples",
        identityField: "name",
        defaultColumns: ["name"],
      },
      recordPresentation: {
        schemaVersion: 1,
        titleField: "name",
        sections: [{ key: "details", label: "Details", fields: ["name"] }],
        navigation: {
          mode: "switch",
          tabs: [{ key: "record", label: "Record", sectionKeys: ["details"] }],
        },
      },
    },
    operations: any = {
      entityCode,
      plane: "neon",
      operations: ["list", "read"].map((key) => ({
        key,
        execution: {
          handlerKey: `entity.record.${key}.v1`,
          registryRequired: true,
        },
        scopeBinding: {
          resolverKey: "tenant.record.v1",
          denyUnresolved: true,
          scopeSource: "persisted_record_or_validated_create_input",
        },
        idempotency: "not_applicable",
      })),
    };
  return { core, operations };
};
it.each(["shipment", "inspection"])(
  "lowers %s solely from explicit source properties without default permissions",
  (entity) => {
    const f = sample(entity);
    const result = prepareSplitReadRuntime(f.core, f.operations);
    expect(result.descriptor.entityCode).toBe(entity);
    expect(
      result.descriptor.authorization.operations.every(
        (op) => !Object.hasOwn(op, "permissionCode"),
      ),
    ).toBe(true);
    expect(result.publicationReady).toBe(false);
    expect(result.descriptor.listPresentation.identityField).toBe("name");
  },
);
it("preserves exact defined permissions and exposes unresolved operations without qualifying them", () => {
  const f = sample("shipment");
  f.operations.operations[0].permissionCode = "sample.directory.view";
  f.operations.operations.push({ key: "approve" });
  const result = prepareSplitReadRuntime(f.core, f.operations);
  expect(result.descriptor.operations.list!.permissionCode).toBe(
    "sample.directory.view",
  );
  expect(result.remainingOperations).toEqual(["approve"]);
  expect(result.descriptor.operations).not.toHaveProperty("approve");
});
it("rejects unadapted operation controls and duplicate bindings", () => {
  for (const change of [
    (op: any) => {
      op.requiresPreflight = true;
    },
    (op: any) => {
      op.scopeBinding.requiredContextCoordinates = ["organizationId"];
    },
    (op: any) => {
      op.scopeBinding.denyUnresolved = false;
    },
  ]) {
    const f = sample("shipment");
    change(f.operations.operations[0]);
    expect(() => prepareSplitReadRuntime(f.core, f.operations)).toThrow(
      "OPERATION_ADAPTER_REQUIRED",
    );
  }
  const f = sample("shipment");
  f.operations.operations.push(f.operations.operations[0]);
  expect(() => prepareSplitReadRuntime(f.core, f.operations)).toThrow(
    "OPERATION_ADAPTER_REQUIRED",
  );
});
it("rejects missing navigation, UUID presentation, unsupported handlers and unmapped storage", () => {
  for (const change of [
    (f: ReturnType<typeof sample>) =>
      delete f.core.recordPresentation.navigation,
    (f: ReturnType<typeof sample>) =>
      f.core.listPresentation.defaultColumns.push("id"),
    (f: ReturnType<typeof sample>) =>
      (f.operations.operations[0].execution.handlerKey = "legacy.read.v1"),
    (f: ReturnType<typeof sample>) =>
      (f.core.fields[0].binding.sourceObject = "master.other"),
    (f: ReturnType<typeof sample>) => (f.core.fieldAccess = {}),
  ]) {
    const f = sample("shipment");
    change(f);
    expect(() => prepareSplitReadRuntime(f.core, f.operations)).toThrow();
  }
});
it("enforces masked-only declarations without opening query access", () => {
  const f = sample("shipment");
  f.core.fields[2].readPolicy = "masked_only";
  expect(() => prepareSplitReadRuntime(f.core, f.operations)).toThrow(
    "MASKING_REQUIRED",
  );
  f.core.fields[2].protection = { normalProjection: { mode: "masked" } };
  expect(
    prepareSplitReadRuntime(f.core, f.operations).descriptor.authorization!
      .fieldPolicies[2]!.representation,
  ).toBe("masked");
  f.core.query = { search: [{ fieldKey: "name" }] };
  expect(() => prepareSplitReadRuntime(f.core, f.operations)).toThrow(
    "MASKED_QUERY_FORBIDDEN",
  );
});
