import type { LogLevel, SpanContext } from "@athyper/server-foundation/observability";

export type TelemetryAttributeValue = string | number | boolean;
export type TelemetryAttributes = Readonly<Record<string, TelemetryAttributeValue>>;
export type TelemetryTraceContext = SpanContext;

interface TelemetryRecordBase {
  readonly timestamp: string;
  readonly serviceName: string;
  readonly attributes?: TelemetryAttributes;
  readonly trace?: TelemetryTraceContext;
}

export interface LogRecord extends TelemetryRecordBase {
  readonly kind: "log";
  readonly level: LogLevel;
  readonly event: string;
  readonly message?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

export interface MetricRecord extends TelemetryRecordBase {
  readonly kind: "metric";
  readonly name: string;
  readonly instrument: "counter" | "gauge" | "histogram";
  readonly value: number;
  readonly unit?: string;
}

export interface TraceRecord extends TelemetryRecordBase {
  readonly kind: "trace";
  readonly name: string;
  readonly span: TelemetryTraceContext;
  readonly durationMs: number;
  readonly status: "unset" | "ok" | "error";
}

export type TelemetryRecord = LogRecord | MetricRecord | TraceRecord;

export interface TelemetryBatch<RecordType extends TelemetryRecord = TelemetryRecord> {
  readonly resource: TelemetryAttributes;
  readonly records: readonly RecordType[];
}
