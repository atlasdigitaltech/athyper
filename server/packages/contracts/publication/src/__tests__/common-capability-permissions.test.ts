import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isCommonCapabilityAction } from "../common-capability-permissions.js";
import { parseCapabilityBinding } from "../entity-capabilities.js";

const binding = (permissionCode: string) => ({
  schemaVersion: 1, serviceKey: "platform.comments.v1", ownerEntityCode: "country",
  admissionResolverKey: "platform.records.admission.v1", layouts: ["drawer"],
  actions: [{ key: "read", permissionCode, handlerKey: "platform.comments.read.v1", concurrency: "none", idempotency: "none" }],
  richTextSchema: "athyper.rich-text/1.0", maxTextLength: 2000, maxDepth: 0,
  allowedAudiences: ["public"], defaultAudience: "public",
  features: { replies: false, edits: false, reactions: false, mentions: false, drafts: false, reporting: false, history: false },
  reactionCodes: [], attachments: { allowed: false, maxCount: 0, pinVersion: true },
});

describe("common capability permission boundary", () => {
  it.each([
    ["comments", "reply", "create"], ["comments", "react", "create"], ["comments", "draft", "create"],
    ["comments", "flag", "read"], ["comments", "mention", "read"], ["comments", "history", "read"],
    ["attachments", "preview", "download"], ["attachments", "extract", "read"], ["attachments", "search", "read"],
    ["attachments", "status", "read"], ["attachments", "folder", "create"], ["attachments", "rename", "create"],
    ["attachments", "version", "create"], ["attachments", "category", "create"], ["attachments", "unlink", "archive"],
  ] as const)("qualifies explicit advanced %s/%s mapping to %s", (kind, key, permission) => {
    const action = { key, permissionCode: `common.collaboration.${kind === "comments" ? "comment" : "attachment"}.${permission}`, handlerKey: `platform.${kind}.${key}.v1` };
    expect(isCommonCapabilityAction(kind, action)).toBe(true);
    expect(isCommonCapabilityAction(kind, { ...action, permissionCode: "common.platform.reference.view" })).toBe(false);
    expect(isCommonCapabilityAction(kind, { ...action, handlerKey: "platform.attachments.download.v1" })).toBe(false);
  });
  it.each([
    ["comments", "read"], ["comments", "create"], ["comments", "update_own"], ["comments", "archive_own"],
    ["attachments", "read"], ["attachments", "create"], ["attachments", "finalize"], ["attachments", "download"], ["attachments", "archive"],
  ] as const)("admits only the exact %s/%s tuple", (kind, key) => {
    const action = { key, permissionCode: `common.collaboration.${kind === "comments" ? "comment" : "attachment"}.${key}`, handlerKey: `platform.${kind}.${key}.v1` };
    expect(isCommonCapabilityAction(kind, action)).toBe(true);
    expect(isCommonCapabilityAction(kind, { ...action, handlerKey: "entity.record.update.v1" })).toBe(false);
    expect(isCommonCapabilityAction(kind, { ...action, permissionCode: "common.platform.reference.view" })).toBe(false);
    expect(isCommonCapabilityAction(kind, { ...action, key: "unregistered" })).toBe(false);
  });
  it("enforces the common boundary during parsing without a registry", () => {
    expect(() => parseCapabilityBinding(binding("common.collaboration.comment.read"), "comments", "country")).not.toThrow();
    for (const code of ["common.platform.reference.view", "common.collaboration.comment.create", "common.collaboration.attachment.read", "common.arbitrary.read"]) {
      expect(() => parseCapabilityBinding(binding(code), "comments", "country")).toThrow(/unsupported common/);
    }
  });
  it("has no product or runtime dependencies, including dynamic imports", () => {
    const source = ts.createSourceFile("common-capability-permissions.ts", readFileSync(new URL("../common-capability-permissions.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const imports: ts.Node[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)
        || (ts.isExportDeclaration(node) && node.moduleSpecifier)
        || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require"))) imports.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(imports).toEqual([]);
  });
});
