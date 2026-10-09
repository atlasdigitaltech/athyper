import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import {
  sha256,
  nativeOperationToStorage,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { createNativeReviewSource } from "./native-review-source.js";
const ports = vi.hoisted(() => ({ catalogue: vi.fn(), components: vi.fn() }));
vi.mock(
  "@athyper/server-plane-studio-meta-entity-authoring",
  async (original) => ({
    ...(await original<object>()),
    readNativeStorageCatalogue: ports.catalogue,
  }),
);
vi.mock("./native-bootstrap-components.js", () => ({
  createNativeBootstrapComponents: () => ports.components,
}));
function fixture() {
  ports.catalogue.mockReset();
  ports.components.mockReset();
  const f = nativeReleaseFixture();
  f.graph.surfaces = f.graph.surfaces.map((surface) => ({
    ...surface,
    maxPageSize: null,
    maxFilters: null,
    maxFilterDepth: null,
  }));
  const members = f.graph.referenceMembers!.members;
  const planes = ["studio", "neon", "mesh"] as const;
  let serial = 700;
  const uuid = () =>
    `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`;
  for (const key of [
    "target",
    "authorizationProfile",
    "fieldAccess",
  ] as const) {
    const rows = members[key];
    Reflect.set(
      members,
      key,
      planes.flatMap((targetPlane, index) =>
        rows.map((row) => ({
          ...row,
          id: uuid(),
          targetPlane,
          ...(key === "target" ? { position: index + 1 } : {}),
        })),
      ),
    );
  }
  const scopes = f.graph.operationScopeBindings!;
  f.graph.operationScopeBindings = planes.flatMap((targetPlane) =>
    scopes.map((row) => ({ ...row, targetPlane })),
  );
  const root = {
    id: f.graph.ownedLabels!.changeSetId,
    entity_id: f.graph.authoringSource.entityId,
    tenant_id: null,
    source_kind: "product",
    native_core_layout_version: 2,
    authoring_schema_hash: f.c.authoringSchemaHash,
    lock_version: 1,
    created_by: uuid(),
  };
  const source = {
    root_json: root,
    graph: f.graph,
    graph_hash: sha256(f.graph),
    operation_rows: f.controls.map((row) => ({
      ...nativeOperationToStorage(
        f.graph.operations.find((operation) => operation.id === row.id)!,
      ),
      requires_mfa: row.requiresMfa,
    })),
    identity_rows: f.c.core.identities.map((row) => ({
      id: row.id,
      entity_id: row.entityId,
      tenant_id: row.tenantId,
      field_key: row.fieldKey,
      parent_identity_id: row.parentIdentityId,
      identity_status: "reserved",
      introduced_change_set_id: root.id,
    })),
  };
  const queries = planes.map(() =>
    vi.fn(async (query: string) => ({
      rows: query.includes("read_native_product_review_source")
        ? [source]
        : query.includes("pg_roles")
          ? [{ safe: true }]
          : [],
    })),
  );
  const databases = queries.map(
    (query) =>
      new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({
          pool: {
            connect: async () => ({ query, release() {} }),
            end: async () => {},
          } as never,
        }),
      }),
  );
  ports.catalogue.mockImplementation(async (_tx, plane) => ({
    ...f.c.core.catalogues[0]!,
    plane,
  }));
  ports.components.mockImplementation(async (_tx, _graph, scope) => ({
    coreComponents: f.c.core.components,
    layoutComponents: f.c.layout.components,
    runtimeComponents: f.c.components,
    evidence: [{ plane: scope.plane, hostReleaseHash: scope.hostReleaseHash }],
  }));
  const config = {
    schema: "entity.local-native-startup/1",
    commands: {
      authoringSchemaHash: f.c.authoringSchemaHash,
      maxMembers: 10000,
    },
    hostReleaseHash: "a".repeat(64),
    targetHostReleaseHashes: { neon: "b".repeat(64), mesh: "c".repeat(64) },
    proposals: { maximumBytes: 4194304 },
    componentPins: [],
    targets: [],
    domains: [],
    referenceContract: { key: "reference", version: 1, hash: "d".repeat(64) },
    identityResource: f.c.identityResource,
  };
  const options = {
    configuration: config as never,
    loader: {} as never,
    targetDatabases: { neon: databases[1]!, mesh: databases[2]! },
  };
  return {
    source,
    config,
    options,
    databases,
    queries,
    run: () =>
      databases[0]!
        .transaction()
        .execute((tx) => createNativeReviewSource(options)(tx, root.id)),
    close: () => Promise.all(databases.map((db) => db.destroy())),
  };
}
it("production source composition uses distinct read-only destination transactions and exact host scopes", async () => {
  const f = fixture();
  try {
    const source = await f.run();
    expect(source.targetCompilers?.map((c) => c.authorization.plane)).toEqual([
      "studio",
      "neon",
      "mesh",
    ]);
    expect(ports.catalogue.mock.calls.map((call) => call[1])).toEqual([
      "studio",
      "neon",
      "mesh",
    ]);
    expect(
      new Set(ports.catalogue.mock.calls.map((call) => call[0])).size,
    ).toBe(3);
    expect(
      ports.components.mock.calls.map((call) => call[2].hostReleaseHash),
    ).toEqual(["a".repeat(64), "b".repeat(64), "c".repeat(64)]);
    for (const query of f.queries.slice(1)) {
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes("SET TRANSACTION READ ONLY"),
        ),
      ).toBe(true);
      expect(query.mock.calls.some(([sql]) => sql.includes("pg_roles"))).toBe(
        true,
      );
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes("read_native_product_review_source"),
        ),
      ).toBe(false);
    }
  } finally {
    await f.close();
  }
});
it.each(["database", "host", "unsafe-role", "component"])(
  "rejects missing destination evidence: %s",
  async (kind) => {
    const f = fixture();
    try {
      if (kind === "database")
        Reflect.deleteProperty(f.options.targetDatabases, "mesh");
      if (kind === "host")
        Reflect.deleteProperty(f.config.targetHostReleaseHashes, "mesh");
      if (kind === "unsafe-role")
        f.queries[2]!.mockImplementation(
          async (sql) =>
            ({
              rows: sql.includes("pg_roles") ? [{ safe: false }] : [],
            }) as never,
        );
      if (kind === "component")
        ports.components.mockRejectedValueOnce(Error("COMPONENT_UNAVAILABLE"));
      await expect(f.run()).rejects.toThrow();
    } finally {
      await f.close();
    }
  },
);
it("accepts inherited reservations only with database-resolved availability", async () => {
  const f = fixture();
  f.source.identity_rows.forEach((row) => {
    row.introduced_change_set_id = "00000000-0000-4000-8000-000000009999";
    Reflect.set(row, "native_available", true);
  });
  expect((await f.run()).targetCompilers).toHaveLength(3);
  Reflect.set(f.source.identity_rows[0]!, "native_available", false);
  await expect(f.run()).rejects.toThrow("NATIVE_REVIEW_SOURCE_INVALID");
});
