import type { ResolvedPrintField } from "../core/resolveEntityPrintSections.js";

function formatDate(value: unknown): string | null {
  if (!value) return null;
  const str = String(value);
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: unknown): string | null {
  if (!value) return null;
  const str = String(value);
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatMoney(value: unknown, field: ResolvedPrintField): string | null {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (isNaN(num)) return null;
  const currency = field.money_config?.currency_code ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function formatDecimal(value: unknown): string | null {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (isNaN(num)) return null;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(num);
}

function formatInteger(value: unknown): string | null {
  const num = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (isNaN(num)) return null;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

export function formatPrintFieldValue(
  field: ResolvedPrintField,
  data: Record<string, unknown>,
): string | null {
  // Pre-resolved reference display value takes priority
  const displayKey = `${field.name}__display`;
  const raw = displayKey in data ? data[displayKey] : data[field.name];

  if (raw == null || raw === "") return null;

  switch (field.data_type) {
    case "boolean":
      return raw === true || raw === "true" || raw === 1 ? "Yes" : "No";
    case "date":
      return formatDate(raw);
    case "datetime":
    case "timestamptz":
    case "timestamp":
      return formatDateTime(raw);
    case "money":
      return formatMoney(raw, field);
    case "decimal":
    case "numeric":
      return formatDecimal(raw);
    case "integer":
    case "int":
    case "bigint":
      return formatInteger(raw);
    default:
      return String(raw);
  }
}
