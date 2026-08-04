import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../../routes/collab.route.ts", import.meta.url), "utf8");
const commentSchemaSource = readFileSync(
  new URL("../../../../../db/ddl/planes/athyper/document/03_tables.sql", import.meta.url),
  "utf8",
);
const cursorSchemaSource = readFileSync(
  new URL("../../../../../db/ddl/planes/athyper/document/03_tables.sql", import.meta.url),
  "utf8",
);

describe("enriched comments list contract", () => {
  it("returns list counts, configuration and row enrichment from bulk queries", () => {
    expect(routeSource).toContain("attachmentsByComment");
    expect(routeSource).toContain("reactionsByComment");
    expect(routeSource).toContain("unreadCount:");
    expect(routeSource).toContain("config,");
    expect(routeSource).toContain("WITH RECURSIVE thread");
  });

  it("keeps attachment and reaction enrichment tenant scoped", () => {
    expect(routeSource).toContain("edl.tenant_id = ${tenantId}::uuid");
    expect(routeSource).toContain("cr.tenant_id = ${tenantId}::uuid");
    expect(routeSource).toContain("cr.comment_id = ANY(${sql.val(allCommentIds)}::uuid[])");
  });

  it("treats polymorphic entity references as text in schema and enriched counts", () => {
    expect(commentSchemaSource).toMatch(
      /CREATE TABLE document\.comment \([\s\S]*?entity_id\s+text\s+NOT NULL/,
    );
    expect(cursorSchemaSource).toMatch(/entity_id\s+text\s+NOT NULL/);
    expect(routeSource).toContain("AND entity_id = ${entityId}");
    expect(routeSource).toContain("AND c.entity_id = ${entityId}");
    expect(routeSource).not.toContain("entity_id = ${entityId}::uuid");
  });

  it("does not reject human-readable entity references before querying comments", () => {
    const listHandler = routeSource.slice(
      routeSource.indexOf("const listCommentsHandler"),
      routeSource.indexOf("const unreadCountHandler"),
    );
    const unreadHandler = routeSource.slice(
      routeSource.indexOf("const unreadCountHandler"),
      routeSource.indexOf("const markAllReadHandler"),
    );
    const markReadHandler = routeSource.slice(
      routeSource.indexOf("const markAllReadHandler"),
      routeSource.indexOf("const createCommentHandler"),
    );

    expect(listHandler).not.toContain("isUuid(entityId)");
    expect(unreadHandler).not.toContain("isUuid(entityId)");
    expect(markReadHandler).not.toContain("isUuid(entityId)");
  });
});
