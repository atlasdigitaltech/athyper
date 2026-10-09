import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({
  compile: vi.fn(),
  get: vi.fn(),
  record: vi.fn(),
  release: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@athyper/server-platform-iam", () => ({
  createKyselyPermissionResolver: () => ({
    resolve: async () => ({ profileHash: "current" }),
  }),
  createPermissionAuthorizer: () => ({ authorize: ports.authorize }),
}));
vi.mock(
  "@athyper/server-plane-studio-meta-entity-authoring",
  async (original) => ({
    ...(await original<object>()),
    compileNativePublication: ports.compile,
    KyselyMetaEntityAuthoringRepository: class {
      get = ports.get;
      recordValidation = ports.record;
      createRelease = ports.release;
    },
  }),
);
import { createLocalNativeRelease } from "./local-publication-release.js";
it("signs the current compiled source once, reuses the repository and rolls back audit failures", async () => {
  let receipt: unknown = null;
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("local_publication_release_receipt")
      ? [{ receipt }]
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
  const compiled = {
    contractHash: "a".repeat(64),
    descriptorHash: "b".repeat(64),
  };
  ports.compile.mockReturnValue(compiled);
  ports.authorize.mockResolvedValue({ allowed: true });
  ports.get.mockResolvedValue({ id: "draft", status: "approved", revision: 3 });
  ports.record.mockResolvedValue(undefined);
  ports.release.mockResolvedValue({ id: "release", releaseNo: 2 });
  const signer = {
    sign: vi
      .fn()
      .mockResolvedValue({
        signatureAlgorithm: "Ed25519",
        signingKeyId: "key",
        signature: "signed",
      }),
  };
  const request = {
    hash: "c".repeat(64),
    basis: "local_development_authority",
    authority: { id: "authority", version: 1, hash: "d".repeat(64) },
    admission: {
      publisherWorkloadId: "publisher",
      authorWorkloadId: "author",
      developerPrincipalId: "developer",
    },
    inputs: {
      changeSetId: "draft",
      revision: 1,
      sourceHash: compiled.contractHash,
      release: {
        descriptorHash: compiled.descriptorHash,
        predecessorReleaseId: "previous",
      },
      targets: [{ plane: "studio" }],
    },
  };
  const audit = {
    record: vi.fn(async (input: any) => ({ ...input, id: "audit" })),
  };
  const options = {
    request,
    configuration: {
      tenantId: "tenant",
      realmKey: "platform-control",
      publisher: { principalId: "publisher", authEpoch: 1 },
    },
    source: vi.fn().mockResolvedValue({ graph: {} }),
    signer,
    audit,
  };
  const run = () =>
    db
      .transaction()
      .execute((transaction) =>
        createLocalNativeRelease({ ...options, transaction } as never),
      );
  try {
    await expect(run()).resolves.toEqual({
      id: "release",
      releaseNo: 2,
      replayed: false,
    });
    expect(signer.sign).toHaveBeenCalledWith(compiled);
    expect(ports.release).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "publisher",
        expectedRevision: 3,
        expectedSourceReleaseId: "previous",
        targetPlanes: ["studio"],
        artifact: {
          ...compiled,
          signatureAlgorithm: "Ed25519",
          signingKeyId: "key",
          signature: "signed",
        },
      }),
    );
    receipt = { id: "release", releaseNo: 2 };
    await expect(run()).resolves.toEqual({
      id: "release",
      releaseNo: 2,
      replayed: true,
    });
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    receipt = null;
    ports.compile.mockReturnValueOnce({
      ...compiled,
      descriptorHash: "e".repeat(64),
    });
    await expect(run()).rejects.toThrow("SIGNED_SOURCE_CHANGED");
    ports.authorize.mockResolvedValueOnce({ allowed: false });
    await expect(run()).rejects.toThrow("IAM_DENIED");
    audit.record.mockRejectedValueOnce(Error("audit unavailable"));
    await expect(run()).rejects.toThrow("audit unavailable");
    expect(query.mock.calls.at(-1)?.[0]).toBe("rollback");
  } finally {
    await db.destroy();
  }
});
