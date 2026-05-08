"use client";

/**
 * Webhook Subscriptions — /setup/integrations/webhooks
 *
 * Manage outbound webhook subscriptions (int.webhook_subscription table).
 * Each subscription has a target URL, signing secret, event topic filters,
 * and retry configuration.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Webhook, Link2, Link2Off, Trash2 } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Textarea,
} from "@athyper/ui/primitives";
import { IntegrationSubNav } from "../_components/integration-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WebhookSubscription {
  id: string;
  name: string;
  targetUrl: string;
  topics: string[];
  isActive: boolean;
  maxRetries: number;
  timeoutMs: number;
  failureCount: number;
  lastFailureAt: string | null;
  createdAt: string;
}

// ── New Webhook Dialog ────────────────────────────────────────────────────────

function NewWebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [topics, setTopics] = useState("");
  const [maxRetries, setMaxRetries] = useState("3");
  const [timeoutMs, setTimeoutMs] = useState("10000");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/integration/webhooks", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-webhooks"] });
      onOpenChange(false);
      setName(""); setTargetUrl(""); setSigningSecret(""); setTopics(""); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!name.trim() || !targetUrl.trim()) { setError("Name and URL are required"); return; }
    const topicList = topics.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
    create.mutate({
      name: name.trim(), targetUrl: targetUrl.trim(),
      signingSecret: signingSecret.trim() || null,
      topics: topicList,
      maxRetries: parseInt(maxRetries, 10) || 3,
      timeoutMs: parseInt(timeoutMs, 10) || 10000,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Webhook Subscription</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Payment Events" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target URL *</Label>
            <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://partner.example.com/hooks" className="font-mono text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Signing Secret (optional)</Label>
            <Input value={signingSecret} onChange={(e) => setSigningSecret(e.target.value)}
              type="password" placeholder="Used to sign payloads" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Topics (one per line or comma-separated)</Label>
            <Textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={3}
              placeholder="payment.created&#10;invoice.paid" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Max Retries</Label>
              <Input value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} type="number" min={0} max={10} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Timeout (ms)</Label>
              <Input value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} type="number" min={1000} />
            </div>
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

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<{ data: WebhookSubscription[] }>({
    queryKey: ["integration-webhooks"],
    queryFn: async () => {
      const res = await fetch("/api/integration/webhooks");
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const subscriptions = data?.data ?? [];

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/integration/webhooks/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-webhooks"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integration/webhooks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-webhooks"] }),
  });

  return (
    <PageFrame
      title="Webhook Subscriptions"
      description="Configure outbound webhooks to notify external systems of platform events"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["integration-webhooks"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Webhook
          </Button>
        </div>
      }
    >
      <IntegrationSubNav active="/setup/integrations/webhooks" />

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={<Webhook className="h-10 w-10 text-muted-foreground/30" />}
          title="No webhook subscriptions configured."
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add first webhook
            </Button>
          }
          className="py-20"
        />
      ) : (
        <div className="space-y-2">
          {subscriptions.map((sub) => (
            <RowCard key={sub.id} className={!sub.isActive ? "opacity-60" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!sub.isActive && <Badge variant="muted" className="text-doc-support">inactive</Badge>}
                    {sub.failureCount > 0 && (
                      <Badge variant="destructive" className="text-doc-support">{sub.failureCount} failures</Badge>
                    )}
                    <span className="font-medium text-sm">{sub.name}</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground truncate">{sub.targetUrl}</p>
                  {sub.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sub.topics.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono text-doc-support">{t}</span>
                      ))}
                      {sub.topics.length > 5 && (
                        <span className="text-doc-support text-muted-foreground">+{sub.topics.length - 5} more</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3 text-doc-support text-muted-foreground">
                    <span>Retries: {sub.maxRetries}</span>
                    <span>Timeout: {sub.timeoutMs}ms</span>
                    {sub.lastFailureAt && <span>Last failure: {new Date(sub.lastFailureAt).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                    onClick={() => toggle.mutate({ id: sub.id, isActive: !sub.isActive })}>
                    {sub.isActive
                      ? <Link2 className="h-3.5 w-3.5 text-success" />
                      : <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => remove.mutate(sub.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </RowCard>
          ))}
        </div>
      )}

      <NewWebhookDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
