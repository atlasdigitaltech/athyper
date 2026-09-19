import { expect, it } from "vitest";
import { createAtlasRecordDataGateway } from "../record-data-gateway.js";
import { context } from "./review-fixture.js";
it("explicit content revisions bind only the captured authorized projection when no row version is published", async () => {
  let name = "visible",
    secret = "hidden";
  const gateway = createAtlasRecordDataGateway({
    maxRows: 1,
    maxResponseBytes: 1000,
    allowProjectedContentRevision: true,
    metadata: {
      async getEntityDescriptor() {
        return {
          entityCode: "business_partner",
          planeKey: context.planeKey,
          compiledHash: "schema",
          fields: [{ key: "display_name" }],
          storage: { idField: "id" },
        } as never;
      },
    },
    records: {
      async list() {
        return { data: [{ id: "record", display_name: name, secret }] };
      },
    } as never,
    fieldSecurity: {
      async project({ rows }) {
        return rows.map((r) => ({ display_name: r.display_name }));
      },
    },
  });
  const input = {
    context,
    request: {
      entityCode: "business_partner",
      fields: ["display_name"],
      limit: 1,
    },
  };
  const a = await gateway.query(input);
  expect(a.sources[0]?.revision).toMatch(/^content-sha256:[a-f0-9]{64}$/);
  secret = "different private field";
  expect((await gateway.query(input)).sources).toEqual(a.sources);
  name = "changed";
  expect((await gateway.query(input)).sources[0]?.revision).not.toEqual(
    a.sources[0]?.revision,
  );
});

it("does not disclose owner query diagnostics or forward unregistered query paths", async () => {
  let received: Record<string, unknown> | undefined;
  const gateway = createAtlasRecordDataGateway({
    maxRows: 1, maxResponseBytes: 1000,
    metadata: { getEntityDescriptor: async () => ({ entityCode: "business_partner", planeKey: context.planeKey, compiledHash: "schema", fields: [{ key: "name" }], storage: { idField: "id" } }) as never },
    records: { list: async (query: Record<string, unknown>) => { received = query; throw new Error("HIDDEN-RECORD linked.secret denied"); } } as never,
    fieldSecurity: { project: async () => { throw new Error("must not project denied results"); } },
  });
  await expect(gateway.query({ context, request: { entityCode: "business_partner", fields: ["name"], limit: 1, group: "secret", search: "secret", viewRelationships: [{ secret: true }] } as never })).rejects.toThrow("The requested Atlas query is unavailable.");
  expect(received).toMatchObject({ countMode: "none", hydrateReferences: false });
  for (const key of ["group", "search", "viewRelationships"]) expect(received).not.toHaveProperty(key);
});
