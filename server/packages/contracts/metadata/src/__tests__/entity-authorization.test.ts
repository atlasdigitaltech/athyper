import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEntityAuthorizationProfile } from "../entity-authorization.js";

const fixture = (name = "business-partner") =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../../../packages/contracts/platform/fixtures/entity-authorization/${name}.v1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
describe("entity authorization profile boundary", () => {
  it.each(["business-partner", "company-invoice", "independent-document"])(
    "accepts registered %s profile with complete references",
    (name) => {
      const source = fixture(name);
      const parsed = parseEntityAuthorizationProfile(source, {
        entityCode: source.entityCode,
        planeKey: source.planeKey,
        fields: source.fieldPolicies.flatMap(
          (p: { fields: string[] }) => p.fields,
        ),
        operations: Object.fromEntries(
          source.operations.map(
            (o: { key: string; permissionCode: string }) => [
              o.key,
              { permissionCode: o.permissionCode },
            ],
          ),
        ),
      });
      expect(parsed).toEqual(source);
      expect(Object.isFrozen(parsed.operations[0])).toBe(true);
    },
  );
  it("rejects version drift, executable properties, unknown resolvers and duplicate fields", () => {
    const source = fixture();
    for (const invalid of [
      { ...source, schemaVersion: 2 },
      { ...source, script: "allow()" },
      { ...source, ownership: "arbitrary.sql" },
      {
        ...source,
        fieldPolicies: [
          ...source.fieldPolicies,
          { ...source.fieldPolicies[0], key: "duplicate" },
        ],
      },
      {
        ...source,
        operations: source.operations.map((o: object, i: number) =>
          i ? o : { ...o, expression: "true" },
        ),
      },
    ])
      expect(() => parseEntityAuthorizationProfile(invalid)).toThrow();
  });
  it("rejects permission mismatch, uncovered fields/operations, and cross-plane references", () => {
    const source = fixture(),
      fields = source.fieldPolicies.flatMap(
        (p: { fields: string[] }) => p.fields,
      ),
      operations = Object.fromEntries(
        source.operations.map((o: { key: string; permissionCode: string }) => [
          o.key,
          { permissionCode: o.permissionCode },
        ]),
      );
    for (const refs of [
      {
        entityCode: source.entityCode,
        fields: [...fields, "secret"],
        operations,
      },
      {
        entityCode: source.entityCode,
        fields,
        operations: { ...operations, read: { permissionCode: "wrong" } },
      },
      {
        entityCode: source.entityCode,
        fields,
        operations: { ...operations, delete: { permissionCode: "delete" } },
      },
      { entityCode: source.entityCode, fields, operations, planeKey: "mesh" },
    ])
      expect(() => parseEntityAuthorizationProfile(source, refs)).toThrow();
  });
  it("rejects recursive discovery and raw queries on masked fields", () => {
    const source = fixture("independent-document");
    expect(() =>
      parseEntityAuthorizationProfile({
        ...source,
        fieldPolicies: source.fieldPolicies.map((p: object, i: number) =>
          i ? { ...p, queryUses: ["filter"] } : p,
        ),
      }),
    ).toThrow(/Masked/);
    const bp = fixture();
    expect(() =>
      parseEntityAuthorizationProfile({
        ...bp,
        operations: bp.operations.map((o: { key: string }) =>
          o.key === "enter" ? { ...o, discoveryOperation: "enter" } : o,
        ),
      }),
    ).toThrow(/Discovery/);
  });
});

it("pins explicit deferrals and rejects executable or duplicate deferrals", () => {
  const source = fixture();
  const parsed = parseEntityAuthorizationProfile({ ...source, deferredOperations: ["deferred_action"] });
  expect(parsed.deferredOperations).toEqual(["deferred_action"]);
  expect(Object.isFrozen(parsed.deferredOperations)).toBe(true);
  for (const deferredOperations of [[source.operations[0].key], ["x", "x"], ["invalid key"]])
    expect(() => parseEntityAuthorizationProfile({ ...source, deferredOperations })).toThrow();
});
