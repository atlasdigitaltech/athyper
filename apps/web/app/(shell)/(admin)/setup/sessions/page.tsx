"use client";

/**
 * Session Audit — /setup/sessions
 *
 * Displays security event log entries from log.security_event_log.
 * Supports filtering by event category, outcome, and principal search.
 * Per-principal "Invalidate Sessions" action via auth_epoch bump.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, RefreshCw, LogOut, Search, X } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
  Input,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SecurityEvent {
  id: string;
  principal_id: string | null;
  event_type: string;
  event_category: string;
  outcome: "success" | "failure" | "error";
  ip_address: string | null;
  session_id: string | null;
  created_at: string;
  failure_reason: string | null;
  // enriched by backend
  principal: { displayName: string | null; email: string | null } | null;
}

interface SessionsResponse {
  ok: boolean;
  data: SecurityEvent[];
  pagination: { limit: number; offset: number; count: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────

type EventCategory = "authentication" | "session" | "mfa" | "authorization";
type Outcome = "success" | "failure" | "error";

const CATEGORY_PILLS: { value: EventCategory; label: string }[] = [
  { value: "authentication", label: "Authentication" },
  { value: "session",        label: "Session" },
  { value: "mfa",            label: "MFA" },
  { value: "authorization",  label: "Authorization" },
];

const OUTCOME_PILLS: { value: Outcome; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "error",   label: "Error" },
];

const OUTCOME_VARIANT: Record<Outcome, "success" | "destructive" | "warning"> = {
  success: "success",
  failure: "destructive",
  error:   "warning",
};

const PAGE_SIZE = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function buildQuery(
  category: string,
  outcome:  string,
  offset:   number,
): string {
  const p = new URLSearchParams();
  if (category) p.set("event_category", category);
  if (outcome)  p.set("outcome", outcome);
  p.set("limit",  String(PAGE_SIZE));
  p.set("offset", String(offset));
  return p.toString() ? `?${p}` : "";
}

// ── Invalidate confirm dialog ─────────────────────────────────────────────────

function InvalidateDialog({
  principalId,
  displayName,
  open,
  onOpenChange,
  onDone,
}: {
  principalId: string;
  displayName: string | null;
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  onDone:       () => void;
}) {
  const invalidate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/iam/admin/principals/${principalId}/invalidate-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      onDone();
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LogOut className="size-4 text-destructive" />
            Invalidate all sessions
          </AlertDialogTitle>
          <AlertDialogDescription>
            All active sessions for{" "}
            <strong>{displayName ?? principalId}</strong> will be terminated
            immediately. They will need to log in again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {invalidate.error && (
          <p className="text-xs text-destructive px-1">
            {(invalidate.error as Error).message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={invalidate.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => invalidate.mutate()}
            disabled={invalidate.isPending}
          >
            {invalidate.isPending ? "Invalidating…" : "Invalidate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({
  event,
  onInvalidate,
}: {
  event:        SecurityEvent;
  onInvalidate: (e: SecurityEvent) => void;
}) {
  return (
    <RowCard
      badge={<>
        <Badge variant={OUTCOME_VARIANT[event.outcome] ?? "muted"} className="text-doc-support shrink-0">
          {event.outcome}
        </Badge>
        <Badge variant="outline" className="text-doc-support font-mono shrink-0">
          {event.event_category}
        </Badge>
      </>}
      title={<span className="font-mono">{event.event_type}</span>}
      metadata={<div className="flex flex-wrap items-center gap-3">
        {(event.principal?.displayName ?? event.principal?.email) && (
          <span className="truncate max-w-[200px]">
            {event.principal.displayName ?? event.principal.email}
            {event.principal.displayName && event.principal.email && (
              <span className="ml-1 opacity-60">({event.principal.email})</span>
            )}
          </span>
        )}
        {event.ip_address && <span className="font-mono">{event.ip_address}</span>}
        <span>{fmtDateTime(event.created_at)}</span>
      </div>}
      actions={event.principal_id ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          onClick={() => onInvalidate(event)}
          title="Invalidate all sessions for this principal"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Invalidate
        </Button>
      ) : undefined}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const qc = useQueryClient();

  const [category, setCategory] = useState("");
  const [outcome,  setOutcome]  = useState("");
  const [search,   setSearch]   = useState("");
  const [offset,   setOffset]   = useState(0);

  const [confirmTarget, setConfirmTarget] = useState<SecurityEvent | null>(null);

  // Client-side principal search filter applied on top of server results
  const queryStr = buildQuery(category, outcome, offset);

  const { data, isLoading, isFetching } = useQuery<SessionsResponse>({
    queryKey: ["iam-admin-sessions", category, outcome, offset],
    queryFn: async () => {
      const res = await fetch(`/api/iam/admin/sessions${queryStr}`);
      return res.ok ? res.json() : { ok: false, data: [], pagination: { limit: PAGE_SIZE, offset, count: 0 } };
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const allEvents = data?.data ?? [];
  const pagination = data?.pagination ?? { limit: PAGE_SIZE, offset: 0, count: 0 };

  // Apply local principal name/email filter
  const events = search.trim()
    ? allEvents.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.principal?.displayName?.toLowerCase().includes(q) ||
          e.principal?.email?.toLowerCase().includes(q) ||
          e.principal_id?.toLowerCase().includes(q)
        );
      })
    : allEvents;

  // Backend count = rows returned in this page; hasMore = full page was returned
  const hasMore = pagination.count >= PAGE_SIZE;

  function resetFilters() {
    setCategory("");
    setOutcome("");
    setSearch("");
    setOffset(0);
  }

  return (
    <PageFrame
      title="Session Audit"
      description="Security event log — authentication, session, MFA, and authorization events"
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["iam-admin-sessions"] })}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      {/* ── Category filter ── */}
      <FilterPillBar
        items={CATEGORY_PILLS}
        value={category}
        onChange={(v) => { setCategory(v); setOffset(0); }}
        allItem={{ label: "All categories" }}
        className="mb-2"
      />

      {/* ── Outcome + search row ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterPillBar
          items={OUTCOME_PILLS}
          value={outcome}
          onChange={(v) => { setOutcome(v); setOffset(0); }}
          allItem={{ label: "All outcomes" }}
        />

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8 h-8 text-sm w-52"
            placeholder="Filter by principal…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Event list ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10 text-muted-foreground/30" />}
          title="No security events found."
          action={
            (category || outcome || search) ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
          className="py-20"
        />
      ) : (
        <>
          <div className="space-y-2">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onInvalidate={setConfirmTarget}
              />
            ))}
          </div>

          {/* ── Pagination ── */}
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>
              Showing {offset + 1}–{offset + events.length} events
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={!hasMore}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Invalidate confirm ── */}
      {confirmTarget && (
        <InvalidateDialog
          principalId={confirmTarget.principal_id!}
          displayName={confirmTarget.principal?.displayName ?? null}
          open={Boolean(confirmTarget)}
          onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}
          onDone={() => {
            setConfirmTarget(null);
            qc.invalidateQueries({ queryKey: ["iam-admin-sessions"] });
          }}
        />
      )}
    </PageFrame>
  );
}
