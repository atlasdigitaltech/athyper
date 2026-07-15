export function formatDate(
  value: string | null | undefined,
  mode: "datetime" | "date" = "datetime",
): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return mode === "date" ? d.toLocaleDateString() : d.toLocaleString();
}
