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
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type HealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

interface Endpoint {
  id: string;
  serviceCode: string;
  code: string;
  name: string;
  path: string;
  method: HttpMethod;
  description: string | null;
  isActive: boolean;
  health: HealthStatus;
  lastCheckedAt: string | null;
}

const HEALTH_VARIANT: Record<HealthStatus, "success" | "warning" | "destructive" | "muted"> = {
  HEALTHY: "success", DEGRADED: "warning", DOWN: "destructive", UNKNOWN: "muted",
};

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// ── Sub-nav ───────────────────────────────────────────────────────────────────

function IntegrationSubNav({ active }: { active: string }) {
  const tabs = [
    { href: "/setup/integrations", label: "Endpoints" },
    { href: "/setup/integrations/providers", label: "Providers" },
    { href: "/setup/integrations/outbox", label: "Outbox" },
    { href: "/setup/integrations/deliveries", label: "Deliveries" },
    { href: "/setup/integrations/webhooks", label: "Webhooks" },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b pb-3">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href}>
          <Button size="sm" variant={active === t.href ? "primary" : "ghost"} className="h-7 text-xs">
            {t.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}

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
    staleTime: 30_000,
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

      {/* Service filter */}
      {services.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          <Button size="sm" variant={serviceFilter === "" ? "primary" : "ghost"} className="h-7 text-xs"
            onClick={() => setServiceFilter("")}>All</Button>
          {services.map((s) => (
            <Button key={s} size="sm" variant={serviceFilter === s ? "primary" : "ghost"} className="h-7 text-xs font-mono"
              onClick={() => setServiceFilter(s)}>{s}</Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : endpoints.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Plug className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No endpoints registered.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Register first endpoint
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.map((ep) => (
            <Card key={ep.id} className={!ep.isActive ? "opacity-60" : ""}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={HEALTH_VARIANT[ep.health]} className="text-[10px]">{ep.health}</Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">{ep.method}</Badge>
                    <span className="font-medium text-sm">{ep.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{ep.serviceCode}/{ep.code}</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground truncate">{ep.path}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"
                  onClick={() => toggle.mutate({ id: ep.id, isActive: !ep.isActive })}>
                  {ep.isActive
                    ? <Link2 className="h-3.5 w-3.5 text-green-500" />
                    : <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewEndpointDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
