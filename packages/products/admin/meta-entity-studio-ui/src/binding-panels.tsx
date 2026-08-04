"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge, Button } from "@athyper/ui";
import type {
  MetaEntityFieldDraft,
  MetaEntityKeyDraft,
  MetaEntitySearchProfileDraft,
} from "@athyper/meta-entity-authoring-contracts";
import { EditorCheckbox, EditorInput, EditorSelect, PanelHeader, selectClassName } from "./editor-controls";

function optionalNumber(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function OrderedBindingList({
  bindings,
  fields,
  editable,
  valueOf,
  onAdd,
  onRemove,
  onMove,
  onFieldChange,
  suffix,
}: {
  bindings: readonly { id: string; position: number }[];
  fields: readonly MetaEntityFieldDraft[];
  editable: boolean;
  valueOf: (binding: { id: string; position: number }) => string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onFieldChange: (id: string, fieldId: string) => void;
  suffix?: (binding: { id: string; position: number }) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {bindings.map((binding, index) => (
        <div key={binding.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
          <Badge variant="outline">{index + 1}</Badge>
          <select className={`${selectClassName} min-w-48 flex-1`} value={valueOf(binding)} disabled={!editable} onChange={(event) => onFieldChange(binding.id, event.target.value)}>
            {fields.map((field) => <option key={field.id} value={field.id}>{field.fieldKey}</option>)}
          </select>
          {suffix?.(binding)}
          <Button variant="ghost" size="iconSm" disabled={!editable || index === 0} onClick={() => onMove(binding.id, -1)} aria-label="Move binding up"><ArrowUp className="size-4" aria-hidden /></Button>
          <Button variant="ghost" size="iconSm" disabled={!editable || index === bindings.length - 1} onClick={() => onMove(binding.id, 1)} aria-label="Move binding down"><ArrowDown className="size-4" aria-hidden /></Button>
          <Button variant="ghost" size="iconSm" disabled={!editable} onClick={() => onRemove(binding.id)} aria-label="Remove binding"><Trash2 className="size-4" aria-hidden /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" disabled={!editable || !fields.length} onClick={onAdd}><Plus className="size-4" aria-hidden />Add field binding</Button>
    </div>
  );
}

export function KeysPanel({ fields, keys, editable, focusFieldId, onChange }: { fields: readonly MetaEntityFieldDraft[]; keys: readonly MetaEntityKeyDraft[]; editable: boolean; focusFieldId?: string | null; onChange: (keys: readonly MetaEntityKeyDraft[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(keys[0]?.id ?? null);
  useEffect(() => { if (!keys.some((key) => key.id === selectedId)) setSelectedId(keys[0]?.id ?? null); }, [keys, selectedId]);
  useEffect(() => { const match = focusFieldId ? keys.find((key) => key.fields.some((field) => field.entityFieldId === focusFieldId)) : null; if (match) setSelectedId(match.id); }, [focusFieldId, keys]);
  const selected = keys.find((key) => key.id === selectedId) ?? null;
  const replace = (key: MetaEntityKeyDraft) => onChange(keys.map((candidate) => candidate.id === key.id ? key : candidate));
  const add = () => {
    const key: MetaEntityKeyDraft = { id: crypto.randomUUID(), keyKey: `alternate_${keys.length + 1}`, keyKind: "alternate", uniquenessScope: "tenant", nullSemantics: "not_allowed", status: "active", fields: [] };
    onChange([...keys, key]); setSelectedId(key.id);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <section className="space-y-4 xl:col-span-2">
        <PanelHeader title="Entity keys" description="Identity, uniqueness, and idempotency contracts." action={<Button size="sm" disabled={!editable} onClick={add}><Plus className="size-4" aria-hidden />Add key</Button>} />
        <div className="space-y-2">{keys.map((key) => <button key={key.id} type="button" onClick={() => setSelectedId(key.id)} className={key.id === selectedId ? "w-full rounded-lg border border-border bg-accent p-3 text-left text-accent-foreground" : "w-full rounded-lg border border-border bg-card p-3 text-left text-card-foreground hover:bg-muted"}><span className="font-mono text-sm font-medium">{key.keyKey}</span><span className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{key.keyKind}</span><span>{key.fields.length} fields</span></span></button>)}</div>
      </section>
      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground xl:col-span-3">
        {!selected ? <p className="text-sm text-muted-foreground">Select or add a key.</p> : <div className="space-y-5">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Key properties</h3><Button variant="ghost" size="iconSm" disabled={!editable || selected.keyKind === "primary"} onClick={() => { onChange(keys.filter((key) => key.id !== selected.id)); setSelectedId(null); }} aria-label="Delete key"><Trash2 className="size-4" aria-hidden /></Button></div>
          <div className="grid gap-4 md:grid-cols-2"><EditorInput label="Key key" value={selected.keyKey} disabled={!editable} onChange={(keyKey) => replace({ ...selected, keyKey })} /><EditorSelect label="Key kind" value={selected.keyKind} options={["primary", "natural", "alternate", "idempotency"]} disabled={!editable} onChange={(keyKind) => replace({ ...selected, keyKind })} /><EditorSelect label="Uniqueness scope" value={selected.uniquenessScope} options={["global", "tenant"]} disabled={!editable} onChange={(uniquenessScope) => replace({ ...selected, uniquenessScope })} /><EditorSelect label="Null semantics" value={selected.nullSemantics} options={["not_allowed", "nulls_distinct", "nulls_not_distinct"]} disabled={!editable} onChange={(nullSemantics) => replace({ ...selected, nullSemantics })} /><EditorSelect label="Status" value={selected.status} options={["active", "deprecated"]} disabled={!editable} onChange={(status) => replace({ ...selected, status })} /></div>
          <div><h4 className="mb-3 text-sm font-semibold">Ordered key fields</h4><OrderedBindingList bindings={selected.fields} fields={fields} editable={editable} valueOf={(binding) => selected.fields.find((item) => item.id === binding.id)?.entityFieldId ?? ""} onAdd={() => { const used = new Set(selected.fields.map((field) => field.entityFieldId)); const field = fields.find((candidate) => !used.has(candidate.id)) ?? fields[0]; if (field) replace({ ...selected, fields: [...selected.fields, { id: crypto.randomUUID(), entityFieldId: field.id, position: selected.fields.length + 1 }] }); }} onRemove={(id) => replace({ ...selected, fields: selected.fields.filter((field) => field.id !== id).map((field, index) => ({ ...field, position: index + 1 })) })} onMove={(id, direction) => { const ordered = [...selected.fields]; const index = ordered.findIndex((field) => field.id === id); const swap = index + direction; if (index < 0 || swap < 0 || swap >= ordered.length) return; [ordered[index], ordered[swap]] = [ordered[swap]!, ordered[index]!]; replace({ ...selected, fields: ordered.map((field, position) => ({ ...field, position: position + 1 })) }); }} onFieldChange={(id, entityFieldId) => replace({ ...selected, fields: selected.fields.map((field) => field.id === id ? { ...field, entityFieldId } : field) })} /></div>
          {selected.status === "deprecated" && <div className="grid gap-4 md:grid-cols-3"><EditorInput label="Replacement key" value={selected.replacementKeyKey ?? ""} disabled={!editable} onChange={(replacementKeyKey) => replace({ ...selected, replacementKeyKey: replacementKeyKey || undefined })} /><EditorInput label="Deprecated release" type="number" value={selected.deprecatedSinceReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, deprecatedSinceReleaseNo: optionalNumber(value) })} /><EditorInput label="Removal release" type="number" value={selected.plannedRemovalReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, plannedRemovalReleaseNo: optionalNumber(value) })} /></div>}
        </div>}
      </section>
    </div>
  );
}

export function SearchPanel({ fields, profiles, editable, focusFieldId, onChange }: { fields: readonly MetaEntityFieldDraft[]; profiles: readonly MetaEntitySearchProfileDraft[]; editable: boolean; focusFieldId?: string | null; onChange: (profiles: readonly MetaEntitySearchProfileDraft[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id ?? null);
  useEffect(() => { if (!profiles.some((profile) => profile.id === selectedId)) setSelectedId(profiles[0]?.id ?? null); }, [profiles, selectedId]);
  useEffect(() => { const match = focusFieldId ? profiles.find((profile) => profile.fields.some((field) => field.entityFieldId === focusFieldId)) : null; if (match) setSelectedId(match.id); }, [focusFieldId, profiles]);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;
  const replace = (profile: MetaEntitySearchProfileDraft) => onChange(profiles.map((candidate) => candidate.id === profile.id ? profile : candidate));
  const add = () => { const profile: MetaEntitySearchProfileDraft = { id: crypto.randomUUID(), searchKey: `search_${profiles.length + 1}`, searchKind: "keyword", queryOperator: "or", minimumQueryLength: 2, languageCode: null, normalizationMode: "casefold", isDefault: profiles.length === 0, status: "active", fields: [] }; onChange([...profiles, profile]); setSelectedId(profile.id); };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <section className="space-y-4 xl:col-span-2"><PanelHeader title="Search profiles" description="Named query behavior, normalization, ranking, and field coverage." action={<Button size="sm" disabled={!editable} onClick={add}><Plus className="size-4" aria-hidden />Add profile</Button>} /><div className="space-y-2">{profiles.map((profile) => <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className={profile.id === selectedId ? "w-full rounded-lg border border-border bg-accent p-3 text-left text-accent-foreground" : "w-full rounded-lg border border-border bg-card p-3 text-left text-card-foreground hover:bg-muted"}><span className="font-mono text-sm font-medium">{profile.searchKey}</span><span className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{profile.searchKind}</span><span>{profile.fields.length} fields</span></span></button>)}</div></section>
      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground xl:col-span-3">{!selected ? <p className="text-sm text-muted-foreground">Select or add a search profile.</p> : <div className="space-y-5">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Search properties</h3><Button variant="ghost" size="iconSm" disabled={!editable} onClick={() => { onChange(profiles.filter((profile) => profile.id !== selected.id)); setSelectedId(null); }} aria-label="Delete search profile"><Trash2 className="size-4" aria-hidden /></Button></div>
        <div className="grid gap-4 md:grid-cols-2"><EditorInput label="Search key" value={selected.searchKey} disabled={!editable} onChange={(searchKey) => replace({ ...selected, searchKey })} /><EditorSelect label="Search kind" value={selected.searchKind} options={["keyword", "full_text", "hybrid"]} disabled={!editable} onChange={(searchKind) => replace({ ...selected, searchKind })} /><EditorSelect label="Query operator" value={selected.queryOperator} options={["and", "or"]} disabled={!editable} onChange={(queryOperator) => replace({ ...selected, queryOperator })} /><EditorSelect label="Normalization" value={selected.normalizationMode} options={["none", "casefold", "casefold_unaccent"]} disabled={!editable} onChange={(normalizationMode) => replace({ ...selected, normalizationMode })} /><EditorInput label="Minimum query length" type="number" value={selected.minimumQueryLength} disabled={!editable} onChange={(value) => replace({ ...selected, minimumQueryLength: Number(value) })} /><EditorInput label="Language code" value={selected.languageCode ?? ""} disabled={!editable} onChange={(languageCode) => replace({ ...selected, languageCode: languageCode || null })} /><EditorSelect label="Status" value={selected.status} options={["active", "deprecated"]} disabled={!editable} onChange={(status) => replace({ ...selected, status })} /></div>
        <EditorCheckbox label="Default search profile" description="Exactly one active profile should be the default." checked={selected.isDefault} disabled={!editable} onChange={(isDefault) => onChange(profiles.map((profile) => profile.id === selected.id ? { ...profile, isDefault } : isDefault ? { ...profile, isDefault: false } : profile))} />
        <div><h4 className="mb-3 text-sm font-semibold">Weighted search fields</h4><OrderedBindingList bindings={selected.fields} fields={fields} editable={editable} valueOf={(binding) => selected.fields.find((item) => item.id === binding.id)?.entityFieldId ?? ""} onAdd={() => { const field = fields[0]; if (field) replace({ ...selected, fields: [...selected.fields, { id: crypto.randomUUID(), entityFieldId: field.id, position: selected.fields.length + 1, matchMode: "contains", weight: 1 }] }); }} onRemove={(id) => replace({ ...selected, fields: selected.fields.filter((field) => field.id !== id).map((field, index) => ({ ...field, position: index + 1 })) })} onMove={(id, direction) => { const ordered = [...selected.fields]; const index = ordered.findIndex((field) => field.id === id); const swap = index + direction; if (index < 0 || swap < 0 || swap >= ordered.length) return; [ordered[index], ordered[swap]] = [ordered[swap]!, ordered[index]!]; replace({ ...selected, fields: ordered.map((field, position) => ({ ...field, position: position + 1 })) }); }} onFieldChange={(id, entityFieldId) => replace({ ...selected, fields: selected.fields.map((field) => field.id === id ? { ...field, entityFieldId } : field) })} suffix={(binding) => { const field = selected.fields.find((item) => item.id === binding.id)!; return <><select aria-label="Match mode" className={`${selectClassName} w-auto`} value={field.matchMode} disabled={!editable} onChange={(event) => replace({ ...selected, fields: selected.fields.map((item) => item.id === field.id ? { ...item, matchMode: event.target.value as typeof item.matchMode } : item) })}>{["exact", "prefix", "contains", "full_text"].map((mode) => <option key={mode}>{mode}</option>)}</select><input aria-label="Search weight" className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground" type="number" min="0.1" step="0.1" value={field.weight} disabled={!editable} onChange={(event) => replace({ ...selected, fields: selected.fields.map((item) => item.id === field.id ? { ...item, weight: Number(event.target.value) } : item) })} /></>; }} /></div>
        {selected.status === "deprecated" && <div className="grid gap-4 md:grid-cols-3"><EditorInput label="Replacement search" value={selected.replacementSearchKey ?? ""} disabled={!editable} onChange={(replacementSearchKey) => replace({ ...selected, replacementSearchKey: replacementSearchKey || undefined })} /><EditorInput label="Deprecated release" type="number" value={selected.deprecatedSinceReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, deprecatedSinceReleaseNo: optionalNumber(value) })} /><EditorInput label="Removal release" type="number" value={selected.plannedRemovalReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, plannedRemovalReleaseNo: optionalNumber(value) })} /></div>}
      </div>}</section>
    </div>
  );
}
