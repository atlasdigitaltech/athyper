"use client";

/**
 * SnapshotDetailDrawer — read-only side panel for inspecting one snapshot.
 *
 * Mounts from the Versions panel when the user clicks a snapshot row or
 * the "View Snapshot" CTA. Fetches the full graph payload from
 *   GET /api/runtime/v1/entities/:entity/:id/snapshots/:snapshotId
 *
 * Renders a tab strip across the snapshot's child collections (Header /
 * Lines / Components / Distributions / Schedules) — tabs that have no
 * data in the snapshot are not rendered, so a POC snapshot won't show
 * empty PC / AD tabs.
 *
 * Field-rule-aware rendering:
 *   - Header tab uses the parent runtime descriptor (passed via the
 *     `contract` prop) to resolve human labels and format scalars by
 *     dataType — see snapshot-field-rules.ts.
 *   - Child tabs (lines / components / distributions / schedules) consume
 *     a per-section descriptor map (`childContracts`) prefetched by the
 *     host page. A missing slot degrades that tab to raw column names.
 *
 * Read-only viewer with a single destructive action — Restore — gated by
 * a DialogConfirmShell. Restore lives here (not at the row level in the
 * panel) so the user sees what they're about to restore before clicking.
 */

import { useMemo, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/platform-theme/semantic-colors";
import { DrawerPeekShell, DialogConfirmShell } from "@athyper/platform-ui/surfaces/shells";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type {
  SnapshotDetail,
  SnapshotGateEventKind,
  SnapshotRestoreResponse,
} from "@athyper/api-contracts/documents";
import {
  buildFieldIndex,
  resolveFieldRule,
  formatFieldValue,
  type SnapshotChildContracts,
} from "./snapshot-field-rules";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import {
  useOptionalRecordWorkspaceSnapshotDetail,
  useOptionalRecordWorkspaceSnapshotRestore,
} from "../record-query";

export interface SnapshotDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityCode: string;
  recordId: string;
  /** Snapshot id from the list. When null while open, drawer shows empty state. */
  snapshotId: string | null;
  /**
   * Optional. Fired AFTER a successful restore (post-confirm + 200 response).
   * Lets the parent refresh whatever it needs — most often the record's
   * detail page or the snapshot index. Drawer closes itself either way.
   */
  onRestoreSuccess?: (result: SnapshotRestoreResponse) => void;
  /**
   * Parent entity runtime descriptor. When provided, the Header tab uses
   * field labels + format hints. When omitted, the drawer gracefully
   * falls back to raw column names and a generic JSON formatter.
   */
  contract?: MetaEntityRuntimeDescriptor;
  /**
   * Per-section child descriptors keyed by snapshot slot (lines /
   * components / distributions / schedules). When a slot has a descriptor,
   * that tab's rows resolve labels + formatters from it; otherwise the
   * tab falls back to raw column names.
   */
  childContracts?: SnapshotChildContracts;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SnapshotDetailDrawer({
  open,
  onOpenChange,
  snapshotId,
  onRestoreSuccess,
  contract,
  childContracts,
}: SnapshotDetailDrawerProps) {
  const detailQuery = useOptionalRecordWorkspaceSnapshotDetail<SnapshotDetail>(
    open ? snapshotId : null,
  );
  const detail = detailQuery.data ?? null;
  const loading = detailQuery.fetchStatus === "fetching" && detailQuery.data === undefined;
  const error = detailQuery.error?.message ?? null;
  const restoreMutation = useOptionalRecordWorkspaceSnapshotRestore<SnapshotRestoreResponse>();

  const title = detail
    ? `Snapshot #${detail.chain_seq}`
    : snapshotId
      ? "Loading snapshot…"
      : "Snapshot";
  const subtitle = detail
    ? `${gateEventKindLabel(detail.gate_event_kind, detail.gate_event)} · ${formatDateTime(detail.captured_at)}`
    : undefined;

  // Restore flow state — kept here so the dialog mounts within the drawer's
  // stack frame, which keeps the SurfaceStackController happy.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoring = restoreMutation.isPending;

  async function handleRestore() {
    if (!detail || restoring) return;
    setRestoreError(null);
    try {
      const body = await restoreMutation.mutateAsync(detail.id);
      // Success — close the confirm + the drawer, signal upstream.
      setConfirmOpen(false);
      onOpenChange(false);
      onRestoreSuccess?.(body);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    }
  }

  const restoreActions: ReactNode = detail ? (
    <button
      type="button"
      onClick={() => { setRestoreError(null); setConfirmOpen(true); }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2.5 text-[11px] font-medium text-warning",
        "hover:bg-warning/15 focus:outline-none focus:ring-2 focus:ring-warning/40",
      )}
    >
      <RotateCcw className="h-3 w-3" aria-hidden />
      Restore
    </button>
  ) : null;

  return (
    <>
      <DrawerPeekShell
        open={open}
        onOpenChange={onOpenChange}
        contextBadge="SNAPSHOT"
        title={title}
        subtitle={subtitle}
        actions={restoreActions}
        widthKey="document:snapshot:detail"
        defaultWidth={560}
        expandedWidth="70vw"
        expandable
      >
        {loading ? (
          <Placeholder title="Loading snapshot…" detail="Reading the frozen graph payload." />
        ) : error ? (
          <Placeholder title="Couldn't load snapshot" detail={error} tone="error" />
        ) : !detail ? (
          <Placeholder title="No snapshot selected" detail="Pick a snapshot row in the Versions panel." />
        ) : (
          <SnapshotBody detail={detail} contract={contract} childContracts={childContracts} />
        )}
      </DrawerPeekShell>

      {detail && (
        <DialogConfirmShell
          open={confirmOpen}
          onOpenChange={(next) => { if (!restoring) setConfirmOpen(next); }}
          intent="destructive"
          title={`Restore from snapshot #${detail.chain_seq}?`}
          consequence={buildRestoreConsequence(detail, restoreError)}
          cancel={
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={restoring}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              Cancel
            </button>
          }
          confirm={
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring}
              className="inline-flex h-8 items-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {restoring ? "Restoring…" : "Restore now"}
            </button>
          }
        />
      )}
    </>
  );
}

function buildRestoreConsequence(detail: SnapshotDetail, errorMessage: string | null): string {
  if (errorMessage) {
    return `${errorMessage} — try again or pick a different snapshot.`;
  }
  const linesCount         = detail.lines_json?.length         ?? 0;
  const componentsCount    = detail.components_json?.length    ?? 0;
  const distributionsCount = detail.distributions_json?.length ?? 0;
  const schedulesCount     = detail.schedules_json?.length     ?? 0;
  const childParts: string[] = [];
  if (linesCount         > 0) childParts.push(`${linesCount} line${linesCount === 1 ? "" : "s"}`);
  if (componentsCount    > 0) childParts.push(`${componentsCount} pricing row${componentsCount === 1 ? "" : "s"}`);
  if (distributionsCount > 0) childParts.push(`${distributionsCount} distribution${distributionsCount === 1 ? "" : "s"}`);
  if (schedulesCount     > 0) childParts.push(`${schedulesCount} schedule row${schedulesCount === 1 ? "" : "s"}`);
  const childSummary = childParts.length > 0 ? childParts.join(", ") : "no child rows";
  return (
    `Header and ${childSummary} will be reverted to the state captured at `
    + `${gateEventKindLabel(detail.gate_event_kind, detail.gate_event).toLowerCase()} `
    + `on ${formatDateTime(detail.captured_at)}. `
    + `Allowed only in draft / rejected. Current child rows will be deleted and replaced.`
  );
}

// ─── Fetch hook ─────────────────────────────────────────────────────────────

// ─── Body ───────────────────────────────────────────────────────────────────

type TabId = "header" | "lines" | "components" | "distributions" | "schedules";

function SnapshotBody({
  detail,
  contract,
  childContracts,
}: {
  detail:          SnapshotDetail;
  contract?:       MetaEntityRuntimeDescriptor;
  childContracts?: SnapshotChildContracts;
}) {
  // Only show tabs for collections that have data — a POC snapshot won't
  // surface empty Components/Distributions tabs.
  const tabs: { id: TabId; label: string; count: number | null }[] = [
    { id: "header", label: "Header", count: null },
  ];
  if (detail.lines_json && detail.lines_json.length > 0) {
    tabs.push({ id: "lines", label: "Lines", count: detail.lines_json.length });
  }
  if (detail.components_json && detail.components_json.length > 0) {
    tabs.push({ id: "components", label: "Components", count: detail.components_json.length });
  }
  if (detail.distributions_json && detail.distributions_json.length > 0) {
    tabs.push({ id: "distributions", label: "Distributions", count: detail.distributions_json.length });
  }
  if (detail.schedules_json && detail.schedules_json.length > 0) {
    tabs.push({ id: "schedules", label: "Schedules", count: detail.schedules_json.length });
  }

  const [activeTab, setActiveTab] = useState<TabId>("header");

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* Snapshot metadata card */}
      <SnapshotMetaCard detail={detail} />

      {/* Tab strip */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-foreground text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className="ml-1 text-[10px] text-muted-foreground">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab body */}
      {activeTab === "header" && (
        <KeyValueTable record={detail.header_json} contract={contract} />
      )}
      {activeTab === "lines" && (
        <CollectionTable
          rows={detail.lines_json ?? []}
          primaryKey="line_no"
          contract={childContracts?.lines}
        />
      )}
      {activeTab === "components" && (
        <CollectionTable
          rows={detail.components_json ?? []}
          primaryKey="sequence"
          contract={childContracts?.components}
        />
      )}
      {activeTab === "distributions" && (
        <CollectionTable
          rows={detail.distributions_json ?? []}
          primaryKey="distribution_no"
          contract={childContracts?.distributions}
        />
      )}
      {activeTab === "schedules" && (
        <CollectionTable
          rows={detail.schedules_json ?? []}
          primaryKey="schedule_no"
          contract={childContracts?.schedules}
        />
      )}
    </div>
  );
}

// ─── Metadata card ──────────────────────────────────────────────────────────

function SnapshotMetaCard({ detail }: { detail: SnapshotDetail }) {
  const colors = resolveSemanticColors(gateEventKindIntent(detail.gate_event_kind, detail.gate_event));
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          colors.subtleBadge,
        )}>
          {gateEventKindLabel(detail.gate_event_kind, detail.gate_event)}
        </span>
        {detail.document_code && (
          <span className="text-xs font-medium text-foreground">{detail.document_code}</span>
        )}
        <span className="text-[11px] text-muted-foreground">v{detail.version_number}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">Gate event</dt>
        <dd className="font-mono text-foreground">{detail.gate_event}</dd>
        <dt className="text-muted-foreground">Captured by</dt>
        <dd className="text-foreground">{detail.captured_by_name ?? "System"}</dd>
        <dt className="text-muted-foreground">Captured at</dt>
        <dd className="text-foreground">{formatDateTime(detail.captured_at)}</dd>
        <dt className="text-muted-foreground">Chain seq</dt>
        <dd className="text-foreground">#{detail.chain_seq}</dd>
        <dt className="text-muted-foreground">Hash</dt>
        <dd
          className="truncate font-mono text-muted-foreground"
          title={detail.payload_hash}
        >
          {detail.payload_hash.slice(0, 24)}…
        </dd>
      </dl>
    </div>
  );
}

// ─── Key/value renderer (header_json) ───────────────────────────────────────

const HEADER_SKIP_KEYS = new Set([
  "tenant_id", "created_at", "created_by", "updated_at", "updated_by",
  "data", // duplicate nested copy on runtime records
]);

function KeyValueTable({
  record,
  contract,
}: {
  record:    Record<string, unknown>;
  contract?: MetaEntityRuntimeDescriptor;
}) {
  // Build the descriptor index once per render. Cheap (~50 entries for a
  // typical document header) but useMemo'd anyway to avoid churn on
  // unrelated state changes inside the parent drawer.
  const fieldIndex = useMemo(() => buildFieldIndex(contract), [contract]);

  // Annotate, then sort by display label so users see human-ordered rows
  // instead of alphabetical-by-snake_case. Unresolved entries sort by raw
  // key (preserving prior behaviour for the long tail of audit/legacy
  // columns that escape the descriptor).
  const entries = Object.entries(record)
    .filter(([key, value]) => !HEADER_SKIP_KEYS.has(key) && value != null)
    .map(([key, value]) => ({ key, value, rule: resolveFieldRule(fieldIndex, key) }))
    .sort((a, b) => a.rule.label.localeCompare(b.rule.label));

  if (entries.length === 0) {
    return <Placeholder title="No header fields" detail="Snapshot header was empty after filtering audit columns." />;
  }

  return (
    <div className="rounded-md border border-border bg-background">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(({ key, value, rule }, idx) => (
            <tr key={key} className={cn(idx > 0 && "border-t border-border/40")}>
              <td
                className={cn(
                  "w-1/3 px-3 py-1.5",
                  rule.resolved
                    ? "text-muted-foreground"
                    : "font-mono text-muted-foreground/70",
                )}
                title={rule.resolved ? key : undefined}
              >
                {rule.label}
              </td>
              <td className="px-3 py-1.5 break-words text-foreground">
                {formatFieldValue(value, rule)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Collection renderer (lines, PC, AD, SL) ────────────────────────────────

const COLLECTION_SKIP_KEYS = new Set([
  "tenant_id", "created_at", "created_by", "updated_at", "updated_by",
  "data",
]);

function CollectionTable({
  rows,
  primaryKey,
  contract,
}: {
  rows:        Record<string, unknown>[];
  primaryKey?: string;
  contract?:   MetaEntityRuntimeDescriptor;
}) {
  // Build the index once for the whole collection — every row uses the
  // same descriptor, so per-row rebuilds would be wasted work.
  const fieldIndex = useMemo(() => buildFieldIndex(contract), [contract]);

  if (rows.length === 0) {
    return <Placeholder title="No rows" detail="This child collection was empty when the snapshot was captured." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, idx) => {
        const headerValue = primaryKey && row[primaryKey] != null
          ? String(row[primaryKey])
          : `#${idx + 1}`;
        // Annotate then sort by display label. Same shape as the header
        // tab's KeyValueTable — see that function for the rationale.
        const entries = Object.entries(row)
          .filter(([key, value]) => !COLLECTION_SKIP_KEYS.has(key) && key !== primaryKey && value != null)
          .map(([key, value]) => ({ key, value, rule: resolveFieldRule(fieldIndex, key) }))
          .sort((a, b) => a.rule.label.localeCompare(b.rule.label));
        return (
          <details
            key={typeof row["id"] === "string" ? row["id"] : `${idx}`}
            className="rounded-md border border-border bg-background"
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40">
              {primaryKey ? <span className="font-mono text-muted-foreground">{primaryKey}: </span> : null}
              {headerValue}
              <span className="ml-2 text-[10px] text-muted-foreground">({entries.length} fields)</span>
            </summary>
            <table className="w-full border-t border-border/40 text-xs">
              <tbody>
                {entries.map(({ key, value, rule }, rowIdx) => (
                  <tr key={key} className={cn(rowIdx > 0 && "border-t border-border/40")}>
                    <td
                      className={cn(
                        "w-1/3 px-3 py-1.5",
                        rule.resolved
                          ? "text-muted-foreground"
                          : "font-mono text-muted-foreground/70",
                      )}
                      title={rule.resolved ? key : undefined}
                    >
                      {rule.label}
                    </td>
                    <td className="px-3 py-1.5 break-words text-foreground">
                      {formatFieldValue(value, rule)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// `gateEvent` lets us surface 'restore' as a distinct chip even though it
// rides on the 'authoring_lock' kind — see runtime-process-surface.tsx for
// the canonical mapping rationale (Phase 14).
function gateEventKindLabel(
  kind:       SnapshotGateEventKind,
  gateEvent?: string | null,
): string {
  if (gateEvent === "restore") return "Restored";
  switch (kind) {
    case "authoring_lock":     return "Submitted";
    case "commitment":         return "Approved";
    case "fulfillment":        return "Fulfilled";
    case "financial_post":     return "Posted";
    case "match_decision":     return "Matched";
    case "amendment_baseline": return "Amendment baseline";
    case "reversal":           return "Reversed";
    default:                   return kind;
  }
}

function gateEventKindIntent(
  kind:       SnapshotGateEventKind,
  gateEvent?: string | null,
): SemanticIntent {
  if (gateEvent === "restore") return "warning";
  switch (kind) {
    case "authoring_lock":     return "info";
    case "commitment":         return "info";
    case "fulfillment":        return "success";
    case "financial_post":     return "success";
    case "match_decision":     return "info";
    case "amendment_baseline": return "warning";
    case "reversal":           return "error";
    default:                   return "muted";
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Placeholder({
  title,
  detail,
  tone = "info",
}: {
  title:  string;
  detail: string;
  tone?:  "info" | "error";
}) {
  return (
    <div className={cn(
      "rounded-md border p-4",
      tone === "error" ? "border-destructive/40 bg-destructive/5" : "border-dashed",
    )}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
