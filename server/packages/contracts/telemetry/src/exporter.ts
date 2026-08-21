import type { TelemetryBatch, TelemetryRecord } from "./records.js";

export type TelemetryExportResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly retryable: boolean; readonly reason: string };

export interface TelemetryExporter<RecordType extends TelemetryRecord = TelemetryRecord> {
  export(batch: TelemetryBatch<RecordType>): Promise<TelemetryExportResult>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
