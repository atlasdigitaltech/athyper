/**
 * Browser-safe contract for global reference data consumed by Business Partner.
 * `value` is the value persisted by the consuming field; it is deliberately not
 * always the reference record's UUID.
 */
export const sharedReferenceSourceKeys = [
  "iso.country",
  "iso.currency",
  "shared.country",
  "shared.currency",
  "shared.language",
  "shared.locale",
  "shared.timezone",
  "shared.uom",
  "shared.state_region",
  "shared.classification_scheme",
  "shared.commodity_code",
  "shared.industry_code",
  "shared.commodity_crosswalk",
  "shared.industry_crosswalk",
  "shared.bank_institution",
  "shared.bank_branch",
  "shared.bank_identifier",
] as const;

export type SharedReferenceSourceKey = (typeof sharedReferenceSourceKeys)[number];
export function isSharedReferenceSourceKey(value: unknown): value is SharedReferenceSourceKey {
  return typeof value === "string" && (sharedReferenceSourceKeys as readonly string[]).includes(value);
}
export type SharedReferenceFilterName =
  | "countryCode"
  | "languageCode"
  | "quantityType"
  | "schemeKind"
  | "domainCode"
  | "sourceDomainCode"
  | "targetDomainCode"
  | "institutionId"
  | "branchId"
  | "jurisdiction"
  | "scheme";

export interface SharedReferenceLookupInput {
  readonly sourceKey: SharedReferenceSourceKey;
  readonly query?: string;
  readonly cursor?: string;
  readonly limit?: number;
  /** Only declared filter names for the selected source are admitted. */
  readonly filters?: Readonly<Partial<Record<SharedReferenceFilterName, string>>>;
  /** Exact historical selection resolution; this never broadens a search. */
  readonly value?: string;
}

export interface SharedReferenceChoice {
  /** Value written by the consumer, such as ISO code or reference UUID. */
  readonly value: string;
  /** Stable record identity, always the reference table UUID. */
  readonly recordId: string;
  readonly label: string;
  readonly data?: Readonly<Record<string, string>>;
}

export interface SharedReferenceLookupPage {
  readonly sourceKey: SharedReferenceSourceKey;
  readonly items: readonly SharedReferenceChoice[];
  readonly nextCursor?: string;
}

export interface SharedReferenceDirectory {
  lookup(input: SharedReferenceLookupInput): Promise<SharedReferenceLookupPage>;
}
