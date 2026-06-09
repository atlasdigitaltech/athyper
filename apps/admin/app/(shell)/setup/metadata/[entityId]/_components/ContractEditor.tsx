"use client";

import { useMemo, useState } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from "@athyper/ui";
import { TagsInput } from "@athyper/ui/composites";
import { csrfFetch } from "@/lib/bff-fetch";
import type { EntityDetail, EntityField } from "./types";
import { DisplayConfigPanel } from "./DisplayConfigPanel";
import {
  ADVANCED_FEATURE_FLAG_KEYS,
  CLASSIFICATION_OPTIONS,
  FEATURE_FLAG_KEYS,
  IDENTITY_CONFIG_KEYS,
  SEARCH_CONFIG_KEYS,
  asRecord,
  fieldIsReadonly,
  formatJson,
  hasUnknownKeys,
  normalizeClassification,
  numberOrUndefined,
  parseJsonText,
  stringArray,
  uniqueStrings,
  type JsonRecord,
} from "./metadataContract";

function labelForKey(key: string): string {
  return key
    .replace(/^has_/, "")
    .replace(/^is_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `${res.status}`;
}

async function saveEntityContract(
  entityId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await csrfFetch(`/api/relay/metadata/admin/entities/${entityId}/contracts`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json() as { item: Record<string, unknown> };
  return data.item;
}

function JsonEditor({
  label,
  description,
  value,
  onChange,
  disabled,
  objectOnly = true,
}: {
  label: string;
  description?: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  objectOnly?: boolean;
}) {
  const [text, setText] = useState(formatJson(value));
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const parsed = parseJsonText(text, { objectOnly });
    if (!parsed.ok) {
      setError(parsed.error ?? "Invalid JSON.");
      return false;
    }
    setError(null);
    onChange(parsed.value);
    return true;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={apply}>
            Apply JSON
          </Button>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Textarea
        className="min-h-28 font-mono text-xs"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => { if (!disabled) apply(); }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ContractHealthPanel({ entity }: { entity: EntityDetail }) {
  const flags = asRecord(entity.feature_flags);
  const display = asRecord(entity.display_config);
  const identity = asRecord(entity.identity_config);
  const search = asRecord(entity.search_config);
  const fieldNames = new Set(entity.fields.map((field) => field.name));

  const issues = useMemo(() => {
    const next: Array<{ severity: "error" | "warning"; message: string }> = [];
    for (const field of entity.fields) {
      if (!field.label) next.push({ severity: "warning", message: `Field ${field.name} has no display label.` });
      if (field.cardinality && !["one", "many", "zero_or_one"].includes(field.cardinality)) {
        next.push({ severity: "error", message: `Field ${field.name} has invalid cardinality '${field.cardinality}'.` });
      }
      if (!["system", "standard", "business"].includes(field.origin)) {
        next.push({ severity: "error", message: `Field ${field.name} has invalid origin '${field.origin}'.` });
      }
    }
    for (const key of stringArray(display["list_columns"])) {
      if (!fieldNames.has(key)) next.push({ severity: "error", message: `List column '${key}' does not match a field.` });
    }
    for (const key of stringArray(search["fields"])) {
      if (!fieldNames.has(key)) next.push({ severity: "error", message: `Search field '${key}' does not match a field.` });
    }
    for (const key of stringArray(identity["natural_key_fields"])) {
      if (!fieldNames.has(key)) next.push({ severity: "error", message: `Natural key field '${key}' does not match a field.` });
    }
    if (flags["has_workflow"] === true && flags["has_lifecycle"] !== true && !Array.isArray(display["lifecycle_stages"])) {
      next.push({ severity: "warning", message: "Workflow is enabled without lifecycle stages or lifecycle flag." });
    }
    return next;
  }, [display, entity.fields, fieldNames, flags, identity, search]);

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <WorkPanel
      title="Contract health"
      description="Static validation across entity, fields, display, identity, search, lifecycle, and workflow hints."
      actions={
        <div className="flex gap-2">
          <Badge variant={errors > 0 ? "destructive" : "outline"}>{errors} errors</Badge>
          <Badge variant={warnings > 0 ? "secondary" : "outline"}>{warnings} warnings</Badge>
        </div>
      }
    >
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No local contract issues detected.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {issues.slice(0, 12).map((issue, index) => (
            <div key={`${issue.message}-${index}`} className="rounded border px-3 py-2 text-xs">
              <Badge variant={issue.severity === "error" ? "destructive" : "secondary"} className="mb-1 text-xs">
                {issue.severity}
              </Badge>
              <p>{issue.message}</p>
            </div>
          ))}
        </div>
      )}
    </WorkPanel>
  );
}

function FeatureFlagsPanel({
  flags,
  entityId,
  onSaved,
}: {
  flags: JsonRecord;
  entityId: string;
  onSaved: (flags: JsonRecord) => void;
}) {
  const [draft, setDraft] = useState<JsonRecord>(flags);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allAllowed = [...FEATURE_FLAG_KEYS, ...ADVANCED_FEATURE_FLAG_KEYS];
  const unknownKeys = hasUnknownKeys(draft, allAllowed);

  async function save() {
    setError(null);
    const unknown = hasUnknownKeys(draft, allAllowed);
    if (unknown.length > 0) {
      setError(`Remove unsupported feature flags before saving: ${unknown.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const item = await saveEntityContract(entityId, { feature_flags: draft });
      const updated = asRecord(item["feature_flags"] ?? draft);
      onSaved(updated);
      setDraft(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkPanel
      title="Capabilities"
      description="Registered feature flags consumed by runtime, workflow, lifecycle, import/export, collaboration, and document surfaces."
      actions={
        editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(flags); setEditing(false); setError(null); }}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {FEATURE_FLAG_KEYS.map((key) => (
          <div key={key} className="flex min-h-7 items-center gap-2">
            <Switch
              id={`flag-${key}`}
              checked={Boolean(draft[key])}
              disabled={!editing}
              onCheckedChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
            />
            <Label htmlFor={`flag-${key}`} className="text-xs">{labelForKey(key)}</Label>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">SLA target hours</Label>
          <Input
            className="h-8 text-sm"
            type="number"
            disabled={!editing}
            value={String(draft["sla_target_hours"] ?? "")}
            onChange={(event) => setDraft((current) => ({ ...current, sla_target_hours: numberOrUndefined(event.target.value) }))}
          />
        </div>
        {["document_category", "owner_type_column", "default_owner_type_scope", "default_owner_type", "role_entity", "party_category", "replacement_for"].map((key) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{labelForKey(key)}</Label>
            <Input
              className="h-8 text-sm"
              disabled={!editing}
              value={String(draft[key] ?? "")}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value || undefined }))}
            />
          </div>
        ))}
        <JsonEditor
          label="Reference picker"
          value={draft["reference_picker"] ?? {}}
          disabled={!editing}
          onChange={(value) => setDraft((current) => ({ ...current, reference_picker: value ?? undefined }))}
        />
        <JsonEditor
          label="Line editor"
          value={draft["line_editor"] ?? {}}
          disabled={!editing}
          onChange={(value) => setDraft((current) => ({ ...current, line_editor: value ?? undefined }))}
        />
      </div>

      {unknownKeys.length > 0 && (
        <div className="mt-4 rounded border border-destructive/40 px-3 py-2 text-xs text-destructive">
          Unsupported flags: {unknownKeys.join(", ")}
          {editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-3 h-7 text-xs"
              onClick={() => setDraft((current) => {
                const next = { ...current };
                for (const key of unknownKeys) delete next[key];
                return next;
              })}
            >
              Remove unsupported
            </Button>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </WorkPanel>
  );
}

function DataPolicyPanel({
  policy,
  fields,
  entityId,
  onSaved,
}: {
  policy: JsonRecord;
  fields: EntityField[];
  entityId: string;
  onSaved: (policy: JsonRecord) => void;
}) {
  const fieldNames = fields.map((field) => field.name);
  const [draft, setDraft] = useState<JsonRecord>(() => ({
    classification: normalizeClassification(policy["classification"] ?? policy["pii_classification"]),
    pii_fields: stringArray(policy["pii_fields"]),
    retention_days: policy["retention_days"],
    legal_hold_eligible: policy["legal_hold_eligible"] === true,
    anonymize_on_delete: policy["anonymize_on_delete"] === true || policy["soft_delete"] === true,
  }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const canonical: JsonRecord = {
        classification: normalizeClassification(draft["classification"]),
        pii_fields: stringArray(draft["pii_fields"]),
        legal_hold_eligible: draft["legal_hold_eligible"] === true,
        anonymize_on_delete: draft["anonymize_on_delete"] === true,
      };
      const retentionDays = Number(draft["retention_days"]);
      if (Number.isInteger(retentionDays) && retentionDays > 0) canonical["retention_days"] = retentionDays;
      const item = await saveEntityContract(entityId, { data_policy: canonical });
      const updated = asRecord(item["data_policy"] ?? canonical);
      onSaved(updated);
      setDraft(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkPanel
      title="Data policy"
      description="Classification, PII fields, retention, legal hold, and delete posture."
      actions={
        editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(policy); setEditing(false); setError(null); }}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Classification</Label>
          <Select disabled={!editing} value={String(draft["classification"] ?? "internal")} onValueChange={(value) => setDraft((current) => ({ ...current, classification: value }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CLASSIFICATION_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Retention days</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            disabled={!editing}
            value={String(draft["retention_days"] ?? "")}
            onChange={(event) => setDraft((current) => ({ ...current, retention_days: numberOrUndefined(event.target.value) }))}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">PII fields</Label>
          <TagsInput
            value={stringArray(draft["pii_fields"])}
            onChange={(value) => setDraft((current) => ({ ...current, pii_fields: uniqueStrings(value) }))}
            suggestions={fieldNames}
            disabled={!editing}
            placeholder="Add field name..."
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="legal-hold" checked={draft["legal_hold_eligible"] === true} disabled={!editing} onCheckedChange={(value) => setDraft((current) => ({ ...current, legal_hold_eligible: value }))} />
          <Label htmlFor="legal-hold" className="text-sm">Legal hold eligible</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="anonymize-delete" checked={draft["anonymize_on_delete"] === true} disabled={!editing} onCheckedChange={(value) => setDraft((current) => ({ ...current, anonymize_on_delete: value }))} />
          <Label htmlFor="anonymize-delete" className="text-sm">Anonymize on delete</Label>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </WorkPanel>
  );
}

function IdentityConfigPanel({
  value,
  fields,
  entityId,
  onSaved,
}: {
  value: JsonRecord;
  fields: EntityField[];
  entityId: string;
  onSaved: (value: JsonRecord) => void;
}) {
  const fieldNames = fields.map((field) => field.name);
  const [draft, setDraft] = useState<JsonRecord>(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unknownKeys = hasUnknownKeys(draft, IDENTITY_CONFIG_KEYS);

  async function save() {
    setError(null);
    if (unknownKeys.length > 0) {
      setError(`Remove unsupported identity keys before saving: ${unknownKeys.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const item = await saveEntityContract(entityId, { identity_config: draft });
      const updated = asRecord(item["identity_config"] ?? draft);
      onSaved(updated);
      setDraft(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkPanel
      title="Identity contract"
      description="Primary, business, natural, parent, numbering, duplicate, and replacement identity metadata."
      actions={
        editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(value); setEditing(false); setError(null); }}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Primary key field</Label>
          <Select disabled={!editing} value={String(draft["primary_key_field"] ?? "")} onValueChange={(selected) => setDraft((current) => ({ ...current, primary_key_field: selected || undefined }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select field" /></SelectTrigger>
            <SelectContent className="max-h-64 overflow-y-auto">
              {fieldNames.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">List entity code</Label>
          <Input className="h-8 text-sm" disabled={!editing} value={String(draft["list_entity_code"] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, list_entity_code: event.target.value || undefined }))} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Business key fields</Label>
          <TagsInput disabled={!editing} value={stringArray(draft["business_key_fields"])} suggestions={fieldNames} onChange={(value) => setDraft((current) => ({ ...current, business_key_fields: uniqueStrings(value) }))} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Natural key fields</Label>
          <TagsInput disabled={!editing} value={stringArray(draft["natural_key_fields"])} suggestions={fieldNames} onChange={(value) => setDraft((current) => ({ ...current, natural_key_fields: uniqueStrings(value) }))} />
        </div>
        <JsonEditor label="Numbering" value={draft["numbering"] ?? {}} disabled={!editing} onChange={(json) => setDraft((current) => ({ ...current, numbering: json ?? undefined }))} />
        <JsonEditor label="Identity via" value={draft["identity_via"] ?? {}} disabled={!editing} onChange={(json) => setDraft((current) => ({ ...current, identity_via: json ?? undefined }))} />
        <JsonEditor label="Parent" value={draft["parent"] ?? {}} disabled={!editing} onChange={(json) => setDraft((current) => ({ ...current, parent: json ?? undefined }))} />
        <JsonEditor label="Duplicate check" value={draft["duplicate_check"] ?? {}} disabled={!editing} onChange={(json) => setDraft((current) => ({ ...current, duplicate_check: json ?? undefined }))} />
        <JsonEditor label="Replacement" value={draft["replacement"] ?? {}} disabled={!editing} onChange={(json) => setDraft((current) => ({ ...current, replacement: json ?? undefined }))} />
      </div>
      {unknownKeys.length > 0 && <p className="mt-3 text-xs text-destructive">Unsupported keys: {unknownKeys.join(", ")}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </WorkPanel>
  );
}

function SearchConfigPanel({
  value,
  fields,
  entityId,
  onSaved,
}: {
  value: JsonRecord;
  fields: EntityField[];
  entityId: string;
  onSaved: (value: JsonRecord) => void;
}) {
  const fieldNames = fields.filter((field) => !fieldIsReadonly(field) || field.is_searchable).map((field) => field.name);
  const [draft, setDraft] = useState<JsonRecord>(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unknownKeys = hasUnknownKeys(draft, SEARCH_CONFIG_KEYS);

  async function save() {
    setError(null);
    if (unknownKeys.length > 0) {
      setError(`Remove unsupported search keys before saving: ${unknownKeys.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const item = await saveEntityContract(entityId, { search_config: draft });
      const updated = asRecord(item["search_config"] ?? draft);
      onSaved(updated);
      setDraft(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkPanel
      title="Search contract"
      description="Full-text enablement, searchable fields, ranking, minimum query length, and operator."
      actions={
        editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(value); setEditing(false); setError(null); }}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-2">
          <Switch id="search-enabled" checked={draft["enabled"] !== false} disabled={!editing} onCheckedChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} />
          <Label htmlFor="search-enabled" className="text-sm">Search enabled</Label>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Minimum query length</Label>
          <Input className="h-8 text-sm" type="number" disabled={!editing} value={String(draft["min_query_length"] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, min_query_length: numberOrUndefined(event.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Operator</Label>
          <Select disabled={!editing} value={String(draft["operator"] ?? "and")} onValueChange={(value) => setDraft((current) => ({ ...current, operator: value }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="and">and</SelectItem>
              <SelectItem value="or">or</SelectItem>
              <SelectItem value="phrase">phrase</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Fields</Label>
          <TagsInput disabled={!editing} value={stringArray(draft["fields"])} suggestions={fieldNames} onChange={(value) => setDraft((current) => ({ ...current, fields: uniqueStrings(value) }))} />
        </div>
        <JsonEditor label="Rank weights" value={draft["rank"] ?? {}} disabled={!editing} onChange={(json) => setDraft((current) => ({ ...current, rank: json ?? undefined }))} />
      </div>
      {unknownKeys.length > 0 && <p className="mt-3 text-xs text-destructive">Unsupported keys: {unknownKeys.join(", ")}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </WorkPanel>
  );
}

export function ContractEditor({ entity }: { entity: EntityDetail }) {
  const [displayConfig, setDisplayConfig] = useState(asRecord(entity.display_config));
  const [identityConfig, setIdentityConfig] = useState(asRecord(entity.identity_config));
  const [searchConfig, setSearchConfig] = useState(asRecord(entity.search_config));
  const [featureFlags, setFeatureFlags] = useState(asRecord(entity.feature_flags));
  const [dataPolicy, setDataPolicy] = useState(asRecord(entity.data_policy));

  return (
    <div className="space-y-4">
      <ContractHealthPanel entity={{ ...entity, feature_flags: featureFlags, display_config: displayConfig, identity_config: identityConfig, search_config: searchConfig, data_policy: dataPolicy }} />
      <FeatureFlagsPanel flags={featureFlags} entityId={entity.id} onSaved={setFeatureFlags} />
      <DataPolicyPanel policy={dataPolicy} fields={entity.fields} entityId={entity.id} onSaved={setDataPolicy} />
      <IdentityConfigPanel value={identityConfig} fields={entity.fields} entityId={entity.id} onSaved={setIdentityConfig} />
      <SearchConfigPanel value={searchConfig} fields={entity.fields} entityId={entity.id} onSaved={setSearchConfig} />
      <DisplayConfigPanel config={displayConfig} fields={entity.fields} entityId={entity.id} onSaved={setDisplayConfig} />
    </div>
  );
}
