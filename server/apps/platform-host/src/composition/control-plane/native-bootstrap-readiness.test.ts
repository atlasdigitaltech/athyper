import { Kysely, PostgresDialect } from "kysely";
import { expect, it } from "vitest";
import { requireNativeBootstrapDependencies } from "./native-bootstrap-readiness.js";
const pin = {
  kind: "entity_authoring_descriptor" as const,
  releaseId: "00000000-0000-4000-8000-000000000001",
  publicationKey: "fixture.descriptor",
  unsignedHash: "a".repeat(64),
  artifactHash: "b".repeat(64),
};
it.each([
  "ready",
  "missing-routine",
  "missing-resource",
  "missing-identity-grants",
  "missing-initializer",
])("checks native startup prerequisites: %s", async (state) => {
  const queries: { text: string; values: unknown[] }[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          query: async (text: string, values: unknown[]) => {
            queries.push({ text, values });
            return {
              rows: text.includes("declared_operation_initialization")
                ? [{ allowed: state !== "missing-initializer" }]
                : text.includes("has_column_privilege")
                  ? [{ allowed: state !== "missing-identity-grants" }]
                  : text.includes("has_function_privilege")
                    ? [{ allowed: state !== "missing-routine" }]
                    : [{ ready: state !== "missing-resource" }],
              rowCount: 1,
            };
          },
          release() {},
        }),
        end: async () => {},
      } as never,
    }),
  });
  try {
    const result = requireNativeBootstrapDependencies(
      db,
      "authority-tenant",
      pin,
    );
    if (state === "ready") {
      await expect(result).resolves.toBeUndefined();
      expect(queries.at(-1)?.values).toEqual([
        "authority-tenant",
        pin.releaseId,
        pin.publicationKey,
        pin.unsignedHash,
        pin.artifactHash,
      ]);
    } else {
      await expect(result).rejects.toThrow(
        state === "missing-initializer"
          ? "DECLARED_INITIALIZER_INSTALLATION_REQUIRED"
          : state === "missing-identity-grants"
            ? "IDENTITY_INSERT_PRIVILEGES_REQUIRED"
            : state === "missing-routine"
              ? "DATABASE_DEPENDENCY_REQUIRED"
              : "DESCRIPTOR_INSTALLATION_REQUIRED",
      );
    }
  } finally {
    await db.destroy();
  }
});
