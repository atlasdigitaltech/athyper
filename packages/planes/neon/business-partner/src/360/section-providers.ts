/**
 * Every section code business-partner-360.tsx's renderSection actually has a branch for. Kept as a
 * separate, explicit list rather than refactoring renderSection's existing if/else chain into a lookup
 * table — that function is large and working, and this file's only job is to catch drift between it and
 * the published panel definition, not to change how sections render. If a section is added to
 * BUSINESS_PARTNER_360_PANEL without a matching renderSection branch, that section currently renders an
 * empty SectionStatePanel with no error; this makes that failure loud instead of silent.
 */
export const BUSINESS_PARTNER_SECTION_PROVIDERS: ReadonlySet<string> = new Set([
  "overview",
  "identity",
  "contacts",
  "addresses",
  "identifiers-tax",
  "governance",
  "comments",
  "attachments",
  "roles-scope",
  "supplier-company",
  "customer-company",
  "banking",
  "qualifications-certificates",
  "credit",
  "network",
  "requests",
  "activity",
  "business-activity",
]);

export interface SectionReferenceHolder {
  readonly sections: readonly string[];
  readonly tabs: readonly { readonly sectionKey?: string }[];
}

/** Fails loudly (module-load time for the static definition) instead of silently rendering nothing. */
export function assertSectionProvidersRegistered(panel: SectionReferenceHolder): void {
  const referenced = new Set([
    ...panel.sections,
    ...panel.tabs.flatMap((tab) => (tab.sectionKey ? [tab.sectionKey] : [])),
  ]);
  const unregistered = [...referenced].filter(
    (code) => !BUSINESS_PARTNER_SECTION_PROVIDERS.has(code),
  );
  if (unregistered.length)
    throw new Error(
      `Unregistered Business Partner 360 section provider(s): ${unregistered.join(", ")}`,
    );
}
