import type {
  AtlasProviderToolDefinition,
  AtlasBusinessContextV1,
} from "@athyper/server-contract-ai";
/** Aliases select only already-admitted registrations; they never resolve names
 * into record IDs or authorize another entity. Ambiguity keeps matching tools. */
export function selectEntitySectionTools(
  tools: readonly AtlasProviderToolDefinition[],
  text: string,
  page?: AtlasBusinessContextV1,
): readonly AtlasProviderToolDefinition[] | undefined {
  const words =
    text
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const matchesAlias = (alias: string) => {
    const phrase =
      alias
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .match(/[\p{L}\p{N}_-]+/gu) ?? [];
    return (
      phrase.length > 0 &&
      words.some((_, i) => phrase.every((word, j) => words[i + j] === word))
    );
  };
  const applicable = tools.filter(
    (tool) =>
      tool.entitySection &&
      (!page || page.entityCode === tool.entitySection.entityCode),
  );
  const learned = applicable.filter((tool) =>
    tool.entitySection?.semanticAliases?.some(matchesAlias),
  );
  const matches = applicable.filter(
    (tool) =>
      text.includes(tool.name) ||
      tool.entitySection!.aliases.some(matchesAlias),
  );
  // Explicit published meanings preserve collisions, including summary/section ambiguity.
  if (learned.length)
    return [
      ...new Map(
        [
          ...learned,
          ...matches.filter(
            (tool) => tool.entitySection?.sectionKey !== "record_summary",
          ),
        ].map((tool) => [tool.name, tool]),
      ).values(),
    ];
  // Entity aliases are fallback summary routing; an explicit owner section is more specific.
  const sections = matches.filter(
    (tool) => tool.entitySection?.sectionKey !== "record_summary",
  );
  return sections.length ? sections : matches.length ? matches : undefined;
}
export function providerTools(
  tools: readonly AtlasProviderToolDefinition[],
): readonly AtlasProviderToolDefinition[] {
  return tools.map(({ entitySection: _, ...tool }) => tool);
}

/** Explicit current-record section reads have no identifier ambiguity. Domain
 * questions, mutations, attachments and multi-section requests stay with the agent. */
export function directEntitySectionRead(
  tools: readonly AtlasProviderToolDefinition[],
  text: string,
  page?: AtlasBusinessContextV1,
): AtlasProviderToolDefinition | undefined {
  // The overview composer supplies the current record. A narrow read phrase
  // can use its admitted metadata summary without asking the model to infer scope.
  if (
    page?.kind === "record" &&
    !page.asOf &&
    page.section === "overview" &&
    /^(?:explain|show|summarize|summarise|read|display)\s+(?:(?:the|this|current)\s+)?(?:saved\s+)?(?:information\s+(?:in|on)\s+(?:the\s+)?overview|(?:record\s+)?overview)[.!?]?$/i.test(
      text.trim(),
    )
  ) {
    const summaries = tools.filter(
      (tool) =>
        tool.entitySection?.entityCode === page.entityCode &&
        tool.entitySection.sectionKey === "record_summary" &&
        tool.entitySection.resultKey &&
        tool.entitySection.label,
    );
    return summaries.length === 1 ? summaries[0] : undefined;
  }
  if (
    page?.kind !== "record" ||
    page.asOf ||
    !/\b(this|current)\b/i.test(text) ||
    !/\b(summarize|summarise|summary|show|list|read|find|search|any|have|display|outline|overview|give me|tell me about)\b/i.test(
      text,
    ) ||
    /\b(update|change|delete|create|remove|set|submit|send|edit|modify|replace|approve|reject|disable|enable|pay|purchase|cancel|without|except|excluding|don.t|never|not)\b/i.test(
      text,
    )
  )
    return undefined;
  const matches = selectEntitySectionTools(tools, text, page);
  return matches?.length === 1 &&
    matches[0]?.entitySection?.resultKey &&
    matches[0]?.entitySection?.label
    ? matches[0]
    : undefined;
}
