import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import {
  createLocalPublicationRequest,
  type LocalDevelopmentAuthority,
  type LocalPublicationAdmission,
} from "@athyper/server-contract-publication";
import {
  admitLocalPublicationRequest,
  withLocalPublicationRequest,
} from "./local-publication-database.js";

function fixture() {
  const host = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
  };
  const admission: LocalPublicationAdmission = {
    host,
    developerPrincipalId: "developer",
    authorWorkloadId: "submitter",
    publisherWorkloadId: "publisher",
    scope: { kind: "product" },
    action: "publish",
    targets: [{ plane: "neon", instance: "dev" }],
  };
  const authority: LocalDevelopmentAuthority = {
    schema: "athyper.local-development-authority/1",
    id: "authority",
    version: 1,
    hash: "a".repeat(64),
    active: true,
    validFrom: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    enrollmentReceiptId: "receipt",
    host,
    scope: admission.scope,
    developerPrincipalIds: ["developer"],
    authorWorkloadId: "submitter",
    publisherWorkloadId: "publisher",
    actions: ["publish"],
    destinations: admission.targets,
  };
  const inputs = {
    changeSetId: "draft",
    revision: 1,
    sourceHash: "b".repeat(64),
    compilerHash: "c".repeat(64),
    resourceHashes: [],
    targets: [
      {
        plane: "neon" as const,
        instance: "dev",
        predecessorHash: null,
        artifactHash: "d".repeat(64),
      },
    ],
  };
  const request = createLocalPublicationRequest(authority, admission, inputs);
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("read_local_publication_request")
      ? [{ authority: { request } }]
      : text.includes("current_setting")
        ? [{ value: null }]
        : text.includes("admit_local_publication_request")
          ? [{ hash: request.hash }]
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
  const resolveCurrent = vi.fn(async () => ({ authority, inputs }));
  return { host, authority, inputs, request, query, db, resolveCurrent };
}
it("worker reads stored requests, independently resolves pins and clears its source scope", async () => {
  const f = fixture();
  try {
    const execute = vi.fn(async () => "compiled");
    expect(
      await f.db.transaction().execute((tx) =>
        withLocalPublicationRequest({
          transaction: tx,
          host: f.host,
          requestHash: f.request.hash,
          resolveCurrent: f.resolveCurrent,
          execute,
        }),
      ),
    ).toBe("compiled");
    expect(f.resolveCurrent).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    const sql = f.query.mock.calls.map(([s]) => s);
    expect(
      sql.some((s) => s.includes("SAVEPOINT local_publication_execution")),
    ).toBe(true);
    expect(
      sql.some((s) =>
        s.includes("set_config('app.local_publication_request_hash','',true)"),
      ),
    ).toBe(true);
  } finally {
    await f.db.destroy();
  }
});
it("rejects substituted current compiler before worker execution", async () => {
  const f = fixture();
  try {
    const execute = vi.fn();
    await expect(
      f.db.transaction().execute((tx) =>
        withLocalPublicationRequest({
          transaction: tx,
          host: f.host,
          requestHash: f.request.hash,
          resolveCurrent: async () => ({
            authority: f.authority,
            inputs: { ...f.inputs, compilerHash: "f".repeat(64) },
          }),
          execute,
        }),
      ),
    ).rejects.toThrow("INPUT_CHANGED");
    expect(execute).not.toHaveBeenCalled();
  } finally {
    await f.db.destroy();
  }
});
it("rolls back request-local work on compiler failure without masking its error", async () => {
  const f = fixture();
  try {
    await expect(
      f.db.transaction().execute((tx) =>
        withLocalPublicationRequest({
          transaction: tx,
          host: f.host,
          requestHash: f.request.hash,
          resolveCurrent: f.resolveCurrent,
          execute: async () => {
            throw Error("compiler failed");
          },
        }),
      ),
    ).rejects.toThrow("compiler failed");
    expect(
      f.query.mock.calls.some(([s]) =>
        s.includes("ROLLBACK TO SAVEPOINT local_publication_execution"),
      ),
    ).toBe(true);
  } finally {
    await f.db.destroy();
  }
});
it("requires real developer authorization before touching admission SQL", async () => {
  const f = fixture();
  try {
    const context = {
      planeKey: "studio",
      tenantId: "tenant",
      principalId: "developer",
    } as Parameters<typeof admitLocalPublicationRequest>[0]["context"];
    await expect(
      f.db.transaction().execute((tx) =>
        admitLocalPublicationRequest({
          transaction: tx,
          context,
          host: f.host,
          request: f.request,
          authorize: async () => false,
        }),
      ),
    ).rejects.toThrow("ADMISSION_DENIED");
    expect(
      f.query.mock.calls.some(([s]) =>
        s.includes("admit_local_publication_request"),
      ),
    ).toBe(false);
    expect(
      await f.db.transaction().execute((tx) =>
        admitLocalPublicationRequest({
          transaction: tx,
          context,
          host: f.host,
          request: f.request,
          authorize: async () => true,
        }),
      ),
    ).toBe(f.request.hash);
  } finally {
    await f.db.destroy();
  }
});
