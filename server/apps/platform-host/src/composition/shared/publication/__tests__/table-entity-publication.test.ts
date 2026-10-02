import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { qualifyPublishedRelationships } from "../relationship-qualification.js";
import { expect, it } from "vitest";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  lowerNativeRuntimePublication,
  compileCompiledEntityArtifacts,
} from "@athyper/server-service-publication";
import { validateCompiledRuntimeContracts } from "@athyper/server-platform-metadata";
const digest = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function fixture(code: string, plane: "studio" | "neon" | "mesh" = "neon") {
  const product = parseTableEntityProduct(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../../../../../../metadata/products/shared/entities/${code}/definition.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

  const { graph, artifact } = compileTableEntityProduct(product, plane),
    profile = graph.runtimeProfiles![0]!;
  const permissions = [
    ...new Set(graph.operationPermissions!.map((p) => p.permissionCode)),
  ].map((code, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    code,
    kind: "capability",
    scopeKinds: ["tenant"],
  }));
  const lowered = lowerNativeRuntimePublication(
    {
      releaseId: "00000000-0000-4000-8000-000000000090",
      releaseNo: 1,
      publicationKey: `metadata.entity.${code}`,
      plane,
      tenantId: null,
      entityCode: code,
      revisionId: "00000000-0000-4000-8000-000000000091",
      sourceEntityId: "00000000-0000-4000-8000-000000000092",
      sourceReleaseHash: artifact.descriptorHash,
      sourceContractHash: artifact.contractHash,
      sourceDescriptorHash: artifact.descriptorHash,
      generatedAt: "2026-09-29T00:00:00.000Z",
      native: artifact.descriptor as unknown as Record<string, unknown>,
      contract: graph as unknown as Record<string, unknown>,
    },
    {
      registration: {
        entityCode: code,
        plane,
        storage: {
          schema: "master",
          object: profile.storageObject!,
          idField: "id",
          tenantField: "tenant_id",
          ...(profile.recordVersionFieldKey
            ? { versionField: profile.recordVersionFieldKey }
            : {}),
        },
        columns: graph.fields.map((f) => f.storagePath!),
        detailRouteTemplate: `/app/entity/${code}/:recordId`,
      },
      permissions,
    },
  );
  expect(lowered.runtimeContracts![code]).toMatchObject({
    storage: { tenantField: "tenant_id" },
  });
  const compiled = compileCompiledEntityArtifacts({
    ...lowered,
    registry: {
      sourceObjects: new Set([`master.${code}`]),
      permissions: new Set(permissions.map((p) => p.code)),
      handlers: new Set([
        "entity.record.list.v1",
        "entity.record.read.v1",
        "entity.record.create.v1",
        "entity.record.patch.v1",
        "platform.notifications.preferences.v1",
        "platform.experience.ui_profile.v1",
      ]),
      resolvers: new Set(["tenant.record.v1"]),
      renderers: new Set(["platform.address.fields.v1"]),
      evaluators: new Set(),
    },
    canonicalizer: {
      canonicalBytes: (value) => Buffer.from(JSON.stringify(value)),
      sha256: (bytes) => `sha256:${digest(bytes)}`,
    },
  });
  return { graph, compiled };
}
for (const code of [
  "principal",
  "principal_profile",
  "principal_notification_preference",
  "principal_ui_profile",
])
  it(`publishes ${code} through native runtime artifacts on every plane`, () => {
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const { compiled } = fixture(code, plane);
      validateCompiledRuntimeContracts(
        compiled.artifacts.map((a) => a.artifact),
      );
      expect(
        compiled.artifacts.some(
          (a) => a.artifact.artifactType === "runtime_contract",
        ),
      ).toBe(true);
    }
  });

for (const code of ["person", "employee", "external_worker", "address", "person_address_use"])
  it(`lowers ${code}'s Neon-only read candidate through the standard publication artifacts`, () => {
    const { graph, compiled } = fixture(code, "neon");
    validateCompiledRuntimeContracts(compiled.artifacts.map(member => member.artifact));
    expect(graph.operations.every(operation => operation.operationKind === "read")).toBe(true);
    expect(graph.runtimeProfiles![0]!.writeMode).toBe("none");
    expect(compiled.artifacts.some(member => member.artifact.artifactType === "runtime_contract")).toBe(true);
  });

function qualificationDatabase(
  active: ReturnType<typeof fixture>[],
  options: { unique?: boolean; foreignKey?: boolean } = {},
) {
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          release() {},
          query: async (statement: string) => {
            if (statement.includes("release_activation_head"))
              return {
                rows: active.map(({ compiled }) => ({
                  artifact: compiled.artifacts.find(
                    (a) => a.artifact.artifactType === "runtime_contract",
                  )!.artifact,
                  release_id: "00000000-0000-4000-8000-000000000090",
                  release_no: 1,
                })),
              };
            if (statement.includes("pg_index"))
              return {
                rows:
                  options.unique === false
                    ? []
                    : [{ columns: ["tenant_id", "principal_id"] }],
              };
            if (statement.includes("pg_constraint"))
              return {
                rows:
                  options.foreignKey === false
                    ? []
                    : [
                        {
                          mapping: [
                            { source: "tenant_id", target: "tenant_id" },
                            { source: "id", target: "principal_id" },
                          ],
                        },
                      ],
              };
            throw Error(`Unexpected qualification SQL: ${statement}`);
          },
        }),
      } as any,
    }),
  });
  return db;
}
it("qualifies the parent against independently activated children", async () => {
  const db = qualificationDatabase([
    fixture("principal_profile"),
    fixture("principal_notification_preference"),
    fixture("principal_ui_profile"),
  ]);
  try {
    await expect(
      qualifyPublishedRelationships(fixture("principal").graph, db as never),
    ).resolves.toBeUndefined();
  } finally {
    await db.destroy();
  }
});
it("rejects missing active dependencies and unproven one-to-one storage", async () => {
  for (const [active, options, message] of [
    [[], {}, "ACTIVE_DEPENDENCY_REQUIRED"],
    [
      [
        fixture("principal_profile"),
        fixture("principal_notification_preference"),
      ],
      { unique: false },
      "not unique",
    ],
    [
      [
        fixture("principal_profile"),
        fixture("principal_notification_preference"),
      ],
      { foreignKey: false },
      "FOREIGN_KEY_REQUIRED",
    ],
  ] as const) {
    const db = qualificationDatabase([...active], options);
    try {
      await expect(
        qualifyPublishedRelationships(fixture("principal").graph, db as never),
      ).rejects.toThrow(message);
    } finally {
      await db.destroy();
    }
  }
});
it("rejects an incompatible child successor while a parent is active", async () => {
  const db = qualificationDatabase([fixture("principal")]);
  try {
    const { graph } = fixture("principal_profile");
    await expect(
      qualifyPublishedRelationships(graph, db as never),
    ).resolves.toBeUndefined();
    const changed = {
      ...graph,
      fields: graph.fields.map((f) =>
        f.fieldKey === "principal_id"
          ? { ...f, writeMode: "mutable" as const }
          : f,
      ),
    };
    await expect(
      qualifyPublishedRelationships(changed, db as never),
    ).rejects.toThrow("IMMUTABLE_CHILD_KEY_REQUIRED");
    await expect(
      qualifyPublishedRelationships(
        {
          ...graph,
          operations: graph.operations.filter((o) => o.operationKey !== "read"),
        },
        db as never,
      ),
    ).rejects.toThrow("dependency mismatch");
  } finally {
    await db.destroy();
  }
});
