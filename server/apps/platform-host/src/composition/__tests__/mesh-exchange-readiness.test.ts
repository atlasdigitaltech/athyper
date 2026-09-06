import { Kysely, PostgresDialect } from "kysely";
import { describe, expect, it } from "vitest";
import { checkMeshExchangeReadiness, MESH_EXCHANGE_FUNCTIONS, MESH_EXCHANGE_PERMISSIONS, meshExchangeRequirementsQuery } from "../mesh-exchange-readiness.js";

const expected = [...MESH_EXCHANGE_FUNCTIONS, ...MESH_EXCHANGE_PERMISSIONS];
function database(rows: object[], error?: Error) {
  return new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {
    connect: async () => ({ query: async () => { if (error) throw error; return { rows }; }, release() {} }), end: async () => {},
  } as never }) });
}
describe("MESH exchange readiness", () => {
  it("accepts all explicit requirements and ignores additional permissions", async () => {
    const db = database([...expected.map(requirement => ({ requirement, state: "ready" })), { requirement: "mesh.business_partner_exchange.future", state: "unpublished" }]);
    expect(await checkMeshExchangeReadiness(db)).toEqual({ status: "healthy" });
    const query = meshExchangeRequirementsQuery().compile(db);
    expect(query.sql).not.toContain("LIKE");
    expect(query.sql).toContain("has_function_privilege(current_user");
    expect(query.sql).toContain("has_schema_privilege(current_user");
    await db.destroy();
  });
  it.each(expected)("fails and identifies missing requirement %s", async requirement => {
    const db = database(expected.filter(value => value !== requirement).map(value => ({ requirement: value, state: "ready" })));
    expect(await checkMeshExchangeReadiness(db)).toEqual({ status: "unhealthy", message: `MESH exchange requirements failed: ${requirement}: missing` });
    await db.destroy();
  });
  it.each(["execute_denied", "unpublished"])("identifies %s without hiding other failures", async state => {
    const db = database(expected.map(requirement => ({ requirement, state })));
    const result = await checkMeshExchangeReadiness(db);
    expect(result.status).toBe("unhealthy");
    for (const requirement of expected) expect(result.message).toContain(`${requirement}: ${state}`);
    await db.destroy();
  });
  it("does not expose raw database errors", async () => {
    const db = database([], new Error("private database error"));
    expect(await checkMeshExchangeReadiness(db)).toEqual({ status: "unhealthy", message: "MESH exchange requirements could not be inspected" });
    await db.destroy();
  });
});
