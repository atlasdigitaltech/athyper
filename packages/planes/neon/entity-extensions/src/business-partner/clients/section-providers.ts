/**
 * Legacy branch-renderer compatibility only. This is NOT the MetaEntity handler registry.
 * EntityRecordPage resolves sections from admitted presentation metadata and the server registry;
 * certificates/restrictions intentionally need no entry here.
 * Retained section vocabulary for BUSINESS_PARTNER_360_PANEL compatibility validation.
 * The branch-rendered shell has been removed; the active BP adapter still consumes
 * the panel's sectionForTab fallback. Do not treat this list as handler reachability
 * or extend it instead of declaring a MetaEntity section binding.
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
