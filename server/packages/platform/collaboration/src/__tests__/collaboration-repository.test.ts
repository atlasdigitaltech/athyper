import { describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createKyselyCollaborationRepository,
  type CollaborationTransaction,
} from "../kysely-collaboration-repository.js";
const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
} as VerifiedRequestContext;
const command = {
  context,
  entityType: "content.item",
  entityId: "article-1",
  text: "hello",
  parentCommentId: "44444444-4444-4444-8444-444444444444",
};
async function run(
  rows: Record<string, unknown>[][],
  work: (
    repository: ReturnType<typeof createKyselyCollaborationRepository>,
    tx: CollaborationTransaction,
  ) => Promise<unknown>,
) {
  const queries: string[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      if (event.level === "query") queries.push(event.query.sql);
    },
    plugins: [
      {
        transformQuery: (args) => args.node,
        transformResult: async (args) => ({
          ...args.result,
          rows: rows.shift() ?? [],
        }),
      },
    ],
  });
  try {
    await work(
      createKyselyCollaborationRepository(),
      db as unknown as CollaborationTransaction,
    );
    return queries;
  } finally {
    await db.destroy();
  }
}
describe("collaboration SQL regressions", () => {
  it("checks full parent coordinates without invoking the author-only update policy before inserting", async () => {
    const queries = await run(
      [[{ active: true }], [{ active: true }], []],
      async (repo, tx) => {
        await expect(repo.create(command, [], tx)).rejects.toMatchObject({
          statusCode: 404,
        });
      },
    );
    const parent = queries.find((query) =>
      query.includes("SELECT thread_depth"),
    );
    expect(parent).toContain("context_type=");
    expect(parent).not.toContain("FOR SHARE");
    expect(parent).not.toContain("FOR UPDATE");
    expect(queries.some((query) => query.includes("INSERT"))).toBe(false);
  });
  it("returns 422 before writing an unknown lookup value", async () => {
    await run([[{ active: false }]], async (repo, tx) => {
      await expect(repo.create(command, [], tx)).rejects.toMatchObject({
        statusCode: 422,
      });
    });
  });
  it("returns 404 for missing flag targets", async () => {
    await run([[]], async (repo, tx) => {
      await expect(
        repo.createFlag(
          context.tenantId,
          command.parentCommentId,
          context.principalId,
          "spam",
          undefined,
          tx,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
  it("validates draft parents before upserting", async () => {
    const queries = await run([[{ active: true }], []], async (repo, tx) => {
      await expect(repo.putDraft(command, tx)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    expect(queries.some((query) => query.includes("INSERT"))).toBe(false);
  });
});

it("returns only deletion metadata for an authorized owner without querying revisions", async()=>{
  const queries=await run([[{status:"deleted",deleted_at:"2026-09-22T06:00:00Z",deleted_by:context.principalId}]],async(repository,tx)=>{
    await expect(repository.history!({context,commentId:command.parentCommentId},tx)).resolves.toEqual({items:[],deletion:{deletedAt:"2026-09-22T06:00:00.000Z",deletedBy:context.principalId}});
  });
  expect(queries).toHaveLength(1);
  expect(queries[0]).toContain('commenter_id=');
  expect(queries[0]).not.toContain('comment_revision');
});
it("denies history when the owner lookup fails",async()=>{
  await run([[]],async(repository,tx)=>{
    await expect(repository.history!({context,commentId:command.parentCommentId},tx)).rejects.toMatchObject({code:'HISTORY_UNAVAILABLE'});
  });
});
