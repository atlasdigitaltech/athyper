import { row, compiled } from "./entity-readiness-inventory.fixtures.js";
import { expect, it } from "vitest";
import { parseCompiledEntityArtifact } from "@athyper/server-contract-publication";
import {
  readinessInventoryDescriptors,
  readinessInventoryTenant,
} from "./entity-readiness-inventory.js";

it("reads active legacy descriptors through the serving parser", () => {
  expect(readinessInventoryDescriptors(row(), "neon")).toMatchObject([
    { entityCode: "country", compiledHash: "b".repeat(64) },
  ]);
});
it("rejects missing or RLS-hidden Entity data and mismatched coordinates", () => {
  expect(() =>
    readinessInventoryDescriptors({ ...row(), descriptor: null }, "neon"),
  ).toThrow("INVENTORY_INCOMPLETE");
  expect(() => readinessInventoryDescriptors(row(), "mesh")).toThrow(
    "COORDINATE_MISMATCH",
  );
  expect(() =>
    readinessInventoryDescriptors({ ...row(), source_release_no: 2 }, "neon"),
  ).toThrow("COORDINATE_MISMATCH");
  const malformed = row();
  malformed.descriptor.compiled_json.schema = "unknown";
  expect(() => readinessInventoryDescriptors(malformed, "neon")).toThrow(
    "Unsupported entity descriptor schema",
  );
});
it("preserves other established descriptor kinds without treating malformed Entity runtime as one", () => {
  expect(
    readinessInventoryDescriptors(
      { ...row(), descriptor_kind: "entity_notifications" },
      "neon",
    ),
  ).toEqual([]);
  expect(() =>
    readinessInventoryDescriptors(
      { ...row(), descriptor_kind: "future" },
      "neon",
    ),
  ).toThrow("INVENTORY_INCOMPLETE");
});

it("reads raw and wrapped compiled runtime artifacts at their exact manifest hash", () => {
  const value = compiled();
  const expected = readinessInventoryDescriptors(value, "neon");
  expect(expected).toMatchObject([
    {
      entityCode: "qualification_company_invoice",
      compiledHash: "c".repeat(64),
    },
  ]);
  expect(
    readinessInventoryDescriptors(
      {
        ...value,
        payload: {
          ...value.payload,
          artifacts: value.payload.artifacts.map(parseCompiledEntityArtifact),
        },
      },
      "neon",
    ),
  ).toEqual(expected);
});
it("rejects absent, duplicate, changed or wrong-plane compiled runtime artifacts", () => {
  const value = compiled();
  for (const artifacts of [
    [],
    [...value.payload.artifacts, ...value.payload.artifacts],
    value.payload.artifacts.map((a) => ({
      ...a,
      artifactHash: `sha256:${"e".repeat(64)}`,
    })),
  ])
    expect(() =>
      readinessInventoryDescriptors(
        { ...value, payload: { ...value.payload, artifacts } },
        "neon",
      ),
    ).toThrow("INVENTORY_INCOMPLETE");
  expect(() => readinessInventoryDescriptors(value, "mesh")).toThrow(
    "COORDINATE_MISMATCH",
  );
  expect(() =>
    readinessInventoryDescriptors({ ...value, payload: null }, "neon"),
  ).toThrow("INVENTORY_INCOMPLETE");
});

it("resolves published tenant scopes and rejects conflicting or malformed coordinates", () => {
  const tenant = "44444444-4444-4444-8444-444444444444";
  expect(
    readinessInventoryTenant("metadata.compiled_entity.country", null),
  ).toBeNull();
  expect(readinessInventoryTenant("metadata.entity.country", tenant)).toBe(
    tenant,
  );
  for (const key of [
    `metadata.compiled_entity.country.tenant.${tenant}`,
    `metadata.entity.country.${tenant.replaceAll("-", "")}`,
    `metadata.notifications.country.${tenant.replaceAll("-", "")}`,
    `metadata.collection.activity.inbox.${tenant.replaceAll("-", "")}`,
  ]) {
    expect(readinessInventoryTenant(key, null)).toBe(tenant);
    expect(readinessInventoryTenant(key, tenant)).toBe(tenant);
    expect(() =>
      readinessInventoryTenant(key, "11111111-1111-4111-8111-111111111111"),
    ).toThrow("SCOPE_INVALID");
  }
  for (const tenant of ["", "not-a-uuid", {}, 123])
    expect(() =>
      readinessInventoryTenant("metadata.entity.country", tenant),
    ).toThrow("SCOPE_INVALID");
  expect(() =>
    readinessInventoryTenant(
      "metadata.compiled_entity.country.tenant.invalid",
      null,
    ),
  ).toThrow("SCOPE_INVALID");
});
