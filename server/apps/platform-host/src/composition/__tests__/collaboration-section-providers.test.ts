import { PostgresQueryCompiler, type CompiledQuery } from "kysely";
import { expect, it, vi } from "vitest";
import { createCollaborationSectionProviders } from "../entities/collaboration/index.js";

const context = { tenantId: "tenant", principalId: "viewer", planeKey: "neon" };
const input = {
  context,
  core: { entityCode: "business_partner" },
  recordId: "record",
  limit: 2,
  capability: { binding: { maxDepth: 2 } },
} as any;

// Compile real parameterized SQL; deterministic rows exercise projection separately.
// This does not replace PostgreSQL/RLS integration testing.
function fixture(respond: (query: CompiledQuery) => unknown[] = () => []) {
  const compiler = new PostgresQueryCompiler();
  const queries: CompiledQuery[] = [];
  const db = {
    getExecutor: () => ({
      transformQuery: (node: any) => node,
      compileQuery: (node: any) => compiler.compileQuery(node),
      executeQuery: async (query: CompiledQuery) => {
        queries.push(query);
        return { rows: respond(query) };
      },
    }),
  };
  const run = vi.fn(
    async (
      _plane: unknown,
      _context: unknown,
      execute: (tx: typeof db) => unknown,
    ) => execute(db),
  );
  return {
    providers: createCollaborationSectionProviders({ run } as never),
    queries,
    run,
  };
}
const comment = (id: string, overrides = {}) => ({
  id,
  text: "Visible text",
  content_format: "rich_json",
  content_json: { type: "doc" },
  revision_no: 1,
  author_id: "author",
  visibility: "public",
  status: "active",
  reactions: [{ code: "like", count: 1 }],
  viewer_reactions: ["like"],
  pinned_files: [{ attachmentId: "file" }],
  reply_count: "3",
  thread_depth: 0,
  created_at: "2026-09-25T00:00:00Z",
  ...overrides,
});

it("registers only shared service keys without eager database reads", () => {
  const f = fixture();
  expect(f.providers.getService("platform.comments.v1")).toBeDefined();
  expect(f.providers.getService("platform.attachments.v1")).toBeDefined();
  for (const key of [
    "constructor",
    "__proto__",
    "neon.bp.section.comments.v1",
    "unknown",
  ])
    expect(f.providers.getService(key)).toBeUndefined();
  expect(f.run).not.toHaveBeenCalled();
});

it("preserves comment aliases, tenant/record visibility, private drafts and tombstone projection", async () => {
  const f = fixture((query) => {
    if (query.sql.includes("FROM document.comment_draft"))
      return [
        {
          id: "draft",
          draft_text: "Private draft",
          content_format: "plain",
          visibility: "private",
          created_at: "2026-09-25T00:00:00Z",
        },
      ];
    if (query.sql.startsWith("SELECT count(*)")) return [{ count: "3" }];
    return [
      comment("deleted", { status: "deleted" }),
      comment("active"),
      comment("overflow"),
    ];
  });
  const result = await f.providers
    .getService("platform.comments.v1")!
    .read(input);
  expect(f.run).toHaveBeenCalledWith("neon", context, expect.any(Function));
  expect(result.data).toMatchObject({
    totalCount: 3,
    unreadCount: 3,
    nextCursor: "active",
    draft: { id: "draft", text: "Private draft" },
    items: [
      {
        id: "deleted",
        text: "",
        tombstone: true,
        canReply: false,
        reactions: [],
        viewerReactions: [],
        pinnedFiles: [],
      },
      {
        id: "active",
        text: "Visible text",
        content: { type: "doc" },
        canReply: true,
        replyCount: 3,
      },
    ],
  });
  expect((result.data as any).items[0]).not.toHaveProperty("content");
  expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.isFrozen(result.data)).toBe(true);
  for (const query of f.queries) {
    expect(query.parameters).toContain("tenant");
    expect(query.parameters).toContain("record");
    expect(query.parameters).toContain("viewer");
    expect(query.parameters).toContainEqual(
      expect.arrayContaining(["business_partner", "master.business_partner"]),
    );
  }
  const main = f.queries[0]!;
  expect(main.sql).toContain("comment.parent_comment_id IS NULL");
  expect(main.sql).toContain(
    "comment.visibility IN ('public','internal') OR comment.commenter_id=",
  );
  expect(main.sql).toContain(
    "ORDER BY comment.created_at DESC,comment.id DESC",
  );
  const draft = f.queries.find((query) =>
    query.sql.includes("FROM document.comment_draft"),
  )!;
  expect(draft.sql).toContain("principal_id=");
  expect(draft.sql).toContain("expires_at>clock_timestamp()");
});

it("keeps bounded reply paging, visible ancestor traversal and per-row reply limits", async () => {
  const f = fixture((query) =>
    query.sql.startsWith("SELECT comment.id")
      ? Array.from({ length: 21 }, (_, i) =>
          comment(String(i), { thread_depth: 2 }),
        )
      : [],
  );
  const result = await f.providers.getService("platform.comments.v1")!.read({
    ...input,
    limit: 100,
    cursor: "cursor",
    resourceContext: { threadRootId: "root", commentFilter: "mentions" },
  });
  expect((result.data as any).items).toHaveLength(20);
  expect(result.data).toMatchObject({ threadRootId: "root", nextCursor: "19" });
  expect(
    (result.data as any).items.every((item: any) => item.canReply === false),
  ).toBe(true);
  const query = f.queries[0]!;
  expect(query.parameters).toContain("root");
  expect(query.parameters).toContain("cursor");
  expect(query.parameters.at(-1)).toBe(21);
  expect(query.sql).toContain("WITH RECURSIVE visible AS NOT MATERIALIZED");
  expect(query.sql).toContain(
    "visibility IN ('public','internal') OR commenter_id=",
  );
  expect(query.sql).toContain("ORDER BY comment.created_at ASC,comment.id ASC");
  expect(query.sql).not.toContain("FROM document.comment_mention mention");
});

it("filters root mention feeds using visible descendants, without changing entity coordinates", async () => {
  const f = fixture();
  await f.providers.getService("platform.comments.v1")!.read({
    ...input,
    core: { entityCode: "contact_person" },
    cursor: "cursor",
    resourceContext: { commentFilter: "mentions" },
  });
  const main = f.queries[0]!;
  expect(main.sql).toContain("FROM document.comment_mention mention");
  expect(main.sql).toContain("mentioned.status<>'deleted'");
  expect(main.sql).toContain("mention.comment_id IN (WITH RECURSIVE");
  expect(main.parameters).toContainEqual(["contact_person"]);
  expect(main.parameters).not.toContainEqual(
    expect.arrayContaining(["business_partner"]),
  );
});

const attachment = (id: string, date: string, status = "active") => ({
  id,
  series_id: "series-" + id,
  link_id: "link-" + id,
  link_kind: "record",
  version_no: 2,
  file_name: id + ".pdf",
  content_type: "application/pdf",
  size_bytes: "1024",
  status,
  created_at: date,
  series_revision: "4",
});
it("preserves attachment visibility, uploader-only pending transfers, versions and continuation", async () => {
  const f = fixture((query) => {
    if (query.sql.startsWith("WITH visible"))
      return [
        attachment("active", "2026-09-24T00:00:00Z"),
        attachment("older", "2026-09-23T00:00:00Z"),
      ];
    if (query.sql.includes("attachment.uploaded_by="))
      return [attachment("pending", "2026-09-25T00:00:00Z", "processing")];
    if (query.sql.includes("FROM document.attachment_folder"))
      return [{ id: "folder", name: "Evidence", parent_id: "parent" }];
    if (query.sql.includes("FROM document.attachment_workspace"))
      return [{ revision_no: "9" }];
    return [
      {
        id: "version",
        version_no: 1,
        file_name: "old.pdf",
        status: "active",
        created_at: "2026-09-22T00:00:00Z",
      },
    ];
  });
  const result = await f.providers
    .getService("platform.attachments.v1")!
    .read({ ...input, cursor: "cursor" });
  expect(result).toMatchObject({
    revision: "9",
    data: {
      workspaceRevision: "9",
      nextCursor: "active",
      folders: [{ id: "folder", name: "Evidence", parentId: "parent" }],
      items: [
        {
          id: "pending",
          processingStatus: "processing",
          sizeBytes: 1024,
          versionHistory: [{ id: "version", version: 1 }],
        },
        { id: "active", version: 2, revision: "4" },
      ],
    },
  });
  const active = f.queries[0]!,
    pending = f.queries[1]!;
  expect(active.sql).toContain("DISTINCT ON (attachment.series_id)");
  expect(active.sql).toContain(
    "COALESCE(link.pinned_attachment_id,series.current_attachment_id)",
  );
  expect(active.sql).toContain(
    "attachment.is_active AND attachment.is_virus_scanned AND attachment.status='active'",
  );
  expect(active.sql).toContain("attachment.expires_at>clock_timestamp()");
  expect(pending.sql).toContain("attachment.uploaded_by=");
  expect(pending.parameters).toContain("viewer");
  for (const query of [active, pending]) {
    expect(query.parameters).toEqual(
      expect.arrayContaining([
        "tenant",
        "business_partner",
        "record",
        "cursor",
        3,
      ]),
    );
  }
  for (const query of f.queries) expect(query.parameters).toContain("tenant");
});

it("returns a stable empty attachment workspace for another entity", async () => {
  const f = fixture();
  expect(
    await f.providers
      .getService("platform.attachments.v1")!
      .read({ ...input, core: { entityCode: "contact_person" } }),
  ).toEqual({
    revision: "1",
    data: { items: [], folders: [], workspaceRevision: "1" },
  });
  expect(f.queries[0]!.parameters).toContain("contact_person");
});

it("does not mask database failures as empty successful reads", async () => {
  const error = new Error("database unavailable");
  const f = fixture(() => {
    throw error;
  });
  for (const key of ["platform.comments.v1", "platform.attachments.v1"])
    await expect(f.providers.getService(key)!.read(input)).rejects.toBe(error);
});
