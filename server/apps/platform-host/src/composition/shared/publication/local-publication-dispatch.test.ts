import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import {
  createLocalPublicationDispatchHandler,
  DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB,
} from "./local-publication-dispatch.js";
it("durable admission survives queue failure and rediscovery uses the same enqueue key", async () => {
  const requestHash = "a".repeat(64);
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("pending_local_publication_requests")
      ? [{ request_hash: requestHash }]
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
  const configuration = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
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
    localAuthority: { id: "authority", version: 1, hash: "c".repeat(64) },
  };
  const enqueue = vi
    .fn()
    .mockRejectedValueOnce(Error("redis offline"))
    .mockResolvedValue("job");
  const handler = createLocalPublicationDispatchHandler({
    database: db,
    configuration,
    jobs: { enqueue },
  });
  const job = {
    id: "job",
    name: DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB,
    queue: "publication.authority",
    data: {},
    payloadSchema: {
      name: DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB,
      version: 1,
    },
    attempt: 1,
    maxAttempts: 3,
    enqueuedAt: new Date().toISOString(),
    execution: {
      planeKey: "studio" as const,
      scope: "plane" as const,
      tenantId: "tenant",
      principalId: "publisher",
    },
  };
  const context = {
    signal: new AbortController().signal,
    attempt: 1,
    reportProgress: vi.fn(),
  };
  try {
    await expect(handler.handle(job, context)).rejects.toThrow("redis offline");
    await expect(handler.handle(job, context)).resolves.toEqual({
      status: "completed",
      output: { enqueued: 1 },
    });
    expect(enqueue.mock.calls[0]).toEqual(enqueue.mock.calls[1]);
    expect(enqueue.mock.calls[0]![2]).toEqual({ requestHash });
    await expect(
      handler.handle(
        { ...job, execution: { ...job.execution, tenantId: "other" } },
        context,
      ),
    ).rejects.toThrow("SCOPE_DENIED");
  } finally {
    await db.destroy();
  }
});
