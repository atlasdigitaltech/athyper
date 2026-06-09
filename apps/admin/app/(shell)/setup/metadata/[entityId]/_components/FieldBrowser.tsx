"use client";

import { useState } from "react";
import { DataTable, Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/ui";
import type { EntityField } from "./types";
import {
  BUSINESS_FIELD_ORIGIN,
  FIELD_CARDINALITIES,
  FIELD_CONTRACT_KEYS,
  FIELD_ORIGINS,
  asRecord,
  fieldIsReadonly,
  formatJson,
  parseJsonText,
  type JsonRecord,
} from "./metadataContract";

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    uuid: "bg-violet-100 text-violet-800",
    text: "bg-sky-100 text-sky-800",
    integer: "bg-amber-100 text-amber-800",
    numeric: "bg-amber-100 text-amber-800",
    decimal: "bg-amber-100 text-amber-800",
    boolean: "bg-green-100 text-green-800",
    timestamptz: "bg-rose-100 text-rose-800",
    date: "bg-rose-100 text-rose-800",
    json: "bg-slate-100 text-slate-700",
    jsonb: "bg-slate-100 text-slate-700",
    reference: "bg-cyan-100 text-cyan-800",
    enum: "bg-indigo-100 text-indigo-800",
  };
  const cls = map[type.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-medium ${cls}`}>{type}</span>;
}

function readErrorBody(res: Response): Promise<string> {
  return res.json()
    .then((body: { message?: string; error?: string }) => body.message ?? body.error ?? `${res.status}`)
    .catch(() => `${res.status}`);
}

function normalizeEditability(value: unknown): JsonRecord {
  const record = asRecord(value);
  if (Object.keys(record).length > 0) return record;
  if (value === "read_only") return { editable: false };
  if (value === "create_only") return { editable: true, editable_in: ["create"] };
  if (value === "conditional") return { editable: true, editable_when: {} };
  return { editable: true };
}

interface FieldDraft {
  group_key: string;
  enum_domain_code: string;
  reference_config: string;
  money_config: string;
  filter_config: string;
  ui_hint: string;
  editability: string;
  lookup_config: string;
  validation_rules: string;
  default_value: string;
  enum_config: string;
  visibility: string;
  constraints: string;
  lookup_profile: string;
}

function draftFromField(field: EntityField): FieldDraft {
  return {
    group_key: field.group_key ?? "",
    enum_domain_code: field.enum_domain_code ?? "",
    reference_config: formatJson(field.reference_config),
    money_config: formatJson(field.money_config),
    filter_config: formatJson(field.filter_config),
    ui_hint: formatJson(field.ui_hint),
    editability: formatJson(normalizeEditability(field.editability)),
    lookup_config: formatJson(field.lookup_config),
    validation_rules: formatJson(field.validation_rules),
    default_value: formatJson(field.default_value),
    enum_config: formatJson(field.enum_config),
    visibility: formatJson(field.visibility),
    constraints: formatJson(field.constraints),
    lookup_profile: formatJson(field.lookup_profile),
  };
}

function JsonTextareaField({
  label,
  value,
  onChange,
  disabled,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Textarea
        className="min-h-28 font-mono text-xs"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function JsonInspector({ label, value }: { label: string; value: unknown }) {
  const hasValue = value !== undefined && value !== null && JSON.stringify(value) !== "{}";
  if (!hasValue) return null;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <pre className="max-h-44 overflow-auto rounded border bg-muted/40 p-2 text-xs">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function parseDraftJson(draft: FieldDraft): { values: Record<string, unknown>; error: string | null } {
  const values: Record<string, unknown> = {
    group_key: draft.group_key.trim() || null,
    enum_domain_code: draft.enum_domain_code.trim() || null,
  };
  const jsonFields: Array<[keyof FieldDraft, boolean]> = [
    ["reference_config", true],
    ["money_config", true],
    ["filter_config", true],
    ["ui_hint", true],
    ["editability", true],
    ["lookup_config", true],
    ["validation_rules", true],
    ["enum_config", true],
    ["visibility", true],
    ["constraints", true],
    ["lookup_profile", true],
    ["default_value", false],
  ];
  for (const [key, objectOnly] of jsonFields) {
    const parsed = parseJsonText(draft[key], { objectOnly });
    if (!parsed.ok) return { values, error: `${key}: ${parsed.error}` };
    values[key] = parsed.value;
  }
  return { values, error: null };
}

function FieldContractSheet({
  field,
  open,
  onClose,
  onSaved,
}: {
  field: EntityField;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: EntityField) => void;
}) {
  const [draft, setDraft] = useState<FieldDraft>(() => draftFromField(field));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isBusinessField = field.origin === BUSINESS_FIELD_ORIGIN;

  async function save() {
    if (isBusinessField) {
      setErr("Tenant-created business fields cannot be edited from the platform Admin plane.");
      return;
    }
    const parsed = parseDraftJson(draft);
    if (parsed.error) {
      setErr(parsed.error);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch(`/api/relay/metadata/admin/entity-fields/${field.id}/contracts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.values),
      });
      if (!res.ok) throw new Error(await readErrorBody(res));
      const data = await res.json() as { item: EntityField };
      onSaved(data.item);
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const invalidCardinality = field.cardinality && !(FIELD_CARDINALITIES as readonly string[]).includes(field.cardinality);
  const invalidOrigin = !(FIELD_ORIGINS as readonly string[]).includes(field.origin);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{field.name}</SheetTitle>
          <SheetDescription>
            Contract properties are validated by the metadata registry before they are persisted.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 px-1">
          <div className="grid gap-3 rounded border p-3 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <TypeBadge type={field.data_type} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cardinality</p>
              <Badge variant={invalidCardinality ? "destructive" : "outline"} className="text-xs">{field.cardinality ?? "one"}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Origin</p>
              <Badge variant={invalidOrigin || isBusinessField ? "secondary" : "outline"} className="text-xs">{field.origin}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sort order</p>
              <span className="text-sm tabular-nums">{field.sort_order}</span>
            </div>
          </div>

          {isBusinessField && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This field is tenant-created. Platform Admin shows its contract for inspection but does not write over tenant-owned metadata.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Field group key</Label>
              <Input
                className="h-8 font-mono text-sm"
                disabled={isBusinessField}
                value={draft.group_key}
                onChange={(event) => setDraft((current) => ({ ...current, group_key: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Enum domain code</Label>
              <Input
                className="h-8 font-mono text-sm"
                disabled={isBusinessField}
                value={draft.enum_domain_code}
                onChange={(event) => setDraft((current) => ({ ...current, enum_domain_code: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <JsonTextareaField label="Editability" value={draft.editability} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, editability: value }))} />
            <JsonTextareaField label="UI hint" value={draft.ui_hint} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, ui_hint: value }))} />
            <JsonTextareaField label="Validation rules" value={draft.validation_rules} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, validation_rules: value }))} />
            <JsonTextareaField label="Default value" value={draft.default_value} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, default_value: value }))} description="Any JSON value is accepted." />
            <JsonTextareaField label="Reference config" value={draft.reference_config} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, reference_config: value }))} />
            <JsonTextareaField label="Lookup config" value={draft.lookup_config} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, lookup_config: value }))} />
            <JsonTextareaField label="Money config" value={draft.money_config} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, money_config: value }))} />
            <JsonTextareaField label="Filter config" value={draft.filter_config} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, filter_config: value }))} />
            <JsonTextareaField label="Inline enum config" value={draft.enum_config} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, enum_config: value }))} description="Grandfathered. Prefer enum domain code for new work." />
            <JsonTextareaField label="Legacy visibility migration input" value={draft.visibility} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, visibility: value }))} description="Normalized into ui_hint.display by the server." />
            <JsonTextareaField label="Constraints migration input" value={draft.constraints} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, constraints: value }))} description="Scalar constraints migrate to validation_rules; DB-only keys are rejected." />
            <JsonTextareaField label="Legacy lookup profile migration input" value={draft.lookup_profile} disabled={isBusinessField} onChange={(value) => setDraft((current) => ({ ...current, lookup_profile: value }))} description="Normalized into reference_config.picker by the server." />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <JsonInspector label="JSON config (reserved)" value={field.json_config} />
            <JsonInspector label="Date/time config (reserved)" value={field.datetime_config} />
            <JsonInspector label="Collection behavior (reserved)" value={field.collection_behavior} />
            <JsonInspector label="Compute expression (server-owned)" value={field.compute_expr} />
          </div>

          <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Authored properties: {FIELD_CONTRACT_KEYS.join(", ")}. Reserved and server-owned properties are shown for diagnostics only.
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || isBusinessField}>{saving ? "Saving..." : "Save contract"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function FieldBrowser({ fields: initialFields }: { fields: EntityField[] }) {
  const [fields, setFields] = useState(initialFields);
  const [q, setQ] = useState("");
  const [selectedField, setSelectedField] = useState<EntityField | null>(null);

  const filtered = q.trim()
    ? fields.filter((field) =>
        field.name.toLowerCase().includes(q.toLowerCase()) ||
        (field.label ?? "").toLowerCase().includes(q.toLowerCase()) ||
        field.data_type.toLowerCase().includes(q.toLowerCase()) ||
        (field.group_key ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : fields;

  const columns: ColumnDef<EntityField>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.name}</span>,
    },
    {
      id: "label",
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => <span className="text-sm">{row.original.label ?? "-"}</span>,
    },
    {
      id: "data_type",
      accessorKey: "data_type",
      header: "Type",
      cell: ({ row }) => <TypeBadge type={row.original.data_type} />,
    },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => {
        const field = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            {field.is_required && <Badge variant="secondary" className="px-1 py-0 text-xs">req</Badge>}
            {field.is_searchable && <Badge variant="outline" className="px-1 py-0 text-xs">srch</Badge>}
            {field.is_filterable && <Badge variant="outline" className="px-1 py-0 text-xs">filt</Badge>}
            {field.is_sortable && <Badge variant="outline" className="px-1 py-0 text-xs">sort</Badge>}
            {field.is_groupable && <Badge variant="outline" className="px-1 py-0 text-xs">grp</Badge>}
            {field.is_aggregatable && <Badge variant="outline" className="px-1 py-0 text-xs">agg</Badge>}
            {field.is_pii && <Badge variant="secondary" className="px-1 py-0 text-xs">pii</Badge>}
            {field.is_unique && <Badge variant="outline" className="px-1 py-0 text-xs">uniq</Badge>}
            {fieldIsReadonly(field) && <Badge variant="outline" className="px-1 py-0 text-xs">ro</Badge>}
          </div>
        );
      },
    },
    {
      id: "group_key",
      accessorKey: "group_key",
      header: "Group",
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.group_key ?? "-"}</span>,
    },
    {
      id: "origin",
      accessorKey: "origin",
      header: "Origin",
      cell: ({ row }) => (
        <Badge variant={row.original.origin === BUSINESS_FIELD_ORIGIN ? "secondary" : "outline"} className="text-xs">
          {row.original.origin}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(event) => { event.stopPropagation(); setSelectedField(row.original); }}
        >
          Contract
        </Button>
      ),
    },
  ];

  function handleSaved(updated: EntityField) {
    setFields((current) => current.map((field) => (field.id === updated.id ? updated : field)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-64 text-sm"
          placeholder="Filter fields..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">{filtered.length} fields</span>
      </div>

      <DataTable columns={columns} data={filtered} />

      {selectedField && (
        <FieldContractSheet
          field={selectedField}
          open={true}
          onClose={() => setSelectedField(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
