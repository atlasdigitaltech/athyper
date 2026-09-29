import type { ActivityComparisonField } from "./activity";

/** Current authorized presentation only; never a live lookup of historical values. */
export interface ActivityCollectionFieldFormat {
  readonly kind: "date" | "datetime" | "enum";
  readonly options?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

/** Authorized collection projection. Storage coordinates, hidden rows and source
 * manifests remain server-side. A single item still uses this collection shape. */
export type ActivityCollectionChange =
  "added" | "updated" | "removed" | "replaced" | "unchanged" | "uncomparable";
export interface ActivityCollectionComparisonItem {
  readonly id: string;
  readonly label?: string;
  readonly change: ActivityCollectionChange;
  readonly beforePresence: "present" | "absent" | "unknown";
  readonly afterPresence: "present" | "absent" | "unknown";
  readonly valueComparison: "same_record" | "different_target" | "unavailable";
  readonly fields: readonly (ActivityComparisonField & {
    readonly format?: ActivityCollectionFieldFormat;
  })[];
}
export interface ActivityCollectionComparison {
  readonly key: string;
  readonly label: string;
  /** Absent for root-transaction sources: use the containing snapshot time. */
  readonly beforeCapturedAt?: string;
  readonly afterCapturedAt?: string;
  readonly items: readonly ActivityCollectionComparisonItem[];
  readonly notes: readonly (
    | "incomplete_capture"
    | "incompatible_scope"
    | "restricted_scope"
    | "independent_sources"
  )[];
  /** Totals concern only authorized comparable items in this bounded projection. */
  readonly counts: Readonly<
    Record<Exclude<ActivityCollectionChange, "uncomparable">, number>
  >;
}

export interface ActivityCollectionSnapshot {
  readonly key: string;
  readonly label: string;
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly notes: ActivityCollectionComparison["notes"];
  readonly items: readonly {
    readonly id: string;
    readonly label?: string;
    readonly fields: readonly {
      readonly key: string;
      readonly label: string;
      readonly format?: ActivityCollectionFieldFormat;
      readonly state: "value" | "uncaptured";
      readonly value?: unknown;
    }[];
  }[];
}
export interface ActivityCollectionComparisonResult extends ActivityCollectionComparison {
  readonly from: string;
  readonly to: string;
}
export type ActivityCollectionPage<T> = T & {
  /** Total authorized items before paging, never the storage collection size. */
  readonly totalItems: number;
  readonly releaseHash: string;
  readonly nextCursor?: string;
};
