import { expect, it, vi } from "vitest";
import { createAtlasEntityContextReader } from "./atlas-entity-context.js";
const context = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
} as never;
const subject = { context, entityCode: "country", recordId: "record" };
function fixture() {
  const read = vi.fn(
    async () =>
      ({
        data: {
          items: [
            {
              id: "comment",
              text: "Saved text",
              authorId: "author",
              replyCount: 2,
              content: { secret: "rich" },
              viewerReport: "private",
              pinnedFiles: ["attachment"],
            },
          ],
          draft: { text: "SECRET DRAFT" },
          nextCursor: "cursor",
        },
      }) as never,
  );
  const page = vi.fn(async () => ({
    items: [],
    releaseHash: "hash",
    nextCursor: "next",
  }));
  const compare = vi.fn(async () => ({
    from: "one",
    to: "two",
    fields: [
      {
        key: "name",
        label: "Name",
        before: { state: "uncaptured" as const },
        after: { state: "value" as const, value: "Malaysia" },
        changed: false,
      },
    ],
  }));
  return {
    read,
    page,
    compare,
    adapter: createAtlasEntityContextReader({ read }, { page, compare }),
  };
}
it("reads saved comments through owner admission and excludes drafts and secondary audiences", async () => {
  const h = fixture();
  const data = await h.adapter.read({
    ...subject,
    capability: "entity_read_comments",
    arguments: { cursor: "cursor", threadRootId: "root" },
  });
  expect(h.read).toHaveBeenCalledWith({
    ...subject,
    kind: "comments",
    limit: 20,
    cursor: "cursor",
    threadRootId: "root",
  });
  expect(data).toMatchObject({
    items: [
      { id: "comment", text: "Saved text", authorId: "author", replyCount: 2 },
    ],
    nextCursor: "cursor",
    hasMore: true,
    coverage: "authorized_thread_replies",
  });
  expect(JSON.stringify(data)).not.toMatch(
    /SECRET|viewerReport|pinnedFiles|rich/,
  );
  h.read.mockRejectedValue(Error("owner denied"));
  await expect(
    h.adapter.read({
      ...subject,
      capability: "entity_read_comments",
      arguments: {},
    }),
  ).rejects.toThrow("owner denied");
});
it("preserves pagination and missing capture state without claiming unchanged data", async () => {
  const h = fixture();
  const snapshots = await h.adapter.read({
    ...subject,
    capability: "entity_read_snapshots",
    arguments: { cursor: "current" },
  });
  expect(h.page).toHaveBeenCalledWith({
    ...subject,
    view: "snapshots",
    cursor: "current",
  });
  expect(snapshots).toMatchObject({
    hasMore: true,
    nextCursor: "next",
    coverage: "authorized_snapshots_in_default_date_range",
  });
  const compared = await h.adapter.read({
    ...subject,
    capability: "entity_compare_snapshots",
    arguments: { from: "one", to: "two" },
  });
  expect(h.compare).toHaveBeenCalledWith({
    ...subject,
    from: "one",
    to: "two",
  });
  expect(compared).toMatchObject({
    fields: [{ before: { state: "uncaptured" }, changed: false }],
  });
  expect(compared.note).toContain("Uncaptured values are unknown");
});
