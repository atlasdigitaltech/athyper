/** A record overview is owner data. Similar document text must not displace it.
 * Explicit document requests still use the normal authorized retrieval path. */
export function atlasRequestsRecordOverview(query: string): boolean {
  const text = query.normalize("NFKC");
  return (
    (/\b(overview|record summary)\b/i.test(text) ||
      /\b(summarize|summarise) this business partner\b/i.test(text)) &&
    !/\b(document|documents|attachment|attachments|file|files|pdf|contract|contracts|certificate|certificates)\b/i.test(
      text,
    )
  );
}
