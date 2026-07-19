"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Search, ChevronDown, ChevronUp, ArrowRight, Clock,
  Copy, ExternalLink, ArrowUpDown, Check,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { DRAWER_CONTROL, DRAWER_LABEL, DRAWER_META, DRAWER_SECTION_HEADING, DRAWER_VALUE } from "@athyper/ui/typography";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";
import { formatBytes } from "@athyper/runtime-shared/core";
import { formatFieldValue, formatRecordValue } from "@athyper/runtime-shared/meta-entity";
type ActivityField = Parameters<typeof formatFieldValue>[1];

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "document" | "comments" | "attachments" | "workflow" | "system";
type SortMode   = "newest" | "oldest";

// ── Time helpers ──────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date(iso)).toLowerCase();
  } catch { return iso; }
}

function formatDayLabel(iso: string, today: Date): string {
  const d = new Date(iso);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(d).toUpperCase();
  if (d.toDateString() === today.toDateString())     return `TODAY · ${label}`;
  if (d.toDateString() === yesterday.toDateString()) return `YESTERDAY · ${label}`;
  return label;
}

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZone: "UTC",
    }).format(new Date(iso)).replace(",", "") + " UTC";
  } catch { return iso; }
}

// ── Event templates ───────────────────────────────────────────────────────────

function summarize(entry: ActivityEntry): string {
  const actor = entry.actor_name ?? "System";
  const type  = entry.activity_type;
  const detail = entry.detail as Record<string, unknown> | null;
  const after = detail?.after as Record<string, unknown> | null;
  if (type === "document.created" && (entry.to_state === "draft" || after?.status === "draft")) {
    return `${actor} created draft`;
  }
  const templates: Record<string, string> = {
    "document.created":              `${actor} created document`,
    "document.ready":                `${actor} marked document ready`,
    "document.updated":              `${actor} updated document`,
    "document.deleted":              `${actor} deleted document`,
    "document.item_created":         `${actor} added journal line`,
    "document.item_updated":         `${actor} updated journal line`,
    "document.item_deleted":         `${actor} removed journal line`,
    "document.submitted":            `${actor} submitted document`,
    "document.approved":             `${actor} approved document`,
    "document.rejected":             `${actor} rejected document`,
    "document.cancelled":            `${actor} cancelled document`,
    "document.reopened":             `${actor} reopened document`,
    "document.amended":              `${actor} amended document`,
    "attachment.uploaded":           `${actor} uploaded attachment`,
    "attachment.visibility_changed": `${actor} changed attachment visibility`,
    "attachment.deleted":            `${actor} deleted attachment`,
    "attachment.renamed":            `${actor} renamed file`,
    "attachment.moved":              `${actor} moved attachment`,
    "comment.created":               `${actor} added comment`,
    "comment.updated":               `${actor} edited comment`,
    "comment.deleted":               `${actor} deleted comment`,
    "user.comment_posted":           `${actor} added comment`,
    "user.comment_updated":          `${actor} edited comment`,
    "user.reaction_toggled":         `${actor} reacted to comment`,
    "workflow.initiated":            `${actor} initiated workflow`,
    "workflow.submitted":            `${actor} submitted for approval`,
    "workflow.approved":             `${actor} approved`,
    "workflow.rejected":             `${actor} rejected`,
    "workflow.delegated":            `${actor} delegated approval`,
    "workflow.escalated":            `${actor} escalated workflow`,
    "workflow.recalled":             `${actor} recalled workflow`,
    "accounting.posted":             `${actor} posted journal`,
    "accounting.reversed":           `${actor} reversed journal`,
    "payment.initiated":             `${actor} initiated payment`,
    "payment.cleared":               `${actor} cleared payment`,
    "system.import":                 `System imported records`,
    "system.auto_action":            `System performed auto action`,
  };
  return templates[type] ?? entry.description ?? type;
}

// ── Detail line (diff/context) ────────────────────────────────────────────────

interface DiffLine {
  prefix?: string;
  before?: string;
  after?: string;
  suffix?: string;
  plain?: string;
}

function changedFieldNames(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null): string[] {
  if (!before || !after) return [];
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => String(before[field] ?? "") !== String(after[field] ?? ""));
}

function journalLineLabel(detail: Record<string, unknown> | null): string {
  const lineNo = detail?.line_no;
  return typeof lineNo === "number" || typeof lineNo === "string" ? `Line ${lineNo}` : "Journal line";
}

function detailChangedFieldNames(
  detail: Record<string, unknown> | null,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): string[] {
  const changedFields = detail?.changed_fields;
  if (Array.isArray(changedFields)) {
    const fields = changedFields.filter((field): field is string => typeof field === "string" && field.length > 0);
    if (fields.length > 0) return fields;
  }
  return changedFieldNames(before, after);
}

function buildDetailLine(entry: ActivityEntry): DiffLine | null {
  const d = entry.detail as Record<string, unknown> | null;
  const type = entry.activity_type;
  const filename =
    (typeof d?.filename === "string"        ? d.filename : null) ??
    (typeof d?.attachment_name === "string" ? d.attachment_name : null);
  const comment =
    (typeof d?.comment_text === "string"  ? d.comment_text : null) ??
    (typeof d?.commentText  === "string"  ? d.commentText  : null);
  const before = d?.before as Record<string, unknown> | null;
  const after  = d?.after  as Record<string, unknown> | null;

  if (type === "attachment.visibility_changed" && before?.visibility && after?.visibility) {
    return {
      prefix: "Visibility:",
      before: String(before.visibility),
      after:  String(after.visibility),
      suffix: filename ? `on ${filename}` : undefined,
    };
  }
  if (type === "attachment.renamed" && before?.filename && after?.filename) {
    return { prefix: "File name:", before: String(before.filename), after: String(after.filename) };
  }
  if (type === "attachment.uploaded" && filename) {
    const size = typeof d?.size_bytes === "number" ? ` · ${formatBytes(d.size_bytes)}` : "";
    return { plain: `${filename}${size}` };
  }
  if ((type === "comment.created" || type === "user.comment_posted") && comment) {
    const snippet = comment.slice(0, 90);
    return { plain: `"${snippet}${comment.length > 90 ? "…" : ""}"` };
  }
  if (type === "document.item_created") {
    return { plain: `${journalLineLabel(d)} added` };
  }
  if (type === "document.item_deleted") {
    return { plain: `${journalLineLabel(d)} removed` };
  }
  if (type === "document.updated" || type === "document.item_updated") {
    if (before && after) {
      const changed = detailChangedFieldNames(d, before, after);
      if (changed.length === 1) {
        return { prefix: `${changed[0]!.replace(/_/g, " ")}:`, before: String(before[changed[0]!] ?? "—"), after: String(after[changed[0]!] ?? "—") };
      }
      if (changed.length > 1) return { plain: `${changed.length} fields updated` };
    }
    if (filename) return { plain: `Description edited on ${filename}` };
  }
  if (type === "document.deleted") {
    return { plain: "Header deleted" };
  }
  if (entry.from_state || entry.to_state) {
    return {
      prefix: "Status:",
      before: entry.from_state?.replace(/_/g, " "),
      after:  entry.to_state?.replace(/_/g, " "),
    };
  }
  return null;
}

// ── Contextual trailing action ────────────────────────────────────────────────

type ActionKind = "view_changes" | "view_comment" | "open_file" | "view_workflow";

function trailingAction(entry: ActivityEntry): { label: string; kind: ActionKind } | null {
  const d    = entry.detail as Record<string, unknown> | null;
  const type = entry.activity_type;
  const hasDiff = (d?.before && d?.after) || entry.from_state || entry.to_state;
  if (hasDiff || type.includes(".updated") || type.startsWith("document.item_") || type === "document.deleted" || type.includes("visibility_changed") || type.includes("renamed"))
    return { label: "View changes", kind: "view_changes" };
  if (type.includes("comment") || type.includes("user.comment"))
    return { label: "View comment", kind: "view_comment" };
  if (type === "attachment.uploaded")
    return { label: "Open file", kind: "open_file" };
  if (type.includes("workflow"))
    return { label: "View workflow", kind: "view_workflow" };
  return null;
}

// ── Filter / search matching ──────────────────────────────────────────────────

function matchesFilter(e: ActivityEntry, f: FilterMode): boolean {
  if (f === "all") return true;
  const t = e.activity_type.toLowerCase();
  switch (f) {
    case "document":    return e.domain === "document";
    case "comments":    return t.includes("comment");
    case "attachments": return t.includes("attachment");
    case "workflow":    return e.domain === "workflow";
    case "system":      return e.domain === "system" || !e.actor_name;
  }
}

function matchesSearch(e: ActivityEntry, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const d     = e.detail as Record<string, unknown> | null;
  const bv    = d?.before as Record<string, unknown> | null;
  const av    = d?.after  as Record<string, unknown> | null;
  const haystack = [
    e.actor_name, e.description, e.activity_type, e.from_state, e.to_state,
    d?.filename, d?.attachment_name, d?.comment_text, d?.commentText,
    bv && Object.values(bv).join(" "),
    av && Object.values(av).join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(lower);
}

// ── Inline diff renderer ──────────────────────────────────────────────────────

function DetailLine({ dl }: { dl: DiffLine }) {
  if (dl.plain) return <span>{dl.plain}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {dl.prefix && <span>{dl.prefix}</span>}
      {dl.before && (
        <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0 text-sm text-foreground">
          {dl.before}
        </span>
      )}
      {dl.before && dl.after && <ArrowRight className="size-2.5 shrink-0 text-muted-foreground" />}
      {dl.after && (
        <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0 text-sm font-medium text-foreground">
          {dl.after}
        </span>
      )}
      {dl.suffix && <span className="text-muted-foreground">{dl.suffix}</span>}
    </span>
  );
}

// ── Audit panel ───────────────────────────────────────────────────────────────

function activityField(fields: ActivityField[] | undefined, name: string): ActivityField | undefined {
  return fields?.find((field) => field.name === name || field.columnName === name);
}

function formatChangedValue(value: unknown, fieldName: string, fields?: ActivityField[], recordData?: Record<string, unknown>): string {
  const field = activityField(fields, fieldName);
  if (!field) return formatRecordValue(value);
  const snapshot = {
    ...(recordData ?? {}),
    data: { ...(recordData ?? {}), [field.name]: value, [field.columnName]: value },
  };
  return formatFieldValue(snapshot, field);
}

function AuditPanel({ entry, onOpenAuditLog, fields, recordData }: {
  entry: ActivityEntry;
  onOpenAuditLog?: (eventId: string) => void;
  fields?: ActivityField[];
  recordData?: Record<string, unknown>;
}) {
  const d          = entry.detail as Record<string, unknown> | null;
  const before     = d?.before ? { ...(d.before as Record<string, unknown>) } : null;
  const after      = d?.after  ? { ...(d.after as Record<string, unknown>) } : null;
  const diffFields = detailChangedFieldNames(d, before, after);
  const hasDiff    = diffFields.length > 0;
  const displayBefore = before
    ? Object.fromEntries(Object.entries(before).map(([field, value]) => [field, formatChangedValue(value, field, fields, recordData)]))
    : null;
  const displayAfter = after
    ? Object.fromEntries(Object.entries(after).map(([field, value]) => [field, formatChangedValue(value, field, fields, recordData)]))
    : null;
  if (before && displayBefore) Object.assign(before, displayBefore);
  if (after && displayAfter) Object.assign(after, displayAfter);
  const hasSession = !!(d?.ip_address || d?.device || d?.session_id || d?.correlation_id);
  const sourceLog  = typeof d?.source_log === "string" ? d.source_log : "log.activity_log";
  const canOpenAuditLog = sourceLog.startsWith("log.");
  const [showEventDetails, setShowEventDetails] = useState(false);

  const copyId = useCallback(async () => {
    await navigator.clipboard.writeText(entry.id).catch(() => {});
  }, [entry.id]);

  return (
    <div className="mx-3 mb-3 mt-0.5 rounded-lg border border-border bg-card p-4 text-sm">

      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{entry.activity_type}</span>
        <span aria-hidden>·</span>
        <span>{formatTimestamp(entry.created_at)}</span>
        {!entry.actor_name && <><span aria-hidden>Â·</span><span>System</span></>}
        {entry.actor_name && <><span aria-hidden>·</span><span>{entry.actor_name}</span></>}
        <button
          type="button"
          onClick={() => setShowEventDetails((value) => !value)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {showEventDetails ? "Hide event details" : "Event details"}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyId}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-foreground transition-colors hover:bg-muted"
          >
            <Copy className="size-3" />Copy ID
          </button>
          {canOpenAuditLog && (
            <button
              type="button"
              onClick={() => onOpenAuditLog?.(entry.id)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-3" />Open audit log
            </button>
          )}
        </div>
      </div>

      {showEventDetails && <div className="mb-2 rounded-md border border-border/70 bg-muted/30 p-3">
      {/* EVENT */}
      <p className={cn("mb-2", DRAWER_SECTION_HEADING)}>Event</p>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
        <span className="font-medium text-muted-foreground">Event code</span>
        <span className="break-all font-mono text-xs text-foreground">{entry.activity_type}</span>
        <span className="font-medium text-muted-foreground">Event ID</span>
        <span className="break-all font-mono text-xs text-foreground">{entry.id}</span>
        <span className="font-medium text-muted-foreground">Source</span>
        <span className="font-mono text-xs text-foreground">{sourceLog}</span>
        {!!d?.entity_id && (
          <>
            <span className="font-medium text-muted-foreground">Entity</span>
            <span className="break-all font-mono text-xs text-foreground">
              {d.entity_table ? `${String(d.entity_table)} · ` : ""}{String(d.entity_id)}
            </span>
          </>
        )}
        <span className={DRAWER_LABEL}>Timestamp</span>
        <span className={cn("tabular-nums", DRAWER_VALUE)}>{formatTimestamp(entry.created_at)}</span>
      </div></div>}

      {/* CHANGE */}
      {(hasDiff || entry.from_state || entry.to_state) && (
        <>
          <div className="my-2.5 border-t border-border" />
          <p className={cn("mb-2", DRAWER_SECTION_HEADING)}>Change</p>
          <div className="grid grid-cols-[110px_1fr_1fr] gap-x-2 gap-y-1">
            <span className="font-medium text-muted-foreground">Field</span>
            <span className="font-medium text-muted-foreground">Before</span>
            <span className="font-medium text-muted-foreground">After</span>
            {hasDiff
              ? diffFields.map((field) => (
                  <Row3
                    key={field}
                    label={field.replace(/_/g, " ")}
                    before={String(before![field] ?? "—")}
                    after={String(after![field] ?? "—")}
                  />
                ))
              : <Row3
                  label="status"
                  before={entry.from_state?.replace(/_/g, " ") ?? "—"}
                  after={entry.to_state?.replace(/_/g, " ")  ?? "—"}
                />}
          </div>
        </>
      )}

      {/* SESSION */}
      {(hasSession || entry.actor_name) && (
        <>
          <div className="my-2.5 border-t border-border" />
          <p className={cn("mb-2", DRAWER_SECTION_HEADING)}>Session</p>
          <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
            {entry.actor_name && (
              <>
                <span className="font-medium text-muted-foreground">Actor</span>
                <span className="text-foreground">{entry.actor_name}</span>
              </>
            )}
            {!!d?.ip_address && (
              <>
                <span className="font-medium text-muted-foreground">IP address</span>
                <span className="font-mono text-xs text-foreground">{String(d.ip_address)}</span>
              </>
            )}
            {!!d?.device && (
              <>
                <span className="font-medium text-muted-foreground">Device</span>
                <span className="text-foreground">{String(d.device)}</span>
              </>
            )}
            {!!d?.session_id && (
              <>
                <span className="font-medium text-muted-foreground">Session</span>
                <span className="font-mono text-xs text-foreground">{String(d.session_id)}</span>
              </>
            )}
            {!!d?.correlation_id && (
              <>
                <span className="font-medium text-muted-foreground">Correlation</span>
                <span className="break-all font-mono text-xs text-foreground">{String(d.correlation_id)}</span>
              </>
            )}
          </div>
        </>
      )}

    </div>
  );
}

function Row3({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <>
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="rounded border border-border bg-card px-1.5 py-0.5 text-sm text-foreground">{before}</span>
      <span className="rounded border border-border bg-card px-1.5 py-0.5 text-sm font-medium text-foreground">{after}</span>
    </>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({
  entry,
  isLast,
  isExpanded,
  onToggleExpand,
  onOpenAuditLog,
  fields,
  recordData,
}: {
  entry:            ActivityEntry;
  isLast:           boolean;
  isExpanded:       boolean;
  onToggleExpand:   () => void;
  onOpenAuditLog?:  (eventId: string) => void;
  fields?:           ActivityField[];
  recordData?:       Record<string, unknown>;
}) {
  const time   = formatTime(entry.created_at);
  const actor  = entry.actor_name ?? "System";
  const full   = summarize(entry);
  // Strip actor prefix from summary to avoid repetition
  const verb   = full.startsWith(actor) ? full.slice(actor.length).trim() : full;
  const dl     = buildDetailLine(entry);
  const action = trailingAction(entry);

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[60px_1fr_auto] items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
          !isLast && !isExpanded && "border-b border-border",
        )}
      >
        {/* Time */}
        <span className={cn("whitespace-nowrap pt-0.5 tabular-nums", DRAWER_CONTROL)}>
          {time}
        </span>

        {/* Content */}
        <div className="min-w-0">
          <p className={cn("leading-snug", DRAWER_VALUE)}>
            <span className="font-medium">{actor}</span>
            {verb && ` ${verb}`}
          </p>
          {dl && (
            <div className={cn("mt-0.5", DRAWER_META)}>
              <DetailLine dl={dl} />
            </div>
          )}
        </div>

        {/* Action */}
        {action && (
          <button
            type="button"
            onClick={onToggleExpand}
            className={cn(
              "flex items-center gap-1 whitespace-nowrap pt-0.5 transition-colors",
              DRAWER_CONTROL,
              isExpanded
                ? "rounded bg-muted px-2 py-1 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isExpanded ? action.label.replace("View", "Hide") : action.label}
            {isExpanded
              ? <ChevronUp className="size-2.5" />
              : <ChevronDown className="size-2.5" />}
          </button>
        )}
      </div>

      {isExpanded && (
        <div className={cn(!isLast && "border-b border-border")}>
          <AuditPanel entry={entry} onOpenAuditLog={onOpenAuditLog} fields={fields} recordData={recordData} />
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface ActivityFeedProps {
  entries?:         ActivityEntry[];
  className?:       string;
  onOpenAuditLog?:  (eventId: string) => void;
  fields?:           ActivityField[];
  recordData?:       Record<string, unknown>;
}

const CHIPS: Array<{ key: FilterMode; label: string }> = [
  { key: "all",         label: "All" },
  { key: "document",    label: "Document" },
  { key: "comments",    label: "Comments" },
  { key: "attachments", label: "Attachments" },
  { key: "workflow",    label: "Workflow" },
  { key: "system",      label: "System" },
];

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
];

export function ActivityFeed({ entries = [], className, onOpenAuditLog, fields, recordData }: ActivityFeedProps) {
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState<FilterMode>("all");
  const [sort,        setSort]        = useState<SortMode>("newest");
  const [sortOpen,    setSortOpen]    = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const searchRef  = useRef<HTMLInputElement>(null);
  const sortRef    = useRef<HTMLDivElement>(null);

  // Outside-click for sort menu
  useEffect(() => {
    if (!sortOpen) return;
    function h(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [sortOpen]);

  // Ctrl+K focuses search
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Per-chip counts (for badges)
  const chipCounts = useMemo(() => {
    const c = { all: entries.length, document: 0, comments: 0, attachments: 0, workflow: 0, system: 0 } as Record<FilterMode, number>;
    for (const e of entries) {
      for (const chip of CHIPS.slice(1)) {
        if (matchesFilter(e, chip.key)) c[chip.key]++;
      }
    }
    return c;
  }, [entries]);

  // Filtered + searched + sorted entries
  const processed = useMemo(() => {
    const list = entries.filter((e) => matchesFilter(e, filter) && matchesSearch(e, search));
    return [...list].sort((a, b) => {
      const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "newest" ? -d : d;
    });
  }, [entries, filter, search, sort]);

  // Group by calendar day
  const dayGroups = useMemo(() => {
    const today = new Date();
    const map   = new Map<string, ActivityEntry[]>();
    for (const e of processed) {
      const key = new Date(e.created_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([, group]) => ({
      label: formatDayLabel(group[0]!.created_at, today),
      count: group.length,
      entries: group,
    }));
  }, [processed]);

  const currentSort = SORT_OPTIONS.find((o) => o.key === sort)!;

  return (
    <div className={cn("flex flex-col gap-3", className)}>

      <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative order-2 min-w-[220px] flex-1 lg:order-2 lg:ml-auto lg:max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search activity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Filter chips + sort control */}
      <div className="order-1 flex items-center gap-2 lg:contents">
        <div className="flex flex-1 flex-wrap items-center gap-1 lg:order-1 lg:flex-none">
          {CHIPS.filter((c) => c.key === "all" || chipCounts[c.key] > 0).map((chip) => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {chip.label}
                {chip.key !== "all" && chipCounts[chip.key] > 0 && (
                  <span className={cn("tabular-nums text-sm", active ? "opacity-80" : "opacity-60")}>
                    {chipCounts[chip.key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="relative order-3 shrink-0" ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className={cn("flex items-center gap-1 transition-colors hover:text-foreground", DRAWER_CONTROL)}
          >
            <ArrowUpDown className="size-3" />
            {currentSort.label}
            <ChevronDown className="size-3 opacity-60" />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-border bg-popover py-1 shadow-lg">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setSort(opt.key); setSortOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex size-3.5 items-center justify-center shrink-0">
                    {sort === opt.key && <Check className="size-3 text-primary" />}
                  </span>
                  <span className={cn("text-foreground", sort !== opt.key && "text-muted-foreground")}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Empty state */}
      {processed.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Clock className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search ? "No activity matches your search." : "No activity yet."}
          </p>
        </div>
      )}

      {/* Day groups */}
      {dayGroups.map((group) => (
        <div key={group.label}>
          {/* Day header */}
          <div className="mb-1.5 flex items-center gap-2">
            <span className="shrink-0 text-sm font-semibold text-foreground">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 tabular-nums text-sm font-medium text-muted-foreground">
              {group.count} event{group.count !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Event rows */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {group.entries.map((entry, idx) => (
              <ActivityRow
                key={entry.id}
                entry={entry}
                isLast={idx === group.entries.length - 1}
                isExpanded={expandedIds.has(entry.id)}
                onToggleExpand={() => toggleExpand(entry.id)}
                onOpenAuditLog={onOpenAuditLog}
                fields={fields}
                recordData={recordData}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
