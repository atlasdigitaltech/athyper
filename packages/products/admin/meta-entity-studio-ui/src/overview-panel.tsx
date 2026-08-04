"use client";

import { RotateCcw, Settings2, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@athyper/ui";
import type {
  MetaEntityClassProfile,
  MetaEntityFieldDraft,
  MetaEntityRuntimeProfileDraft,
} from "@athyper/meta-entity-authoring-contracts";
import { copyClassProfileDefaults } from "@athyper/meta-entity-runtime";
import { EditorInput, EditorNullableSelect, EditorSelect, PanelHeader } from "./editor-controls";

const backingKinds = ["table", "view", "materialized_view", "external", "virtual"] as const;
const apiExposures = ["none", "catalog_only", "api"] as const;
const readModes = ["none", "generic", "facade", "projection"] as const;
const writeModes = ["none", "generic", "facade", "append_only"] as const;
const createModes = ["form_only", "early_draft", "direct", "source_document"] as const;
const concurrencyModes = ["none", "optimistic", "append_only"] as const;
const planes = ["athyper", "neon", "mesh"] as const;

export function OverviewPanel({
  profile,
  classProfile,
  fields,
  editable,
  onChange,
}: {
  profile: MetaEntityRuntimeProfileDraft;
  classProfile: MetaEntityClassProfile | null;
  fields: readonly MetaEntityFieldDraft[];
  editable: boolean;
  onChange: (profile: MetaEntityRuntimeProfileDraft) => void;
}) {
  const patch = (next: Partial<MetaEntityRuntimeProfileDraft>) => onChange({ ...profile, ...next });
  const fieldKeys = fields.map((field) => field.fieldKey);
  const needsStorageObject = ["table", "view", "materialized_view"].includes(profile.backingKind);

  return (
    <div className="space-y-4">
      {classProfile && (
        <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <PanelHeader
            title={classProfile.fallbackName}
            description={classProfile.description}
            action={(
              <Button variant="outline" size="sm" disabled={!editable} onClick={() => onChange(copyClassProfileDefaults(profile, classProfile))}>
                <RotateCcw className="size-4" aria-hidden />Copy class defaults
              </Button>
            )}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline">Profile v{classProfile.profileVersion}</Badge>
            <Badge variant="secondary">{classProfile.defaultBackingKind}</Badge>
            <Badge variant="secondary">{classProfile.defaultApiExposure}</Badge>
            <Badge variant="secondary">{classProfile.defaultChangePolicy} change</Badge>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Defaults are copied into this change set. Published contracts never use live inheritance.</p>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <div className="flex items-center gap-2"><Settings2 className="size-4 text-muted-foreground" aria-hidden /><h2 className="font-semibold">Storage and exposure</h2></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <EditorSelect label="Backing kind" value={profile.backingKind} options={backingKinds} disabled={!editable} onChange={(backingKind) => patch({
            backingKind,
            storagePlane: backingKind === "virtual" ? null : profile.storagePlane,
            storageSchema: backingKind === "external" || backingKind === "virtual" ? null : profile.storageSchema,
            storageObject: backingKind === "external" || backingKind === "virtual" ? null : profile.storageObject,
          })} />
          <EditorNullableSelect label="Storage plane" value={profile.storagePlane} options={planes} disabled={!editable || profile.backingKind === "virtual"} onChange={(storagePlane) => patch({ storagePlane })} />
          <EditorInput label="Storage schema" value={profile.storageSchema ?? ""} disabled={!editable || !needsStorageObject} onChange={(value) => patch({ storageSchema: value || null })} />
          <EditorInput label="Storage object" value={profile.storageObject ?? ""} disabled={!editable || !needsStorageObject} onChange={(value) => patch({ storageObject: value || null })} />
          <EditorSelect label="API exposure" value={profile.apiExposure} options={apiExposures} disabled={!editable} onChange={(apiExposure) => patch({ apiExposure })} />
          <EditorSelect label="Create mode" value={profile.createMode} options={createModes} disabled={!editable} onChange={(createMode) => patch({ createMode })} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden /><h2 className="font-semibold">Runtime execution</h2></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <EditorSelect label="Read mode" value={profile.readMode} options={readModes} disabled={!editable} onChange={(readMode) => patch({ readMode, readHandlerKey: readMode === "facade" ? profile.readHandlerKey : null })} />
          <EditorInput label="Read handler key" value={profile.readHandlerKey ?? ""} disabled={!editable || profile.readMode !== "facade"} onChange={(value) => patch({ readHandlerKey: value || null })} />
          <EditorSelect label="Write mode" value={profile.writeMode} options={writeModes} disabled={!editable} onChange={(writeMode) => patch({ writeMode, writeHandlerKey: writeMode === "facade" ? profile.writeHandlerKey : null })} />
          <EditorInput label="Write handler key" value={profile.writeHandlerKey ?? ""} disabled={!editable || profile.writeMode !== "facade"} onChange={(value) => patch({ writeHandlerKey: value || null })} />
          <EditorSelect label="Concurrency" value={profile.concurrencyMode} options={concurrencyModes} disabled={!editable} onChange={(concurrencyMode) => patch({ concurrencyMode, recordVersionFieldKey: concurrencyMode === "optimistic" ? profile.recordVersionFieldKey : null })} />
          <EditorNullableSelect label="Record-version field" value={profile.recordVersionFieldKey} options={fieldKeys} disabled={!editable || profile.concurrencyMode !== "optimistic"} onChange={(recordVersionFieldKey) => patch({ recordVersionFieldKey })} />
          <EditorNullableSelect label="Tenant field" value={profile.tenantFieldKey} options={fieldKeys} disabled={!editable} onChange={(tenantFieldKey) => patch({ tenantFieldKey })} />
          <EditorNullableSelect label="Soft-delete field" value={profile.softDeleteFieldKey} options={fieldKeys} disabled={!editable} onChange={(softDeleteFieldKey) => patch({ softDeleteFieldKey })} />
          <EditorInput label="Draft TTL hours" type="number" value={profile.draftTtlHours ?? ""} disabled={!editable} onChange={(value) => patch({ draftTtlHours: value ? Number(value) : null })} />
        </div>
      </section>
    </div>
  );
}
