/**
 * @athyper/entity-runtime — Default Field Renderers
 *
 * Built-in renderers for all standard data types.
 * Call registerDefaults() at app startup to populate the registry.
 */
import { useQuery } from "@tanstack/react-query";
import { Input, Checkbox, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@athyper/ui/primitives";
// Select primitives kept for EnumRenderer (LookupSelect).
import { DatePicker } from "@athyper/ui/composites";
import { EntityPicker } from "@athyper/runtime-shared/entity-search";
import { MoneySummary, QuantityUnit } from "@athyper/domain-widgets";
import { useLookupDomain } from "@athyper/query";
import { registerFieldRenderer, type FieldRendererProps } from "./registry";

// ── Text / String ───────────────────────────────────────────────

function TextRenderer({ value, field, mode, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    return <span className="text-sm">{String(value ?? "—")}</span>;
  }
  return (
    <Input
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={field.label ?? field.name}
      error={error}
    />
  );
}

// ── Number / Integer / Decimal ──────────────────────────────────

function NumberRenderer({ value, field, mode, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    if (field.unit) {
      return <QuantityUnit quantity={Number(value ?? 0)} unit={field.unit} />;
    }
    return <span className="text-sm tabular-nums">{value != null ? String(value) : "—"}</span>;
  }
  return (
    <Input
      type="number"
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.valueAsNumber)}
      placeholder={field.label ?? field.name}
      error={error}
    />
  );
}

// ── Boolean ─────────────────────────────────────────────────────

function BooleanRenderer({ value, mode, onChange }: FieldRendererProps) {
  if (mode === "view") {
    return <Badge variant={value ? "success" : "muted"}>{value ? "Yes" : "No"}</Badge>;
  }
  return (
    <Checkbox
      checked={Boolean(value)}
      onCheckedChange={(checked) => onChange?.(checked)}
    />
  );
}

// ── Date / DateTime ─────────────────────────────────────────────

function DateRenderer({ value, field, mode, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    if (!value) return <span className="text-sm text-muted-foreground">—</span>;
    const date = new Date(String(value));
    const formatted = field.data_type === "date"
      ? date.toLocaleDateString()
      : date.toLocaleString();
    return <span className="text-sm">{formatted}</span>;
  }
  return (
    <DatePicker
      value={value != null ? String(value) : null}
      mode={field.data_type === "date" ? "date" : "datetime"}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

// ── Money ───────────────────────────────────────────────────────

function MoneyRenderer({ value, mode, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    const data = value as { amount?: number; currency_code?: string } | null;
    if (!data?.amount) return <span className="text-sm text-muted-foreground">—</span>;
    return <MoneySummary amount={data.amount} currencyCode={data.currency_code ?? "USD"} />;
  }
  return (
    <Input
      type="number"
      step="0.01"
      value={String((value as { amount?: number })?.amount ?? "")}
      onChange={(e) => onChange?.({ amount: e.target.valueAsNumber })}
      error={error}
    />
  );
}

// ── Enum / Lookup ───────────────────────────────────────────────

function EnumRenderer({ value, field, mode, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    return <Badge variant="outline">{String(value ?? "—")}</Badge>;
  }
  return (
    <LookupSelect
      domainCode={field.enum_domain_code ?? ""}
      value={String(value ?? "")}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

interface LookupSelectProps {
  domainCode: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function LookupSelect({ domainCode, value, onChange, error }: LookupSelectProps) {
  const { data, isLoading } = useLookupDomain(domainCode);
  const activeValues = (data?.values ?? [])
    .filter((v) => v.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange} disabled={isLoading || !domainCode}>
        <SelectTrigger className={error ? "border-destructive" : undefined}>
          <SelectValue placeholder={isLoading ? "Loading…" : "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {activeValues.map((v) => (
            <SelectItem key={v.code} value={v.code}>
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── UUID ─────────────────────────────────────────────────────────

function UuidRenderer({ value, mode }: FieldRendererProps) {
  if (mode === "view") {
    const str = String(value ?? "");
    return <span className="font-mono text-xs text-muted-foreground">{str.slice(0, 8)}…</span>;
  }
  return <span className="text-sm">{String(value ?? "")}</span>;
}

// ── Reference (entity chooser) ───────────────────────────────────

function getReferenceEntityCode(field: FieldRendererProps["field"]): string | null {
  if (field.reference_config?.target_entity) return field.reference_config.target_entity;
  const v = field.validation_rules as Record<string, unknown> | null;
  if (v?.ref_entity) return String(v.ref_entity);
  return null;
}

function ReferencePickerField({
  entityCode,
  value,
  onChange,
  error,
}: {
  entityCode: string | null;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <EntityPicker
      entityCode={entityCode}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      disabled={!entityCode}
      error={error}
      placeholder="Search records…"
    />
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ReferenceRenderer({ value, field, mode, onChange, error }: FieldRendererProps) {
  const entityCode    = getReferenceEntityCode(field);
  const displayField  = field.reference_config?.display_field ?? "name";
  const uuid          = typeof value === "string" && UUID_RE.test(value) ? value : null;

  const { data: refRecord } = useQuery<{ data: Record<string, unknown> } | null>({
    queryKey: ["entity-ref", entityCode ?? "", uuid ?? ""],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode!)}/${encodeURIComponent(uuid!)}`,
        { signal },
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ data: Record<string, unknown> }>;
    },
    enabled: mode === "view" && !!entityCode && !!uuid,
    staleTime: 5 * 60 * 1000,
  });

  if (mode === "view") {
    if (!value) return <span className="text-sm text-muted-foreground">—</span>;
    const displayName = refRecord?.data?.[displayField];
    if (displayName && typeof displayName === "string") {
      return <span className="text-sm">{displayName}</span>;
    }
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {String(value).slice(0, 8)}…
      </span>
    );
  }

  return (
    <ReferencePickerField
      entityCode={entityCode}
      value={String(value ?? "")}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

// ── JSON ────────────────────────────────────────────────────────

function JsonRenderer({ value, mode }: FieldRendererProps) {
  if (mode === "view") {
    return (
      <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs font-mono">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <pre className="text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

// ── Registration ────────────────────────────────────────────────

/**
 * Register all default field renderers.
 * Call once at app startup (e.g. in apps/web providers).
 */
export function registerDefaults(): void {
  // Text family
  registerFieldRenderer("string", TextRenderer);
  registerFieldRenderer("text", TextRenderer);

  // Number family
  registerFieldRenderer("integer", NumberRenderer);
  registerFieldRenderer("bigint", NumberRenderer);
  registerFieldRenderer("decimal", NumberRenderer);
  registerFieldRenderer("numeric", NumberRenderer);

  // Boolean
  registerFieldRenderer("boolean", BooleanRenderer);

  // Date family
  registerFieldRenderer("date", DateRenderer);
  registerFieldRenderer("datetime", DateRenderer);
  registerFieldRenderer("timestamptz", DateRenderer);

  // Money
  registerFieldRenderer("money", MoneyRenderer);

  // Enum / Lookup
  registerFieldRenderer("enum", EnumRenderer);

  // UUID
  registerFieldRenderer("uuid", UuidRenderer);
  // Reference — entity chooser dropdown in edit mode
  registerFieldRenderer("reference", ReferenceRenderer);

  // JSON
  registerFieldRenderer("json", JsonRenderer);
  registerFieldRenderer("jsonb", JsonRenderer);
}
