"use client";

import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Textarea } from "@athyper/ui";
import type {
  MetaEntityFieldDraft,
  MetaEntityFieldType,
  MetaEntityFieldTypeConfig,
} from "@athyper/meta-entity-authoring-contracts";
import { EditorField, EditorInput, EditorNullableSelect, EditorSelect, JsonEditor, PanelHeader } from "./editor-controls";

const fieldTypes = ["string", "text", "integer", "bigint", "decimal", "boolean", "uuid", "date", "datetime", "json", "enum", "reference", "money"] as const;
const cardinalities = ["one", "zero_or_one", "many"] as const;
const origins = ["stored", "computed", "projected", "runtime"] as const;
const writeModes = ["mutable", "write_once", "read_only", "computed"] as const;
const statuses = ["active", "deprecated"] as const;

function defaultTypeConfig(dataType: MetaEntityFieldType): MetaEntityFieldTypeConfig {
  if (dataType === "string" || dataType === "text") return { kind: dataType, maxLength: dataType === "string" ? 255 : undefined };
  if (dataType === "integer" || dataType === "bigint" || dataType === "decimal") return { kind: dataType };
  if (dataType === "reference") return { kind: "reference", identifierType: "uuid" };
  if (dataType === "money") return { kind: "money", currencyMode: "field", scale: 2 };
  if (dataType === "enum") return { kind: "enum", domainCode: "" };
  if (dataType === "datetime") return { kind: "datetime", timezoneMode: "utc" };
  if (dataType === "json") return { kind: "json" };
  return { kind: dataType };
}

function optionalNumber(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function TypeConfigEditor({ field, editable, onChange }: { field: MetaEntityFieldDraft; editable: boolean; onChange: (field: MetaEntityFieldDraft) => void }) {
  const config = field.typeConfig as unknown as Record<string, unknown>;
  const patch = (next: Record<string, unknown>) => onChange({ ...field, typeConfig: { ...config, ...next } as unknown as MetaEntityFieldTypeConfig });

  if (field.dataType === "string" || field.dataType === "text") return (
    <div className="grid gap-4 md:grid-cols-2">
      <EditorInput label="Minimum length" type="number" value={config["minLength"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ minLength: optionalNumber(value) })} />
      <EditorInput label="Maximum length" type="number" value={config["maxLength"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ maxLength: optionalNumber(value) })} />
      <div className="md:col-span-2"><EditorInput label="Pattern" value={config["pattern"] as string | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ pattern: value || undefined })} /></div>
    </div>
  );
  if (["integer", "bigint", "decimal"].includes(field.dataType)) return (
    <div className="grid gap-4 md:grid-cols-2">
      <EditorInput label="Minimum" type="number" value={config["minimum"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ minimum: optionalNumber(value) })} />
      <EditorInput label="Maximum" type="number" value={config["maximum"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ maximum: optionalNumber(value) })} />
      {field.dataType === "decimal" && <><EditorInput label="Precision" type="number" value={config["precision"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ precision: optionalNumber(value) })} /><EditorInput label="Scale" type="number" value={config["scale"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ scale: optionalNumber(value) })} /></>}
    </div>
  );
  if (field.dataType === "reference") return <EditorSelect label="Identifier type" value={(config["identifierType"] as "uuid" | "string" | "integer" | "bigint") ?? "uuid"} options={["uuid", "string", "integer", "bigint"]} disabled={!editable} onChange={(identifierType) => patch({ identifierType })} />;
  if (field.dataType === "enum") return <EditorInput label="Domain code" value={config["domainCode"] as string ?? ""} disabled={!editable} onChange={(domainCode) => patch({ domainCode })} />;
  if (field.dataType === "datetime") return <EditorSelect label="Timezone mode" value={(config["timezoneMode"] as "utc" | "offset" | "local") ?? "utc"} options={["utc", "offset", "local"]} disabled={!editable} onChange={(timezoneMode) => patch({ timezoneMode })} />;
  if (field.dataType === "json") return <EditorInput label="JSON schema code" value={config["schemaCode"] as string | undefined ?? ""} disabled={!editable} onChange={(schemaCode) => patch({ schemaCode: schemaCode || undefined })} />;
  if (field.dataType === "money") {
    const currencyMode = (config["currencyMode"] as "field" | "fixed") ?? "field";
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <EditorSelect label="Currency mode" value={currencyMode} options={["field", "fixed"]} disabled={!editable} onChange={(next) => patch({ currencyMode: next, currencyFieldKey: undefined, fixedCurrencyCode: undefined })} />
        {currencyMode === "field" ? <EditorInput label="Currency field key" value={config["currencyFieldKey"] as string | undefined ?? ""} disabled={!editable} onChange={(currencyFieldKey) => patch({ currencyFieldKey: currencyFieldKey || undefined })} /> : <EditorInput label="Fixed currency" value={config["fixedCurrencyCode"] as string | undefined ?? ""} disabled={!editable} onChange={(fixedCurrencyCode) => patch({ fixedCurrencyCode: fixedCurrencyCode || undefined })} />}
        <EditorInput label="Scale" type="number" value={config["scale"] as number | undefined ?? ""} disabled={!editable} onChange={(value) => patch({ scale: optionalNumber(value) })} />
      </div>
    );
  }
  return <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">This scalar type has no additional type configuration.</p>;
}

export function FieldsPanel({
  fields,
  selectedFieldId,
  editable,
  onSelect,
  onOpenDependencies,
  onChange,
}: {
  fields: readonly MetaEntityFieldDraft[];
  selectedFieldId: string | null;
  editable: boolean;
  onSelect: (fieldId: string | null) => void;
  onOpenDependencies: (section: "keys" | "search" | "relations", fieldId: string) => void;
  onChange: (fields: readonly MetaEntityFieldDraft[]) => void;
}) {
  const selected = fields.find((field) => field.id === selectedFieldId) ?? null;
  const replace = (field: MetaEntityFieldDraft) => onChange(fields.map((candidate) => candidate.id === field.id ? field : candidate));
  const add = () => {
    const field: MetaEntityFieldDraft = {
      id: crypto.randomUUID(), fieldKey: `new_field_${fields.length + 1}`, description: "", dataType: "string",
      typeConfig: defaultTypeConfig("string"), cardinality: "zero_or_one", valueOrigin: "stored", writeMode: "mutable",
      storagePath: `new_field_${fields.length + 1}`, defaultSpec: null, computationSpec: null, validationSpec: null,
      status: "active", keyUsageCount: 0, searchUsageCount: 0, relationUsageCount: 0,
    };
    onChange([...fields, field]); onSelect(field.id);
  };
  const remove = (field: MetaEntityFieldDraft) => {
    if (field.keyUsageCount + field.searchUsageCount + field.relationUsageCount > 0) return;
    onChange(fields.filter((candidate) => candidate.id !== field.id)); onSelect(null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <section className="space-y-4 xl:col-span-3">
        <PanelHeader title="Intrinsic fields" description="Storage, value, typing, default, computation, and validation semantics. Surface presentation remains separate." action={<Button size="sm" disabled={!editable} onClick={add}><Plus className="size-4" aria-hidden />Add field</Button>} />
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Cardinality</th><th className="px-3 py-2 font-medium">Usage</th></tr></thead>
            <tbody className="divide-y divide-border">
              {fields.map((field) => (
                <tr key={field.id} className={field.id === selectedFieldId ? "bg-accent" : "hover:bg-muted"}>
                  <td className="p-0"><button type="button" className="w-full px-3 py-3 text-left font-mono text-sm font-medium text-foreground" onClick={() => onSelect(field.id)}>{field.fieldKey}</button></td>
                  <td className="px-3 py-3 text-foreground">{field.dataType}</td><td className="px-3 py-3 text-muted-foreground">{field.cardinality.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 text-muted-foreground">{field.keyUsageCount + field.searchUsageCount + field.relationUsageCount}</td>
                </tr>
              ))}
              {!fields.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No intrinsic fields have been added.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="rounded-lg border border-border bg-card p-4 text-card-foreground xl:col-span-2" aria-label="Field inspector">
        {!selected ? <p className="text-sm leading-6 text-muted-foreground">Select a field to edit its canonical properties.</p> : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-foreground">Field inspector</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{selected.id}</p></div><Button variant="ghost" size="iconSm" title={selected.keyUsageCount + selected.searchUsageCount + selected.relationUsageCount ? "Remove bindings before deleting this field" : "Delete field"} disabled={!editable || selected.keyUsageCount + selected.searchUsageCount + selected.relationUsageCount > 0} onClick={() => remove(selected)}><Trash2 className="size-4" aria-hidden /></Button></div>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={!selected.keyUsageCount} onClick={() => onOpenDependencies("keys", selected.id)}><Badge variant="outline">{selected.keyUsageCount} key</Badge></button><button type="button" disabled={!selected.searchUsageCount} onClick={() => onOpenDependencies("search", selected.id)}><Badge variant="outline">{selected.searchUsageCount} search</Badge></button><button type="button" disabled={!selected.relationUsageCount} onClick={() => onOpenDependencies("relations", selected.id)}><Badge variant="outline">{selected.relationUsageCount} relation</Badge></button></div>
            <EditorInput label="Field key" value={selected.fieldKey} disabled={!editable} onChange={(fieldKey) => replace({ ...selected, fieldKey })} />
            <EditorField label="Description"><Textarea value={selected.description ?? ""} disabled={!editable} onChange={(event) => replace({ ...selected, description: event.target.value })} /></EditorField>
            <div className="grid gap-4 md:grid-cols-2">
              <EditorSelect label="Data type" value={selected.dataType} options={fieldTypes} disabled={!editable} onChange={(dataType) => replace({ ...selected, dataType, typeConfig: defaultTypeConfig(dataType) })} />
              <EditorSelect label="Cardinality" value={selected.cardinality} options={cardinalities} disabled={!editable} onChange={(cardinality) => replace({ ...selected, cardinality })} />
              <EditorSelect label="Value origin" value={selected.valueOrigin} options={origins} disabled={!editable} onChange={(valueOrigin) => replace({ ...selected, valueOrigin })} />
              <EditorSelect label="Write mode" value={selected.writeMode} options={writeModes} disabled={!editable} onChange={(writeMode) => replace({ ...selected, writeMode })} />
            </div>
            <EditorInput label="Storage path" value={selected.storagePath ?? ""} disabled={!editable || selected.valueOrigin !== "stored"} onChange={(storagePath) => replace({ ...selected, storagePath: storagePath || null })} />
            <div><p className="mb-3 text-sm font-semibold text-foreground">Typed configuration</p><TypeConfigEditor field={selected} editable={editable} onChange={replace} /></div>
            <JsonEditor label="Default specification" hint="Static, context, parent, principal, or resolver default." value={selected.defaultSpec} disabled={!editable} onChange={(defaultSpec) => replace({ ...selected, defaultSpec: defaultSpec as MetaEntityFieldDraft["defaultSpec"] })} />
            <JsonEditor label="Computation specification" hint="Expression or registered handler for computed values." value={selected.computationSpec} disabled={!editable} onChange={(computationSpec) => replace({ ...selected, computationSpec: computationSpec as MetaEntityFieldDraft["computationSpec"] })} />
            <JsonEditor label="Validation specification" hint="Canonical versioned field rules; UI presentation validation is not stored here." value={selected.validationSpec} disabled={!editable} onChange={(validationSpec) => replace({ ...selected, validationSpec: validationSpec as MetaEntityFieldDraft["validationSpec"] })} />
            <EditorSelect label="Lifecycle status" value={selected.status} options={statuses} disabled={!editable} onChange={(status) => replace({ ...selected, status })} />
            {selected.status === "deprecated" && <div className="grid gap-4 md:grid-cols-2"><EditorNullableSelect label="Replacement field" value={selected.replacementFieldKey ?? null} options={fields.filter((field) => field.id !== selected.id).map((field) => field.fieldKey)} disabled={!editable} onChange={(replacementFieldKey) => replace({ ...selected, replacementFieldKey: replacementFieldKey ?? undefined })} /><EditorInput label="Deprecated since release" type="number" value={selected.deprecatedSinceReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, deprecatedSinceReleaseNo: optionalNumber(value) })} /><EditorInput label="Planned removal release" type="number" value={selected.plannedRemovalReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, plannedRemovalReleaseNo: optionalNumber(value) })} /></div>}
          </div>
        )}
      </aside>
    </div>
  );
}
