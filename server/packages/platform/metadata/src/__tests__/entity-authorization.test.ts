import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "../descriptor-parser.js";

const profile = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: profile.entityCode,
  planeKey: "neon",
  storage: {
    schema: "document",
    object: "invoice",
    idField: "id",
    tenantField: "tenant_id",
  },
  fields: profile.fieldPolicies
    .flatMap((g: { fields: string[] }) => g.fields)
    .map((key: string) => ({
      key,
      storagePath: key,
      type: "string",
      required: false,
      writableOn: [],
      filterable: false,
      sortable: false,
    })),
  operations: Object.fromEntries(
    profile.operations.map((o: { key: string; permissionCode: string }) => [
      o.key,
      { code: o.key, permissionCode: o.permissionCode },
    ]),
  ),
  authorization: profile,
};
const row = {
  entity_code: profile.entityCode,
  plane_code: "neon",
  release_id: "release",
  release_no: 1,
  entity_contract_hash: "a".repeat(64),
  compiled_hash: "b".repeat(64),
  compiled_json: descriptor,
};
it("preserves authorization through runtime descriptor parsing", () => {
  expect(parseEntityRuntimeDescriptor(row).authorization).toEqual(profile);
});
it("rejects profile drift at runtime even if authoring was bypassed", () => {
  expect(() =>
    parseEntityRuntimeDescriptor({
      ...row,
      compiled_json: {
        ...descriptor,
        authorization: { ...profile, planeKey: "mesh" },
      },
    }),
  ).toThrow(/coordinate/);
  expect(() =>
    parseEntityRuntimeDescriptor({
      ...row,
      compiled_json: {
        ...descriptor,
        fields: [
          ...descriptor.fields,
          { key: "secret", type: "string", required: false, writableOn: [] },
        ],
      },
    }),
  ).toThrow();
});
it("retains legacy field restrictions and operation binding mode through descriptor hydration", () => {
  const field = {
    ...descriptor.fields[0],
    readPermissionCode: "invoice.secret.read",
    writePermissionCode: "invoice.secret.write",
    classification: "confidential",
    retentionPolicyCode: "invoice.retention",
  };
  const parsed = parseEntityRuntimeDescriptor({
    ...row,
    compiled_json: {
      ...descriptor,
      fields: [field, ...descriptor.fields.slice(1)],
      operations: {
        ...descriptor.operations,
        read: {
          ...descriptor.operations.read,
          authorizationMode: "permission_only",
        },
      },
    },
  });
  expect(parsed.fields[0]).toMatchObject({
    readPermissionCode: field.readPermissionCode,
    writePermissionCode: field.writePermissionCode,
    classification: field.classification,
    retentionPolicyCode: field.retentionPolicyCode,
  });
  expect(parsed.operations.read?.authorizationMode).toBe("permission_only");
  expect(() =>
    parseEntityRuntimeDescriptor({
      ...row,
      compiled_json: {
        ...descriptor,
        fields: [
          { ...field, classification: "unrestricted" },
          ...descriptor.fields.slice(1),
        ],
      },
    }),
  ).toThrow();
});
