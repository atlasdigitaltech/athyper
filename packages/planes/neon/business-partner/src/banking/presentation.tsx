import { Card } from "@athyper/platform-ui";

export function Notice({ data }: { data: Readonly<Record<string, unknown>> }) {
  return data["readOnly"] ? (
    <Card className="bp360-section-card">
      <strong>Historical read-only view</strong>
      <p>Owning-service actions are disabled for an explicit as-of date.</p>
    </Card>
  ) : null;
}
export function Field({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{show(value)}</dd>
    </div>
  );
}
export function rows(value: unknown) {
  return Array.isArray(value)
    ? (value.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      ) as readonly Readonly<Record<string, unknown>>[])
    : [];
}
export function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
export function show(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value)
    ? value.map(showListItem).join(", ")
    : String(value);
}
export function showListItem(value: unknown) {
  const item = record(value);
  if (!item) return String(value);
  if (item["domainCode"] && item["code"])
    return `${String(item["domainCode"]).toUpperCase()} ${String(item["code"])}${item["name"] ? ` — ${String(item["name"])}` : ""}`;
  if (item["categoryCode"])
    return `${String(item["categoryCode"])}${item["categoryName"] ? ` — ${String(item["categoryName"])}` : ""}`;
  return String(value);
}
