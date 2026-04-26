"use client";

/**
 * Connector Catalog — /setup/integrations/connectors
 *
 * Browse available connector types (from control.connector_type).
 * Each card shows category, auth types, capabilities, and a "New Connection"
 * button that opens a dynamic config form driven by the type's config_schema.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Plug2, ChevronDown, ChevronRight } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Textarea,
} from "@athyper/ui/primitives";
import { IntegrationSubNav } from "../_components/integration-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectorType {
  id:           string;
  code:         string;
  name:         string;
  category:     string;
  description:  string | null;
  iconKey:      string | null;
  authTypes:    string[];
  capabilities: string[];
  isSystem:     boolean;
  status:       string;
}

interface ConnectorTypeDetail extends ConnectorType {
  configSchema:      Record<string, unknown>;
  healthCheckConfig: Record<string, unknown>;
}

interface SchemaProperty {
  type?:        string;
  format?:      string;
  title?:       string;
  description?: string;
  enum?:        string[];
  default?:     unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_BADGE: Record<string, "secondary" | "outline" | "warning" | "success"> = {
  api:           "secondary",
  file_transfer: "outline",
  messaging:     "warning",
  erp:           "success",
  payment:       "secondary",
  custom:        "outline",
};

function isCredentialField(key: string): boolean {
  return /secret|password|key|token|credential/i.test(key);
}

// ── Dynamic config form ───────────────────────────────────────────────────────

function ConfigForm({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, unknown>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const properties = (schema["properties"] as Record<string, SchemaProperty> | undefined) ?? {};
  const required   = (schema["required"] as string[] | undefined) ?? [];

  const entries = Object.entries(properties);
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No configuration fields required for this connector type.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, prop]) => {
        const isRequired = required.includes(key);
        const label = prop.title ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const isPassword = isCredentialField(key) || prop.format === "password";
        const isTextarea = prop.type === "string" && (prop.format === "multiline" || key === "description" || key === "notes");

        return (
          <div key={key} className="space-y-1">
            <Label className="text-xs">
              {label}
              {isRequired && <span className="text-destructive ml-0.5">*</span>}
              {isPassword && (
                <Badge variant="outline" className="ml-1.5 text-[9px] font-normal">credential</Badge>
              )}
            </Label>
            {prop.description && (
              <p className="text-[10px] text-muted-foreground">{prop.description}</p>
            )}
            {prop.enum ? (
              <select
                className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={values[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
              >
                <option value="">Select…</option>
                {prop.enum.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : isTextarea ? (
              <Textarea
                value={values[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                rows={2}
                className="text-xs"
                placeholder={String(prop.default ?? "")}
              />
            ) : (
              <Input
                type={isPassword ? "password" : prop.format === "uri" ? "url" : prop.type === "integer" || prop.type === "number" ? "number" : "text"}
                value={values[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                className="text-xs"
                placeholder={String(prop.default ?? prop.description ?? "")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Create connection dialog ──────────────────────────────────────────────────

function NewConnectionDialog({
  connectorType,
  open,
  onOpenChange,
}: {
  connectorType: ConnectorType;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName]           = useState("");
  const [code, setCode]           = useState("");
  const [description, setDesc]    = useState("");
  const [configValues, setConfig] = useState<Record<string, string>>({});
  const [error, setError]         = useState<string | null>(null);

  // Fetch full schema on open
  const { data: detail } = useQuery<{ ok: boolean; data: ConnectorTypeDetail }>({
    queryKey: ["connector-type-detail", connectorType.id],
    queryFn: async () => {
      const res = await fetch(`/api/integration/connector-types/${connectorType.id}`);
      return res.json() as Promise<{ ok: boolean; data: ConnectorTypeDetail }>;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const schema = detail?.data?.configSchema ?? {};

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integration/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorTypeId: connectorType.id,
          code:            code.trim() || connectorType.code + "-" + Date.now(),
          name:            name.trim(),
          description:     description.trim() || null,
          config:          configValues,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? "Failed to create connection");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-connections"] });
      onOpenChange(false);
      setName(""); setCode(""); setDesc(""); setConfig({}); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Connection — {connectorType.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Identity */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`My ${connectorType.name}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder={connectorType.code + "-prod"}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Auto-generated if left blank. Lowercase, hyphens OK.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} />
            </div>
          </div>

          {/* Config fields */}
          {detail ? (
            <div className="border-t pt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Configuration
              </p>
              <ConfigForm
                schema={schema}
                values={configValues}
                onChange={(k, v) => setConfig((prev) => ({ ...prev, [k]: v }))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create Connection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Connector type card ───────────────────────────────────────────────────────

function ConnectorCard({ type }: { type: ConnectorType }) {
  const [expanded, setExpanded]   = useState(false);
  const [dialogOpen, setDialog]   = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <button
              className="flex items-center gap-2 text-left flex-1"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground mt-0.5" />
                : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground mt-0.5" />}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {type.iconKey && (
                    <span className="text-base">{type.iconKey}</span>
                  )}
                  <CardTitle className="text-sm">{type.name}</CardTitle>
                  <Badge variant={CATEGORY_BADGE[type.category] ?? "outline"} className="text-[10px]">
                    {type.category.replace(/_/g, " ")}
                  </Badge>
                  {type.isSystem && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">system</Badge>
                  )}
                </div>
                {type.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                )}
              </div>
            </button>

            <Button
              size="sm" variant="outline" className="h-7 text-xs shrink-0"
              onClick={() => setDialog(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              New Connection
            </Button>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0">
            <div className="border-t pt-2 mt-1 space-y-2">
              {type.authTypes.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Auth</p>
                  <div className="flex flex-wrap gap-1">
                    {type.authTypes.map((a) => (
                      <Badge key={a} variant="outline" className="text-[10px] font-mono">
                        {a.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {type.capabilities.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Capabilities</p>
                  <div className="flex flex-wrap gap-1">
                    {type.capabilities.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground font-mono">{type.code}</p>
            </div>
          </CardContent>
        )}
      </Card>

      {dialogOpen && (
        <NewConnectionDialog
          connectorType={type}
          open={dialogOpen}
          onOpenChange={setDialog}
        />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "api",           label: "API" },
  { value: "file_transfer", label: "File Transfer" },
  { value: "messaging",     label: "Messaging" },
  { value: "erp",           label: "ERP" },
  { value: "payment",       label: "Payment" },
  { value: "custom",        label: "Custom" },
];

export default function ConnectorCatalogPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");

  const params = category ? `?category=${category}` : "";

  const { data, isLoading } = useQuery<{ ok: boolean; data: ConnectorType[] }>({
    queryKey: ["connector-types", category],
    queryFn: async () => {
      const res = await fetch(`/api/integration/connector-types${params}`);
      return res.ok ? res.json() : { ok: true, data: [] };
    },
    staleTime: 60_000,
  });

  const types = data?.data ?? [];

  return (
    <PageFrame
      title="Integration Hub"
      description="Browse connector types and manage configured connection instances"
      actions={
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["connector-types"] })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <IntegrationSubNav active="/setup/integrations/connectors" />

      <FilterPillBar
        items={CATEGORIES.filter((c) => c.value !== "").map((c) => ({ value: c.value, label: c.label }))}
        value={category}
        onChange={setCategory}
        allItem={{ label: "All" }}
        className="mb-4"
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : types.length === 0 ? (
        <EmptyState
          icon={<Plug2 className="h-10 w-10 text-muted-foreground/30" />}
          title="No connector types found."
          description={<>Seed <code className="font-mono">control.connector_type</code> rows to populate the catalog.</>}
          className="py-20"
        />
      ) : (
        <div className="space-y-2">
          {types.map((t) => <ConnectorCard key={t.id} type={t} />)}
        </div>
      )}
    </PageFrame>
  );
}
