/** Safe Activity wire projection. Storage coordinates, payload hashes and raw audit context never cross this boundary. */
export type ActivityView = "timeline" | "auditLog" | "versions" | "snapshots";
export interface ActivityDescription {
  readonly supportsCalendarRanges?: boolean;
  readonly views: readonly ActivityView[];
  readonly defaultView?: ActivityView;
  readonly canCapture: boolean;
  readonly releaseHash: string;
  readonly maxRangeDays: number;
  readonly defaultRangeDays: number;
}
export interface ActivityAuditItem {
  readonly id: string;
  readonly occurredAt: string;
  readonly event: string;
  readonly operation: string;
  readonly outcome: string;
  readonly actor: string | null;
  readonly changedFields: readonly string[];
}
export interface ActivitySnapshotItem {
  readonly id: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly sequence: number;
  readonly sourceRecordVersion: number | null;
  readonly coverage: "authorized_fields" | "declared_fields" | "unknown";
}
export interface ActivitySnapshot extends ActivitySnapshotItem {
  /** Current discoverable collection sections, not a claim of captured coverage. */
  readonly collections?: readonly {readonly key:string; readonly label:string; readonly sectionKey?:string}[];
  readonly fields: readonly {
    readonly key: string;
    readonly label: string;
    readonly state: "value" | "uncaptured";
    readonly value?: unknown;
    /** A captured reference: shown as "Linked record", never as an identifier. */
    readonly reference?: true;
  }[];
}
export interface ActivityPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly releaseHash: string;
}
/** A missing capture is a coverage limitation, never an empty or deleted value.
 * Restricted fields are omitted by the server; layout metadata cannot disclose them. */
export interface ActivityCapturedValue {
  readonly state: "value" | "uncaptured";
  readonly value?: unknown;
}
export interface ActivityComparisonField {
  /** Stable field key within the root record; not a related-record identity. */
  readonly key: string;
  readonly label: string;
  readonly before: ActivityCapturedValue;
  readonly after: ActivityCapturedValue;
  /** True only for unequal, comparable captured values. */
  readonly changed: boolean;
  /** A captured reference to another record: compared by its stored identity,
   * shown as "Linked record", never resolved against today's label and never
   * displayed as an identifier (Compare blueprint section 9.6). */
  readonly reference?: true;
}
export interface ActivityComparison {
  readonly from: string;
  readonly to: string;
  /** Authorized root fields. Related collections require a separately qualified
   * identity/coverage contract; never infer them from JSON array positions. */
  readonly fields: readonly ActivityComparisonField[];
}

/** Headers only. Historical values require separate current-field authorization. */
export interface ActivityVersionItem {
  readonly id: string;
  readonly occurredAt: string;
  readonly version: number;
  readonly operation: string;
  readonly actor: string;
  readonly changedFields: readonly string[];
}

export interface ActivityTimelineItem extends ActivityAuditItem {
  readonly source: "audit" | "snapshot" | "version";
  readonly correlation?: string;
}
export interface ActivityEventFilters {
  readonly event?: string;
  readonly actor?: string;
  readonly outcome?: "success" | "failure" | "denied";
}
