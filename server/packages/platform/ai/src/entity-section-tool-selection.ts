import type { AtlasProviderToolDefinition, AtlasBusinessContextV1 } from "@athyper/server-contract-ai";
/** Aliases select only already-admitted registrations; they never resolve names
 * into record IDs or authorize another entity. Ambiguity keeps matching tools. */
export function selectEntitySectionTools(tools: readonly AtlasProviderToolDefinition[], text: string, page?: AtlasBusinessContextV1): readonly AtlasProviderToolDefinition[] | undefined {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const matches = tools.filter(tool => tool.entitySection && (!page || page.entityCode === tool.entitySection.entityCode) && (text.includes(tool.name) || tool.entitySection.aliases.some(alias => {
    const phrase = alias.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
    return phrase.length > 0 && words.some((_, i) => phrase.every((word, j) => words[i + j] === word));
  })));
  return matches.length ? matches : undefined;
}
export function providerTools(tools: readonly AtlasProviderToolDefinition[]): readonly AtlasProviderToolDefinition[] {
  return tools.map(({entitySection: _, ...tool}) => tool);
}

/** Explicit current-record section reads have no identifier ambiguity. Domain
 * questions, mutations, attachments and multi-section requests stay with the agent. */
export function directEntitySectionRead(tools: readonly AtlasProviderToolDefinition[], text: string, page?: AtlasBusinessContextV1): AtlasProviderToolDefinition | undefined {
  if (page?.kind !== "record" || page.asOf || !/\b(this|current)\b/i.test(text) || !/\b(summarize|summarise|summary|show|list|read|find|search|any|have)\b/i.test(text) || /\b(update|change|delete|create|remove|set|submit|send|don't|not)\b/i.test(text)) return undefined;
  const matches = selectEntitySectionTools(tools, text, page);
  return matches?.length === 1 && matches[0]?.entitySection?.resultKey && matches[0]?.entitySection?.label ? matches[0] : undefined;
}
