import { describe, expect, it } from "vitest";
import { buildListPageParams, buildRuntimeListBrowserCacheKey } from "../lazy-list";
import { buildServerSearchParams } from "../search";

describe("runtime-list pagination query mode", () => {
  it("forces lazy page requests onto the offset pagination contract", () => {
    const params = buildListPageParams({
      page: "1",
      page_size: "50",
      query_v1: "1",
      cursor: "stale-cursor",
      sort: "posted_at:desc",
      "filter.status": "posted",
    }, 2, 20);

    expect(params.get("page")).toBe("2");
    expect(params.get("page_size")).toBe("20");
    expect(params.get("query_v1")).toBe("0");
    expect(params.has("cursor")).toBe(false);
    expect(params.get("sort")).toBe("posted_at:desc");
    expect(params.get("filter.status")).toBe("posted");
  });

  it("keeps server search on the same offset pagination contract", () => {
    const params = buildServerSearchParams({
      query_v1: "1",
      cursor: "stale-cursor",
      sort: "code:asc",
      "filter.status": "posted",
    }, "audit", 20);

    expect(params.get("q")).toBe("audit");
    expect(params.get("page_size")).toBe("20");
    expect(params.get("query_v1")).toBe("0");
    expect(params.has("cursor")).toBe(false);
    expect(params.get("sort")).toBe("code:asc");
    expect(params.get("filter.status")).toBe("posted");
  });

  it("does not reuse page maps cached under the previous pagination contract", () => {
    const cacheKey = buildRuntimeListBrowserCacheKey("journal_entry", {}, 20);

    expect(cacheKey).toMatch(/^runtime-list:v2:journal_entry:20:/);
  });
});
