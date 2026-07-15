/**
 * @athyper/collaboration-ui — P2P Audit Timeline
 *
 * Renders the snapshot-augmented audit timeline for a single P2P record,
 * fed by GET /audit/timeline/:entityType/:entityId (see Phase 9 in
 * docs/architecture/p2p.md).
 *
 * Differences from the general ActivityTimeline:
 *   - Each row may carry a captured snapshot (gate_event_kind, version, hash);
 *     when present, the row is expandable to show snapshot metadata.
 *   - Filters narrow by gate_event_kind (authoring_lock, commitment,
 *     fulfillment, financial_post, match_decision, amendment_baseline,
 *     reversal) rather than by activity domain.
 *
 * Drop into a document object page's tab content:
 *
 *   <P2PAuditTimeline
 *     entityType="purchase_invoice"
 *     entityId={record.id}
 *     fetcher={fetchTimeline}
 *   />
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface P2PAuditTimelineRow {
  entity_type:              string;
  entity_id:                string;
  domain:                   string | null;
  activity_type:            string | null;
  actor_id:                 string | null;
  actor_type:               string | null;
  activity_detail:          Record<string, unknown> | null;
  correlation_id:           string | null;
  activity_at:              string;
  activity_by:              string | null;
  snapshot_id:              string | null;
  gate_event:               string | null;
  gate_event_kind:          string | null;
  snapshot_version_number:  number | null;
  snapshot_chain_seq:       number | null;
  snapshot_payload_hash:    string | null;
  snapshot_captured_at:     string | null;
  snapshot_captured_by:     string | null;
  snapshot_capture_source:  string | null;
}

export interface P2PAuditTimelineResponse {
  items: P2PAuditTimelineRow[];
  next:  string | null;
}

export interface P2PAuditTimelineProps {
  entityType: string;
  entityId:   string;
  /** Optional fetcher injection for testing / Storybook. Default uses fetch(). */
  fetcher?: (entityType: string, entityId: string, cursor: string | null)
    => Promise<P2PAuditTimelineResponse>;
  /** Maximum rows to show. Default: paginate 50 at a time. */
  pageSize?: number;
  className?: string;
}

// ── Gate-event-kind taxonomy ──────────────────────────────────────────────────

type GateKind =
  | "all"
  | "authoring_lock"
  | "commitment"
  | "fulfillment"
  | "financial_post"
  | "match_decision"
  | "amendment_baseline"
  | "reversal";

const GATE_KIND_FILTERS: Array<{ value: GateKind; label: string }> = [
  { value: "all",                label: "All"                  },
  { value: "authoring_lock",     label: "Submit"               },
  { value: "commitment",         label: "Approve"              },
  { value: "fulfillment",        label: "Fulfilment"           },
  { value: "financial_post",     label: "Posted"               },
  { value: "match_decision",     label: "Match"                },
  { value: "amendment_baseline", label: "Amend"                },
  { value: "reversal",           label: "Reverse"              },
];

function gateKindVariant(
  kind: string | null,
): "default" | "success" | "info" | "warning" | "destructive" | "muted" | "secondary" {
  switch (kind) {
    case "financial_post":     return "success";
    case "commitment":         return "info";
    case "fulfillment":        return "info";
    case "authoring_lock":     return "warning";
    case "match_decision":     return "warning";
    case "amendment_baseline": return "secondary";
    case "reversal":           return "destructive";
    default:                   return "muted";
  }
}

// ── Default fetcher ───────────────────────────────────────────────────────────

async function defaultFetcher(
  entityType: string,
  entityId:   string,
  cursor:     string | null,
): Promise<P2PAuditTimelineResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  const url = `/api/relay/audit/timeline/${entityType}/${entityId}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Audit timeline fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as P2PAuditTimelineResponse;
}

// ── Date formatting ───────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function P2PAuditTimeline({
  entityType,
  entityId,
  fetcher = defaultFetcher,
  className,
}: P2PAuditTimelineProps) {
  const [rows,      setRows]      = useState<P2PAuditTimelineRow[]>([]);
  const [next,      setNext]      = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<GateKind>("all");
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  // Initial load (and re-load on entityId change)
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setNext(null);
    setError(null);
    setLoading(true);
    fetcher(entityType, entityId, null)
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setNext(res.next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityType, entityId, fetcher]);

  const loadMore = (): void => {
    if (!next || loading) return;
    setLoading(true);
    fetcher(entityType, entityId, next)
      .then((res) => {
        setRows((prev) => [...prev, ...res.items]);
        setNext(res.next);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  // Filter rows by gate_event_kind
  const visibleRows = useMemo(() => {
    if (kindFilter === "all") return rows;
    return rows.filter((r) => r.gate_event_kind === kindFilter);
  }, [rows, kindFilter]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Gate-event-kind filter pills */}
      <div className="flex flex-wrap gap-1">
        {GATE_KIND_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setKindFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              kindFilter === f.value
                ? "bg-foreground text-background"
                : "bg-muted text-foreground hover:bg-muted/80",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Timeline rows */}
      <div className="flex flex-col divide-y rounded border border-muted/40">
        {visibleRows.length === 0 && !loading && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No timeline entries.
          </div>
        )}

        {visibleRows.map((row, idx) => {
          const rowKey = `${row.activity_at}:${idx}`;
          const isExpanded = expandedRowKey === rowKey && row.snapshot_id != null;
          return (
            <div key={rowKey} className="flex flex-col gap-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {formatTimestamp(row.activity_at)}
                </span>
                <span className="font-medium">
                  {row.activity_type ?? row.domain ?? "activity"}
                </span>
                {row.gate_event_kind && (
                  <Badge variant={gateKindVariant(row.gate_event_kind)}>
                    {row.gate_event_kind}
                  </Badge>
                )}
                {row.snapshot_id && (
                  <button
                    type="button"
                    onClick={() => setExpandedRowKey(isExpanded ? null : rowKey)}
                    className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {isExpanded ? "Hide snapshot" : "Show snapshot"}
                  </button>
                )}
              </div>

              {isExpanded && row.snapshot_id && (
                <div className="flex flex-col gap-1 rounded bg-muted/30 px-3 py-2 text-xs">
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <span className="text-muted-foreground">Snapshot </span>
                      <span className="font-mono">{row.snapshot_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Captured </span>
                      <span className="font-mono">{row.snapshot_captured_at ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Version </span>
                      <span className="font-mono">{row.snapshot_version_number ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Chain seq </span>
                      <span className="font-mono">{row.snapshot_chain_seq ?? "—"}</span>
                    </div>
                    <div className="col-span-2 break-all">
                      <span className="text-muted-foreground">Hash </span>
                      <span className="font-mono">{row.snapshot_payload_hash ?? "—"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load-more / status */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{visibleRows.length} entr{visibleRows.length === 1 ? "y" : "ies"} shown</span>
        {next && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}
