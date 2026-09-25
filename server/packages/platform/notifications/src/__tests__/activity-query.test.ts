import { describe, it, expect } from "vitest";
import {
  defaultActivityQuery,
  parseActivityQuery,
  queryActivity,
  type ActivityQueryRow,
} from "@athyper/contract-platform-activity";
const now = "2026-09-23T12:00:00.000Z";
const rows: ActivityQueryRow[] = Array.from({ length: 120 }, (_, i) => ({
  id: String(i).padStart(3, "0"),
  title: `Update ${i}`,
  createdAt: "2026-09-20T12:00:00.000Z",
  entity: "business_partner",
  type: "collaboration.comment.mentioned",
  unread: i % 2 === 0,
  recordLabel: i === 90 ? "Needle supplier" : "Supplier",
}));
const run = (
  query = defaultActivityQuery("notifications"),
  cursor?: string,
  items = rows,
) =>
  queryActivity({
    kind: "notifications",
    query,
    rows: items,
    project: (r) => r,
    limit: 25,
    scope: "tenant:user:plane",
    now,
    cursor,
  });
describe("authorized activity query pagination", () => {
  it("matches an authorized label beyond the first page and counts all matching rows", () => {
    const result = run({
      ...defaultActivityQuery("notifications"),
      search: "Needle",
    });
    expect(result.data.map((r) => r.id)).toEqual(["090"]);
    expect(result.matchingCount).toBe(1);
  });
  it("sorts and groups before pagination with stable identity ties", () => {
    let page = run(),
      ids = page.data.map((r) => r.id);
    while (page.nextCursor) {
      page = run(undefined, page.nextCursor);
      ids.push(...page.data.map((r) => r.id));
    }
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(page.matchingCount).toBe(120);
  });
  it("binds cursor to the query and excludes later arrivals", () => {
    const page = run();
    expect(() =>
      run(
        { ...defaultActivityQuery("notifications"), read: "unread" },
        page.nextCursor,
      ),
    ).toThrow(/cursor/);
    const next = run(undefined, page.nextCursor, [
      ...rows,
      { ...rows[0]!, id: "new", createdAt: "2026-09-24T00:00:00.000Z" },
    ]);
    expect(next.matchingCount).toBe(120);
  });
  it("keeps unread matching count distinct from total activity", () =>
    expect(
      run({ ...defaultActivityQuery("notifications"), read: "unread" })
        .matchingCount,
    ).toBe(60));
  it("validates dates, options and unknown filters", () => {
    for (const q of [
      { from: "2026-02-30" },
      { from: "2026-09-24", to: "2026-09-23" },
      { sort: "unsafe" },
      { unknown: true },
    ])
      expect(() => parseActivityQuery("notifications", q)).toThrow();
  });
  it("uses clear due buckets and filters team work independently", () => {
    const items = [
      {
        ...rows[0]!,
        status: "open",
        assignment: "team",
        dueAt: "2026-09-21T12:00:00Z",
      },
      {
        ...rows[1]!,
        status: "open",
        assignment: "me",
        dueAt: "2026-09-23T13:00:00Z",
      },
      {
        ...rows[2]!,
        status: "open",
        assignment: "me",
        dueAt: "2026-09-24T00:00:00Z",
      },
      { ...rows[3]!, status: "open", assignment: "me" },
    ];
    const input = {
      kind: "inbox" as const,
      query: defaultActivityQuery("inbox"),
      rows: items,
      project: (r: ActivityQueryRow) => r,
      limit: 25,
      scope: "t:u:p",
      now,
    };
    expect(queryActivity(input).data.map((r) => r.groupLabel)).toEqual([
      "Overdue",
      "Due today",
      "Upcoming",
      "No due date",
    ]);
    expect(
      queryActivity({ ...input, query: { ...input.query, assignment: "team" } })
        .matchingCount,
    ).toBe(1);
  });
});
