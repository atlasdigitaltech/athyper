import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it } from "vitest";
import { compileTableEntityProduct, parseTableEntityProduct } from "@athyper/server-plane-studio-meta-entity-authoring";
import { qualifyCoordinatedProductRelationships, qualifyPublishedRelationships } from "./relationship-qualification.js";

function fixture(options: { unique?: boolean; foreignKey?: boolean } = {}) {
  const graphs = ["principal", "principal_profile", "principal_notification_preference", "principal_ui_profile"].map(code => {
    const product = parseTableEntityProduct(JSON.parse(readFileSync(new URL(
      `../../../../../../../metadata/products/shared/entities/${code}/definition.json`, import.meta.url), "utf8")));
    const { graph } = compileTableEntityProduct(product, "neon");
    // Isolate embedded-list dependency behavior from unrelated key-reference
    // catalogs. Live candidate preflight checks both against actual databases.
    for (const field of graph.fields) if (field.typeConfig) delete field.typeConfig.keyReference;
    return graph;
  });
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {
    end: async () => {}, connect: async () => ({ release() {}, query: async (statement: string) => {
      if (statement.includes("release_activation_head")) return { rows: [] };
      if (statement.includes("pg_index")) return { rows: options.unique === false ? [] : [{ columns: ["tenant_id", "principal_id"] }] };
      if (statement.includes("pg_constraint")) return { rows: options.foreignKey === false ? [] : [{ mapping: [
        { source: "tenant_id", target: "tenant_id" }, { source: "id", target: "principal_id" },
      ] }] };
      throw Error("Unexpected qualification query");
    } }),
  } as any }) });
  return { graphs, database };
}

it("qualifies the complete prospective group without weakening the single-release gate", async () => {
  const f = fixture();
  try {
    await expect(qualifyPublishedRelationships(f.graphs[0]!, f.database as never)).rejects.toThrow("ACTIVE_DEPENDENCY_REQUIRED");
    await expect(qualifyCoordinatedProductRelationships(f.graphs, f.database as never)).resolves.toBeUndefined();
    await expect(qualifyPublishedRelationships(f.graphs[0]!, f.database as never)).rejects.toThrow("ACTIVE_DEPENDENCY_REQUIRED");
  } finally { await f.database.destroy(); }
});
it.each(["unique", "foreignKey"] as const)("retains the actual storage %s requirement", async gate => {
  const f = fixture({ [gate]: false });
  try {
    await expect(qualifyCoordinatedProductRelationships(f.graphs, f.database as never)).rejects.toThrow(
      gate === "unique" ? "not unique" : "FOREIGN_KEY_REQUIRED");
  } finally { await f.database.destroy(); }
});
it("rejects missing members, duplicate entities, cross-plane groups and writable child keys", async () => {
  const f = fixture();
  try {
    await expect(qualifyCoordinatedProductRelationships(f.graphs.slice(0, 2), f.database as never)).rejects.toThrow("ACTIVE_DEPENDENCY_REQUIRED");
    await expect(qualifyCoordinatedProductRelationships([f.graphs[0]!, f.graphs[0]!], f.database as never)).rejects.toThrow("GROUP_INVALID");
    const mixed = structuredClone(f.graphs); mixed[1]!.runtimeProfiles![0]!.storagePlane = "mesh";
    await expect(qualifyCoordinatedProductRelationships(mixed, f.database as never)).rejects.toThrow("GROUP_INVALID");
    f.graphs[1]!.fields.find(field => field.fieldKey === "principal_id")!.writeMode = "mutable";
    await expect(qualifyCoordinatedProductRelationships(f.graphs, f.database as never)).rejects.toThrow("IMMUTABLE_CHILD_KEY_REQUIRED");
  } finally { await f.database.destroy(); }
});
