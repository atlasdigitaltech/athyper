import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Kysely } from "kysely";
import { prepareEntitySuccessorDraft, type PrepareEntitySuccessorInput } from "../publication/prepare-successor.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input: PrepareEntitySuccessorInput = { requestId: id(1), authorityTenantId: id(2), entityId: id(3), actorId: id(4), publicationKey: "metadata.entity.example",
  predecessor: { authoringReleaseId: id(5), authoringReleaseNo: 1, authoringReleaseHash: "a".repeat(64), publicationReleaseId: id(6), publicationReleaseNo: 1, publicationReleaseHash: "b".repeat(64), revisionId: id(7), contractHash: "c".repeat(64) } };
it("requires explicit maintenance authorization before database work", async () => {
  const transaction = vi.fn(), assertAuthorized = vi.fn(async () => { throw Error("DENIED"); });
  await expect(prepareEntitySuccessorDraft({ transaction } as unknown as Kysely<Record<string, never>>, { assertAuthorized }, input)).rejects.toThrow("DENIED");
  expect(transaction).not.toHaveBeenCalled();
  expect(assertAuthorized).toHaveBeenCalledWith({ ...input, action: "metadata.entity.successor.prepare" });
});
it("rejects invalid predecessor coordinates before calling authority", async () => {
  const assertAuthorized = vi.fn();
  await expect(prepareEntitySuccessorDraft({} as Kysely<Record<string, never>>, { assertAuthorized }, { ...input, predecessor: { ...input.predecessor, authoringReleaseId: "missing" } })).rejects.toThrow("ID_INVALID");
  expect(assertAuthorized).not.toHaveBeenCalled();
});
it("keeps draft preparation generic, with explicit imports and no release allocation", () => {
  const text = readFileSync(new URL("../publication/prepare-successor.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("prepare-successor.ts", text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["kysely", "@athyper/server-contract-publication", "@athyper/server-contract-meta-entity-authoring", "../kysely-authoring-repository.js", "../graph-identity.js", "../deterministic.js"]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(tree) === "require"))) throw Error("Import bypass");
    node.forEachChild(visit);
  }
  visit(tree);
  expect(text).not.toMatch(/country|currency|business_partner|fn_activate|INSERT INTO (publication\.release|metadata\.entity_release)/);
});
