"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Badge, Button } from "@athyper/ui";
import type {
  MetaEntityFieldDraft,
  MetaEntityRelationDraft,
  MetaEntityRelationTargetDraft,
  MetaEntitySummary,
} from "@athyper/meta-entity-authoring-contracts";
import { EditorCheckbox, EditorInput, EditorSelect, PanelHeader, selectClassName } from "./editor-controls";

function optionalNumber(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export function RelationsPanel({
  sourceEntity,
  entities,
  fields,
  relations,
  editable,
  focusFieldId,
  onChange,
}: {
  sourceEntity: MetaEntitySummary;
  entities: readonly MetaEntitySummary[];
  fields: readonly MetaEntityFieldDraft[];
  relations: readonly MetaEntityRelationDraft[];
  editable: boolean;
  focusFieldId?: string | null;
  onChange: (relations: readonly MetaEntityRelationDraft[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(relations[0]?.id ?? null);
  useEffect(() => { if (!relations.some((relation) => relation.id === selectedId)) setSelectedId(relations[0]?.id ?? null); }, [relations, selectedId]);
  useEffect(() => { const match = focusFieldId ? relations.find((relation) => relation.targets.some((target) => target.fields.some((field) => field.sourceFieldId === focusFieldId))) : null; if (match) setSelectedId(match.id); }, [focusFieldId, relations]);
  const selected = relations.find((relation) => relation.id === selectedId) ?? null;
  const replace = (relation: MetaEntityRelationDraft) => onChange(relations.map((candidate) => candidate.id === relation.id ? relation : candidate));
  const add = () => {
    const relation: MetaEntityRelationDraft = { id: crypto.randomUUID(), relationKey: `relation_${relations.length + 1}`, relationKind: "many_to_one", resolutionKind: "foreign_key", ownershipMode: "reference", mutationMode: "read_only", onDelete: "restrict", onUpdate: "restrict", inverseRelationKey: null, status: "active", targets: [] };
    onChange([...relations, relation]); setSelectedId(relation.id);
  };
  const updateTarget = (target: MetaEntityRelationTargetDraft) => selected && replace({ ...selected, targets: selected.targets.map((candidate) => candidate.id === target.id ? target : candidate) });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <PanelHeader title="Relation map" description="A compact topology view of this change set. Field mappings remain authoritative." />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{sourceEntity.entityCode}</Badge>
          {relations.flatMap((relation) => relation.targets.map((target) => {
            const targetEntity = entities.find((entity) => entity.id === target.targetEntityId);
            return <span key={target.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground"><ArrowRight className="size-3" aria-hidden /><span>{relation.relationKey}</span><Badge variant="outline">{targetEntity?.entityCode ?? target.targetEntityId}</Badge></span>;
          }))}
          {!relations.length && <p className="text-sm text-muted-foreground">No relations in this graph.</p>}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="space-y-4 xl:col-span-2"><PanelHeader title="Relations" description="Cardinality, resolution, ownership, mutation, and referential actions." action={<Button size="sm" disabled={!editable} onClick={add}><Plus className="size-4" aria-hidden />Add relation</Button>} /><div className="space-y-2">{relations.map((relation) => <button key={relation.id} type="button" onClick={() => setSelectedId(relation.id)} className={relation.id === selectedId ? "w-full rounded-lg border border-border bg-accent p-3 text-left text-accent-foreground" : "w-full rounded-lg border border-border bg-card p-3 text-left text-card-foreground hover:bg-muted"}><span className="font-mono text-sm font-medium">{relation.relationKey}</span><span className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{relation.resolutionKind}</span><span>{relation.targets.length} targets</span></span></button>)}</div></section>

        <section className="rounded-lg border border-border bg-card p-4 text-card-foreground xl:col-span-3">
          {!selected ? <p className="text-sm text-muted-foreground">Select or add a relation.</p> : <div className="space-y-5">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Relation properties</h3><Button variant="ghost" size="iconSm" disabled={!editable} onClick={() => { onChange(relations.filter((relation) => relation.id !== selected.id)); setSelectedId(null); }} aria-label="Delete relation"><Trash2 className="size-4" aria-hidden /></Button></div>
            <div className="grid gap-4 md:grid-cols-2"><EditorInput label="Relation key" value={selected.relationKey} disabled={!editable} onChange={(relationKey) => replace({ ...selected, relationKey })} /><EditorSelect label="Cardinality" value={selected.relationKind} options={["one_to_one", "many_to_one", "one_to_many", "many_to_many"]} disabled={!editable} onChange={(relationKind) => replace({ ...selected, relationKind })} /><EditorSelect label="Resolution" value={selected.resolutionKind} options={["foreign_key", "logical", "polymorphic"]} disabled={!editable} onChange={(resolutionKind) => replace({ ...selected, resolutionKind })} /><EditorSelect label="Ownership" value={selected.ownershipMode} options={["reference", "aggregate_child", "shared"]} disabled={!editable} onChange={(ownershipMode) => replace({ ...selected, ownershipMode })} /><EditorSelect label="Mutation mode" value={selected.mutationMode} options={["read_only", "source_owned", "target_owned", "coordinated"]} disabled={!editable} onChange={(mutationMode) => replace({ ...selected, mutationMode })} /><EditorSelect label="On delete" value={selected.onDelete} options={["restrict", "cascade", "set_null", "no_action"]} disabled={!editable} onChange={(onDelete) => replace({ ...selected, onDelete })} /><EditorSelect label="On update" value={selected.onUpdate} options={["restrict", "cascade", "no_action"]} disabled={!editable} onChange={(onUpdate) => replace({ ...selected, onUpdate })} /><EditorInput label="Inverse relation key" value={selected.inverseRelationKey ?? ""} disabled={!editable} onChange={(inverseRelationKey) => replace({ ...selected, inverseRelationKey: inverseRelationKey || null })} /><EditorSelect label="Status" value={selected.status} options={["active", "deprecated"]} disabled={!editable} onChange={(status) => replace({ ...selected, status })} /></div>
            {selected.status === "deprecated" && <div className="grid gap-4 md:grid-cols-3"><EditorInput label="Replacement relation" value={selected.replacementRelationKey ?? ""} disabled={!editable} onChange={(replacementRelationKey) => replace({ ...selected, replacementRelationKey: replacementRelationKey || undefined })} /><EditorInput label="Deprecated release" type="number" value={selected.deprecatedSinceReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, deprecatedSinceReleaseNo: optionalNumber(value) })} /><EditorInput label="Removal release" type="number" value={selected.plannedRemovalReleaseNo ?? ""} disabled={!editable} onChange={(value) => replace({ ...selected, plannedRemovalReleaseNo: optionalNumber(value) })} /></div>}

            <div className="border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">Relation targets</h4><p className="mt-1 text-xs text-muted-foreground">Polymorphic relations use one target row per discriminator.</p></div><Button variant="outline" size="sm" disabled={!editable || !entities.length} onClick={() => { const entity = entities[0]; if (!entity) return; replace({ ...selected, targets: [...selected.targets, { id: crypto.randomUUID(), relationTargetKey: `target_${selected.targets.length + 1}`, targetEntityId: entity.id, targetKeyKey: `${entity.entityCode}_pk`, discriminatorValue: null, isDefault: selected.targets.length === 0, fields: [] }] }); }}><Plus className="size-4" aria-hidden />Add target</Button></div>
              <div className="mt-4 space-y-4">{selected.targets.map((target) => (
                <div key={target.id} className="space-y-4 rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-mono text-sm font-medium text-foreground">{target.relationTargetKey}</p><Button variant="ghost" size="iconSm" disabled={!editable} onClick={() => replace({ ...selected, targets: selected.targets.filter((candidate) => candidate.id !== target.id) })} aria-label="Delete relation target"><Trash2 className="size-4" aria-hidden /></Button></div>
                  <div className="grid gap-4 md:grid-cols-2"><EditorInput label="Target key" value={target.relationTargetKey} disabled={!editable} onChange={(relationTargetKey) => updateTarget({ ...target, relationTargetKey })} /><label className="grid gap-1.5 text-sm font-medium text-foreground">Target Entity<select className={selectClassName} value={target.targetEntityId} disabled={!editable} onChange={(event) => updateTarget({ ...target, targetEntityId: event.target.value })}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entityCode}</option>)}</select></label><EditorInput label="Target Entity key" value={target.targetKeyKey} disabled={!editable} onChange={(targetKeyKey) => updateTarget({ ...target, targetKeyKey })} /><EditorInput label="Discriminator value" value={target.discriminatorValue ?? ""} disabled={!editable || selected.resolutionKind !== "polymorphic"} onChange={(discriminatorValue) => updateTarget({ ...target, discriminatorValue: discriminatorValue || null })} /></div>
                  <EditorCheckbox label="Default target" checked={target.isDefault} disabled={!editable} onChange={(isDefault) => replace({ ...selected, targets: selected.targets.map((candidate) => candidate.id === target.id ? { ...candidate, isDefault } : isDefault ? { ...candidate, isDefault: false } : candidate) })} />
                  <div><div className="flex items-center justify-between"><h5 className="text-sm font-semibold">Field mappings</h5><Button variant="outline" size="sm" disabled={!editable || !fields.length} onClick={() => { const field = fields[0]; if (field) updateTarget({ ...target, fields: [...target.fields, { id: crypto.randomUUID(), sourceFieldId: field.id, targetFieldKey: "id", position: target.fields.length + 1 }] }); }}><Plus className="size-4" aria-hidden />Add mapping</Button></div><div className="mt-3 space-y-2">{target.fields.map((mapping, index) => <div key={mapping.id} className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-5"><Badge variant="outline">{index + 1}</Badge><select aria-label="Source field" className={`${selectClassName} md:col-span-2`} value={mapping.sourceFieldId} disabled={!editable} onChange={(event) => updateTarget({ ...target, fields: target.fields.map((candidate) => candidate.id === mapping.id ? { ...candidate, sourceFieldId: event.target.value } : candidate) })}>{fields.map((field) => <option key={field.id} value={field.id}>{field.fieldKey}</option>)}</select><input aria-label="Target field key" className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={mapping.targetFieldKey} disabled={!editable} onChange={(event) => updateTarget({ ...target, fields: target.fields.map((candidate) => candidate.id === mapping.id ? { ...candidate, targetFieldKey: event.target.value } : candidate) })} /><Button variant="ghost" size="iconSm" disabled={!editable} onClick={() => updateTarget({ ...target, fields: target.fields.filter((candidate) => candidate.id !== mapping.id).map((candidate, position) => ({ ...candidate, position: position + 1 })) })} aria-label="Remove mapping"><Trash2 className="size-4" aria-hidden /></Button></div>)}</div></div>
                </div>
              ))}</div>
            </div>
          </div>}
        </section>
      </div>
    </div>
  );
}
