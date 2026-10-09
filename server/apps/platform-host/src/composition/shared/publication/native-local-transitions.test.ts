import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { createLocalPublicationRequest } from "@athyper/server-contract-publication";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
const dependencies = vi.hoisted(() => ({
  source: vi.fn(),
  compile: vi.fn(),
  targets: vi.fn(),
  authority: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("../../control-plane/native-review-source.js", () => ({
  createNativeReviewSource: () => dependencies.source,
}));
vi.mock("./local-publication-policy.js", () => ({
  resolveLocalPublicationAuthority: dependencies.authority,
}));
vi.mock("./compiler-build.js", () => ({
  publicationCompilerIdentity: () => ({ buildHash: "b".repeat(64) }),
}));
vi.mock(
  "@athyper/server-plane-studio-meta-entity-authoring",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    compileNativePublication: dependencies.compile,
    nativePublicationTargets: dependencies.targets,
  }),
);
vi.mock("@athyper/server-platform-iam", () => ({
  createKyselyPermissionResolver: () => ({
    resolve: async () => ({ profileHash: "permissions" }),
  }),
  createPermissionAuthorizer: () => ({ authorize: dependencies.authorize }),
}));
import { createNativePublicationStartup } from "./native-publication-startup.js";

it("production startup compiles current inputs, enforces IAM, transitions and audits in the same transaction", async () => {
  const directory = mkdtempSync(join(tmpdir(), "local-native-command-"));
  const file = join(directory, "source.json");
  writeFileSync(file, "{}", { mode: 0o600 });
  const host = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
  };
  const configuration = {
    ...host,
    tenantId: "tenant",
    realmKey: "platform-control",
    author: {
      principalId: "author",
      code: "dev.metadata.author",
      authEpoch: 1,
      credentialSha256: "a".repeat(64),
    },
    publisher: {
      principalId: "publisher",
      code: "dev.metadata.publisher",
      authEpoch: 1,
      credentialSha256: "b".repeat(64),
    },
    localAuthority: { id: "authority", version: 1, hash: "a".repeat(64) },
  };
  const authority = {
    schema: "athyper.local-development-authority/1" as const,
    ...configuration.localAuthority,
    active: true,
    host,
    validFrom: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    enrollmentReceiptId: "fixture",
    scope: { kind: "product" as const },
    developerPrincipalIds: ["developer"],
    authorWorkloadId: "author",
    publisherWorkloadId: "publisher",
    actions: ["publish" as const],
    destinations: [{ plane: "studio" as const, instance: "dev" }],
  };
  const request = createLocalPublicationRequest(
    authority,
    {
      host,
      developerPrincipalId: "developer",
      authorWorkloadId: "author",
      publisherWorkloadId: "publisher",
      scope: authority.scope,
      action: "publish",
      targets: authority.destinations,
    },
    {
      changeSetId: "draft",
      revision: 1,
      sourceHash: "c".repeat(64),
      compilerHash: "b".repeat(64),
      release: { descriptorHash: "e".repeat(64), predecessorReleaseId: null },
      resourceHashes: [sha256({})],
      targets: [
        {
          plane: "studio",
          instance: "dev",
          predecessorHash: null,
          artifactHash: "d".repeat(64),
        },
      ],
    },
  );
  dependencies.authority.mockResolvedValue(authority);
  dependencies.source.mockResolvedValue({
    graph: { entity: { entityClass: "reference", entityCode: "fixture" } },
    compiler: {},
  });
  dependencies.compile.mockReturnValue({
    contractHash: request.inputs.sourceHash,
    descriptorHash: "e".repeat(64),
  });
  dependencies.targets.mockReturnValue([
    { targetPlane: "studio", artifact: { descriptorHash: "d".repeat(64) } },
  ]);
  dependencies.authorize.mockResolvedValue({ allowed: true });
  const query = vi.fn(async (text: string, parameters: unknown[] = []) => ({
    rows: text.includes("read_local_publication_request")
      ? [{ authority: { request } }]
      : text.includes("current_setting")
        ? [{ value: null }]
        : text.includes("FROM master.principal")
          ? [{ id: "actor" }]
          : text.includes("read_native_worker_source")
            ? [{ lock_version: 1, predecessor: null }]
            : text.includes("transition_local_publication_request")
              ? [
                  {
                    receipt: {
                      basis: "local_development_authority",
                      requestHash: request.hash,
                      revision: 2,
                      status: "in_review",
                      replayed: false,
                    },
                  },
                ]
              : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const audit = {
    record: vi.fn(async (input: any) => ({ ...input, id: "audit" })),
  };
  try {
    const runtime = createNativePublicationStartup({
      environment: { PUBLICATION_NATIVE_SOURCE_CONFIGURATION_FILE: file },
      localConfiguration: configuration,
      audit,
      loader: {
        canonicalizer: {
          canonicalBytes: (v) => Buffer.from(JSON.stringify(v)),
          sha256: () => "a".repeat(64),
        },
        verifier: { verify: vi.fn() },
        store: { get: vi.fn(), putImmutable: vi.fn() },
        runtimeVersion: "1",
        uiComponents: { qualify: vi.fn() },
      },
      run: (work) => db.transaction().execute(work),
    });
    await expect(
      runtime.transitionLocalNativeSource!(request.hash, "submit"),
    ).resolves.toMatchObject({ revision: 2, status: "in_review" });
    expect(dependencies.compile).toHaveBeenCalled();
    expect(dependencies.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: "studio.metadata.contract.submit",
        context: expect.objectContaining({ principalId: "author" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { kind: "service", principalId: "author" },
        metadata: expect.objectContaining({
          developerPrincipalId: "developer",
          basis: "local_development_authority",
        }),
      }),
      expect.anything(),
    );
    expect(query.mock.calls.some(([text]) => text === "commit")).toBe(true);
    query.mockClear();
    dependencies.authorize.mockResolvedValue({ allowed: false });
    await expect(
      runtime.transitionLocalNativeSource!(request.hash, "submit"),
    ).rejects.toThrow("IAM_DENIED");
    expect(
      query.mock.calls.some(([text]) =>
        text.includes("transition_local_publication_request"),
      ),
    ).toBe(false);
    dependencies.authorize.mockResolvedValue({ allowed: true });
    audit.record.mockRejectedValueOnce(Error("audit unavailable"));
    query.mockClear();
    await expect(
      runtime.transitionLocalNativeSource!(request.hash, "submit"),
    ).rejects.toThrow("audit unavailable");
    expect(
      query.mock.calls.some(([text]) => text.includes("ROLLBACK TO SAVEPOINT")),
    ).toBe(true);
    expect(query.mock.calls.some(([text]) => text === "commit")).toBe(false);
    dependencies.compile.mockReturnValue({ contractHash: "f".repeat(64) });
    query.mockClear();
    await expect(
      runtime.transitionLocalNativeSource!(request.hash, "submit"),
    ).rejects.toThrow();
    expect(
      query.mock.calls.some(([text]) =>
        text.includes("transition_local_publication_request"),
      ),
    ).toBe(false);
  } finally {
    await db.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
});
