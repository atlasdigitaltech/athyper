"use client";

/**
 * Runtime entity version compare — /app/[entity]/[id]/compare
 *
 * Side-by-side field diff between two versions of any entity.
 * Gated by feature_flags.version_control.
 *
 * URL: /app/[entity]/[id]/compare?from=1&to=2
 *   from  — baseline version number (older)
 *   to    — target version number (newer); defaults to current
 *
 * API: GET /api/relay/api/records/:entity/:id/versions/:versionNo
 *   → { data: RecordVersionDetail }
 *
 * [id] = canonical business key (NOT UUID).
 *
 * Examples:
 *   /app/purchase_invoice/PINV-ACME-2026-00001/compare?from=1&to=2
 */

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileDiff } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import { useCompiledEntity } from "@athyper/query";
import { appEntityDetailHref } from "@athyper/runtime-shared/core";
import type { RecordVersionDetail } from "@athyper/api-contracts/records";
import { bffFetch } from "@/lib/bff-fetch";
import { formatTitle } from "@/lib/format";
import { resolveCapabilities } from "@/lib/entity-capabilities";
import { GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";
import { canonicalEntityCode } from "../../../_lib/entity-aliases";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VersionDetailResponse {
  data: RecordVersionDetail;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function renderValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

type DiffState = "changed" | "added" | "removed" | "same";

function diffState(fromVal: unknown, toVal: unknown): DiffState {
  const fromMissing = fromVal === undefined || fromVal === null;
  const toMissing   = toVal   === undefined || toVal   === null;
  if (fromMissing && !toMissing) return "added";
  if (!fromMissing && toMissing) return "removed";
  if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) return "changed";
  return "same";
}

function diffRowBg(state: DiffState): string {
  switch (state) {
    case "changed": return "bg-warning/8 border-l-2 border-l-warning";
    case "added":   return "bg-success/8 border-l-2 border-l-success";
    case "removed": return "bg-destructive/8 border-l-2 border-l-destructive";
    default:        return "";
  }
}

function diffCellBg(state: DiffState, side: "from" | "to"): string {
  if (state === "same") return "";
  if (state === "added"   && side === "from") return "text-muted-foreground/40 italic";
  if (state === "removed" && side === "to")   return "text-muted-foreground/40 italic";
  if (state === "changed") return side === "to" ? "font-medium text-foreground" : "text-muted-foreground line-through";
  return "";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useVersionDetail(entityCode: string, entityId: string, versionNo: number | null) {
  return useQuery<VersionDetailResponse>({
    queryKey: ["record-version-detail", entityCode, entityId, versionNo],
    queryFn: () =>
      bffFetch<VersionDetailResponse>(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(entityId)}/versions/${versionNo}`,
      ),
    enabled: versionNo !== null,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Version header card ───────────────────────────────────────────────────────

function VersionHeader({
  label,
  versionNo,
  detail,
  isLoading,
}: {
  label:     string;
  versionNo: number | null;
  detail:    RecordVersionDetail | undefined;
  isLoading: boolean;
}) {
  if (isLoading || versionNo === null) {
    return <Skeleton className="h-20 w-full rounded-lg" />;
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold">v{versionNo}</span>
      </div>
      {detail && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Badge
            variant={
              detail.status === "approved"   ? "success"
            : detail.status === "cancelled"  ? "destructive"
            : detail.status === "superseded" ? "muted"
            : "secondary"
            }
            className="capitalize text-doc-support"
          >
            {detail.status}
          </Badge>
          <span className="capitalize">{detail.change_type.replace("_", " ")}</span>
          <span>{fmtDate(detail.created_at)}</span>
          {detail.created_by_name && <span>by {detail.created_by_name}</span>}
        </div>
      )}
    </div>
  );
}

// ── Diff row ──────────────────────────────────────────────────────────────────

interface DiffRowProps {
  fieldName: string;
  label:     string;
  fromVal:   unknown;
  toVal:     unknown;
}

function DiffRow({ label, fromVal, toVal }: DiffRowProps) {
  const state = diffState(fromVal, toVal);
  return (
    <tr className={[diffRowBg(state), "transition-colors"].join(" ")}>
      <td className="w-1/4 py-2.5 pl-3 pr-2 text-xs font-medium text-muted-foreground align-top">
        {label}
      </td>
      <td className={["w-[37.5%] py-2.5 px-2 text-sm align-top", diffCellBg(state, "from")].join(" ")}>
        {state === "added" ? (
          <span className="text-muted-foreground/40 italic">—</span>
        ) : (
          renderValue(fromVal)
        )}
      </td>
      <td className={["w-[37.5%] py-2.5 px-2 text-sm align-top", diffCellBg(state, "to")].join(" ")}>
        {state === "removed" ? (
          <span className="text-muted-foreground/40 italic">—</span>
        ) : (
          renderValue(toVal)
        )}
      </td>
    </tr>
  );
}

// ── Diff table ────────────────────────────────────────────────────────────────

function DiffTable({
  fromDetail,
  toDetail,
  fieldLabels,
}: {
  fromDetail:  RecordVersionDetail;
  toDetail:    RecordVersionDetail;
  fieldLabels: Map<string, string>;
}) {
  // Union of all field names from both versions, preserving a natural order
  const allFields = Array.from(
    new Set([
      ...Object.keys(fromDetail.fields),
      ...Object.keys(toDetail.fields),
    ]),
  );

  const rows = allFields.map((fieldName) => ({
    fieldName,
    label:    fieldLabels.get(fieldName) ?? fieldName,
    fromVal:  fromDetail.fields[fieldName],
    toVal:    toDetail.fields[fieldName],
  }));

  const changedRows = rows.filter((r) => diffState(r.fromVal, r.toVal) !== "same");
  const unchangedRows = rows.filter((r) => diffState(r.fromVal, r.toVal) === "same");

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-left">
        {/* Column headers */}
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-1/4 py-2.5 pl-3 pr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Field
            </th>
            <th className="w-[37.5%] py-2.5 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              v{fromDetail.version_no} — {fromDetail.change_type}
            </th>
            <th className="w-[37.5%] py-2.5 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              v{toDetail.version_no} — {toDetail.change_type}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {/* Changed fields first */}
          {changedRows.map((row) => (
            <DiffRow key={row.fieldName} {...row} />
          ))}

          {/* Unchanged fields (collapsed section) */}
          {unchangedRows.length > 0 && (
            <>
              <tr className="bg-muted/20">
                <td
                  colSpan={3}
                  className="py-1.5 pl-3 text-doc-subtitle font-medium uppercase tracking-wide text-muted-foreground/60"
                >
                  {unchangedRows.length} unchanged field{unchangedRows.length !== 1 ? "s" : ""}
                </td>
              </tr>
              {unchangedRows.map((row) => (
                <DiffRow key={row.fieldName} {...row} />
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Compare content — uses useSearchParams ────────────────────────────────────

function CompareContent() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();

  const entity = params["entity"] as string;
  const entityCode = canonicalEntityCode(entity);
  const id     = params["id"]     as string;

  const fromNo = parseInt(searchParams.get("from") ?? "1", 10);
  const toNo   = parseInt(searchParams.get("to")   ?? "2", 10);

  const { data: entityMeta, isLoading: metaLoading } = useCompiledEntity(entityCode);
  const { data: fromResp, isLoading: fromLoading } = useVersionDetail(entityCode, id, isNaN(fromNo) ? null : fromNo);
  const { data: toResp,   isLoading: toLoading   } = useVersionDetail(entityCode, id, isNaN(toNo)   ? null : toNo);

  // Guard — all hooks above; safe to return early from here
  if (metaLoading) return <GuardSkeleton />;
  if (!entityMeta || !resolveCapabilities(entityMeta).hasVersions) {
    return <FeatureUnavailablePage entityCode={entityCode} entityId={id} />;
  }

  const fromDetail = fromResp?.data;
  const toDetail   = toResp?.data;

  const fieldLabels = new Map<string, string>(
    entityMeta.fields.map((f) => [f.name, f.label ?? f.name]),
  );

  const isLoading  = fromLoading || toLoading;
  const canCompare = !isLoading && !!fromDetail && !!toDetail;

  const changedCount = canCompare
    ? Object.keys({ ...fromDetail.fields, ...toDetail.fields })
        .filter((k) => diffState(fromDetail.fields[k], toDetail.fields[k]) !== "same")
        .length
    : 0;

  return (
    <PageFrame
      title={`Compare v${fromNo} → v${toNo}`}
      description={`${formatTitle(entity)} — field diff`}
      width="wide"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(appEntityDetailHref(entityCode, id, "versions"))
            }
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Version history
          </Button>
        </div>
      }
    >
      <div className="space-y-4">

        {/* Version header cards */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              From
            </p>
            <VersionHeader
              label="Baseline"
              versionNo={isNaN(fromNo) ? null : fromNo}
              detail={fromDetail}
              isLoading={fromLoading}
            />
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              To
              <ArrowRight className="h-3 w-3" />
            </p>
            <VersionHeader
              label="Revised"
              versionNo={isNaN(toNo) ? null : toNo}
              detail={toDetail}
              isLoading={toLoading}
            />
          </div>
        </div>

        {/* Summary badge */}
        {canCompare && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {changedCount === 0 ? (
              <span>No field differences between these two versions.</span>
            ) : (
              <>
                <Badge variant="warning" className="text-doc-support">
                  {changedCount} field{changedCount !== 1 ? "s" : ""} changed
                </Badge>
                <span className="text-xs">Showing all fields — changed fields are listed first.</span>
              </>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        )}

        {/* Diff table */}
        {canCompare && changedCount > 0 && (
          <DiffTable
            fromDetail={fromDetail}
            toDetail={toDetail}
            fieldLabels={fieldLabels}
          />
        )}

        {/* No changes state */}
        {canCompare && changedCount === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <FileDiff className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">These versions are identical</p>
            <p className="text-xs text-muted-foreground/70">
              All field values are the same between v{fromNo} and v{toNo}.
            </p>
          </div>
        )}

        {/* Invalid params */}
        {!isLoading && (isNaN(fromNo) || isNaN(toNo)) && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">
              Invalid version parameters. Use <code>?from=1&to=2</code> format.
            </p>
          </div>
        )}

      </div>
    </PageFrame>
  );
}

// ── Page — Suspense boundary required for useSearchParams ─────────────────────

export default function AppEntityComparePage() {
  return (
    <Suspense
      fallback={
        <PageFrame title="Compare versions" width="wide">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        </PageFrame>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
