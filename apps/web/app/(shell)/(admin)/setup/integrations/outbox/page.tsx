"use client";

/**
 * Outbox Operations — /setup/integrations/outbox
 *
 * View and manage the integration outbox queue.
 * Retry failed/dead-letter messages or discard them (sets dead_letter status).
 * No hard deletes — traceability is preserved.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, XCircle, Inbox } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { IntegrationSubNav } from "../_components/integration-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

type OutboxStatus = "pending" | "processing" | "delivered" | "failed" | "dead_letter";

interface OutboxMessage {
  id: string;
  eventType: string;
  targetService: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  availableAt: string;
  createdAt: string;
}

const STATUS_VARIANT: Record<OutboxStatus, "warning" | "muted" | "success" | "destructive" | "outline"> = {
  pending: "outline", processing: "warning", delivered: "success",
  failed: "destructive", dead_letter: "muted",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OutboxPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<OutboxStatus | "failed">("failed");

  const { data, isLoading } = useQuery<{ data: OutboxMessage[] }>({
    queryKey: ["integration-outbox", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/integration/outbox?status=${statusFilter}&limit=50`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 20_000,
  });
  const messages = data?.data ?? [];

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integration/outbox/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-outbox"] }),
  });

  const discard = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integration/outbox/${id}/discard`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to discard");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-outbox"] }),
  });

  return (
    <PageFrame
      title="Outbox"
      description="Retry or discard failed integration messages. Messages are never deleted."
      actions={
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["integration-outbox"] })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <IntegrationSubNav active="/setup/integrations/outbox" />

      {/* Status filter */}
      <div className="mb-4 flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OutboxStatus)}>
          <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["pending", "processing", "delivered", "failed", "dead_letter"] as OutboxStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{messages.length} messages</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8 text-muted-foreground/30" />}
          title={`No ${statusFilter} messages.`}
          className="py-16"
        />
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <RowCard
              key={msg.id}
              badge={<Badge variant={STATUS_VARIANT[msg.status]} className="text-[10px]">{msg.status}</Badge>}
              title={<>{msg.eventType} <span className="text-muted-foreground">→ {msg.targetService}</span></>}
              metadata={<>
                <div className="flex gap-3">
                  <span>Attempts: {msg.attempts}/{msg.maxAttempts}</span>
                  <span>{new Date(msg.createdAt).toLocaleString()}</span>
                </div>
                {msg.lastError && <p className="text-destructive truncate">{msg.lastError}</p>}
              </>}
              actions={<>
                {(msg.status === "failed" || msg.status === "dead_letter") && (
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => retry.mutate(msg.id)} disabled={retry.isPending}>
                    <RotateCcw className="mr-1 h-3 w-3" />Retry
                  </Button>
                )}
                {(msg.status === "failed" || msg.status === "pending") && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                    onClick={() => discard.mutate(msg.id)} disabled={discard.isPending}>
                    <XCircle className="mr-1 h-3 w-3" />Discard
                  </Button>
                )}
              </>}
            />
          ))}
        </div>
      )}
    </PageFrame>
  );
}
