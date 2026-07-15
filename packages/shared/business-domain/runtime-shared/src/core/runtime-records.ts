export interface RuntimeRecordRow {
  id?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RuntimeListState {
  status: "ready" | "unavailable";
  message?: string;
}

export interface RuntimeListPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type RuntimeFieldRecord = Record<string, unknown> & {
  data?: unknown;
  id?: unknown;
};

export function isRuntimeRecord(value: unknown): value is RuntimeFieldRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function runtimeRecordData(record: RuntimeFieldRecord | undefined): Record<string, unknown> {
  return isRuntimeRecord(record?.data) ? record.data : {};
}

export function flattenRuntimeRecord(record: RuntimeFieldRecord | undefined): Record<string, unknown> {
  if (!record) return {};
  return {
    ...record,
    ...runtimeRecordData(record),
  };
}

export function readRuntimeRecordField(
  record: RuntimeFieldRecord | undefined,
  fieldName: string,
  columnName = fieldName,
): unknown {
  if (!record) return undefined;
  const data = runtimeRecordData(record);
  if (fieldName === "id") return record.id ?? data["id"];
  return data[fieldName]
    ?? record[fieldName]
    ?? data[columnName]
    ?? record[columnName];
}

export function readRuntimeRecordText(
  record: RuntimeFieldRecord | undefined,
  fieldName: string,
  columnName = fieldName,
): string | undefined {
  const value = readRuntimeRecordField(record, fieldName, columnName);
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
