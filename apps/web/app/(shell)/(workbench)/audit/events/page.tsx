"use client";

/**
 * Audit Event Log — /audit/events
 *
 * Paginated view of log.audit_log rows with:
 *   Filters    — date range, entity type, actor ID, operation
 *   Export     — CSV or JSON (with integrity chain) via GET /audit/events/export
 *   Detail row — expand to show old/new values diff
 *
 * Data: GET /api/relay/audit/events
 */

import { useState, useCallback, useRef } from "react";
import {
  ShieldCheck, Search, X, RefreshCw, Download, ChevronRight,
  ChevronDown, FileJson, FileSpreadsheet, AlertTriangle, Clock,
  User, Database, Pencil, Trash2, Plus, Eye,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  useRelayQuery,
  SearchInput,
  SectionHeader,
  LoadingRows,
  EmptyState,
  CodeBadge,
  fmtDateTime,
  relayFetch,
} from "../../../(admin)/setup/_components/admin-ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEvent {
  id:            string;
  tenantId:      string;
  logType:       string;
  entityType:    string;
  entityId:      string;
  operation:     string;
  actorId:       string | null;
  actorType:     string | null;
  changedFields: string[] | null;
  correlationId: string | null;
  requestId:     string | null;
  ipAddress:     string | null;
  userAgent:     string | null;
  oldValues:     Record<string, unknown> | null;
  newValues:     Record<string, unknown> | null;
  createdAt:     string;
  createdBy:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPERATION_ICON: Record<string, React.ReactNode> = {
  create:  <Plus   className="size-3 text-success"          />,
  update:  <Pencil className="size-3 text-primary"          />,
  delete:  <Trash2 className="size-3 text-destructive"      />,
  read:    <Eye    className="size-3 text-muted-foreground" />,
};

const OPERATION_COLOR: Record<string, string> = {
  create:  "bg-success/10 text-success border-success/30",
  update:  "bg-primary/10 text-primary border-primary/30",
  delete:  "bg-destructive/10 text-destructive border-destructive/30",
  read:    "bg-muted text-muted-foreground border-border",
};

function OperationBadge({ op }: { op: string }) {
  const cls = OPERATION_COLOR[op] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize", cls)}>
      {OPERATION_ICON[op]}
      {op}
    </span>
  );
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Detail row ────────────────────────────────────────────────────────────────

function EventDetailRow({ event }: { event: AuditEvent }) {
  const hasValues = event.oldValues || event.newValues;
  return (
    <div className="px-4 pb-3 pt-1 space-y-3 bg-muted/20 border-t">
      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Event ID</span>
          <p className="font-mono text-[10px] truncate">{event.id}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Entity ID</span>
          <p className="font-mono text-[10px] truncate">{event.entityId}</p>
        </div>
        {event.correlationId && (
          <div>
            <span className="text-muted-foreground">Correlation</span>
            <p className="font-mono text-[10px] truncate">{event.correlationId}</p>
          </div>
        )}
        {event.actorId && (
          <div>
            <span className="text-muted-foreground">Actor ID</span>
            <p className="font-mono text-[10px] truncate">{event.actorId}</p>
          </div>
        )}
        {event.ipAddress && (
          <div>
            <span className="text-muted-foreground">IP Address</span>
            <p className="font-mono text-[10px]">{event.ipAddress}</p>
          </div>
        )}
        {event.changedFields && event.changedFields.length > 0 && (
          <div className="col-span-2 sm:col-span-3">
            <span className="text-muted-foreground">Changed fields</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {event.changedFields.map((f) => (
                <CodeBadge key={f}>{f}</CodeBadge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Values diff */}
      {hasValues && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {event.oldValues && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider">Before</p>
              <pre className="text-[10px] font-mono bg-background border rounded p-2 overflow-x-auto max-h-32 text-muted-foreground">
                {JSON.stringify(event.oldValues, null, 2)}
              </pre>
            </div>
          )}
          {event.newValues && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-success uppercase tracking-wider">After</p>
              <pre className="text-[10px] font-mono bg-background border rounded p-2 overflow-x-auto max-h-32 text-muted-foreground">
                {JSON.stringify(event.newValues, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 cursor-pointer select-none transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}

        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="text-xs text-muted-foreground w-32 shrink-0">{fmtDateTime(event.createdAt)}</span>
          <OperationBadge op={event.operation} />
          <span className="font-mono text-xs text-primary">{event.entityType}</span>
          {event.actorId && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="size-3" />
              {event.actorType ?? "principal"}
            </span>
          )}
          {event.logType !== "business" && (
            <CodeBadge>{event.logType}</CodeBadge>
          )}
        </div>
      </div>

      {expanded && <EventDetailRow event={event} />}
    </div>
  );
}

// ── Export button ─────────────────────────────────────────────────────────────

function ExportButton({
  from,
  to,
  entityType,
  actorId,
  operation,
}: {
  from:        string;
  to:          string;
  entityType?: string;
  actorId?:    string;
  operation?:  string;
}) {
  const [open,       setOpen]       = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function doExport(format: "csv" | "json") {
    setExporting(true);
    setError(null);
    setOpen(false);
    try {
      const qs = new URLSearchParams({ format, from, to });
      if (entityType) qs.set("entityType", entityType);
      if (actorId)    qs.set("actorId",    actorId);
      if (operation)  qs.set("operation",  operation);

      // Fetch via relay — need the Bearer token injected by the relay proxy
      const res = await fetch(`/api/relay/audit/events/export?${qs}`, { method: "GET" });
      if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;

      const cd    = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download  = match?.[1] ?? `audit_export_${from}.${format === "json" ? "ndjson" : "csv"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        <Download className={cn("size-3.5", exporting && "animate-bounce")} />
        {exporting ? "Exporting…" : "Export"}
      </button>

      {error && (
        <p className="absolute right-0 top-9 w-64 rounded-md border border-destructive/30 bg-background p-2 text-xs text-destructive shadow-lg z-10">
          {error}
        </p>
      )}

      {open && !exporting && (
        <div className="absolute right-0 top-9 rounded-md border bg-background shadow-lg z-10 py-1 min-w-[160px]">
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => void doExport("csv")}
          >
            <FileSpreadsheet className="size-3.5 text-success" />
            Export as CSV
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => void doExport("json")}
          >
            <FileJson className="size-3.5 text-primary" />
            Export as JSON + integrity chain
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Today",    days: 1  },
  { label: "7 days",   days: 7  },
  { label: "30 days",  days: 30 },
  { label: "90 days",  days: 90 },
];

export default function AuditEventsPage() {
  const [preset,      setPreset]      = useState(1);   // 7 days default
  const [entityType,  setEntityType]  = useState("");
  const [actorId,     setActorId]     = useState("");
  const [operation,   setOperation]   = useState("");
  const [offset,      setOffset]      = useState(0);
  const LIMIT = 50;

  const fromDate = toISO(new Date(Date.now() - PRESETS[preset]!.days * 86_400_000));
  const toDate   = toISO(new Date());

  const qs = new URLSearchParams({
    from:   fromDate,
    to:     toDate,
    limit:  String(LIMIT),
    offset: String(offset),
  });
  if (entityType.trim()) qs.set("entityType", entityType.trim());
  if (actorId.trim())    qs.set("actorId",    actorId.trim());
  if (operation.trim())  qs.set("operation",  operation.trim());

  const queryKey = ["audit-events", fromDate, toDate, entityType, actorId, operation, offset];

  const { data, isLoading, isError, refetch, isFetching } =
    useRelayQuery<{ ok: boolean; data: AuditEvent[]; hasMore: boolean }>(
      queryKey,
      `/audit/events?${qs}`,
    );

  const events  = data?.data ?? [];
  const hasMore = data?.hasMore ?? false;

  const handlePreset = useCallback((i: number) => {
    setPreset(i);
    setOffset(0);
  }, []);

  const handleFilterChange = useCallback((setter: (v: string) => void) => (v: string) => {
    setter(v);
    setOffset(0);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={ShieldCheck}
          title="Audit Log"
          description="Entity mutation trail — who changed what, and when."
        />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
          </button>
          <ExportButton
            from={fromDate}
            to={toDate}
            entityType={entityType || undefined}
            actorId={actorId || undefined}
            operation={operation || undefined}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date presets */}
        {PRESETS.map((p, i) => (
          <button
            key={p.days}
            onClick={() => handlePreset(i)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              preset === i
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted/50"
            )}
          >
            {p.label}
          </button>
        ))}

        <span className="text-xs text-muted-foreground">|</span>

        <SearchInput
          value={entityType}
          onChange={handleFilterChange(setEntityType)}
          placeholder="Entity type…"
          className="w-36"
        />
        <SearchInput
          value={operation}
          onChange={handleFilterChange(setOperation)}
          placeholder="Operation…"
          className="w-32"
        />
        <SearchInput
          value={actorId}
          onChange={handleFilterChange(setActorId)}
          placeholder="Actor UUID…"
          className="w-52"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
          </div>
          <div className="p-4">
            <LoadingRows rows={8} cols={4} />
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
          <AlertTriangle className="size-8 mx-auto text-destructive/50" />
          <p className="text-sm text-destructive">Failed to load audit events.</p>
          <button onClick={() => void refetch()} className="text-xs text-muted-foreground underline">
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No audit events found"
          description="Try extending the date range or clearing the filters."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="w-3.5" />
            <span className="w-32 shrink-0">Time</span>
            <span className="w-20 shrink-0">Operation</span>
            <span className="flex-1">Entity type</span>
            <span className="w-24 shrink-0 text-right">Actor</span>
          </div>

          {events.map((e) => <EventRow key={e.id} event={e} />)}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
            <span>Showing {offset + 1}–{offset + events.length}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="rounded border px-2.5 py-1 hover:bg-muted/50 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setOffset(offset + LIMIT)}
                disabled={!hasMore}
                className="rounded border px-2.5 py-1 hover:bg-muted/50 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
