"use client";

/**
 * Compiled Descriptor Inspector — /setup/metadata/descriptor
 *
 * Developer/admin tool to inspect the compiled entity descriptor
 * (snapshot.entity_compiled) for any registered entity. Shows:
 *   • Full compiled JSON (prettified)
 *   • Field catalogue with data types, cardinality, feature flags
 *   • Field groups
 *   • Feature flags
 *   • compiled_hash + version_no for cache debugging
 *
 * API: GET /api/relay/metadata/entities/:entity/compiled
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCode, Search, RefreshCw, Copy, CheckCheck,
  Database, Flag, Layers, Code2,
  Hash, AlertCircle,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Skeleton, Input,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import { relayFetch, CodeBadge, StatusPill, EmptyState } from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntityField {
  id: string;
  name: string;
  column_name: string;
  label: string | null;
  data_type: string;
  ui_type: string | null;
  cardinality: string;
  origin: string;
  is_required: boolean;
  is_readonly: boolean;
  is_unique: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_pii: boolean;
  enum_domain_code: string | null;
  group_key: string | null;
  sort_order: number;
}

interface FieldGroup {
  group_key: string;
  label: string;
  description: string | null;
  sort_order: number;
  fields: string[];
}

interface FeatureFlags {
  has_attachments: boolean;
  has_comments: boolean;
  has_activity_log: boolean;
  has_workflow: boolean;
  has_lifecycle: boolean;
  has_versioning: boolean;
  is_importable: boolean;
  is_exportable: boolean;
  is_bulk_editable: boolean;
}

interface CompiledDescriptor {
  entity_id: string;
  entity_code: string;
  entity_name: string;
  entity_class: string;
  table_schema: string;
  table_name: string;
  version_no: number;
  version_hash: string;
  compiled_hash: string;
  compiled_at: string;
  governance_level: string;
  security_tier: string;
  fields: EntityField[];
  field_groups: FieldGroup[];
  display_config: Record<string, unknown>;
  feature_flags: FeatureFlags;
}

interface EntityCat {
  name: string;
  label_singular: string | null;
  entity_class: string;
  module_id: string;
}

// ─── Data type color ──────────────────────────────────────────────────────────

const DT_COLORS: Record<string, string> = {
  text:        "text-primary",
  uuid:        "text-accent-foreground",
  integer:     "text-success",
  numeric:     "text-success",
  decimal:     "text-success",
  boolean:     "text-warning",
  date:        "text-destructive",
  timestamptz: "text-destructive",
  jsonb:       "text-muted-foreground",
  json:        "text-muted-foreground",
};

function DtBadge({ type }: { type: string }) {
  const color = DT_COLORS[type.toLowerCase()] ?? "text-muted-foreground";
  return <span className={`font-mono text-xs ${color}`}>{type}</span>;
}

// ─── Feature flag pill ────────────────────────────────────────────────────────

function FlagPill({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
      enabled
        ? "bg-success/10 border-success/30 text-success"
        : "bg-muted/40 border-border text-muted-foreground"
    }`}>
      <div className={`size-1.5 rounded-full ${enabled ? "bg-success" : "bg-muted-foreground/30"}`} />
      {label}
    </div>
  );
}

// ─── Field table ──────────────────────────────────────────────────────────────

function FieldTable({ fields }: { fields: EntityField[] }) {
  const [filter, setFilter] = useState("");
  const shown = fields.filter(
    (f) => !filter ||
      f.name.toLowerCase().includes(filter) ||
      f.column_name.toLowerCase().includes(filter) ||
      (f.label ?? "").toLowerCase().includes(filter)
  );

  return (
    <div className="space-y-2">
      <Input
        className="h-8 text-sm max-w-xs"
        placeholder="Filter fields…"
        value={filter}
        onChange={(e) => setFilter(e.target.value.toLowerCase())}
      />
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Field</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Column</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Origin</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Flags</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Group</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {shown.map((f) => (
              <tr key={f.id} className="hover:bg-muted/20">
                <td className="px-3 py-2">
                  <div>
                    <span className="font-mono">{f.name}</span>
                    {f.label && f.label !== f.name && (
                      <span className="block text-muted-foreground">{f.label}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{f.column_name}</td>
                <td className="px-3 py-2">
                  <DtBadge type={f.data_type} />
                  {f.enum_domain_code && (
                    <span className="block text-muted-foreground font-mono mt-0.5">
                      lkp:{f.enum_domain_code}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      f.origin === "system" ? "text-muted-foreground" :
                      f.origin === "standard" ? "text-primary border-primary/30" :
                      "text-accent-foreground border-accent/30"
                    }`}
                  >
                    {f.origin}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-0.5">
                    {f.is_required  && <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/30 px-1 rounded">req</span>}
                    {f.is_unique    && <span className="text-[9px] bg-primary/10 text-primary border border-primary/30 px-1 rounded">uniq</span>}
                    {f.is_searchable && <span className="text-[9px] bg-success/10 text-success border border-success/30 px-1 rounded">search</span>}
                    {f.is_filterable && <span className="text-[9px] bg-warning/10 text-warning border border-warning/30 px-1 rounded">filter</span>}
                    {f.is_pii       && <span className="text-[9px] bg-accent/10 text-accent-foreground border border-accent/30 px-1 rounded">PII</span>}
                    {f.is_readonly  && <span className="text-[9px] bg-muted text-muted-foreground border border-border px-1 rounded">ro</span>}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {f.group_key ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No fields match your filter.</div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{shown.length} of {fields.length} fields</p>
    </div>
  );
}

// ─── JSON viewer with copy ────────────────────────────────────────────────────

function JsonViewer({ value }: { value: unknown }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(value, null, 2);

  async function copy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded-lg border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Code2 className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono">compiled_json</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={copy}>
          {copied ? <CheckCheck className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="p-4 text-xs font-mono overflow-auto max-h-[60vh] leading-relaxed">
        {json}
      </pre>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DescriptorInspectorPage() {
  const { toast } = useToast();
  const [entityCode, setEntityCode] = useState("");
  const [inputValue, setInputValue] = useState("");

  const { data: entData } = useQuery<{ items: EntityCat[] }>({
    queryKey: ["meta-admin-entities"],
    queryFn: () => relayFetch("/metadata/admin/entities"),
    staleTime: 60_000,
  });
  const entities = entData?.items ?? [];

  const { data: descriptor, isLoading, error, refetch } = useQuery<CompiledDescriptor>({
    queryKey: ["meta-descriptor", entityCode],
    queryFn: () => relayFetch(`/metadata/entities/${entityCode}/compiled`),
    enabled: !!entityCode,
    staleTime: 0,
    retry: false,
  });

  function loadEntity() {
    const code = inputValue.trim().replace(/-/g, "_");
    if (code) setEntityCode(code);
  }

  const flags = descriptor?.feature_flags;

  return (
    <PageFrame
      title="Descriptor Inspector"
      description="Inspect the compiled entity descriptor for any registered entity. Read-only — for debugging compiled snapshots and descriptor-driven features."
    >
      <div className="space-y-4">
        {/* Entity selector */}
        <div className="flex items-center gap-2">
          <Select
            value={entityCode || "__none__"}
            onValueChange={(v) => { if (v !== "__none__") setEntityCode(v); }}
          >
            <SelectTrigger className="h-9 text-sm flex-1 max-w-xs">
              <SelectValue placeholder="Select an entity…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {Object.entries(
                entities.reduce<Record<string, EntityCat[]>>((acc, e) => {
                  (acc[e.entity_class] ??= []).push(e);
                  return acc;
                }, {})
              ).sort(([a], [b]) => a.localeCompare(b)).map(([cls, items]) => (
                <div key={cls}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {cls}
                  </div>
                  {items.map((e) => (
                    <SelectItem key={e.name} value={e.name} className="text-sm pl-4">
                      <span className="flex items-center gap-2">
                        <span>{e.label_singular ?? e.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{e.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground text-xs">or</span>

          <div className="flex items-center gap-1 flex-1 max-w-xs">
            <Input
              className="h-9 text-sm font-mono"
              placeholder="entity_code or slug"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadEntity()}
            />
            <Button size="sm" className="h-9 gap-1" onClick={loadEntity}>
              <Search className="size-4" />
            </Button>
          </div>

          {entityCode && (
            <Button
              variant="outline" size="sm" className="h-9 gap-1"
              onClick={() => void refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>

        {/* Loading / error states */}
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to load descriptor</p>
              <p className="text-xs text-muted-foreground mt-0.5">{String(error)}</p>
            </div>
          </div>
        )}

        {!entityCode && !isLoading && (
          <EmptyState
            icon={FileCode}
            title="Select an entity"
            description="Choose an entity from the dropdown or enter an entity code to inspect its compiled descriptor."
          />
        )}

        {/* Descriptor content */}
        {descriptor && !isLoading && (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-lg border bg-card p-4 flex items-start gap-4">
              <Database className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base">{descriptor.entity_name}</span>
                  <CodeBadge>{descriptor.entity_code}</CodeBadge>
                  <Badge variant="outline" className="text-xs">{descriptor.entity_class}</Badge>
                  <Badge variant="secondary" className="text-xs">v{descriptor.version_no}</Badge>
                </div>
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Hash className="size-3" />
                    <span className="font-mono">{descriptor.compiled_hash}</span>
                  </span>
                  <span className="font-mono">{descriptor.table_schema}.{descriptor.table_name}</span>
                  <span>Compiled {new Date(descriptor.compiled_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Governance: <strong>{descriptor.governance_level}</strong></span>
                  <span>·</span>
                  <span>Security tier: <strong>{descriptor.security_tier}</strong></span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="fields">
              <TabsList>
                <TabsTrigger value="fields" className="gap-1.5 text-xs">
                  <Database className="size-3.5" />
                  Fields
                  <Badge variant="secondary" className="text-[10px] px-1">{descriptor.fields.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="groups" className="gap-1.5 text-xs">
                  <Layers className="size-3.5" />
                  Groups
                  <Badge variant="secondary" className="text-[10px] px-1">{descriptor.field_groups.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="flags" className="gap-1.5 text-xs">
                  <Flag className="size-3.5" />
                  Feature flags
                </TabsTrigger>
                <TabsTrigger value="json" className="gap-1.5 text-xs">
                  <Code2 className="size-3.5" />
                  Raw JSON
                </TabsTrigger>
              </TabsList>

              {/* Fields tab */}
              <TabsContent value="fields" className="mt-4">
                <FieldTable fields={descriptor.fields} />
              </TabsContent>

              {/* Groups tab */}
              <TabsContent value="groups" className="mt-4">
                {descriptor.field_groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No field groups for this entity.</p>
                ) : (
                  <div className="space-y-2">
                    {descriptor.field_groups
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((g) => (
                        <div key={g.group_key} className="rounded-lg border bg-card p-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{g.label}</span>
                            <CodeBadge>{g.group_key}</CodeBadge>
                            <Badge variant="secondary" className="text-[10px] px-1">{g.fields.length} fields</Badge>
                          </div>
                          {g.description && (
                            <p className="text-xs text-muted-foreground">{g.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {g.fields.map((f) => (
                              <CodeBadge key={f}>{f}</CodeBadge>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </TabsContent>

              {/* Feature flags tab */}
              <TabsContent value="flags" className="mt-4">
                {flags && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Feature flags control which platform capabilities are enabled for this entity.
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      <FlagPill label="Attachments"   enabled={flags.has_attachments} />
                      <FlagPill label="Comments"      enabled={flags.has_comments} />
                      <FlagPill label="Activity log"  enabled={flags.has_activity_log} />
                      <FlagPill label="Workflow"      enabled={flags.has_workflow} />
                      <FlagPill label="Lifecycle"     enabled={flags.has_lifecycle} />
                      <FlagPill label="Versioning"    enabled={flags.has_versioning} />
                      <FlagPill label="Importable"    enabled={flags.is_importable} />
                      <FlagPill label="Exportable"    enabled={flags.is_exportable} />
                      <FlagPill label="Bulk editable" enabled={flags.is_bulk_editable} />
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Raw JSON tab */}
              <TabsContent value="json" className="mt-4">
                <JsonViewer value={descriptor} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
