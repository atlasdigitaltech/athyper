import {
  readNativeStorageCatalogue,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { createControlProductCommandRuntime } from "./product-command-runtime.js";
const authority = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control",
  audience: "athyper-platform-control-api",
};
const issuerRole = {
  login: "issuer",
  database: "athyper_studio",
  safe: true,
  isolated: true,
  issuer: true,
  application: false,
  owner: false,
};
const appRole = {
  login: "application",
  database: "athyper_studio",
  safe: true,
  isolated: true,
  issuer: false,
  application: true,
  owner: false,
};
function database(
  row: unknown,
  auditAllowed = true,
  resourceAllowed = true,
  identities: unknown[] = [],
  storage: unknown[] = [],
) {
  return new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          query: async (query: string) => ({
            rows: query.includes("SELECT id,entity_id")
              ? identities
              : query.includes("WITH RECURSIVE types")
                ? storage
                : [
                    query.includes("has_schema_privilege")
                      ? { allowed: auditAllowed }
                      : query.includes("has_function_privilege")
                        ? { allowed: resourceAllowed }
                        : row,
                  ],
            rowCount: 1,
          }),
          release() {},
        }),
        end: async () => {},
      } as never,
    }),
  });
}
async function fixture(issuer = issuerRole, application = appRole) {
  const issuerDatabase = database(issuer),
    commandDatabase = database(application);
  const audit = {
    record: vi.fn(async (event: any, _tx: unknown) => ({
      ...event,
      id: "audit",
    })),
  };
  return {
    issuerDatabase,
    commandDatabase,
    audit,
    options: {
      governanceDatabase: issuerDatabase,
      issuerDatabase,
      commandDatabase,
      applicationLogin: "application",
      authority,
      labels: {
        supportedLocales: ["en"],
        maxCommands: 100,
        maxBatchBytes: 65536,
      },
      audit: audit as never,
    },
    async close() {
      await issuerDatabase.destroy();
      await commandDatabase.destroy();
    },
  };
}
it.each([
  { issuer: true },
  { owner: true },
  { safe: false },
  { isolated: false },
  { database: "athyper_neon" },
  { login: "wrong" },
  { application: false },
])(
  "rejects unsafe command role %j before enabling the route",
  async (patch) => {
    const f = await fixture(issuerRole, { ...appRole, ...patch });
    try {
      await expect(
        createControlProductCommandRuntime(f.options),
      ).rejects.toThrow(/PRODUCT_COMMAND_LOGIN/);
    } finally {
      await f.close();
    }
  },
);
it("rejects an issuer with application membership", async () => {
  const f = await fixture({ ...issuerRole, application: true });
  try {
    await expect(createControlProductCommandRuntime(f.options)).rejects.toThrow(
      "SEPARATION",
    );
  } finally {
    await f.close();
  }
});
it("uses transactional audit and refuses fabricated audit attribution", async () => {
  const f = await fixture();
  try {
    const runtime = await createControlProductCommandRuntime(f.options);
    const context = {
      tenantId: authority.tenantId,
      principalId: "human",
      requestId: "request",
    };
    const input = {
      changeSetId: "draft",
      proposal: { idempotencyKey: "enrollment" },
    };
    const result = {
      sourceHash: "source",
      proposalHash: "proposal",
      revision: 2,
    };
    await runtime.audit(
      f.commandDatabase,
      context as never,
      input as never,
      result as never,
    );
    expect(f.audit.record.mock.calls[0]?.[1]).toBe(f.commandDatabase);
    f.audit.record.mockImplementation(async (event) => ({
      ...event,
      id: "audit",
      actor: { kind: "user", principalId: "other" },
    }));
    await expect(
      runtime.audit(
        f.commandDatabase,
        context as never,
        input as never,
        result as never,
      ),
    ).rejects.toThrow("AUDIT_REQUIRED");
    expect(() => runtime.host.commands).toThrow("legacy label enrollment only");
    await expect(
      runtime.host.resolveInitializer(f.commandDatabase as never, {} as never),
    ).rejects.toThrow("legacy label enrollment only");
  } finally {
    await f.close();
  }
});

it("rejects a command connection without the transactional audit privilege", async () => {
  const f = await fixture();
  const denied = database(appRole, false);
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        commandDatabase: denied,
      }),
    ).rejects.toThrow("AUDIT_PRIVILEGE_REQUIRED");
  } finally {
    await denied.destroy();
    await f.close();
  }
});

it("binds reference policies only with exact configuration and restricted read privileges", async () => {
  const f = await fixture(),
    denied = database(appRole, true, false);
  const referenceResources = {
    authorityTenantId: authority.tenantId,
    descriptorPin: {
      kind: "entity_authoring_descriptor" as const,
      publicationKey: "fixture.descriptor",
      releaseId: "00000000-0000-4000-8000-000000000001",
      unsignedHash: "a".repeat(64),
      artifactHash: "b".repeat(64),
    },
    descriptorHash: "c".repeat(64),
    maximumBytes: 10000,
    maximumReleases: 20,
    supportedLocales: ["en"],
    verifier: { verify: async () => true },
    authorizeReview: async () => {},
    audit: async () => {},
  };
  try {
    const nativeBootstrap = { resolve: vi.fn() };
    const runtime = await createControlProductCommandRuntime({
      ...f.options,
      referenceResources,
      nativeBootstrap,
      nativeConversion: { resolve: vi.fn() },
    });
    expect(runtime.referenceEnrollment?.nativeBootstrap).toBe(nativeBootstrap);
    const conversion = runtime.referenceEnrollment!.nativeConversion!;
    await conversion.audit(
      f.commandDatabase as never,
      {
        tenantId: authority.tenantId,
        principalId: "human",
        requestId: "request",
      } as never,
      { changeSetId: "draft", idempotencyKey: "conversion" } as never,
      { revision: 5, sourceHash: "before", targetHash: "after" } as never,
    );
    expect(f.audit.record.mock.calls[0]?.[1]).toBe(f.commandDatabase);
    expect(f.audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: "convert_native",
      metadata: { sourceHash: "before", targetHash: "after", revision: 5 },
    });
    expect(runtime.referenceEnrollment?.database).toBe(f.commandDatabase);
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        commandDatabase: denied,
        referenceResources,
      }),
    ).rejects.toThrow("RESOURCE_READ_PRIVILEGE_REQUIRED");
  } finally {
    await denied.destroy();
    await f.close();
  }
});

it("does not enable native conversion without installed reference resource configuration", async () => {
  const f = await fixture();
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        nativeConversion: { resolve: vi.fn() },
      }),
    ).rejects.toThrow("PRODUCT_NATIVE_REFERENCE_RESOURCES_REQUIRED");
  } finally {
    await f.close();
  }
});

it("does not enable native bootstrap without installed reference resources", async () => {
  const f = await fixture();
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        nativeBootstrap: { resolve: vi.fn() },
      }),
    ).rejects.toThrow("PRODUCT_NATIVE_REFERENCE_RESOURCES_REQUIRED");
  } finally {
    await f.close();
  }
});

it("rejects competing native bootstrap compositions before querying roles", async () => {
  const f = await fixture();
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        nativeBootstrap: { resolve: vi.fn() },
        nativeBootstrapProposals: {
          readProposal: vi.fn(),
          resolveResources: vi.fn(),
          audit: vi.fn(),
          maximumBytes: 1000,
        },
      }),
    ).rejects.toThrow("PRODUCT_NATIVE_BOOTSTRAP_COMPOSITION_AMBIGUOUS");
  } finally {
    await f.issuerDatabase.destroy();
    await f.commandDatabase.destroy();
  }
});
it("proposal composition still requires installed reference resources", async () => {
  const f = await fixture();
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        nativeBootstrapProposals: {
          readProposal: vi.fn(),
          resolveResources: vi.fn(),
          audit: vi.fn(),
          maximumBytes: 1000,
        },
      }),
    ).rejects.toThrow("PRODUCT_NATIVE_REFERENCE_RESOURCES_REQUIRED");
  } finally {
    await f.issuerDatabase.destroy();
    await f.commandDatabase.destroy();
  }
});

it("rejects bootstrap resource wiring without proposal composition before database access", async () => {
  const f = await fixture();
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        nativeBootstrapResources: { components: vi.fn(), scope: vi.fn() },
      }),
    ).rejects.toThrow("PRODUCT_NATIVE_BOOTSTRAP_PROPOSALS_REQUIRED");
  } finally {
    await f.issuerDatabase.destroy();
    await f.commandDatabase.destroy();
  }
});

it("binds compiler identities to application rows and revalidates without component composition", async () => {
  const f = await fixture(),
    native = nativeReleaseFixture();
  const rows = native.c.core.identities.map((i) => ({
    id: i.id,
    entity_id: i.entityId,
    tenant_id: i.tenantId,
    field_key: i.fieldKey,
    parent_identity_id: i.parentIdentityId,
    identity_status: "reserved",
  }));
  const storage = native.c.core.catalogues[0]!.columns.map((column) => ({
    path: column.path,
    storage_type: column.storageType,
    nullable: column.nullable,
    base_schema: "pg_catalog",
    base_type: column.storageType,
    type_kind: "b",
    object_kind: "r",
    generated: "",
    column_count: 3,
    constraints: [],
    default_expression: null,
  }));
  const tx = database(appRole, true, true, rows, storage);
  Object.defineProperty(tx, "isTransaction", { value: true });
  const installedCatalogue = await readNativeStorageCatalogue(
    tx as never,
    "studio",
    {
      plane: "studio",
      schema: native.graph.runtimeProfiles[0]!.storageSchema!,
      object: native.graph.runtimeProfiles[0]!.storageObject!,
    },
  );
  Object.assign(native.graph.runtimeProfiles[0]!, {
    storageCatalogueHash: installedCatalogue.hash,
  });
  const proposal = {
    graph: native.graph,
    title: "Reference",
    branchCode: "native",
    baseReleaseId: null,
  };
  const input = {
    entityId: native.graph.authoringSource.entityId,
    changeSetId: native.graph.ownedLabels!.changeSetId,
    actorId: authority.tenantId,
    tenantId: null,
    idempotencyKey: "native-test",
    proposalHash: sha256(native.graph),
  };
  const qualify = vi.fn(async () => {});
  try {
    const runtime = await createControlProductCommandRuntime({
      ...f.options,
      referenceResources: {
        authorityTenantId: authority.tenantId,
        descriptorPin: {
          kind: "entity_authoring_descriptor",
          publicationKey: "fixture.descriptor",
          releaseId: authority.tenantId,
          unsignedHash: "a".repeat(64),
          artifactHash: "b".repeat(64),
        },
        descriptorHash: native.c.authoringSchemaHash,
        maximumBytes: 10000,
        maximumReleases: 20,
        supportedLocales: ["en"],
        verifier: { verify: async () => true },
        authorizeReview: async () => {},
        audit: async () => {},
      },
      nativeBootstrapProposals: {
        maximumBytes: 100000,
        readProposal: async () => proposal,
        audit: async () => {},
        resolveResources: async () => ({
          schema: {} as never,
          host: {
            commands: {
              authoringSchemaHash: native.c.authoringSchemaHash,
              maxMembers: 1000,
              maxCommands: 100,
              maxBatchBytes: 100000,
            },
            snapshotVersions: [2],
            admit: async () => {},
          } as never,
          qualify,
          preparation: {
            compiler: {
              ...native.c,
              core: { ...native.c.core, identities: [] },
            },
            operations: {} as never,
            reader: {} as never,
          },
        }),
      },
    });
    const resolved =
      await runtime.referenceEnrollment!.nativeBootstrap!.resolve(
        tx as never,
        { principalId: input.actorId } as never,
        input,
      );
    const prepared = await resolved.policy.prepare(tx as never, input);
    expect(prepared.compiler.core.identities).toEqual(native.c.core.identities);
    expect(prepared.compiler.core.catalogues).toEqual([installedCatalogue]);
    await resolved.policy.qualify(tx as never, input);
    expect(qualify).toHaveBeenCalledTimes(1);
    rows[0]!.field_key = "changed";
    await expect(resolved.policy.qualify(tx as never, input)).rejects.toThrow(
      "IDENTITY_BINDING_CHANGED",
    );
    expect(qualify).toHaveBeenCalledTimes(1);
    rows[0]!.field_key = native.c.core.identities[0]!.fieldKey;
    storage[0]!.nullable = !storage[0]!.nullable;
    await expect(resolved.policy.qualify(tx as never, input)).rejects.toThrow(
      "STORAGE_CATALOGUE_CHANGED",
    );
    expect(qualify).toHaveBeenCalledTimes(1);
  } finally {
    await tx.destroy();
    await f.close();
  }
});
