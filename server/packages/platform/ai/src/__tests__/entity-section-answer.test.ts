import {expect, it} from "vitest";
import {entitySectionAnswer} from "../entity-section-answer.js";
const definitions = [{name: "product_specs", description: "Specs", inputSchema: {}, entitySection: {entityCode: "product", sectionKey: "specifications", aliases: ["specifications"], resultKey: "items", label: "Product specifications"}}];
const result = (status: string, items: unknown[], hasMore = false) => ({type: "tool_result" as const, toolName: "product_specs", callId: "c", result: {section: "specifications", status, items, hasMore}});
it("renders generic typed values and marks partial rows without inventing totals", () => {
 const answer = entitySectionAnswer([result("ready", [{displayName: "Widget", primary: true, weight: 5}], true)], definitions);
 expect(answer).toContain("Product specifications — 1 shown");
 expect(answer).toContain("Display name: Widget"); expect(answer).toContain("Primary: Yes"); expect(answer).toContain("partial summary");
});
it("distinguishes unavailable and authorized empty outcomes", () => {
 expect(entitySectionAnswer([result("unavailable", [])], definitions)).toContain("unavailable");
 expect(entitySectionAnswer([result("empty", [])], definitions)).toContain("No saved");
});
it("does not render failed, unregistered, mixed or mismatched tool results", () => {
 const block = result("ready", [{label: "Widget"}]);
 expect(entitySectionAnswer([{...block, isError: true}], definitions)).toBeUndefined();
 expect(entitySectionAnswer([block], [])).toBeUndefined();
 expect(entitySectionAnswer([block, block], definitions)).toBeUndefined();
 expect(entitySectionAnswer([{...block, result: {...block.result, section: "other"}}], definitions)).toBeUndefined();
 expect(entitySectionAnswer([result("ready", [{hiddenObject: {secret: "never-render"}}])], definitions)).toBeUndefined();
});
it.each([false, true])("answers a named existence question with coverage (partial=%s)", partial => {
 const defs = definitions.map(d => ({...d, entitySection: {...d.entitySection, searchFields: ["displayName"]}}));
 const question = "For this product do we have any specifications like Chandravel?";
 const answer = entitySectionAnswer([result("ready", [{displayName: "Amelia Hart"}], partial)], defs, question);
 expect(answer).toContain("No authorized name matches for “Chandravel”");
 expect(answer).not.toContain("Amelia Hart");
 expect(answer).toContain(partial ? "partial authorized list" : "fully searched");
 expect(entitySectionAnswer([result("ready", [{displayName: "Chandravel N"}], partial)], defs, question)).toContain("Found 1 authorized name match");
});
it("filters only registered name fields and does not imply an exhaustive search when they are absent", () => {
 const defs = definitions.map(d => ({...d, entitySection: {...d.entitySection, searchFields: ["displayName"]}}));
 const answer = entitySectionAnswer([result("ready", [{businessTitle: "Chandravel"}])], defs, "Find this product specifications named Chandravel");
 expect(answer).toContain("No authorized name matches");
 expect(answer).toContain("partial authorized list");
});
it.each(["missing_scope", "denied", "reader_unavailable"])("preserves unavailable reason %s without claiming absence", unavailableReason => {
 const block = result("unavailable", []);
 const answer = entitySectionAnswer([{...block, result: {...block.result, unavailableReason}}], definitions);
 expect(answer).toContain("No absence finding");
});
it("does not silently replace an unsupported filter with a summary", () => {
 expect(entitySectionAnswer([result("ready", [{displayName: "Widget"}])], definitions, "Find this product specifications with weight over 5")).toContain("cannot evaluate that filter");
});
it.each(["as", "named", "called", "like", "with name", "with the name", "name is"])("checks the name condition '%s' instead of reporting unrelated contact existence", phrase => {
 const defs = definitions.map(d => ({...d, entitySection: {...d.entitySection, searchFields: ["displayName"]}}));
 const question = `for this business partner do we have any contact ${phrase} Chandravel`;
 const answer = entitySectionAnswer([result("ready", [{displayName: "Amelia Hart"}])], defs, question);
 expect(answer).toContain("No authorized name matches for “Chandravel”");
 expect(answer).not.toContain("Yes");
 expect(answer).not.toContain("Amelia Hart");
 expect(entitySectionAnswer([result("ready", [{displayName: "Chandravel N"}])], defs, question)).toContain("Found 1 authorized name match");
 expect(entitySectionAnswer([result("ready", [{displayName: "Amelia Hart"}], true)], defs, question)).toContain("partial authorized list");
});
