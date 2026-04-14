"use client";

/**
 * Notification Providers — /setup/integrations/providers
 *
 * Lists notification provider configurations (email, SMS, push, etc.)
 * Config field (contains encrypted secrets) is intentionally hidden.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Link2, Link2Off } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProviderChannel = "EMAIL" | "SMS" | "PUSH" | "WEBHOOK" | "SLACK" | "TEAMS" | "IN_APP";

interface NotificationProvider {
  id: string;
  channel: ProviderChannel;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

const CHANNEL_VARIANT: Record<ProviderChannel, "success" | "warning" | "muted" | "outline"> = {
  EMAIL: "success", SMS: "warning", PUSH: "muted", WEBHOOK: "outline",
  SLACK: "warning", TEAMS: "muted", IN_APP: "outline",
};

const CHANNELS: ProviderChannel[] = ["EMAIL", "SMS", "PUSH", "WEBHOOK", "SLACK", "TEAMS", "IN_APP"];

// ── Sub-nav ───────────────────────────────────────────────────────────────────

function IntegrationSubNav({ active }: { active: string }) {
  const tabs = [
    { href: "/setup/integrations",              label: "Endpoints" },
    { href: "/setup/integrations/providers",    label: "Providers" },
    { href: "/setup/integrations/outbox",       label: "Outbox" },
    { href: "/setup/integrations/deliveries",   label: "Deliveries" },
    { href: "/setup/integrations/webhooks",     label: "Webhooks" },
    { href: "/setup/integrations/connectors",   label: "Connectors" },
    { href: "/setup/integrations/connections",  label: "Connections" },
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

// ── New Provider Dialog ───────────────────────────────────────────────────────

function NewProviderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<ProviderChannel>("EMAIL");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/integration/providers", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-providers"] });
      onOpenChange(false);
      setCode(""); setName(""); setApiKey(""); setFromAddress(""); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!code.trim() || !name.trim()) { setError("Code and name are required"); return; }
    const config: Record<string, string> = {};
    if (apiKey.trim()) config["api_key"] = apiKey.trim();
    if (fromAddress.trim()) config["from"] = fromAddress.trim();
    create.mutate({ channel, code: code.trim().toUpperCase(), name: name.trim(), config });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Provider</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ProviderChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" placeholder="SENDGRID" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SendGrid Production" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">API Key</Label>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="Stored encrypted" />
          </div>
          {channel === "EMAIL" && (
            <div className="space-y-1">
              <Label className="text-xs">From Address</Label>
              <Input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="noreply@company.com" />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Config is encrypted at rest. Existing values are not shown.</p>
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

export default function ProvidersPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ProviderChannel | "">("");

  const params = channelFilter ? `?channel=${channelFilter}` : "";

  const { data, isLoading } = useQuery<{ data: NotificationProvider[] }>({
    queryKey: ["integration-providers", channelFilter],
    queryFn: async () => {
      const res = await fetch(`/api/integration/providers${params}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const providers = data?.data ?? [];

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/integration/providers/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-providers"] }),
  });

  return (
    <PageFrame
      title="Notification Providers"
      description="Configure delivery providers for email, SMS, push, and webhook channels"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["integration-providers"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Provider
          </Button>
        </div>
      }
    >
      <IntegrationSubNav active="/setup/integrations/providers" />

      {/* Channel filter */}
      <div className="mb-4 flex flex-wrap gap-1">
        <Button size="sm" variant={channelFilter === "" ? "primary" : "ghost"} className="h-7 text-xs"
          onClick={() => setChannelFilter("")}>All</Button>
        {CHANNELS.map((c) => (
          <Button key={c} size="sm" variant={channelFilter === c ? "primary" : "ghost"} className="h-7 text-xs"
            onClick={() => setChannelFilter(c)}>{c}</Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : providers.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No providers configured.</p>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <Card key={p.id} className={!p.isActive ? "opacity-60" : ""}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={CHANNEL_VARIANT[p.channel]} className="text-[10px]">{p.channel}</Badge>
                    {p.isDefault && <Badge variant="success" className="text-[10px]">default</Badge>}
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"
                  onClick={() => toggle.mutate({ id: p.id, isActive: !p.isActive })}>
                  {p.isActive
                    ? <Link2 className="h-3.5 w-3.5 text-green-500" />
                    : <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
