"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import { Badge, Button, Label, Textarea } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { EntityDetail } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJson(text: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON." };
  }
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `Request failed (${response.status}).`;
}

function JsonSection({
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(formatJson(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(formatJson(value)), [value]);

  function apply() {
    const parsed = parseJson(text);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onChange(parsed.value);
  }

  return (
    <WorkPanel
      title={title}
      description={description}
      actions={!disabled ? <Button type="button" size="sm" variant="outline" onClick={apply}>Apply section</Button> : undefined}
    >
      <Label className="sr-only" htmlFor={`contract-${title}`}>{title}</Label>
      <Textarea
        id={`contract-${title}`}
        className="min-h-48 font-mono text-xs"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => { if (!disabled) apply(); }}
      />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </WorkPanel>
  );
}

export function ContractEditor({ entity }: { entity: EntityDetail }) {
  const [versionId, setVersionId] = useState(entity.version_id ?? null);
  const [versionStatus, setVersionStatus] = useState(entity.version_status ?? null);
  const [contract, setContract] = useState<JsonRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fields = useMemo(() => {
    const value = contract?.["fields"];
    return Array.isArray(value) ? value.length : entity.fields.length;
  }, [contract, entity.fields.length]);
  const surfaces = Array.isArray(contract?.["surfaces"]) ? contract?.["surfaces"] as unknown[] : [];
  const operations = Array.isArray(contract?.["operations"]) ? contract?.["operations"] as unknown[] : [];

  async function load(version: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/relay/metadata/studio/entity-versions/${version}/contract-v2`);
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json() as JsonRecord;
      setContract(body);
      setVersionId(version);
      setVersionStatus(typeof body["version_status"] === "string" ? body["version_status"] : versionStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (versionId) void load(versionId);
    else {
      setLoading(false);
      setError("This entity has no effective version. Create a version before editing its contract.");
    }
    // The initial version is the only server input for this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  async function openDraft() {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const entityCode = entity.entity_code ?? entity.name;
      const response = await csrfFetch(`/api/relay/metadata/studio/entities/${encodeURIComponent(entityCode)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_type: "contract_v2", change_summary: "Meta Entity Contract v2 edit" }),
      });
      const body = await response.json().catch(() => ({})) as JsonRecord;
      const draftId = typeof body["id"] === "string"
        ? body["id"]
        : typeof body["existing_draft_id"] === "string" ? body["existing_draft_id"] : null;
      if (!draftId) throw new Error(body["message"] as string ?? `Unable to create a DRAFT (${response.status}).`);
      setVersionStatus("DRAFT");
      await load(draftId);
      setNotice("DRAFT is ready. Edit the owned sections and save the complete contract before submitting for approval.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  }

  function updateSection(key: string, value: unknown) {
    setContract((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!versionId || !contract || versionStatus !== "DRAFT") return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const response = await csrfFetch(`/api/relay/metadata/studio/entity-versions/${versionId}/contract-v2`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contract),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice("Contract v2 saved and strictly validated. Submit the DRAFT for review when ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  }

  const editable = versionStatus === "DRAFT";

  if (loading) return <WorkPanel title="Meta Entity Contract v2"><p className="text-sm text-muted-foreground">Loading the canonical contract…</p></WorkPanel>;

  return (
    <div className="space-y-4">
      <WorkPanel
        title="Meta Entity Contract v2"
        description="Each property has one owner. Search, PII, identity, surfaces, operations, lifecycle, numbering, policy, and flows are edited as one versioned graph."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={versionStatus === "DRAFT" ? "secondary" : "outline"}>{versionStatus ?? "NO VERSION"}</Badge>
            {!editable && <Button size="sm" onClick={() => void openDraft()} disabled={working}>Open DRAFT</Button>}
            {editable && <Button size="sm" onClick={() => void save()} disabled={working || !contract}>{working ? "Saving…" : "Save complete contract"}</Button>}
          </div>
        }
      >
        {contract ? (
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            <span>Version: {String(contract["contract_version"] ?? 2)}</span>
            <span>Fields: {fields}</span>
            <span>Surfaces: {surfaces.length}</span>
            <span>Operations: {operations.length}</span>
          </div>
        ) : <p className="text-sm text-muted-foreground">No canonical v2 graph is available yet.</p>}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </WorkPanel>

      {contract && (
        <>
          <JsonSection title="Catalog" description="Stable identity and classification only. Storage, runtime, layout, and feature flags do not belong here." value={contract["catalog"]} onChange={(value) => updateSection("catalog", value)} disabled={!editable} />
          <JsonSection title="Version contract" description="Runtime, API exposure, physical storage, identity, search, data policy, concurrency, and storage configuration." value={contract["version_contract"]} onChange={(value) => updateSection("version_contract", value)} disabled={!editable} />
          <JsonSection title="Fields" description="Data semantics and query capabilities. Search membership and PII are intentionally configured in their owning sections." value={contract["fields"]} onChange={(value) => updateSection("fields", value)} disabled={!editable} />
          <JsonSection title="Relations" description="Cross-entity structure, polymorphism, mutation owner, and relation permissions." value={contract["relations"]} onChange={(value) => updateSection("relations", value)} disabled={!editable} />
          <JsonSection title="Surfaces" description="List, detail, create, edit, picker, print, line editor, child collection, and field placement." value={contract["surfaces"]} onChange={(value) => updateSection("surfaces", value)} disabled={!editable} />
          <JsonSection title="Operations" description="Commands, authorization, placement, handlers, confirmation, reason requirements, and selection behavior." value={contract["operations"]} onChange={(value) => updateSection("operations", value)} disabled={!editable} />
          <JsonSection title="Lifecycle" description="Status field, state presentation, terminal/edit/delete masks, and allowed transitions." value={contract["lifecycle"]} onChange={(value) => updateSection("lifecycle", value)} disabled={!editable} />
          <JsonSection title="Numbering" description="The single owner of generated numbers, prefixes, segments, reset, uniqueness, and character policy." value={contract["numbering"]} onChange={(value) => updateSection("numbering", value)} disabled={!editable} />
          <JsonSection title="Policy and flows" description="Access, company scope, audit, retention, default filters, and create flow composition." value={{ policy: asRecord(contract["policy"]), flows: contract["flows"] ?? [] }} onChange={(value) => {
            const next = asRecord(value);
            updateSection("policy", next["policy"] ?? {});
            updateSection("flows", next["flows"] ?? []);
          }} disabled={!editable} />
        </>
      )}
    </div>
  );
}
