"use client";

/**
 * Integration Endpoints — /setup/integrations
 *
 * Registry of integration endpoints (inbound/outbound).
 * Sub-nav links to providers, outbox, deliveries, webhooks.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Plug, Link2, Link2Off } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from "@athyper/ui/primitives";
import { IntegrationSubNav } from "./_components/integration-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type HealthStatus = "healthy" | "degraded" | "down";

interface Endpoint {
  id: string;
  serviceCode: string;
  code: string;
  name: string;
  path: string;
  method: HttpMethod;
  description: string | null;
  isActive: boolean;
  health: HealthStatus | null;
  healthCheckUrl: string | null;
  lastCheckedAt: string | null;
  responseTimeMs: number | null;
}

const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy:  "bg-success",
  degraded: "bg-warning",
  down:     "bg-destructive",
};

function fmtCheckedAt(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)    return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// ── New Endpoint Dialog ───────────────────────────────────────────────────────

function NewEndpointDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [serviceCode, setServiceCode] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [method, setMethod] = useState<HttpMethod>("POST");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/integration/endpoints", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-endpoints"] });
      onOpenChange(false);
      setServiceCode(""); setCode(""); setName(""); setPath(""); setDescription(""); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!serviceCode.trim() || !code.trim() || !name.trim() || !path.trim()) {
      setError("Service, code, name, and path are required"); return;
    }
    create.mutate({
      serviceCode: serviceCode.trim().toUpperCase(),
      code: code.trim().toUpperCase(),
      name: name.trim(), path: path.trim(), method,
      description: description.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Endpoint</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Service Code *</Label>
              <Input value={serviceCode} onChange={(e) => setServiceCode(e.target.value)}
                className="font-mono uppercase" placeholder="PAYMENTS" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Endpoint Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)}
                className="font-mono uppercase" placeholder="PAY_SUBMIT" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Submit Payment" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Path *</Label>
              <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/payments/submit" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as HttpMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HTTP_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationEndpointsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState("");

  const params = serviceFilter ? `?serviceCode=${serviceFilter}` : "";

  const { data, isLoading } = useQuery<{ data: Endpoint[] }>({
    queryKey: ["integration-endpoints", serviceFilter],
    queryFn: async () => {
      const res = await fetch(`/api/integration/endpoints${params}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime:       30_000,
    refetchInterval: 60_000,
  });
  const endpoints = data?.data ?? [];

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/integration/endpoints/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-endpoints"] }),
  });

  // Unique service codes for filter buttons
  const services = [...new Set(endpoints.map((e) => e.serviceCode))].sort();

  return (
    <PageFrame
      title="Integration Hub"
      description="Manage endpoint registry, providers, outbox, and webhooks"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["integration-endpoints"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Endpoint
          </Button>
        </div>
      }
    >
      <IntegrationSubNav active="/setup/integrations" />

      {services.length > 0 && (
        <FilterPillBar
          items={services.map((s) => ({ value: s, label: s }))}
          value={serviceFilter}
          onChange={setServiceFilter}
          allItem={{ label: "All" }}
          className="mb-4"
        />
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : endpoints.length === 0 ? (
        <EmptyState
          icon={<Plug className="h-10 w-10 text-muted-foreground/30" />}
          title="No endpoints registered."
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Register first endpoint
            </Button>
          }
          className="py-20"
        />
      ) : (
        <div className="space-y-2">
          {endpoints.map((ep) => (
            <RowCard
              key={ep.id}
              className={!ep.isActive ? "opacity-60" : ""}
              badge={<>
                {ep.healthCheckUrl && ep.health ? (
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${HEALTH_DOT[ep.health]}`}
                    title={[
                      `Health: ${ep.health}`,
                      `Checked: ${fmtCheckedAt(ep.lastCheckedAt)}`,
                      ep.responseTimeMs != null ? `Response: ${ep.responseTimeMs}ms` : null,
                    ].filter(Boolean).join(" · ")}
                  />
                ) : (
                  <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" title="No health check URL configured" />
                )}
                <Badge variant="outline" className="text-[10px] font-mono">{ep.method}</Badge>
              </>}
              title={ep.name}
              metadata={<>
                <span className="font-mono">{ep.serviceCode}/{ep.code}</span>
                <p className="font-mono truncate">{ep.path}</p>
              </>}
              actions={
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                  onClick={() => toggle.mutate({ id: ep.id, isActive: !ep.isActive })}>
                  {ep.isActive
                    ? <Link2 className="h-3.5 w-3.5 text-success" />
                    : <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              }
            />
          ))}
        </div>
      )}

      <NewEndpointDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
