import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../../routes/attachments.route.ts", import.meta.url), "utf8");

describe("attachment workspace contract", () => {
  it("registers one read model containing files, folders and summary", () => {
    expect(routeSource).toContain('"/documents/:docType/:id/attachment-workspace"');
    expect(routeSource).toContain("const [items, links, folders] = await Promise.all");
    expect(routeSource).toContain("attachments,");
    expect(routeSource).toContain("folders:");
    expect(routeSource).toContain("summary,");
  });
});
