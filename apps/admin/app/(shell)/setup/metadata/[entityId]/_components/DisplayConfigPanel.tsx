"use client";

import { useState, useMemo } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import {
  Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge, Checkbox, Collapsible, CollapsibleTrigger, CollapsibleContent, Textarea, Separator, Switch,
} from "@athyper/ui";
import { TagsInput } from "@athyper/ui/composites";
import { ChevronDown, ChevronRight } from "lucide-react";
import { csrfFetch } from "@/lib/bff-fetch";
import type { EntityField } from "./types";

// ─── Local types ──────────────────────────────────────────────────────────────

type DetailRenderer = "master" | "document" | "ledger";
type DetailProfile  = "simple" | "rich" | "read-only";
type ListRenderer   = "table" | "kanban" | "dashboard" | "spreadsheet";
type ViewMode       = "table" | "compact" | "kanban" | "dashboard" | "spreadsheet";

const ALL_DETAIL_RENDERERS: DetailRenderer[] = ["master", "document", "ledger"];
const ALL_DETAIL_PROFILES:  DetailProfile[]  = ["simple", "rich", "read-only"];
const ALL_LIST_RENDERERS:   ListRenderer[]   = ["table", "kanban", "dashboard", "spreadsheet"];
const ALL_VIEW_MODES:       ViewMode[]       = ["table", "compact", "kanban", "dashboard", "spreadsheet"];
const ALL_LINES_RENDERERS = ["generic", "journal", "payment"];

// ─── Key catalogues ───────────────────────────────────────────────────────────

// Everything the typed UI handles — residual keys go to the advanced JSON section.
const KNOWN_TOP_KEYS = new Set([
  "title_field", "subtitle_field", "icon", "color",
  "list_columns", "compact_card",
  "default_sort_field", "default_sort_order",
  "list_renderer", "view_modes",
  "detail_renderer", "detail_profile",
  "lines_renderer",
  "status_field_names", "alternate_flows",
  "document_header",
  "print_config",
  "action_groups", "intake_modes", "create_redirect",
  "journal_editor", "journal_line_fields", "journal_reference_targets",
  "commodity_classification_config", "intake_fields",
  "allocation_display_labels", "allocation_primary_label", "allocation_primary_field",
  "allocation_primary_source", "allocation_primary_fallback_fields", "allocation_empty_primary_label",
  "accounting_distribution_config",
]);

// Complex nested keys inside document_header that are edited via the advanced textarea.
const DH_COMPLEX_KEYS = new Set([
  "stage_date_fields", "stage_key_aliases", "line_aggregates", "lifecycle_stages",
]);

// Simple string field-name keys inside document_header.
const DH_FIELD_KEYS = new Set([
  "number_field", "name_field", "title_field", "status_field",
  "party_name_field", "party_id_field", "company_code_field",
  "amount_field", "subtotal_field", "tax_field", "currency_field",
  "date_field", "due_date_field",
  "created_at_field", "created_by_field", "updated_at_field", "updated_by_field",
  "status_changed_at_field", "status_changed_by_field", "stage_date_field",
  "accounting_posted_field",
  "paid_amount_field", "payable_amount_field", "outstanding_amount_field",
  "match_status_field",
]);

// Simple label/text keys inside document_header.
const DH_LABEL_KEYS = new Set([
  "default_status", "type_label", "total_label", "date_label", "outstanding_label",
]);

// Array keys inside document_header shown as TagsInput.
const DH_ARRAY_KEYS = new Set(["editable_statuses", "edit_excluded_fields"]);

const ALL_PRINT_LAYOUT_MODES = ["standard", "two_column"] as const;
const ALL_PRINT_FIELD_COLUMNS = ["1", "2", "3"] as const;

// Groups for document_header display.
const DH_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Primary identity",
    keys: ["number_field", "name_field", "title_field", "status_field", "default_status", "type_label"],
  },
  {
    label: "Party",
    keys: ["party_name_field", "party_id_field", "company_code_field"],
  },
  {
    label: "Amounts",
    keys: ["amount_field", "subtotal_field", "tax_field", "currency_field", "total_label"],
  },
  {
    label: "Dates",
    keys: ["date_field", "due_date_field", "date_label"],
  },
  {
    label: "Settlement",
    keys: ["paid_amount_field", "payable_amount_field", "outstanding_amount_field", "outstanding_label", "match_status_field"],
  },
  {
    label: "Posting",
    keys: ["accounting_posted_field"],
  },
  {
    label: "Audit",
    keys: [
      "created_at_field", "created_by_field",
      "updated_at_field", "updated_by_field",
      "status_changed_at_field", "status_changed_by_field",
      "stage_date_field",
    ],
  },
];

// ─── Type-safe helpers ────────────────────────────────────────────────────────

function getStr(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

function getObj(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function parseJsonObject(str: string, label: string): { value: Record<string, unknown>; error: string | null } {
  if (!str.trim()) return { value: {}, error: null };
  try {
    const parsed = JSON.parse(str) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { value: parsed as Record<string, unknown>, error: null };
    }
    return { value: {}, error: `${label} must be a JSON object.` };
  } catch (err) {
    return {
      value: {},
      error: `${label} is not valid JSON${err instanceof Error ? `: ${err.message}` : "."}`,
    };
  }
}

function extractAdvanced(obj: Record<string, unknown>, knownKeys: Set<string>): Record<string, unknown> {
  const adv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!knownKeys.has(k)) adv[k] = v;
  }
  return adv;
}

function isEmptyConfigValue(value: unknown): boolean {
  return value === undefined
    || value === null
    || value === ""
    || (Array.isArray(value) && value.length === 0);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function invalidMembers(values: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string" && !allowed.has(value));
}

function validatePrintConfig(
  config: Record<string, unknown> | undefined,
  fieldNames: string[],
  groupKeys: string[],
): string[] {
  if (!config || Object.keys(config).length === 0) return [];

  const fieldSet = new Set(fieldNames);
  const groupSet = new Set(groupKeys);
  const errors: string[] = [];

  for (const key of ["header_pin_fields", "included_fields", "excluded_fields"] as const) {
    const invalid = invalidMembers(config[key], fieldSet);
    if (invalid.length > 0) errors.push(`print_config.${key} contains unknown fields: ${invalid.join(", ")}`);
  }

  const invalidGroupOrder = invalidMembers(config["group_order"], groupSet);
  if (invalidGroupOrder.length > 0) {
    errors.push(`print_config.group_order contains unknown groups: ${invalidGroupOrder.join(", ")}`);
  }

  const groupLabels = getObj(config, "group_label_overrides");
  const invalidGroupLabels = Object.keys(groupLabels).filter((key) => !groupSet.has(key));
  if (invalidGroupLabels.length > 0) {
    errors.push(`print_config.group_label_overrides contains unknown groups: ${invalidGroupLabels.join(", ")}`);
  }

  const fieldLabels = getObj(config, "field_label_overrides");
  const invalidFieldLabels = Object.keys(fieldLabels).filter((key) => !fieldSet.has(key));
  if (invalidFieldLabels.length > 0) {
    errors.push(`print_config.field_label_overrides contains unknown fields: ${invalidFieldLabels.join(", ")}`);
  }

  const sections = config["sections"];
  if (Array.isArray(sections)) {
    sections.forEach((section, index) => {
      const sectionObj = section !== null && typeof section === "object" && !Array.isArray(section)
        ? section as Record<string, unknown>
        : {};
      const invalid = invalidMembers(sectionObj["fields"], fieldSet);
      if (invalid.length > 0) {
        errors.push(`print_config.sections[${index}].fields contains unknown fields: ${invalid.join(", ")}`);
      }
    });
  }

  return errors;
}

// Extract the complex-key subset of document_header for the advanced textarea.
function initAdvanced(raw: Record<string, unknown>) {
  const dh = getObj(raw, "document_header");
  const dhComplex: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dh)) {
    if (DH_COMPLEX_KEYS.has(k)) dhComplex[k] = v;
  }
  const topAdv = extractAdvanced(raw, KNOWN_TOP_KEYS);
  return {
    dhAdv: Object.keys(dhComplex).length ? JSON.stringify(dhComplex, null, 2) : "",
    topAdv: Object.keys(topAdv).length ? JSON.stringify(topAdv, null, 2) : "",
  };
}

// ─── FieldSelect ──────────────────────────────────────────────────────────────

function FieldSelect({
  fields,
  value,
  onChange,
  placeholder = "— none —",
  filterFn,
}: {
  fields: EntityField[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  filterFn?: (f: EntityField) => boolean;
}) {
  const opts = filterFn ? fields.filter(filterFn) : fields;
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{placeholder}</SelectItem>
        {opts.map((f) => (
          <SelectItem key={f.name} value={f.name}>
            {f.label ? `${f.name} — ${f.label}` : f.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── AdvancedJsonSection ──────────────────────────────────────────────────────

function AdvancedJsonSection({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {label}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Textarea
          className="mt-2 font-mono text-xs"
          rows={8}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="{}"
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── DocHeaderSection ─────────────────────────────────────────────────────────

function DocHeaderSection({
  fields,
  dh,
  dhAdv,
  editing,
  onSetDH,
  onSetDHAdv,
}: {
  fields: EntityField[];
  dh: Record<string, unknown>;
  dhAdv: string;
  editing: boolean;
  onSetDH: (key: string, value: unknown) => void;
  onSetDHAdv: (v: string) => void;
}) {
  const fieldNames = useMemo(() => fields.map((f) => f.name), [fields]);

  return (
    <div className="space-y-5">
      {DH_GROUPS.map(({ label, keys }) => {
        const hasValues = keys.some((k) => getStr(dh, k));
        if (!editing && !hasValues) return null;
        return (
          <div key={label}>
            <p className="mb-2 text-xs font-mediumr text-muted-foreground">
              {label}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {keys.map((key) => {
                const val = getStr(dh, key);
                if (!editing && !val) return null;
                const isFieldKey = DH_FIELD_KEYS.has(key);
                return (
                  <div key={key} className="space-y-0.5">
                    <Label className="text-xs font-normal text-muted-foreground">
                      {key.replace(/_/g, " ")}
                    </Label>
                    {editing ? (
                      isFieldKey ? (
                        <FieldSelect
                          fields={fields}
                          value={val}
                          onChange={(v) => onSetDH(key, v || undefined)}
                        />
                      ) : (
                        <Input
                          className="h-8 text-sm"
                          value={val}
                          onChange={(e) => onSetDH(key, e.target.value || undefined)}
                          placeholder="—"
                        />
                      )
                    ) : (
                      <span className="text-sm">{val}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Editable statuses */}
      {(editing || getArr(dh, "editable_statuses").length > 0) && (
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">editable statuses</Label>
          {editing ? (
            <TagsInput
              value={getArr(dh, "editable_statuses")}
              onChange={(v) => onSetDH("editable_statuses", v.length ? v : undefined)}
              placeholder="Add status value…"
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {getArr(dh, "editable_statuses").map((s) => (
                <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit excluded fields */}
      {(editing || getArr(dh, "edit_excluded_fields").length > 0) && (
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">edit excluded fields</Label>
          {editing ? (
            <TagsInput
              value={getArr(dh, "edit_excluded_fields")}
              onChange={(v) => onSetDH("edit_excluded_fields", v.length ? v : undefined)}
              suggestions={fieldNames}
              placeholder="Add field name…"
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {getArr(dh, "edit_excluded_fields").map((s) => (
                <Badge key={s} variant="outline" className="font-mono text-xs">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Complex nested keys: lifecycle_stages, stage_date_fields, line_aggregates */}
      <AdvancedJsonSection
        label="Nested config (lifecycle_stages, stage_date_fields, line_aggregates, stage_key_aliases)"
        value={dhAdv}
        onChange={onSetDHAdv}
        disabled={!editing}
      />
    </div>
  );
}

function PrintConfigSection({
  fields,
  groupKeys,
  printConfig,
  editing,
  onSetPrintKey,
  onSetPrintLayoutKey,
  onSetGroupLabel,
}: {
  fields: EntityField[];
  groupKeys: string[];
  printConfig: Record<string, unknown>;
  editing: boolean;
  onSetPrintKey: (key: string, value: unknown) => void;
  onSetPrintLayoutKey: (key: string, value: unknown) => void;
  onSetGroupLabel: (groupKey: string, value: string) => void;
}) {
  const fieldNames = useMemo(() => fields.map((f) => f.name), [fields]);
  const layout = getObj(printConfig, "layout");
  const labelOverrides = getObj(printConfig, "group_label_overrides");
  const labelKeys = uniqueStrings([...groupKeys, ...Object.keys(labelOverrides)]);
  const printEnabled = printConfig["enabled"] === true;
  const fieldColumns = layout["field_columns"];

  return (
    <section>
      <p className="mb-3 text-xs font-mediumr text-muted-foreground">
        Print
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Switch
            id="print-enabled"
            checked={printEnabled}
            disabled={!editing}
            onCheckedChange={(v) => onSetPrintKey("enabled", v)}
          />
          <Label htmlFor="print-enabled" className="text-sm">Print enabled</Label>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">layout mode</Label>
          {editing ? (
            <Select
              value={typeof layout["mode"] === "string" ? layout["mode"] : "standard"}
              onValueChange={(v) => onSetPrintLayoutKey("mode", v)}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_PRINT_LAYOUT_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{String(layout["mode"] ?? "standard")}</Badge>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">field columns</Label>
          {editing ? (
            <Select
              value={typeof fieldColumns === "number" ? String(fieldColumns) : "__default__"}
              onValueChange={(v) => onSetPrintLayoutKey("field_columns", v === "__default__" ? undefined : Number(v))}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">default</SelectItem>
                {ALL_PRINT_FIELD_COLUMNS.map((count) => (
                  <SelectItem key={count} value={count}>{count}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{typeof fieldColumns === "number" ? fieldColumns : "default"}</Badge>
          )}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">header pin fields</Label>
          {editing ? (
            <TagsInput
              value={getArr(printConfig, "header_pin_fields")}
              onChange={(v) => onSetPrintKey("header_pin_fields", v)}
              suggestions={fieldNames}
              placeholder="Add field name..."
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {getArr(printConfig, "header_pin_fields").length > 0 ? (
                getArr(printConfig, "header_pin_fields").map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs">{field}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">group order</Label>
          {editing ? (
            <TagsInput
              value={getArr(printConfig, "group_order")}
              onChange={(v) => onSetPrintKey("group_order", v)}
              suggestions={groupKeys}
              placeholder="Add group key..."
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {getArr(printConfig, "group_order").length > 0 ? (
                getArr(printConfig, "group_order").map((group) => (
                  <Badge key={group} variant="outline" className="font-mono text-xs">{group}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">included fields</Label>
          {editing ? (
            <TagsInput
              value={getArr(printConfig, "included_fields")}
              onChange={(v) => onSetPrintKey("included_fields", v)}
              suggestions={fieldNames}
              placeholder="Add field name..."
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {getArr(printConfig, "included_fields").length > 0 ? (
                getArr(printConfig, "included_fields").map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs">{field}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">excluded fields</Label>
          {editing ? (
            <TagsInput
              value={getArr(printConfig, "excluded_fields")}
              onChange={(v) => onSetPrintKey("excluded_fields", v)}
              suggestions={fieldNames}
              placeholder="Add field name..."
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {getArr(printConfig, "excluded_fields").length > 0 ? (
                getArr(printConfig, "excluded_fields").map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs">{field}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          )}
        </div>

        {(editing || labelKeys.length > 0) && (
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs">group labels</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {labelKeys.map((groupKey) => (
                <div key={groupKey} className="space-y-1">
                  <Label className="font-mono text-xs text-muted-foreground">{groupKey}</Label>
                  {editing ? (
                    <Input
                      className="h-8 text-sm"
                      value={typeof labelOverrides[groupKey] === "string" ? labelOverrides[groupKey] : ""}
                      onChange={(e) => onSetGroupLabel(groupKey, e.target.value)}
                      placeholder={groupKey.replace(/[_-]+/g, " ")}
                    />
                  ) : (
                    <span className="text-sm">
                      {typeof labelOverrides[groupKey] === "string" ? labelOverrides[groupKey] : "-"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── DisplayConfigPanel ───────────────────────────────────────────────────────

export function DisplayConfigPanel({
  config,
  fields,
  entityId,
  onSaved,
}: {
  config: Record<string, unknown>;
  fields: EntityField[];
  entityId: string;
  onSaved: (v: Record<string, unknown>) => void;
}) {
  const fieldNames = useMemo(() => fields.map((f) => f.name), [fields]);
  const groupKeys = useMemo(() => uniqueStrings(fields.map((f) => f.group_key)), [fields]);

  const { dhAdv: initDhAdv, topAdv: initTopAdv } = useMemo(() => initAdvanced(config), []);

  const [draft, setDraft] = useState<Record<string, unknown>>(config);
  const [dhAdv, setDhAdv] = useState(initDhAdv);
  const [topAdv, setTopAdv] = useState(initTopAdv);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dhOpen, setDhOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const dh             = getObj(draft, "document_header");
  const detailRenderer = (getStr(draft, "detail_renderer") || "master") as DetailRenderer;
  const listColumns    = getArr(draft, "list_columns");
  const viewModes      = getArr(draft, "view_modes") as ViewMode[];
  const statusFields   = getArr(draft, "status_field_names");
  const altFlows       = getArr(draft, "alternate_flows");
  const hasDocHeader   = Object.keys(dh).length > 0 || detailRenderer === "document";
  const printConfig    = getObj(draft, "print_config");

  // ── Setters ──────────────────────────────────────────────────────────────────

  function setKey(key: string, value: unknown) {
    setDraft((d) => {
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
        const next = { ...d };
        delete next[key];
        return next;
      }
      return { ...d, [key]: value };
    });
  }

  function setDHKey(key: string, value: unknown) {
    setDraft((d) => {
      const prevDH = getObj(d, "document_header");
      const nextDH = { ...prevDH };
      if (value === undefined || value === null || value === "") {
        delete nextDH[key];
      } else {
        nextDH[key] = value;
      }
      if (Object.keys(nextDH).length === 0) {
        const next = { ...d };
        delete next["document_header"];
        return next;
      }
      return { ...d, document_header: nextDH };
    });
  }

  function setPrintKey(key: string, value: unknown) {
    setDraft((d) => {
      const nextPrint = { ...getObj(d, "print_config") };
      if (isEmptyConfigValue(value)) {
        delete nextPrint[key];
      } else {
        nextPrint[key] = value;
      }
      return { ...d, print_config: nextPrint };
    });
  }

  function setPrintLayoutKey(key: string, value: unknown) {
    setDraft((d) => {
      const nextPrint = { ...getObj(d, "print_config") };
      const nextLayout = { ...getObj(nextPrint, "layout") };
      if (isEmptyConfigValue(value)) {
        delete nextLayout[key];
      } else {
        nextLayout[key] = value;
      }
      if (Object.keys(nextLayout).length > 0) {
        nextPrint["layout"] = nextLayout;
      } else {
        delete nextPrint["layout"];
      }
      return { ...d, print_config: nextPrint };
    });
  }

  function setPrintGroupLabel(groupKey: string, value: string) {
    setDraft((d) => {
      const nextPrint = { ...getObj(d, "print_config") };
      const nextLabels = { ...getObj(nextPrint, "group_label_overrides") };
      if (value.trim()) {
        nextLabels[groupKey] = value.trim();
      } else {
        delete nextLabels[groupKey];
      }
      if (Object.keys(nextLabels).length > 0) {
        nextPrint["group_label_overrides"] = nextLabels;
      } else {
        delete nextPrint["group_label_overrides"];
      }
      return { ...d, print_config: nextPrint };
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Strip complex DH keys from draft.document_header, then overlay dhAdv.
      const currentDH = getObj(draft, "document_header");
      const dhSimple: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(currentDH)) {
        if (!DH_COMPLEX_KEYS.has(k)) dhSimple[k] = v;
      }
      const dhParsed = parseJsonObject(dhAdv, "Nested document header config");
      if (dhParsed.error) {
        setError(dhParsed.error);
        return;
      }
      const finalDH = { ...dhSimple, ...dhParsed.value };

      // Strip unknown top-level keys from draft, then overlay topAdv.
      const draftKnown: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(draft)) {
        if (KNOWN_TOP_KEYS.has(k)) draftKnown[k] = v;
      }
      const topParsed = parseJsonObject(topAdv, "Advanced display config");
      if (topParsed.error) {
        setError(topParsed.error);
        return;
      }
      const finalConfig: Record<string, unknown> = { ...topParsed.value, ...draftKnown };

      if (Object.keys(finalDH).length) {
        finalConfig.document_header = finalDH;
      } else {
        delete finalConfig.document_header;
      }

      const printErrors = validatePrintConfig(getObj(finalConfig, "print_config"), fieldNames, groupKeys);
      if (printErrors.length > 0) {
        setError(printErrors.join("\n"));
        return;
      }

      const res = await csrfFetch(`/api/relay/metadata/admin/entities/${entityId}/contracts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_config: finalConfig }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { item: { display_config: Record<string, unknown> } };
      const saved = (data.item.display_config ?? finalConfig) as Record<string, unknown>;
      onSaved(saved);
      setDraft(saved);
      const re = initAdvanced(saved);
      setDhAdv(re.dhAdv);
      setTopAdv(re.topAdv);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    const re = initAdvanced(config);
    setDraft(config);
    setDhAdv(re.dhAdv);
    setTopAdv(re.topAdv);
    setError(null);
    setEditing(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <WorkPanel
      title="Display config"
      description="Rendering strategy, visible columns, sort defaults, identity fields, and document header."
      actions={
        editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancel}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
        )
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* ── 1. Identity ─────────────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-mediumr text-muted-foreground">
            Identity
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">title field</Label>
              {editing ? (
                <FieldSelect
                  fields={fields}
                  value={getStr(draft, "title_field")}
                  onChange={(v) => setKey("title_field", v || undefined)}
                />
              ) : (
                <span className="text-sm">
                  {getStr(draft, "title_field") || <span className="text-muted-foreground">—</span>}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">subtitle field</Label>
              {editing ? (
                <FieldSelect
                  fields={fields}
                  value={getStr(draft, "subtitle_field")}
                  onChange={(v) => setKey("subtitle_field", v || undefined)}
                />
              ) : (
                <span className="text-sm">
                  {getStr(draft, "subtitle_field") || <span className="text-muted-foreground">—</span>}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">icon</Label>
              {editing ? (
                <Input
                  className="h-8 text-sm"
                  value={getStr(draft, "icon")}
                  onChange={(e) => setKey("icon", e.target.value || undefined)}
                  placeholder="icon key"
                />
              ) : (
                <span className="text-sm">
                  {getStr(draft, "icon") || <span className="text-muted-foreground">—</span>}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">color</Label>
              {editing ? (
                <Input
                  className="h-8 text-sm"
                  value={getStr(draft, "color")}
                  onChange={(e) => setKey("color", e.target.value || undefined)}
                  placeholder="color token"
                />
              ) : (
                <span className="text-sm">
                  {getStr(draft, "color") || <span className="text-muted-foreground">—</span>}
                </span>
              )}
            </div>
          </div>
        </section>

        <Separator />

        {/* ── 2. List View ─────────────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-mediumr text-muted-foreground">
            List View
          </p>
          <div className="grid gap-3 sm:grid-cols-2">

            {/* list columns — full width */}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">list columns</Label>
              {editing ? (
                <TagsInput
                  value={listColumns}
                  onChange={(v) => setKey("list_columns", v)}
                  suggestions={fieldNames}
                  placeholder="Add field name…"
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {listColumns.length > 0 ? (
                    listColumns.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">list renderer</Label>
              {editing ? (
                <Select
                  value={getStr(draft, "list_renderer") || "table"}
                  onValueChange={(v) => setKey("list_renderer", v)}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_LIST_RENDERERS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">{getStr(draft, "list_renderer") || "table"}</Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">default sort field</Label>
              {editing ? (
                <FieldSelect
                  fields={fields}
                  value={getStr(draft, "default_sort_field")}
                  onChange={(v) => setKey("default_sort_field", v || "")}
                  filterFn={(f) => f.is_sortable}
                  placeholder="— none —"
                />
              ) : (
                <span className="text-sm">
                  {getStr(draft, "default_sort_field") || <span className="text-muted-foreground">—</span>}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">default sort order</Label>
              {editing ? (
                <div className="flex gap-1">
                  {(["asc", "desc"] as const).map((o) => (
                    <Button
                      key={o}
                      type="button"
                      size="sm"
                      variant={
                        (getStr(draft, "default_sort_order") || "desc") === o
                          ? "primary"
                          : "outline"
                      }
                      className="h-8 text-xs"
                      onClick={() => setKey("default_sort_order", o)}
                    >
                      {o === "asc" ? "↑ Asc" : "↓ Desc"}
                    </Button>
                  ))}
                </div>
              ) : (
                <Badge variant="outline">
                  {(getStr(draft, "default_sort_order") || "desc") === "asc" ? "↑ Asc" : "↓ Desc"}
                </Badge>
              )}
            </div>

            {/* view modes — full width */}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">view modes</Label>
              {editing ? (
                <div className="flex flex-wrap gap-3">
                  {ALL_VIEW_MODES.map((m) => (
                    <div key={m} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`vm-${m}`}
                        checked={viewModes.includes(m)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...viewModes, m]
                            : viewModes.filter((x) => x !== m);
                          setKey("view_modes", next.length ? next : undefined);
                        }}
                      />
                      <Label htmlFor={`vm-${m}`} className="text-xs font-normal">{m}</Label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {viewModes.length > 0 ? (
                    viewModes.map((m) => (
                      <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <Separator />

        {/* ── 3. Detail View ───────────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-mediumr text-muted-foreground">
            Detail View
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">detail renderer</Label>
              {editing ? (
                <Select value={detailRenderer} onValueChange={(v) => setKey("detail_renderer", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_DETAIL_RENDERERS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">{detailRenderer}</Badge>
              )}
            </div>

            {/* detail profile — only relevant for master renderer */}
            {(editing || getStr(draft, "detail_profile")) && (
              <div className="space-y-1">
                <Label className="text-xs">
                  detail profile
                  {editing && detailRenderer !== "master" && (
                    <span className="ml-1 text-muted-foreground">(master only)</span>
                  )}
                </Label>
                {editing ? (
                  <Select
                    value={getStr(draft, "detail_profile") || "simple"}
                    onValueChange={(v) => setKey("detail_profile", v)}
                    disabled={detailRenderer !== "master"}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_DETAIL_PROFILES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{getStr(draft, "detail_profile") || "simple"}</Badge>
                )}
              </div>
            )}

            {/* lines renderer — only relevant for document renderer */}
            {(editing || getStr(draft, "lines_renderer")) && (
              <div className="space-y-1">
                <Label className="text-xs">
                  lines renderer
                  {editing && detailRenderer !== "document" && (
                    <span className="ml-1 text-muted-foreground">(document only)</span>
                  )}
                </Label>
                {editing ? (
                  <Select
                    value={getStr(draft, "lines_renderer") || "__none__"}
                    onValueChange={(v) => setKey("lines_renderer", v === "__none__" ? null : v)}
                    disabled={detailRenderer !== "document"}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {ALL_LINES_RENDERERS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{getStr(draft, "lines_renderer") || "—"}</Badge>
                )}
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* ── 4. Lifecycle ─────────────────────────────────────────────────── */}
        <PrintConfigSection
          fields={fields}
          groupKeys={groupKeys}
          printConfig={printConfig}
          editing={editing}
          onSetPrintKey={setPrintKey}
          onSetPrintLayoutKey={setPrintLayoutKey}
          onSetGroupLabel={setPrintGroupLabel}
        />

        <Separator />

        <section>
          <p className="mb-3 text-xs font-mediumr text-muted-foreground">
            Lifecycle
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">status field names</Label>
              {editing ? (
                <TagsInput
                  value={statusFields}
                  onChange={(v) => setKey("status_field_names", v)}
                  suggestions={fieldNames}
                  placeholder="Add field name…"
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {statusFields.length > 0 ? (
                    statusFields.map((s) => (
                      <Badge key={s} variant="outline" className="font-mono text-xs">{s}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">alternate flows</Label>
              {editing ? (
                <TagsInput
                  value={altFlows}
                  onChange={(v) => setKey("alternate_flows", v)}
                  placeholder="Add flow code…"
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {altFlows.length > 0 ? (
                    altFlows.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 5. Document Header ───────────────────────────────────────────── */}
        {(hasDocHeader || editing) && (
          <>
            <Separator />
            <section>
              <Collapsible open={dhOpen || editing} onOpenChange={setDhOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-xs font-mediumr text-muted-foreground hover:text-foreground"
                  >
                    <span>Document Header</span>
                    {dhOpen || editing ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  {editing && detailRenderer !== "document" && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      Switch detail renderer to <strong>document</strong> to activate these field mappings at runtime.
                    </p>
                  )}
                  <DocHeaderSection
                    fields={fields}
                    dh={dh}
                    dhAdv={dhAdv}
                    editing={editing}
                    onSetDH={setDHKey}
                    onSetDHAdv={setDhAdv}
                  />
                </CollapsibleContent>
              </Collapsible>
            </section>
          </>
        )}

        {/* ── 6. Advanced top-level JSON ───────────────────────────────────── */}
        {(topAdv || editing) && (
          <>
            <Separator />
            <AdvancedJsonSection
              label="Advanced config (action_groups, intake_modes, allocation_config…)"
              value={topAdv}
              onChange={setTopAdv}
              disabled={!editing}
            />
          </>
        )}
      </div>
    </WorkPanel>
  );
}
