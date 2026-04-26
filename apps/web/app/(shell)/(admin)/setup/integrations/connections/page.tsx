"use client";

/**
 * Connection Instances — /setup/integrations/connections
 *
 * Lists all tenant-configured connections (event.connector_instance).
 * Each row shows type, health, status, last tested time.
 * Actions: test health, edit config, deactivate, delete.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Plug2, CheckCircle2, XCircle, AlertTriangle,
  HelpCircle, FlaskConical, Pencil, Power, Trash2,
} from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Textarea,
} from "@athyper/ui/primitives";
import { IntegrationSubNav } from "../_components/integration-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthStatus = "healthy" | "degraded" | "down" | "unknown";
type ConnStatus   = "active" | "testing" | "paused" | "error" | "deprecated";

interface Connection {
  id:                    string;
  connectorTypeId:       string;
  connectorTypeName:     string | null;
  connectorTypeCode:     string | null;
  connectorTypeCategory: string | null;
  connectorTypeIcon:     string | null;
  code:                  string;
  name:                  string;
  description:           string | null;
  status:                ConnStatus;
  healthStatus:          HealthStatus;
  lastHealthCheckAt:     string | null;
  lastErrorMessage:      string | null;
  isActive:              boolean;
  createdAt:             string;
  updatedAt:             string | null;
}

interface ConnectionDetail extends Connection {
  config: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEALTH_ICON: Record<HealthStatus, React.ReactNode> = {
  healthy:  <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  degraded: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  down:     <XCircle className="h-3.5 w-3.5 text-destructive" />,
  unknown:  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

const HEALTH_BADGE: Record<HealthStatus, "success" | "warning" | "destructive" | "secondary"> = {
  healthy:  "success",
  degraded: "warning",
  down:     "destructive",
  unknown:  "secondary",
};

const STATUS_BADGE: Record<ConnStatus, "success" | "secondary" | "warning" | "destructive" | "outline"> = {
  active:     "success",
  testing:    "warning",
  paused:     "secondary",
  error:      "destructive",
  deprecated: "outline",
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)  return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function isCredentialField(key: string): boolean {
  return /secret|password|key|token|credential/i.test(key);
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteDialog({
  conn, open, onOpenChange, onConfirm,
}: { conn: Connection; open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Delete connection?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Permanently delete <span className="font-medium">{conn.name}</span>{" "}
          (<span className="font-mono text-xs">{conn.code}</span>)?
          This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false); }}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit config dialog ────────────────────────────────────────────────────────

function EditDialog({
  conn, open, onOpenChange,
}: { conn: Connection; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();

  // Fetch full detail to get config
  const { data: detail } = useQuery<{ ok: boolean; data: ConnectionDetail }>({
    queryKey: ["connection-detail", conn.id],
    queryFn: async () => {
      const res = await fetch(`/api/integration/connections/${conn.id}`);
      return res.json() as Promise<{ ok: boolean; data: ConnectionDetail }>;
    },
    enabled: open,
    staleTime: 0,
  });

  const [name, setName]           = useState(conn.name);
  const [description, setDesc]    = useState(conn.description ?? "");
  const [configText, setConfig]   = useState("");
  const [error, setError]         = useState<string | null>(null);

  // Sync config text when detail loads
  const rawConfig = detail?.data?.config;
  const configDisplay = configText || (rawConfig ? JSON.stringify(rawConfig, null, 2) : "{}");

  const save = useMutation({
    mutationFn: async () => {
      let parsedConfig: unknown;
      try { parsedConfig = JSON.parse(configDisplay); } catch {
        throw new Error("Config is not valid JSON");
      }
      const res = await fetch(`/api/integration/connections/${conn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        name.trim(),
          description: description.trim() || null,
          config:      parsedConfig,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-connections"] });
      qc.invalidateQueries({ queryKey: ["connection-detail", conn.id] });
      onOpenChange(false);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit — {conn.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Config (JSON)</Label>
            <p className="text-[10px] text-muted-foreground">
              Edit raw config JSONB. Credential fields will be stored as-is — encryption in Phase 5.
            </p>
            <textarea
              className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              value={configText || configDisplay}
              onChange={(e) => setConfig(e.target.value)}
              spellCheck={false}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { setError(null); save.mutate(); }} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Connection row ────────────────────────────────────────────────────────────

function ConnectionRow({ conn }: { conn: Connection }) {
  const qc = useQueryClient();
  const [editOpen,   setEditOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<{ healthStatus: string; probed: boolean } | null>(null);

  const test = useMutation({
    mutationFn: async () => {
      setTesting(true);
      const res = await fetch(`/api/integration/connections/${conn.id}/test`, { method: "POST" });
      if (!res.ok) throw new Error("Test failed");
      return res.json() as Promise<{ healthStatus: string; probed: boolean; lastErrorMessage?: string }>;
    },
    onSuccess: (data) => {
      setTestResult(data);
      qc.invalidateQueries({ queryKey: ["integration-connections"] });
      setTesting(false);
    },
    onError: () => setTesting(false),
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/integration/connections/${conn.id}/deactivate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-connections"] }),
  });

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/integration/connections/${conn.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-connections"] }),
  });

  const displayHealth = (testResult?.healthStatus ?? conn.healthStatus) as HealthStatus;

  return (
    <>
      <RowCard
        className={!conn.isActive ? "opacity-60" : ""}
        leading={conn.connectorTypeIcon ? <span className="text-base">{conn.connectorTypeIcon}</span> : undefined}
        badge={<>
          <Badge variant={STATUS_BADGE[conn.status]} className="text-[10px]">
            {conn.status}
          </Badge>
          <Badge variant={HEALTH_BADGE[displayHealth]} className="text-[10px] gap-1">
            {HEALTH_ICON[displayHealth]}
            {displayHealth}
          </Badge>
        </>}
        title={conn.name}
        metadata={<>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="font-mono">{conn.code}</span>
            {conn.connectorTypeName && <span>{conn.connectorTypeName}</span>}
            {conn.connectorTypeCategory && (
              <Badge variant="outline" className="text-[10px]">
                {conn.connectorTypeCategory.replace(/_/g, " ")}
              </Badge>
            )}
            <span>tested {fmtRelative(conn.lastHealthCheckAt)}</span>
          </div>
          {conn.lastErrorMessage && displayHealth !== "healthy" && (
            <p className="text-[11px] text-destructive font-mono truncate max-w-xs">
              {conn.lastErrorMessage}
            </p>
          )}
          {testResult && (
            <p className="text-[11px]">
              {testResult.probed
                ? `Probe result: ${testResult.healthStatus}`
                : "No base URL configured — marked as unknown"}
            </p>
          )}
        </>}
        actions={<>
          <Button
            size="sm" variant="ghost" className="h-7 text-xs"
            disabled={testing}
            onClick={() => { setTestResult(null); test.mutate(); }}
            title="Test connection health"
          >
            <FlaskConical className="h-3.5 w-3.5 mr-1" />
            {testing ? "Testing…" : "Test"}
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            onClick={() => setEditOpen(true)}
            title="Edit config"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {conn.isActive && (
            <Button
              size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={() => deactivate.mutate()}
              title="Deactivate"
            >
              <Power className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>}
      />

      {editOpen   && <EditDialog   conn={conn} open={editOpen}   onOpenChange={setEditOpen}   />}
      {deleteOpen && <DeleteDialog conn={conn} open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={() => del.mutate()} />}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active",  label: "Active" },
  { value: "paused",  label: "Paused" },
  { value: "error",   label: "Error" },
];

export default function ConnectionsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatus] = useState("");

  const params = statusFilter ? `?status=${statusFilter}` : "";

  const { data, isLoading } = useQuery<{ ok: boolean; data: Connection[] }>({
    queryKey: ["integration-connections", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/integration/connections${params}`);
      return res.ok ? res.json() : { ok: true, data: [] };
    },
    staleTime: 15_000,
  });

  const connections = data?.data ?? [];
  const unhealthy   = connections.filter((c) => c.healthStatus === "down" || c.healthStatus === "degraded").length;

  return (
    <PageFrame
      title="Integration Hub"
      description="Manage configured connection instances"
      actions={
        <div className="flex items-center gap-2">
          {unhealthy > 0 && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" />
              {unhealthy} unhealthy
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["integration-connections"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/setup/integrations/connectors">
            <Button size="sm" variant="outline">
              Browse Catalog
            </Button>
          </Link>
        </div>
      }
    >
      <IntegrationSubNav active="/setup/integrations/connections" />

      <FilterPillBar
        items={STATUS_OPTIONS.filter((o) => o.value !== "").map((o) => ({ value: o.value, label: o.label }))}
        value={statusFilter}
        onChange={setStatus}
        allItem={{ label: "All statuses" }}
        className="mb-4"
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={<Plug2 className="h-10 w-10 text-muted-foreground/30" />}
          title="No connections configured."
          action={
            <Link href="/setup/integrations/connectors">
              <Button variant="outline" size="sm">Browse connector catalog</Button>
            </Link>
          }
          className="py-20"
        />
      ) : (
        <div className="space-y-2">
          {connections.map((c) => <ConnectionRow key={c.id} conn={c} />)}
        </div>
      )}
    </PageFrame>
  );
}
