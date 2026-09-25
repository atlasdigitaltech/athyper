type Row = Record<string, unknown>;
export function requiredText(row: Row, key: string): string {
  const value = row[key];
  if (value === null || value === undefined)
    throw new Error(`BP_360_REPOSITORY_FIELD_MISSING:${key}`);
  return String(value);
}
export function optionalText(row: Row, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}
export function timestamp(value: unknown): string {
  if (value === null || value === undefined) throw new Error("BP_360_TIMESTAMP_MISSING");
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}
export function dateOnly(value: unknown): string {
  if (value === null || value === undefined) throw new Error("BP_360_DATE_MISSING");
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
