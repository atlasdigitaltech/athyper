"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button } from "@athyper/ui";
import type { MetaEntityFieldDraft, MetaEntitySurfaceDraft } from "@athyper/meta-entity-authoring-contracts";
import {
  EditorCheckbox,
  EditorInput,
  EditorSelect,
  JsonEditor,
  PanelHeader,
  selectClassName,
} from "./editor-controls";

export function SurfacesPanel({ fields, surfaces, editable, onChange }: {
  fields: readonly MetaEntityFieldDraft[];
  surfaces: readonly MetaEntitySurfaceDraft[];
  editable: boolean;
  onChange: (surfaces: readonly MetaEntitySurfaceDraft[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(surfaces[0]?.id ?? null);
  useEffect(() => {
    if (!surfaces.some((item) => item.id === selectedId)) setSelectedId(surfaces[0]?.id ?? null);
  }, [selectedId, surfaces]);
  const selected = surfaces.find((item) => item.id === selectedId) ?? null;
  const replace = (surface: MetaEntitySurfaceDraft) => {
    onChange(surfaces.map((item) => item.id === surface.id ? surface : item));
  };
  const add = () => {
    const surface: MetaEntitySurfaceDraft = {
      id: crypto.randomUUID(),
      surfaceKey: `form_${surfaces.length + 1}`,
      surfaceKind: "form",
      title: "New surface",
      description: null,
      layoutKind: "grid",
      layoutConfig: {},
      isDefault: surfaces.length === 0,
      status: "active",
      sections: [],
      fieldBindings: [],
    };
    onChange([...surfaces, surface]);
    setSelectedId(surface.id);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <section className="space-y-4 xl:col-span-2">
        <PanelHeader title="Surfaces" description="Named presentation contracts owned by this change set." action={<Button size="sm" onClick={add} disabled={!editable}><Plus className="size-4" aria-hidden />Add surface</Button>} />
        <div className="space-y-2">
          {surfaces.map((surface) => (
            <button type="button" key={surface.id} onClick={() => setSelectedId(surface.id)} className={surface.id === selectedId ? "w-full rounded-lg border border-border bg-accent p-3 text-left text-accent-foreground" : "w-full rounded-lg border border-border bg-card p-3 text-left text-card-foreground hover:bg-muted"}>
              <span className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-medium">{surface.surfaceKey}</span>{surface.isDefault && <Badge variant="success">default</Badge>}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{surface.surfaceKind} · {surface.sections.length} sections · {surface.fieldBindings.length} fields</span>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground xl:col-span-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorInput label="Surface key" value={selected.surfaceKey} disabled={!editable} onChange={(surfaceKey) => replace({ ...selected, surfaceKey })} />
            <EditorInput label="Title" value={selected.title} disabled={!editable} onChange={(title) => replace({ ...selected, title })} />
            <EditorSelect label="Kind" value={selected.surfaceKind} options={["form", "detail", "list", "lookup", "embedded"]} disabled={!editable} onChange={(surfaceKind) => replace({ ...selected, surfaceKind })} />
            <EditorSelect label="Layout" value={selected.layoutKind} options={["flow", "grid", "stack", "tabs"]} disabled={!editable} onChange={(layoutKind) => replace({ ...selected, layoutKind })} />
          </div>
          <EditorCheckbox label="Default surface for this kind" checked={selected.isDefault} disabled={!editable} onChange={(isDefault) => onChange(surfaces.map((surface) => surface.id === selected.id ? { ...surface, isDefault } : isDefault && surface.surfaceKind === selected.surfaceKind ? { ...surface, isDefault: false } : surface))} />
          <JsonEditor label="Layout configuration" value={selected.layoutConfig} disabled={!editable} onChange={(layoutConfig) => replace({ ...selected, layoutConfig: (layoutConfig ?? {}) as Record<string, unknown> })} />

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Sections</h3>
              <Button size="sm" variant="outline" disabled={!editable} onClick={() => replace({ ...selected, sections: [...selected.sections, { id: crypto.randomUUID(), sectionKey: `section_${selected.sections.length + 1}`, parentSectionId: null, sectionKind: "section", title: "New section", description: null, position: selected.sections.length, columnCount: 1, collapsible: false, collapsedByDefault: false, layoutConfig: {} }] })}><Plus className="size-4" aria-hidden />Section</Button>
            </div>
            <div className="mt-3 space-y-2">
              {selected.sections.map((section) => (
                <div key={section.id} className="grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-3">
                  <EditorInput label="Section key" value={section.sectionKey} disabled={!editable} onChange={(sectionKey) => replace({ ...selected, sections: selected.sections.map((item) => item.id === section.id ? { ...item, sectionKey } : item) })} />
                  <EditorInput label="Title" value={section.title ?? ""} disabled={!editable} onChange={(title) => replace({ ...selected, sections: selected.sections.map((item) => item.id === section.id ? { ...item, title: title || null } : item) })} />
                  <div className="flex items-end"><Button variant="ghost" size="sm" disabled={!editable} onClick={() => replace({ ...selected, sections: selected.sections.filter((item) => item.id !== section.id), fieldBindings: selected.fieldBindings.map((binding) => binding.sectionId === section.id ? { ...binding, sectionId: null } : binding) })}><Trash2 className="size-4" aria-hidden />Remove</Button></div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Field bindings</h3>
              <Button size="sm" variant="outline" disabled={!editable || !fields.length} onClick={() => {
                const field = fields.find((item) => !selected.fieldBindings.some((binding) => binding.entityFieldId === item.id)) ?? fields[0];
                if (!field) return;
                replace({ ...selected, fieldBindings: [...selected.fieldBindings, { id: crypto.randomUUID(), bindingKey: field.fieldKey, entityFieldId: field.id, sectionId: selected.sections[0]?.id ?? null, position: selected.fieldBindings.length, labelOverride: null, helpText: null, placeholder: null, widgetKey: null, columnSpan: 12, showRequiredIndicator: true, displayConfig: {}, visibilityRule: null, editabilityRule: null, status: "active" }] });
              }}><Plus className="size-4" aria-hidden />Field</Button>
            </div>
            <div className="mt-3 space-y-2">
              {selected.fieldBindings.map((binding) => (
                <div key={binding.id} className="grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-4">
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">Field<select className={selectClassName} value={binding.entityFieldId} disabled={!editable} onChange={(event) => replace({ ...selected, fieldBindings: selected.fieldBindings.map((item) => item.id === binding.id ? { ...item, entityFieldId: event.target.value } : item) })}>{fields.map((field) => <option key={field.id} value={field.id}>{field.fieldKey}</option>)}</select></label>
                  <EditorInput label="Binding key" value={binding.bindingKey} disabled={!editable} onChange={(bindingKey) => replace({ ...selected, fieldBindings: selected.fieldBindings.map((item) => item.id === binding.id ? { ...item, bindingKey } : item) })} />
                  <EditorInput label="Label override" value={binding.labelOverride ?? ""} disabled={!editable} onChange={(labelOverride) => replace({ ...selected, fieldBindings: selected.fieldBindings.map((item) => item.id === binding.id ? { ...item, labelOverride: labelOverride || null } : item) })} />
                  <div className="flex items-end"><Button variant="ghost" size="sm" disabled={!editable} onClick={() => replace({ ...selected, fieldBindings: selected.fieldBindings.filter((item) => item.id !== binding.id) })}><Trash2 className="size-4" aria-hidden />Remove</Button></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
