"use client";

import {
  Calendar,
  Check,
  Database,
  Hash,
  HelpCircle,
  Layers,
  Pencil,
  Settings,
  Tag,
  User,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import type { EntitySummary } from "@/lib/schema-manager/types";

import { ColorTokenPicker } from "@/components/mesh/shared/ColorTokenPicker";
import { IconPicker, resolveIcon } from "@/components/mesh/shared/IconPicker";
import { ClassBadge } from "@/components/mesh/shared/ClassBadge";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEntityMeta } from "@/lib/schema-manager/use-entity-meta";
import { useModules } from "@/lib/schema-manager/use-modules";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";

// ─── Helpers ──────────────────────────────────────────────────

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}


interface DLItem {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
}

function DL({ items, cols = 2 }: { items: DLItem[]; cols?: 2 | 3 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2${cols === 3 ? " lg:grid-cols-3" : ""}`}>
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <dt className="inline-flex items-center gap-1 text-xs font-medium text-meta-text-soft">
            {item.label}
            {item.tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3 cursor-help text-muted-foreground/60" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  {item.tooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </dt>
          <dd className="text-sm">{item.value ?? <Dash />}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Renders a JSON object as pill badges for boolean maps, or a collapsible pre for complex objects. */
function JsonValue({ data }: { data: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);

  if (!data) return <Dash />;

  // Simple boolean map → render as pill badges
  const entries = Object.entries(data);
  const isSimpleBooleanMap =
    entries.length > 0 && entries.every(([, v]) => typeof v === "boolean");

  if (isSimpleBooleanMap) {
    const trueKeys = entries.filter(([, v]) => v === true).map(([k]) => k);
    if (trueKeys.length === 0) return <Dash />;
    return (
      <div className="flex flex-wrap gap-1">
        {trueKeys.map((k) => (
          <Badge key={k} variant="secondary" className="text-xs font-mono">
            {k}
          </Badge>
        ))}
      </div>
    );
  }

  // Complex object → collapsible JSON
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? "Collapse" : "Expand"} ({entries.length}{" "}
        {entries.length === 1 ? "key" : "keys"})
      </Button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Reusable label with optional tooltip – matches the DL read-only pattern. */
function FieldLabel({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <label className="inline-flex items-center gap-1 text-xs font-medium text-meta-text-soft">
      {children}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="size-3 cursor-help text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </label>
  );
}

function StatusLabel({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} />
      <span className="capitalize">{status}</span>
    </span>
  );
}

function formatTimestamp(ts: string | null | undefined): React.ReactNode {
  if (!ts) return <Dash />;
  try {
    const d = new Date(ts);
    return (
      <span title={d.toISOString()}>
        {d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}{" "}
        {d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    );
  } catch {
    return (
      <Badge variant="outline" className="text-xs font-mono">
        {ts}
      </Badge>
    );
  }
}

// ─── Dropdown Options ────────────────────────────────────────

const ENTITY_CLASSES = [
  { value: "REFERENCE", label: "Reference", hint: "Lookup / config data" },
  { value: "MASTER", label: "Master", hint: "Core business entities" },
  { value: "DOCUMENT", label: "Document", hint: "Lifecycle-managed documents" },
  { value: "CONTROL", label: "Control", hint: "Configuration / rules" },
  { value: "LEDGER", label: "Ledger", hint: "Immutable append-only records" },
  { value: "LOG", label: "Log", hint: "Operational event streams" },
] as const;

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "deprecated", label: "Deprecated" },
  { value: "suspended", label: "Suspended" },
] as const;

const GOVERNANCE_LEVELS = [
  { value: "full", label: "Full" },
  { value: "light", label: "Light" },
  { value: "audit_only", label: "Audit Only" },
] as const;

const MAPPING_MODES = [
  { value: "exclusive", label: "Exclusive" },
  { value: "shared", label: "Shared" },
] as const;

const OWNERSHIP_MODELS = [
  { value: "system", label: "System" },
  { value: "tenant", label: "Tenant" },
  { value: "shared", label: "Shared" },
] as const;

const MUTABILITY_OPTIONS = [
  { value: "mutable", label: "Mutable" },
  { value: "controlled", label: "Controlled" },
  { value: "immutable", label: "Immutable" },
] as const;

const BACKING_TYPES = [
  { value: "table", label: "Table" },
  { value: "view", label: "View" },
  { value: "virtual", label: "Virtual" },
] as const;

/** Smart default: entityClass → governance level */
const CLASS_GOVERNANCE_DEFAULT: Record<string, string> = {
  REFERENCE: "light",
  MASTER: "full",
  DOCUMENT: "full",
  CONTROL: "light",
  LEDGER: "full",
  LOG: "audit_only",
};

// ─── Shared save helper ──────────────────────────────────────

async function saveEntityFields(
  entityName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}`,
    {
      method: "PUT",
      headers: { ...buildHeaders(), "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      body.error?.message ?? `Failed to update entity (${res.status})`,
    );
  }
}

// ─── Sections ─────────────────────────────────────────────────

interface IdentityFormState {
  entityShort: string;
  slug: string;
  moduleId: string;
}

function IdentitySection({ entity: e, onSaved, modules }: { entity: EntitySummary; onSaved: () => void; modules: { code: string; name: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<IdentityFormState>({
    entityShort: "",
    slug: "",
    moduleId: "",
  });

  const startEditing = useCallback(() => {
    setForm({
      entityShort: e.entityShort ?? "",
      slug: e.slug ?? "",
      moduleId: e.moduleId ?? "",
    });
    setError(null);
    setEditing(true);
  }, [e]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveEntityFields(e.name, {
        entityShort: form.entityShort.trim() || null,
        slug: form.slug.trim() || null,
        moduleId: form.moduleId || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [form, e.name, onSaved]);

  if (editing) {
    return (
      <Card className="border-meta-border-soft">
        <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Hash className="size-4 text-meta-text-soft" />
              Identity & Codes
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={cancelEditing} disabled={saving}>
                <X className="size-3" /> Cancel
              </Button>
              <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleSave} disabled={saving}>
                <Check className="size-3" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Abbreviated code (e.g. PINV, MJE) used in document numbering and compact displays">Short Code</FieldLabel>
              <Input
                value={form.entityShort}
                onChange={(ev) => setForm((p) => ({ ...p, entityShort: ev.target.value }))}
                placeholder="e.g. PINV"
                className="h-8 font-mono text-sm uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="URL-friendly kebab-case identifier used in routes and REST endpoints">Slug</FieldLabel>
              <Input
                value={form.slug}
                onChange={(ev) => setForm((p) => ({ ...p, slug: ev.target.value }))}
                placeholder="e.g. purchase-invoice"
                className="h-8 font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="The functional module this entity belongs to (e.g. ACC, CRM, INV)">Module</FieldLabel>
              <Select value={form.moduleId} onValueChange={(v) => setForm((p) => ({ ...p, moduleId: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.code} value={m.code}>{m.code} — {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Read-only fields shown for context */}
          <Separator className="my-4" />
          <DL
            items={[
              {
                label: "Entity Code",
                tooltip: "Immutable after publish — set during entity creation",
                value: e.entityCode ? (
                  <Badge variant="outline" className="text-xs font-mono">
                    {e.entityCode}
                  </Badge>
                ) : null,
              },
              {
                label: "Table",
                tooltip: "Immutable after publish — set during entity creation",
                value: (
                  <Badge variant="outline" className="text-xs font-mono">
                    {e.tableSchema}.{e.tableName}
                  </Badge>
                ),
              },
              {
                label: "Identity Config",
                tooltip: "Configuration for display templates, primary code field, and label field used in lookups and references",
                value: (
                  <JsonValue data={e.identityConfig as Record<string, unknown> | null} />
                ),
              },
            ]}
          />

          {error && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/5 p-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-meta-border-soft">
      <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Hash className="size-4 text-meta-text-soft" />
            Identity & Codes
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={startEditing}>
            <Pencil className="size-3" /> Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <DL
          items={[
            {
              label: "Entity Code",
              tooltip: "Unique snake_case identifier used in code generation and API references",
              value: e.entityCode ? (
                <Badge variant="outline" className="text-xs font-mono">{e.entityCode}</Badge>
              ) : null,
            },
            {
              label: "Slug",
              tooltip: "URL-friendly kebab-case identifier used in routes and REST endpoints",
              value: e.slug ? (
                <Badge variant="outline" className="text-xs font-mono">{e.slug}</Badge>
              ) : null,
            },
            {
              label: "Short Code",
              tooltip: "Abbreviated code (e.g. PINV, MJE) used in document numbering and compact displays",
              value: e.entityShort ? (
                <Badge variant="outline" className="text-xs font-mono">{e.entityShort}</Badge>
              ) : null,
            },
            {
              label: "Module",
              tooltip: "The functional module this entity belongs to (e.g. ACC, CRM, INV)",
              value: e.moduleId ? (
                <Badge variant="outline" className="text-xs">{e.moduleId}</Badge>
              ) : null,
            },
            {
              label: "Table",
              tooltip: "Physical PostgreSQL schema and table name (schema.table) where entity data is stored",
              value: (
                <Badge variant="outline" className="text-xs font-mono">
                  {e.tableSchema}.{e.tableName}
                </Badge>
              ),
            },
            {
              label: "Identity Config",
              tooltip: "Configuration for display templates, primary code field, and label field used in lookups and references",
              value: (
                <JsonValue
                  data={
                    e.identityConfig as Record<string, unknown> | null
                  }
                />
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

interface ClassificationFormState {
  entityClass: string;
  status: string;
  governanceLevel: string;
  mappingMode: string;
  ownershipModel: string;
  mutability: string;
  backingType: string;
  engineTag: string;
}

function ClassificationSection({ entity: e, onSaved }: { entity: EntitySummary; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ClassificationFormState>({
    entityClass: "",
    status: "",
    governanceLevel: "",
    mappingMode: "",
    ownershipModel: "",
    mutability: "",
    backingType: "",
    engineTag: "",
  });

  const startEditing = useCallback(() => {
    setForm({
      entityClass: e.entityClass ?? "",
      status: e.status ?? "",
      governanceLevel: e.governanceLevel ?? "",
      mappingMode: e.mappingMode ?? "",
      ownershipModel: e.ownershipModel ?? "",
      mutability: e.mutability ?? "",
      backingType: e.backingType ?? "",
      engineTag: e.engineTag ?? "",
    });
    setError(null);
    setEditing(true);
  }, [e]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveEntityFields(e.name, {
        entityClass: form.entityClass || null,
        status: form.status || undefined,
        governanceLevel: form.governanceLevel || undefined,
        mappingMode: form.mappingMode || undefined,
        ownershipModel: form.ownershipModel || null,
        mutability: form.mutability || null,
        backingType: form.backingType || null,
        engineTag: form.engineTag.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [form, e.name, onSaved]);

  const set = useCallback(
    <K extends keyof ClassificationFormState>(key: K, val: ClassificationFormState[K]) =>
      setForm((p) => {
        const next = { ...p, [key]: val };
        // Auto-suggest governance level when entityClass changes
        if (key === "entityClass" && typeof val === "string") {
          const suggested = CLASS_GOVERNANCE_DEFAULT[val];
          if (suggested) next.governanceLevel = suggested;
        }
        return next;
      }),
    [],
  );

  if (editing) {
    return (
      <Card className="border-meta-border-soft">
        <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Layers className="size-4 text-meta-text-soft" />
              Classification & Behavior
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={cancelEditing} disabled={saving}>
                <X className="size-3" /> Cancel
              </Button>
              <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleSave} disabled={saving}>
                <Check className="size-3" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Entity classification: REFERENCE (lookup data), MASTER (core business entity), DOCUMENT (transactional document), CONTROL (config/rules), LEDGER (immutable records), LOG (event streams)">Entity Class</FieldLabel>
              <Select value={form.entityClass} onValueChange={(v) => set("entityClass", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_CLASSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span>{c.label}</span>
                      <span className="ml-1.5 text-muted-foreground text-xs">— {c.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Current lifecycle status: active (in use), draft (not yet live), deprecated (phased out), suspended (temporarily disabled)">Status</FieldLabel>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Level of schema governance: full (strict validation, approval required), light (basic validation), none (no constraints)">Governance</FieldLabel>
              <Select value={form.governanceLevel} onValueChange={(v) => set("governanceLevel", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOVERNANCE_LEVELS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="How the entity maps to its backing table: exclusive (1:1 ownership) or shared (multiple entities share one table via discriminator)">Mapping Mode</FieldLabel>
              <Select value={form.mappingMode} onValueChange={(v) => set("mappingMode", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAPPING_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Data ownership model: system (platform-managed), tenant (tenant-owned), shared (cross-tenant reference data)">Ownership</FieldLabel>
              <Select value={form.ownershipModel} onValueChange={(v) => set("ownershipModel", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIP_MODELS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Controls how records can be modified: mutable (freely editable), controlled (edit with audit trail), immutable (write-once, no updates)">Mutability</FieldLabel>
              <Select value={form.mutability} onValueChange={(v) => set("mutability", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MUTABILITY_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Physical storage mechanism: table (real DB table), view (database view), virtual (computed at runtime, no persistence)">Backing Type</FieldLabel>
              <Select value={form.backingType} onValueChange={(v) => set("backingType", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BACKING_TYPES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Runtime processing engine bound to this entity (e.g. posting-engine for financial documents that generate journal entries)">Engine Tag</FieldLabel>
              <Input
                value={form.engineTag}
                onChange={(ev) => set("engineTag", ev.target.value)}
                placeholder="e.g. posting-engine"
                className="h-8 font-mono text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/5 p-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-meta-border-soft">
      <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Layers className="size-4 text-meta-text-soft" />
            Classification & Behavior
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={startEditing}>
            <Pencil className="size-3" /> Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <DL
          items={[
            {
              label: "Entity Class",
              tooltip: "Entity classification: REFERENCE (lookup data), MASTER (core business entity), DOCUMENT (transactional document), CONTROL (config/rules), LEDGER (immutable records), LOG (event streams)",
              value: e.entityClass ? (
                <ClassBadge entityClass={e.entityClass} />
              ) : null,
            },
            {
              label: "Status",
              tooltip: "Current lifecycle status: active (in use), draft (not yet live), deprecated (phased out), suspended (temporarily disabled)",
              value: e.status ? <StatusLabel status={e.status} /> : null,
            },
            {
              label: "Governance",
              tooltip: "Level of schema governance: full (strict validation, approval required), light (basic validation), none (no constraints)",
              value: e.governanceLevel ? (
                <Badge variant="outline" className="text-xs capitalize">
                  {e.governanceLevel}
                </Badge>
              ) : null,
            },
            {
              label: "Mapping Mode",
              tooltip: "How the entity maps to its backing table: exclusive (1:1 ownership) or shared (multiple entities share one table via discriminator)",
              value: e.mappingMode ? (
                <Badge variant="outline" className="text-xs capitalize">{e.mappingMode}</Badge>
              ) : null,
            },
            {
              label: "Ownership",
              tooltip: "Data ownership model: system (platform-managed), tenant (tenant-owned), shared (cross-tenant reference data)",
              value: e.ownershipModel ? (
                <Badge variant="outline" className="text-xs capitalize">{e.ownershipModel}</Badge>
              ) : null,
            },
            {
              label: "Mutability",
              tooltip: "Controls how records can be modified: mutable (freely editable), controlled (edit with audit trail), immutable (write-once, no updates)",
              value: e.mutability ? (
                <Badge variant="outline" className="text-xs capitalize">
                  {e.mutability}
                </Badge>
              ) : null,
            },
            {
              label: "Backing Type",
              tooltip: "Physical storage mechanism: table (real DB table), view (database view), virtual (computed at runtime, no persistence)",
              value: e.backingType ? (
                <Badge variant="outline" className="text-xs capitalize">
                  {e.backingType}
                </Badge>
              ) : null,
            },
            {
              label: "Engine Tag",
              tooltip: "Runtime processing engine bound to this entity (e.g. posting-engine for financial documents that generate journal entries)",
              value: e.engineTag ? (
                <Badge variant="secondary" className="text-xs font-mono">
                  {e.engineTag}
                </Badge>
              ) : null,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

interface DisplayFormState {
  labelSingular: string;
  labelPlural: string;
  description: string;
  iconKey: string;
  colorToken: string;
}

function DisplaySection({
  entity: e,
  onSaved,
}: {
  entity: EntitySummary;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DisplayFormState>({
    labelSingular: "",
    labelPlural: "",
    description: "",
    iconKey: "",
    colorToken: "",
  });

  const startEditing = useCallback(() => {
    setForm({
      labelSingular: e.labelSingular ?? "",
      labelPlural: e.labelPlural ?? "",
      description: e.description ?? "",
      iconKey: e.iconKey ?? "",
      colorToken: e.colorToken ?? "",
    });
    setError(null);
    setEditing(true);
  }, [e]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveEntityFields(e.name, {
        labelSingular: form.labelSingular.trim() || null,
        labelPlural: form.labelPlural.trim() || null,
        description: form.description.trim() || null,
        iconKey: form.iconKey.trim() || null,
        colorToken: form.colorToken.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [form, e.name, onSaved]);

  const updateField = useCallback(
    (field: keyof DisplayFormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  if (editing) {
    return (
      <Card className="border-meta-border-soft">
        <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Tag className="size-4 text-meta-text-soft" />
              Display & UX
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={cancelEditing}
                disabled={saving}
              >
                <X className="size-3" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={handleSave}
                disabled={saving}
              >
                <Check className="size-3" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel tooltip="Human-readable singular name shown in UI headings, breadcrumbs, and form titles">Label (Singular)</FieldLabel>
              <Input
                value={form.labelSingular}
                onChange={(ev) => updateField("labelSingular", ev.target.value)}
                placeholder="e.g. Purchase Invoice"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel tooltip="Human-readable plural name shown in list views, navigation menus, and table headers">Label (Plural)</FieldLabel>
              <Input
                value={form.labelPlural}
                onChange={(ev) => updateField("labelPlural", ev.target.value)}
                placeholder="e.g. Purchase Invoices"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <FieldLabel tooltip="Brief explanation of the entity's purpose, shown in tooltips and documentation">Description</FieldLabel>
              <Textarea
                value={form.description}
                onChange={(ev) => updateField("description", ev.target.value)}
                placeholder="Brief explanation of this entity's purpose"
                className="min-h-[60px] resize-y text-sm"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Lucide icon name used to visually represent this entity in navigation, lists, and badges">Icon Key</FieldLabel>
              <IconPicker
                value={form.iconKey}
                onChange={(v) => updateField("iconKey", v)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel tooltip="Design system color token applied to the entity's icon, badges, and accent elements">Color Token</FieldLabel>
              <ColorTokenPicker
                value={form.colorToken}
                onChange={(v) => updateField("colorToken", v)}
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/5 p-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-meta-border-soft">
      <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Tag className="size-4 text-meta-text-soft" />
            Display & UX
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={startEditing}
          >
            <Pencil className="size-3" />
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <DL
          cols={3}
          items={[
            {
              label: "Label (Singular)",
              tooltip: "Human-readable singular name shown in UI headings, breadcrumbs, and form titles",
              value: e.labelSingular ?? null,
            },
            {
              label: "Label (Plural)",
              tooltip: "Human-readable plural name shown in list views, navigation menus, and table headers",
              value: e.labelPlural ?? null,
            },
            {
              label: "Description",
              tooltip: "Brief explanation of the entity's purpose, shown in tooltips and documentation",
              value: e.description ?? null,
            },
            {
              label: "Icon Key",
              tooltip: "Lucide icon name used to visually represent this entity in navigation, lists, and badges",
              value: e.iconKey ? (
                <span className="inline-flex items-center gap-1.5">
                  {(() => {
                    const Icon = resolveIcon(e.iconKey);
                    return Icon ? <Icon className="size-4 text-muted-foreground" /> : null;
                  })()}
                  <Badge variant="outline" className="text-xs font-mono">{e.iconKey}</Badge>
                </span>
              ) : null,
            },
            {
              label: "Color Token",
              tooltip: "Design system color token applied to the entity's icon, badges, and accent elements",
              value: e.colorToken ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: `var(--${e.colorToken}, ${e.colorToken})` }}
                  />
                  <Badge variant="outline" className="text-xs">{e.colorToken}</Badge>
                </span>
              ) : null,
            },
            {
              label: "Display Config",
              tooltip: "UI layout configuration including display fields for list views, section labels, and section field overrides",
              value: (
                <JsonValue
                  data={
                    e.displayConfig as Record<string, unknown> | null
                  }
                />
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function FeaturesSection({ entity: e }: { entity: EntitySummary }) {
  const hasDiscriminator = e.discriminatorColumn || e.discriminatorValue;

  return (
    <Card className="border-meta-border-soft">
      <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Settings className="size-4 text-meta-text-soft" />
          Features & Policies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <DL
          items={[
            {
              label: "Feature Flags",
              tooltip: "Boolean capability flags that activate runtime behaviors (e.g. hasPosting, hasApproval, hasSettlement, hasNumbering)",
              value: (
                <JsonValue
                  data={
                    e.featureFlags as Record<string, unknown> | null
                  }
                />
              ),
            },
            {
              label: "Naming Policy",
              tooltip: "Auto-numbering rules for document/record codes (e.g. prefix, sequence format, reset cycle)",
              value: (
                <JsonValue
                  data={
                    e.namingPolicy as Record<string, unknown> | null
                  }
                />
              ),
            },
            {
              label: "Data Policy",
              tooltip: "Data governance rules including retention periods, archival strategy, and PII handling requirements",
              value: (
                <JsonValue
                  data={
                    e.dataPolicy as Record<string, unknown> | null
                  }
                />
              ),
            },
            {
              label: "Provenance",
              tooltip: "Origin or source of the entity definition (e.g. seed, migration, user-created) for traceability",
              value: e.provenance ? (
                <Badge variant="outline" className="text-xs capitalize">
                  {e.provenance}
                </Badge>
              ) : null,
            },
          ]}
        />

        {hasDiscriminator && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-medium text-meta-text-soft">
                Polymorphism
              </p>
              <DL
                items={[
                  {
                    label: "Discriminator Column",
                    tooltip: "Column in the shared table that distinguishes which entity a row belongs to (single-table inheritance pattern)",
                    value: e.discriminatorColumn ? (
                      <Badge variant="outline" className="text-xs font-mono">
                        {e.discriminatorColumn}
                      </Badge>
                    ) : null,
                  },
                  {
                    label: "Discriminator Value",
                    tooltip: "The specific value in the discriminator column that identifies rows belonging to this entity",
                    value: e.discriminatorValue ? (
                      <Badge variant="outline" className="text-xs font-mono">
                        {e.discriminatorValue}
                      </Badge>
                    ) : null,
                  },
                ]}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OperationalSection({ entity: e }: { entity: EntitySummary }) {
  return (
    <Card className="border-meta-border-soft">
      <CardHeader className="border-b border-meta-border-soft bg-meta-surface-subtle pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Database className="size-4 text-meta-text-soft" />
          Operational & Audit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <DL
          items={[
            {
              label: "Published Version",
              tooltip: "UUID of the currently published (live) version of this entity's schema definition",
              value: e.publishedVersionId ? (
                <Badge variant="outline" className="text-xs font-mono">
                  {e.publishedVersionId.slice(0, 12)}...
                </Badge>
              ) : null,
            },
            {
              label: "Last Compiled",
              tooltip: "Timestamp when the entity schema was last compiled into a deployment-ready artifact",
              value: formatTimestamp(e.lastCompiledAt),
            },
            {
              label: "Compiled Hash",
              tooltip: "Content hash of the compiled artifact, used to detect changes and skip redundant recompilations",
              value: e.lastCompiledHash ? (
                <Badge variant="outline" className="text-xs font-mono">
                  {e.lastCompiledHash.slice(0, 12)}
                </Badge>
              ) : null,
            },
            {
              label: "Last Schema Change",
              tooltip: "Timestamp of the most recent structural change (field add/remove/modify, relation change, index change)",
              value: formatTimestamp(e.lastSchemaChangeAt),
            },
            {
              label: "Fields",
              tooltip: "Total number of field definitions in the current version of this entity",
              value: (
                <Badge variant="secondary" className="text-xs">
                  {e.fieldCount}
                </Badge>
              ),
            },
            {
              label: "Relations",
              tooltip: "Total number of relation definitions (belongs_to, has_many, m2m) in the current version",
              value: (
                <Badge variant="secondary" className="text-xs">
                  {e.relationCount}
                </Badge>
              ),
            },
          ]}
        />

        <Separator />

        {/* Status History */}
        <div>
          <p className="mb-2 text-xs font-medium text-meta-text-soft">
            Status History
          </p>
          <DL
            items={[
              {
                label: "Status Changed At",
                tooltip: "Timestamp when the entity status was last changed (e.g. draft to active, active to deprecated)",
                value: formatTimestamp(e.statusChangedAt),
              },
              {
                label: "Status Changed By",
                tooltip: "User or system actor who performed the last status change",
                value: e.statusChangedBy ? (
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3 text-muted-foreground" />
                    {e.statusChangedBy}
                  </span>
                ) : null,
              },
              {
                label: "Status Reason",
                tooltip: "Optional explanation for why the status was changed (e.g. suspended for migration, deprecated in favor of v2)",
                value: e.statusReason ?? null,
              },
            ]}
          />
        </div>

        <Separator />

        {/* Timestamps */}
        <div>
          <p className="mb-2 text-xs font-medium text-meta-text-soft">
            Timestamps
          </p>
          <DL
            items={[
              {
                label: "Created",
                tooltip: "When and by whom the entity definition was first created in the meta registry",
                value: (
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="size-3 text-muted-foreground" />
                    {formatTimestamp(e.createdAt)}
                    {e.createdBy && (
                      <span className="text-muted-foreground">
                        by {e.createdBy}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                label: "Updated",
                tooltip: "When and by whom the entity definition was last modified (any field, satellite, or version change)",
                value: (
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="size-3 text-muted-foreground" />
                    {formatTimestamp(e.updatedAt)}
                    {e.updatedBy && (
                      <span className="text-muted-foreground">
                        by {e.updatedBy}
                      </span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function OverviewPage() {
  const { entity } = useParams<{ entity: string }>();
  const entityName = decodeURIComponent(entity);
  const { entity: entityData, loading, error, refresh } = useEntityMeta(entityName);
  const { modules } = useModules();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </div>
        <Skeleton className="h-40 rounded-md" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!entityData) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-sm text-muted-foreground">Entity not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IdentitySection entity={entityData} onSaved={refresh} modules={modules} />
        <ClassificationSection entity={entityData} onSaved={refresh} />
      </div>
      <DisplaySection entity={entityData} onSaved={refresh} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FeaturesSection entity={entityData} />
        <OperationalSection entity={entityData} />
      </div>
    </div>
  );
}
