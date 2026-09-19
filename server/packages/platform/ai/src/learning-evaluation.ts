import { createHash } from "node:crypto";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
import { resolveAtlasIntent } from "./structured-intent.js";
/** Evaluation invokes the same direct-read resolver; fixtures never become aliases. */
export function evaluateAtlasLearningVocabulary(entityCode: string, ai: EntityAiDescriptorV1, fixtures: readonly {question: string; expected: "read" | "delegate"}[], baseline?: EntityAiDescriptorV1): {passed: boolean; fixtureHash: string; resolverVersion: string; results: {expected: string; actual: string; before?: string; passed: boolean}[]} {
  const terms = ai.vocabulary?.terms.filter(term => term.capabilityId === "entity_read_record").map(term => term.phrase) ?? [];
  const tools = ai.enabled && ai.insightProviders.some(ref => ref.id === "entity_read_record") ? [{name: "entity_read_record", description: "Read current record", inputSchema: {}, entitySection: {entityCode, sectionKey: "record_summary", aliases: ["summary", ...ai.aliases], semanticAliases: terms, resultKey: "items", label: "Record summary"}}] : [];
  const page = {schemaVersion: 1, kind: "record", entityCode, recordId: "00000000-0000-4000-8000-000000000001", section: "overview", dirty: false, generationId: "evaluation", locale: "en"} as const;
  const results = fixtures.map(fixture => {
    const actual = resolveAtlasIntent(tools, fixture.question, page);
    const before = baseline ? evaluateAtlasLearningVocabulary(entityCode, baseline, [fixture]).results[0]!.actual : undefined;
    return {expected: fixture.expected, actual: actual.kind, ...(before ? {before} : {}), passed: (!baseline || (fixture.expected === "read" ? before !== "read" : before === "delegate")) && actual.kind === fixture.expected && (actual.kind !== "read" || actual.capabilityIds[0] === "entity_read_record")};
  });
  return {passed: results.every(result => result.passed), fixtureHash: createHash("sha256").update(JSON.stringify(fixtures)).digest("hex"), resolverVersion: "atlas-exact-terms/4.0", results};
}
