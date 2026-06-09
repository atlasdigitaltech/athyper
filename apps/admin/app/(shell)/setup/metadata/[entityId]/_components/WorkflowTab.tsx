"use client";

import { useState } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import { Badge, Button, Input, Label, Switch, Textarea } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { EntityDetail } from "./types";
import { asRecord, formatJson, numberOrUndefined, parseJsonText, type JsonRecord } from "./metadataContract";

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `${res.status}`;
}

export function WorkflowTab({ entity }: { entity: EntityDetail }) {
  const [flags, setFlags] = useState<JsonRecord>(() => asRecord(entity.feature_flags));
  const [display, setDisplay] = useState<JsonRecord>(() => asRecord(entity.display_config));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stagesText, setStagesText] = useState(formatJson(display["lifecycle_stages"] ?? []));
  const [aliasesText, setAliasesText] = useState(formatJson(display["stage_key_aliases"] ?? {}));
  const [workflowConfigText, setWorkflowConfigText] = useState(formatJson(display["workflow"] ?? {}));

  const workflowEnabled = flags["has_workflow"] === true || flags["is_approvable"] === true;
  const stages = Array.isArray(display["lifecycle_stages"]) ? display["lifecycle_stages"] as unknown[] : [];
  const issue = workflowEnabled && stages.length === 0
    ? "Workflow is enabled but no lifecycle/workflow stages are configured."
    : null;

  async function save() {
    const stagesJson = parseJsonText(stagesText, { objectOnly: false });
    if (!stagesJson.ok || (stagesJson.value !== null && !Array.isArray(stagesJson.value))) {
      setErr(`lifecycle_stages: ${stagesJson.error ?? "Expected a JSON array."}`);
      return;
    }
    const aliasesJson = parseJsonText(aliasesText, { objectOnly: true });
    if (!aliasesJson.ok) {
      setErr(`stage_key_aliases: ${aliasesJson.error}`);
      return;
    }
    const workflowJson = parseJsonText(workflowConfigText, { objectOnly: true });
    if (!workflowJson.ok) {
      setErr(`workflow: ${workflowJson.error}`);
      return;
    }
    const displayPatch: JsonRecord = {
      lifecycle_stages: stagesJson.value ?? [],
      stage_key_aliases: aliasesJson.value ?? {},
      workflow: workflowJson.value ?? {},
    };
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch(`/api/relay/metadata/admin/entities/${entity.id}/contracts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature_flags: flags,
          display_config: displayPatch,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json() as { item: Record<string, unknown> };
      const nextFlags = asRecord(data.item["feature_flags"] ?? flags);
      const nextDisplay = asRecord(data.item["display_config"] ?? { ...display, ...displayPatch });
      setFlags(nextFlags);
      setDisplay(nextDisplay);
      setStagesText(formatJson(nextDisplay["lifecycle_stages"] ?? []));
      setAliasesText(formatJson(nextDisplay["stage_key_aliases"] ?? {}));
      setWorkflowConfigText(formatJson(nextDisplay["workflow"] ?? {}));
      setEditing(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <WorkPanel
        title="Workflow contract"
        description="Workflow participation, approvable behavior, SLA target, and runtime stage metadata."
        actions={
          editing ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setFlags(asRecord(entity.feature_flags)); setDisplay(asRecord(entity.display_config)); setEditing(false); setErr(null); }}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
          )
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <Switch id="has-workflow" checked={flags["has_workflow"] === true} disabled={!editing} onCheckedChange={(value) => setFlags((current) => ({ ...current, has_workflow: value }))} />
            <Label htmlFor="has-workflow" className="text-sm">Workflow enabled</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="is-approvable" checked={flags["is_approvable"] === true} disabled={!editing} onCheckedChange={(value) => setFlags((current) => ({ ...current, is_approvable: value }))} />
            <Label htmlFor="is-approvable" className="text-sm">Approvable</Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SLA target hours</Label>
            <Input
              className="h-8 text-sm"
              type="number"
              disabled={!editing}
              value={String(flags["sla_target_hours"] ?? "")}
              onChange={(event) => setFlags((current) => ({ ...current, sla_target_hours: numberOrUndefined(event.target.value) }))}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Lifecycle/workflow stages</Label>
            <Textarea className="min-h-44 font-mono text-xs" disabled={!editing} value={stagesText} onChange={(event) => setStagesText(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stage aliases</Label>
            <Textarea className="min-h-44 font-mono text-xs" disabled={!editing} value={aliasesText} onChange={(event) => setAliasesText(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Workflow presentation config</Label>
            <Textarea className="min-h-44 font-mono text-xs" disabled={!editing} value={workflowConfigText} onChange={(event) => setWorkflowConfigText(event.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant={workflowEnabled ? "default" : "outline"}>{workflowEnabled ? "enabled" : "disabled"}</Badge>
          <Badge variant="outline">{stages.length} stages</Badge>
          {issue && <Badge variant="destructive">needs stages</Badge>}
        </div>
        {issue && <p className="mt-3 text-xs text-destructive">{issue}</p>}
        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
      </WorkPanel>

      <WorkPanel
        title="Workflow backend coverage"
        description="Runtime compiler coverage currently resolves workflow from entity feature flags and display stages."
      >
        <div className="grid gap-2 text-xs md:grid-cols-3">
          <div className="rounded border px-3 py-2">
            <p className="font-medium">Compiled runtime fields</p>
            <p className="text-muted-foreground">enabled, stages, slaTargetHours</p>
          </div>
          <div className="rounded border px-3 py-2">
            <p className="font-medium">Persisted contract source</p>
            <p className="text-muted-foreground">feature_flags, display_config</p>
          </div>
          <div className="rounded border px-3 py-2">
            <p className="font-medium">Template CRUD</p>
            <p className="text-muted-foreground">Requires workflow-admin endpoint before Studio can safely mutate approval templates.</p>
          </div>
        </div>
      </WorkPanel>
    </div>
  );
}
