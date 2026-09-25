import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it } from "vitest";
import { compileGraph } from "../deterministic.js";
import { prepareCollectionConfigurationRelease } from "../collection-publication.js";
const graph = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../../tooling/fixtures/collections/inbox.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
it("prepares only the saved signed configuration and its exact publication targets", async () => {
  const artifact = {
    ...compileGraph(graph),
    signature: "signed",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
  };
  let rows: Record<string, unknown>[] = [
    {
      contract_json: graph,
      contract_signature: "signed",
      signature_algorithm: "Ed25519",
      signing_key_id: "test",
    },
  ];
  const prepared: unknown[][] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          query: async (text: string, values: unknown[]) => {
            if (text.includes("fn_prepare_collection_configuration_release")) {
              prepared.push(values);
              return { rows: [] };
            }
            expect(text).toContain("shared.current_tenant_id()");
            expect(text).toContain("master.current_principal_id_soft()");
            return { rows };
          },
          release() {},
        }),
      } as never,
    }),
  });
  const input = {
    releaseId: "10000000-0000-4000-8000-000000000001",
    artifact,
    targetPlanes: ["studio", "neon", "mesh"],
  };
  try {
    expect(await prepareCollectionConfigurationRelease(db, input)).toBe(true);
    expect(prepared).toHaveLength(1);
    expect(
      JSON.parse(String(prepared[0]![1])).configuration.collectionKey,
    ).toBe("activity.inbox");
    await expect(
      prepareCollectionConfigurationRelease(db, {
        ...input,
        targetPlanes: ["neon"],
      }),
    ).rejects.toThrow(/targets/);
    await expect(
      prepareCollectionConfigurationRelease(db, {
        ...input,
        artifact: { ...artifact, signature: "forged" },
      }),
    ).rejects.toThrow(/signed/);
    expect(prepared).toHaveLength(1);
    rows = [];
    await expect(
      prepareCollectionConfigurationRelease(db, input),
    ).rejects.toThrow(/unavailable/);
  } finally {
    await db.destroy();
  }
});
