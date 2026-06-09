"use client";

import { useEffect, useMemo, useState } from "react";
import { StatePanel, WorkPanel } from "@athyper/surface-kit";
import { Badge, Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { EntityOperation, EntityPolicy } from "./types";
import { ACCESS_MODES, AUDIT_MODES, COMPANY_SCOPE_MODES, formatJson, parseJsonText } from "./metadataContract";

interface PolicyDraft {
  access_mode: string;
  company_scope_mode: string;
  audit_mode: string;
  retention_policy: string;
  default_filters: string;
  cache_flags: string;
}

function draftFromPolicy(policy: Partial<EntityPolicy> | null): PolicyDraft {
  return {
    access_mode: policy?.access_mode ?? "default_deny",
    company_scope_mode: policy?.company_scope_mode ?? "none",
    audit_mode: policy?.audit_mode === "minimal" ? "sampling" : policy?.audit_mode ?? "enabled",
    retention_policy: formatJson(policy?.retention_policy ?? {}),
    default_filters: formatJson(policy?.default_filters ?? {}),
    cache_flags: formatJson(policy?.cache_flags ?? {}),
  };
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `${res.status}`;
}

function JsonPolicyField({
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
      <Textarea className="min-h-36 font-mono text-xs" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function parseDraft(draft: PolicyDraft): { body?: Record<string, unknown>; error?: string } {
  const retention = parseJsonText(draft.retention_policy, { objectOnly: true });
  if (!retention.ok) return { error: `retention_policy: ${retention.error}` };
  const filters = parseJsonText(draft.default_filters, { objectOnly: true });
  if (!filters.ok) return { error: `default_filters: ${filters.error}` };
  const cache = parseJsonText(draft.cache_flags, { objectOnly: true });
  if (!cache.ok) return { error: `cache_flags: ${cache.error}` };
  return {
    body: {
      access_mode: draft.access_mode,
      company_scope_mode: draft.company_scope_mode,
      audit_mode: draft.audit_mode,
      retention_policy: retention.value ?? {},
      default_filters: filters.value ?? {},
      cache_flags: cache.value ?? {},
    },
  };
}

function PolicyMatrixPreview({
  policy,
  operations,
}: {
  policy: Partial<EntityPolicy>;
  operations: EntityOperation[];
}) {
  const rows = useMemo(() => {
    const accessMode = policy.access_mode ?? "default_deny";
    return operations.map((operation) => ({
      permission: operation.permission_code,
      surface: operation.surface,
      intent: operation.intent ?? "neutral",
      defaultDecision: accessMode === "public" || accessMode === "default_allow" ? "allow unless denied" : "deny unless granted",
      audit: policy.audit_mode ?? "enabled",
      scope: policy.company_scope_mode ?? "none",
    }));
  }, [operations, policy.access_mode, policy.audit_mode, policy.company_scope_mode]);

  return (
    <WorkPanel
      title="Policy matrix preview"
      description="Effective posture by operation. Authorization decisions still come from IAM and policy evaluation at runtime."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No operations loaded for matrix preview.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <div key={row.permission} className="grid gap-2 rounded border px-3 py-2 text-xs md:grid-cols-5">
              <span className="font-mono">{row.permission}</span>
              <Badge variant="outline" className="w-fit text-xs">{row.surface}</Badge>
              <Badge variant={row.intent === "danger" ? "destructive" : "outline"} className="w-fit text-xs">{row.intent}</Badge>
              <span>{row.defaultDecision}</span>
              <span className="text-muted-foreground">{row.scope} / {row.audit}</span>
            </div>
          ))}
        </div>
      )}
    </WorkPanel>
  );
}

export function PolicyTab({ entityId, entityName }: { entityId: string; entityName: string }) {
  const [policy, setPolicy] = useState<EntityPolicy | null>(null);
  const [operations, setOperations] = useState<EntityOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(null));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [policyRes, operationsRes] = await Promise.all([
        fetch(`/api/relay/metadata/admin/entity-policies?entity_id=${encodeURIComponent(entityId)}`),
        fetch(`/api/relay/metadata/admin/entity-operations?entity=${encodeURIComponent(entityName)}`),
      ]);
      if (!policyRes.ok) throw new Error(await readError(policyRes));
      const policyData = await policyRes.json() as { items: EntityPolicy[] };
      const first = policyData.items[0] ?? null;
      setPolicy(first);
      setDraft(draftFromPolicy(first));
      if (operationsRes.ok) {
        setOperations(((await operationsRes.json()) as { items: EntityOperation[] }).items);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to load policy.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [entityId, entityName]);

  async function save() {
    const parsed = parseDraft(draft);
    if (parsed.error) {
      setErr(parsed.error);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let res: Response;
      if (policy) {
        res = await csrfFetch(`/api/relay/metadata/admin/entity-policies/${policy.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.body),
        });
      } else {
        res = await csrfFetch("/api/relay/metadata/admin/entity-policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_id: entityId, ...parsed.body }),
        });
      }
      if (!res.ok) throw new Error(await readError(res));
      const updated = await res.json() as EntityPolicy;
      setPolicy(updated);
      setDraft(draftFromPolicy(updated));
      setEditing(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <StatePanel title="Loading..." message="Fetching policy." />;

  const current = policy ?? {
    access_mode: draft.access_mode,
    company_scope_mode: draft.company_scope_mode,
    audit_mode: draft.audit_mode,
    retention_policy: {},
    default_filters: {},
    cache_flags: {},
  };

  return (
    <div className="space-y-4">
      <WorkPanel
        title="Entity policy"
        description="Access mode, company scope, audit mode, retention, default filters, and cache flags."
        actions={
          editing ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(draftFromPolicy(policy)); setEditing(false); setErr(null); }}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(draftFromPolicy(policy)); setEditing(true); }}>
              {policy ? "Edit" : "Create policy"}
            </Button>
          )
        }
      >
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Access mode</Label>
            {editing ? (
              <Select value={draft.access_mode} onValueChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, access_mode: value }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ACCESS_MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{String(current.access_mode ?? "-")}</Badge>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Company scope</Label>
            {editing ? (
              <Select value={draft.company_scope_mode} onValueChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, company_scope_mode: value }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{COMPANY_SCOPE_MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{String(current.company_scope_mode ?? "-")}</Badge>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Audit mode</Label>
            {editing ? (
              <Select value={draft.audit_mode} onValueChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, audit_mode: value }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIT_MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{String(current.audit_mode ?? "-")}</Badge>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <JsonPolicyField label="Retention policy" value={draft.retention_policy} onChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, retention_policy: value }))} />
            <JsonPolicyField label="Default filters" value={draft.default_filters} onChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, default_filters: value }))} />
            <JsonPolicyField label="Cache flags" value={draft.cache_flags} onChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, cache_flags: value }))} />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <pre className="max-h-44 overflow-auto rounded border bg-muted/40 p-2 text-xs">{formatJson(current.retention_policy)}</pre>
            <pre className="max-h-44 overflow-auto rounded border bg-muted/40 p-2 text-xs">{formatJson(current.default_filters)}</pre>
            <pre className="max-h-44 overflow-auto rounded border bg-muted/40 p-2 text-xs">{formatJson(current.cache_flags)}</pre>
          </div>
        )}

        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
      </WorkPanel>

      <PolicyMatrixPreview policy={policy ?? current} operations={operations} />
    </div>
  );
}
