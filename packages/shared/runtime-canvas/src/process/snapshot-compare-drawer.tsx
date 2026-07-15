"use client";

/**
 * SnapshotCompareDrawer — sectioned diff between two snapshots.
 *
 * Mounts from VersionsPanel when the user selects two snapshots and clicks
 * Compare. Fires:
 *   POST /api/runtime/v1/entities/:entity/:id/snapshots/compare
 *   body: { leftSnapshotId, rightSnapshotId }
 *
 * Renders one section card per (header / lines / components / distributions
 * / schedules), each with added / removed / changed buckets. Server always
 * emits older → newer regardless of click order; the drawer surfaces that
 * via a `swapped` chip when the user picked them out of chronological order.
 *
 * Read-only. Restore is a separate Phase 9b path with its own confirmation
 * + replay engine.
 *
 * Field-rule-aware rendering:
 *   - The **header** section uses the parent runtime descriptor (passed
 *     via the `contract` prop) to resolve human labels and format scalars
 *     by dataType — see snapshot-field-rules.ts.
 *   - Lines / components / distributions / schedules consume a per-slot
 *     map of child descriptors (`childContracts`) prefetched by the host.
 *     Any slot whose descriptor is unavailable falls back to raw column
 *     names for that section.
 */

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ArrowRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";
import { DrawerPeekShell } from "@athyper/ui/surfaces/shells";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type {
  FieldDelta,
  RowAddRemove,
  RowChange,
  SectionDiff,
  SnapshotCompareResponse,
  SnapshotCompareSide,
  SnapshotGateEventKind,
} from "@athyper/api-contracts/documents";
import {
  buildFieldIndex,
  resolveFieldRule,
  formatFieldValue,
  type SnapshotChildContracts,
  type SnapshotChildSlot,
} from "./snapshot-field-rules";

export interface SnapshotCompareDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityCode: string;
  recordId: string;
  /** Snapshot ids picked by the user. Sent in caller order; server sorts. */
  leftSnapshotId:  string | null;
  rightSnapshotId: string | null;
  /**
   * Parent entity runtime descriptor for the **header** section.
   */
  contract?: MetaEntityRuntimeDescriptor;
  /**
   * Per-section child descriptors keyed by snapshot slot. Any non-header
   * section whose descriptor is present resolves labels + formatters from
   * it; absent slots fall back to raw column names.
   */
  childContracts?: SnapshotChildContracts;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SnapshotCompareDrawer({
  open,
  onOpenChange,
  entityCode,
  recordId,
  leftSnapshotId,
  rightSnapshotId,
  contract,
  childContracts,
}: SnapshotCompareDrawerProps) {
  const { loading, error, diff } = useSnapshotCompare(
    entityCode,
    recordId,
    open ? leftSnapshotId  : null,
    open ? rightSnapshotId : null,
  );

  const title = diff
    ? `Compare #${diff.left.chain_seq} → #${diff.right.chain_seq}`
    : loading
      ? "Comparing snapshots…"
      : "Compare snapshots";
  const subtitle = diff
    ? `${diff.total_differences} difference${diff.total_differences === 1 ? "" : "s"} across ${diff.sections.length} sections`
    : undefined;

  return (
    <DrawerPeekShell
      open={open}
      onOpenChange={onOpenChange}
      contextBadge="COMPARE"
      title={title}
      subtitle={subtitle}
      widthKey="document:snapshot:compare"
      defaultWidth={680}
      expandedWidth="80vw"
      expandable
    >
      {loading ? (
        <Placeholder title="Computing diff…" detail="Loading both snapshots and comparing field-by-field." />
      ) : error ? (
        <Placeholder title="Couldn't compute diff" detail={error} tone="error" />
      ) : !diff ? (
        <Placeholder title="No comparison" detail="Pick two snapshots in the Versions panel." />
      ) : (
        <CompareBody diff={diff} contract={contract} childContracts={childContracts} />
      )}
    </DrawerPeekShell>
  );
}

// ─── Fetch hook ─────────────────────────────────────────────────────────────

function useSnapshotCompare(
  entityCode: string,
  recordId:   string,
  leftId:     string | null,
  rightId:    string | null,
): {
  loading: boolean;
  error:   string | null;
  diff:    SnapshotCompareResponse | null;
} {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [diff,    setDiff]    = useState<SnapshotCompareResponse | null>(null);

  useEffect(() => {
    if (!leftId || !rightId) {
      setLoading(false);
      setError(null);
      setDiff(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(runtimePath.entitySnapshotCompare(entityCode, recordId), {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leftSnapshotId: leftId, rightSnapshotId: rightId }),
      cache:  "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { message?: string } | null;
          throw new Error(body?.message ?? `Compare API returned ${res.status}`);
        }
        const body = await res.json() as SnapshotCompareResponse;
        if (!controller.signal.aborted) setDiff(body);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [entityCode, recordId, leftId, rightId]);

  return { loading, error, diff };
}

// ─── Body ───────────────────────────────────────────────────────────────────

function CompareBody({
  diff,
  contract,
  childContracts,
}: {
  diff:            SnapshotCompareResponse;
  contract?:       MetaEntityRuntimeDescriptor;
  childContracts?: SnapshotChildContracts;
}) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const visibleSections = showUnchanged
    ? diff.sections
    : diff.sections.filter((s) => !s.identical);

  // Build one field index per section that has a descriptor available.
  // Memoised so all visible SectionCards share the same Map instances
  // across renders — without this, the diff toggle would rebuild every
  // index on each tick. Missing slots produce empty maps, which the row
  // renderers treat as "no descriptor → raw column names".
  const sectionIndexes = useMemo(() => ({
    header:        buildFieldIndex(contract),
    lines:         buildFieldIndex(childContracts?.lines),
    components:    buildFieldIndex(childContracts?.components),
    distributions: buildFieldIndex(childContracts?.distributions),
    schedules:     buildFieldIndex(childContracts?.schedules),
  }), [contract, childContracts?.lines, childContracts?.components, childContracts?.distributions, childContracts?.schedules]);

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* Header card with side metadata + sort note */}
      <SideStrip left={diff.left} right={diff.right} swapped={diff.swapped} />

      {/* Toggle */}
      <label className="inline-flex w-fit items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showUnchanged}
          onChange={(e) => setShowUnchanged(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Show identical sections
      </label>

      {/* Sections */}
      {visibleSections.length === 0 ? (
        <Placeholder
          title="No differences"
          detail="The two snapshots are identical across header, lines, components, distributions, and schedules."
        />
      ) : (
        visibleSections.map((section) => (
          <SectionCard
            key={section.section}
            section={section}
            fieldIndex={resolveSectionFieldIndex(section.section, sectionIndexes)}
          />
        ))
      )}
    </div>
  );
}

/**
 * Pick the correct field index for a SectionDiff. Header maps directly;
 * line / component / distribution / schedule slots map to the matching
 * child slot. Any unknown section name returns the empty index (raw
 * fallback) — this also covers the case where SectionDiff adds a new
 * variant ahead of the canvas being updated.
 */
function resolveSectionFieldIndex(
  section: SectionDiff["section"],
  indexes: Record<"header" | SnapshotChildSlot, ReadonlyMap<string, MetaEntityField>>,
): ReadonlyMap<string, MetaEntityField> {
  switch (section) {
    case "header":        return indexes.header;
    case "lines":         return indexes.lines;
    case "components":    return indexes.components;
    case "distributions": return indexes.distributions;
    case "schedules":     return indexes.schedules;
    default:              return EMPTY_FIELD_INDEX;
  }
}

// ─── Side strip ─────────────────────────────────────────────────────────────

function SideStrip({
  left,
  right,
  swapped,
}: {
  left:    SnapshotCompareSide;
  right:   SnapshotCompareSide;
  swapped: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
        <SideCard side={left} label="Before" />
        <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
        <SideCard side={right} label="After" />
      </div>
      {swapped && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Snapshots were picked out of chronological order; sorted older → newer for readability.
        </p>
      )}
    </div>
  );
}

function SideCard({ side, label }: { side: SnapshotCompareSide; label: string }) {
  const colors = resolveSemanticColors(gateEventKindIntent(side.gate_event_kind, side.gate_event));
  return (
    <div className="min-w-0 rounded-md border border-border bg-background p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
          colors.subtleBadge,
        )}>
          {gateEventKindLabel(side.gate_event_kind, side.gate_event)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">#{side.chain_seq}</span>
      </div>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{side.gate_event}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {formatDateTime(side.captured_at)} · {side.captured_by_name ?? "System"}
      </p>
    </div>
  );
}

// ─── Section card ───────────────────────────────────────────────────────────

const SECTION_LABEL: Record<SectionDiff["section"], string> = {
  header:        "Header",
  lines:         "Lines",
  components:    "Components",
  distributions: "Distributions",
  schedules:     "Schedules",
};

// Shared empty index for non-header sections — `useMemo` keeps the same
// reference across renders so SectionCard receives stable props.
const EMPTY_FIELD_INDEX: ReadonlyMap<string, MetaEntityField> = new Map();

function SectionCard({
  section,
  fieldIndex,
}: {
  section:    SectionDiff;
  fieldIndex: ReadonlyMap<string, MetaEntityField>;
}) {
  const counts = [
    section.added.length   > 0 ? `${section.added.length} added`     : null,
    section.removed.length > 0 ? `${section.removed.length} removed` : null,
    section.changed.length > 0 ? `${section.changed.length} changed` : null,
  ].filter((s): s is string => s !== null);

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium text-foreground">{SECTION_LABEL[section.section]}</span>
        <span className="text-[11px] text-muted-foreground">
          {section.identical ? "Identical" : counts.join(" · ")}
        </span>
      </div>

      {section.identical ? null : (
        <div className="flex flex-col gap-2 p-3">
          {section.added.map((row) => (
            <AddRemoveRow
              key={`add-${row.identifier}-${row.row_id ?? ""}`}
              row={row}
              kind="added"
              fieldIndex={fieldIndex}
            />
          ))}
          {section.removed.map((row) => (
            <AddRemoveRow
              key={`rem-${row.identifier}-${row.row_id ?? ""}`}
              row={row}
              kind="removed"
              fieldIndex={fieldIndex}
            />
          ))}
          {section.changed.map((row) => (
            <ChangedRow
              key={`chg-${row.identifier}-${row.row_id ?? ""}`}
              row={row}
              fieldIndex={fieldIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddRemoveRow({
  row,
  kind,
  fieldIndex,
}: {
  row:        RowAddRemove;
  kind:       "added" | "removed";
  fieldIndex: ReadonlyMap<string, MetaEntityField>;
}) {
  const isAdded = kind === "added";
  return (
    <details className={cn(
      "rounded-md border bg-background",
      isAdded ? "border-success/40" : "border-destructive/40",
    )}>
      <summary className={cn(
        "cursor-pointer px-3 py-2 text-xs",
        isAdded ? "text-success" : "text-destructive",
      )}>
        <span className="inline-flex items-center gap-1">
          {isAdded ? <Plus className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
          <span className="font-medium">{kind === "added" ? "Added" : "Removed"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-foreground">{row.identifier}</span>
        </span>
      </summary>
      <div className="border-t border-border/40 p-2">
        <KeyValueDiffTable row={row.row} fieldIndex={fieldIndex} />
      </div>
    </details>
  );
}

function ChangedRow({
  row,
  fieldIndex,
}: {
  row:        RowChange;
  fieldIndex: ReadonlyMap<string, MetaEntityField>;
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5 text-xs">
        <span>
          <span className="text-muted-foreground">Changed · </span>
          <span className="font-mono text-foreground">{row.identifier}</span>
        </span>
        <span className="text-[11px] text-muted-foreground">
          {row.fields.length} field{row.fields.length === 1 ? "" : "s"}
        </span>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {row.fields.map((field, idx) => (
            <FieldDeltaRow
              key={field.field}
              field={field}
              striped={idx % 2 === 0}
              fieldIndex={fieldIndex}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldDeltaRow({
  field,
  striped,
  fieldIndex,
}: {
  field:      FieldDelta;
  striped:    boolean;
  fieldIndex: ReadonlyMap<string, MetaEntityField>;
}) {
  // `fieldIndex` is the parent descriptor's column-name → MetaEntityField map
  // (built once in CompareBody). resolveFieldRule treats an empty Map as
  // "no descriptor available" and falls back to the raw column name.
  const rule = resolveFieldRule(fieldIndex as Map<string, MetaEntityField>, field.field);
  return (
    <tr className={cn(striped && "bg-muted/30")}>
      <td
        className={cn(
          "w-1/4 px-3 py-1.5 align-top",
          rule.resolved
            ? "text-muted-foreground"
            : "font-mono text-muted-foreground/70",
        )}
        title={rule.resolved ? field.field : undefined}
      >
        {rule.label}
      </td>
      <td className="w-3/8 px-3 py-1.5 align-top">
        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through break-words">
          {formatFieldValue(field.left, rule)}
        </span>
      </td>
      <td className="w-3/8 px-3 py-1.5 align-top">
        <span className="rounded bg-success/10 px-1.5 py-0.5 text-success break-words">
          {formatFieldValue(field.right, rule)}
        </span>
      </td>
    </tr>
  );
}

// Renders a removed/added row's full payload as a key/value table.
const KV_SKIP_KEYS = new Set([
  "tenant_id", "created_at", "created_by", "updated_at", "updated_by",
  "row_version", "data",
]);

function KeyValueDiffTable({
  row,
  fieldIndex,
}: {
  row:        Record<string, unknown>;
  fieldIndex: ReadonlyMap<string, MetaEntityField>;
}) {
  // Annotate first so we can sort by display label instead of snake_case.
  const entries = Object.entries(row)
    .filter(([key, value]) => !KV_SKIP_KEYS.has(key) && value != null)
    .map(([key, value]) => ({
      key,
      value,
      rule: resolveFieldRule(fieldIndex as Map<string, MetaEntityField>, key),
    }))
    .sort((a, b) => a.rule.label.localeCompare(b.rule.label));
  if (entries.length === 0) {
    return <p className="text-[11px] italic text-muted-foreground">No non-audit fields.</p>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(({ key, value, rule }, idx) => (
          <tr key={key} className={cn(idx > 0 && "border-t border-border/40")}>
            <td
              className={cn(
                "w-1/3 px-2 py-1",
                rule.resolved
                  ? "text-muted-foreground"
                  : "font-mono text-muted-foreground/70",
              )}
              title={rule.resolved ? key : undefined}
            >
              {rule.label}
            </td>
            <td className="px-2 py-1 break-words text-foreground">
              {formatFieldValue(value, rule)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
