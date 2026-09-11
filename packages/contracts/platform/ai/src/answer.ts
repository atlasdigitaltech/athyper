import { parseAtlasInsightResult, type AtlasInsightResult } from "@athyper/contract-platform-ai/insights";

/** Generated presentation contains references only; facts and capabilities remain owner supplied. */
export interface AtlasAnswerEnvelope {
  readonly schemaVersion: 1;
  readonly kind: "brief" | "explanation" | "comparison" | "worklist" | "unavailable";
  readonly summary: string;
  readonly explanation?: string;
  readonly findingIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly nextActionId?: string;
}
export interface AtlasAnswerAuthority {
  readonly evidenceIds: readonly string[];
  readonly actionIds: readonly string[];
  readonly insight?: AtlasInsightResult;
}

/** Call with current authorized tool evidence, never with a model's claimed authority. */
export function parseAtlasAnswerEnvelope(value: unknown, authority: AtlasAnswerAuthority): AtlasAnswerEnvelope {
  const fail = (): never => { throw new TypeError("Invalid Atlas answer envelope or reference."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !["schemaVersion", "kind", "summary", "explanation", "findingIds", "evidenceIds", "nextActionId"].includes(key))) return fail();
  if (item.schemaVersion !== 1 || !["brief", "explanation", "comparison", "worklist", "unavailable"].includes(item.kind as string)) return fail();
  const prose = (text: unknown, limit: number): string => {
    if (typeof text !== "string" || !text.trim() || text.length > limit) return fail();
    return text;
  };
  const insight = authority.insight ? parseAtlasInsightResult(authority.insight) : undefined;
  const refs = (value: unknown, allowed: readonly string[]): readonly string[] => {
    if (!Array.isArray(value) || value.length > 100 || new Set(value).size !== value.length || value.some(id => typeof id !== "string" || !allowed.includes(id))) return fail();
    return Object.freeze([...value]) as readonly string[];
  };
  const findingIds = refs(item.findingIds, insight?.findings.map(f => f.id) ?? []);
  const evidenceIds = refs(item.evidenceIds, [...authority.evidenceIds, ...(insight?.evidence.map(e => e.id) ?? [])]);
  // Every selected finding carries its owner evidence; prose cannot detach the supporting sources.
  for (const finding of insight?.findings.filter(f => findingIds.includes(f.id)) ?? []) {
    if (finding.evidenceIds.some(id => !evidenceIds.includes(id))) return fail();
  }
  if (item.nextActionId !== undefined) {
    // An insight reference alone is insufficient: the current registered capability must also be available.
    if (typeof item.nextActionId !== "string" || !authority.actionIds.includes(item.nextActionId)) return fail();
    const action = insight?.actions.find(a => a.id === item.nextActionId);
    if (action?.evidenceIds.some(id => !evidenceIds.includes(id))) return fail();
  }
  return Object.freeze({ schemaVersion: 1, kind: item.kind as AtlasAnswerEnvelope["kind"], summary: prose(item.summary, 16000),
    ...(item.explanation === undefined ? {} : { explanation: prose(item.explanation, 24000) }), findingIds, evidenceIds,
    ...(item.nextActionId === undefined ? {} : { nextActionId: item.nextActionId as string }) });
}

export { parseAtlasInsightResult, type AtlasInsightResult } from "@athyper/contract-platform-ai/insights";
