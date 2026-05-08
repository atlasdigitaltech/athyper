"use client";

/**
 * Runtime entity version history — /app/[entity]/[id]/versions
 *
 * Full-page version chain timeline for any entity with version_control enabled.
 * Gated by feature_flags.version_control (tab only appears when true;
 * direct URL access shows a graceful not-supported state).
 *
 * API: GET /api/relay/api/records/:entity/:id/versions
 *   → { data: RecordVersionSummary[]; current_version_no: number }
 *
 * [id] = canonical business key (NOT UUID).
 *
 * Examples:
 *   /app/purchase_invoice/PINV-ACME-2026-00001/versions
 *   /app/purchase_order/PO-ACME-2026-00042/versions
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowLeftRight, CheckCircle2, Clock,
  FileClock, GitBranch, RotateCcw, XCircle,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge, Button, Skeleton,
  Tooltip, TooltipContent, TooltipTrigger,
} from "@athyper/ui/primitives";
import type { RecordVersionSummary } from "@athyper/api-contracts/records";
import { bffFetch } from "@/lib/bff-fetch";
import { formatTitle } from "@/lib/format";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VersionListResponse {
  data: RecordVersionSummary[];
  current_version_no: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function changeTypeLabel(t: RecordVersionSummary["change_type"]): string {
  const map: Record<string, string> = {
    original:   "Original",
    amendment:  "Amendment",
    reversal:   "Reversal",
    correction: "Correction",
  };
  return map[t] ?? t;
}

function versionStatusVariant(
  s: RecordVersionSummary["status"],
): "success" | "muted" | "destructive" | "secondary" {
  switch (s) {
    case "approved":   return "success";
    case "superseded": return "muted";
    case "cancelled":  return "destructive";
    default:           return "secondary";
  }
}

function ChangeTypeIcon({ type }: { type: RecordVersionSummary["change_type"] }) {
  switch (type) {
    case "amendment":  return <GitBranch  className="h-3.5 w-3.5" />;
    case "reversal":   return <RotateCcw  className="h-3.5 w-3.5" />;
    case "original":   return <CheckCircle2 className="h-3.5 w-3.5" />;
    default:           return <Clock      className="h-3.5 w-3.5" />;
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useVersionList(entityCode: string, entityId: string) {
  return useQuery<VersionListResponse>({
    queryKey: ["record-versions", entityCode, entityId],
    queryFn: () =>
      bffFetch<VersionListResponse>(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(entityId)}/versions`,
      ),
    staleTime: 30 * 1000,
  });
}

function useAmendRecord(entityCode: string, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      bffFetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(entityId)}/amend`,
        { method: "POST", body: reason ? { reason } : {} },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["record-versions", entityCode, entityId],
      });
    },
  });
}

// ── Version card ──────────────────────────────────────────────────────────────

function VersionCard({
  version,
  isLast,
  onSelectCompare,
  onNavigateCompare,
  onAmend,
  isAmending,
  pinnedVersion,
}: {
  version:            RecordVersionSummary;
  isLast:             boolean;
  onSelectCompare:    (vNo: number) => void;
  onNavigateCompare:  (from: number, to: number) => void;
  onAmend:            () => void;
  isAmending:         boolean;
  pinnedVersion:      number | null;
}) {
  const isCurrentAmendTarget = version.is_current && version.status === "approved";
  const isPinned = pinnedVersion === version.version_no;
  const canCompareWith = pinnedVersion !== null && !isPinned;

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
            "text-xs font-bold tabular-nums",
            version.is_current
              ? "border-primary bg-primary text-primary-foreground"
              : isPinned
              ? "border-info bg-info/10 text-info"
              : "border-border bg-background text-muted-foreground",
          ].join(" ")}
        >
          {version.version_no}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      {/* Card body */}
      <div
        className={[
          "mb-4 flex-1 rounded-lg border p-4",
          version.is_current
            ? "border-primary/30 bg-primary/5"
            : isPinned
            ? "border-info/30 bg-info/5"
            : "bg-card",
        ].join(" ")}
      >
        {/* Header row */}
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-medium">
              <ChangeTypeIcon type={version.change_type} />
              {changeTypeLabel(version.change_type)}
            </span>
            <Badge
              variant={versionStatusVariant(version.status)}
              className="capitalize text-doc-support"
            >
              {version.status}
            </Badge>
            {version.is_current && (
              <Badge variant="info" className="text-doc-support">Current</Badge>
            )}
            {isPinned && (
              <Badge variant="secondary" className="text-doc-support">Selected</Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            {canCompareWith ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                      const from = Math.min(pinnedVersion!, version.version_no);
                      const to   = Math.max(pinnedVersion!, version.version_no);
                      onNavigateCompare(from, to);
                    }}
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    Compare ↔ v{pinnedVersion}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open side-by-side diff: v{pinnedVersion} → v{version.version_no}</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isPinned ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground"
                    onClick={() => onSelectCompare(version.version_no)}
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    {isPinned ? "Deselect" : "Select"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isPinned
                    ? "Deselect this version"
                    : "Select v" + version.version_no + " as compare baseline"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Amend — only on current approved version */}
            {isCurrentAmendTarget && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onAmend}
                loading={isAmending}
                disabled={isAmending}
              >
                <GitBranch className="h-3 w-3" />
                Amend
              </Button>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{fmtDate(version.created_at)}</span>
          {version.created_by_name && (
            <span>by {version.created_by_name}</span>
          )}
          {version.change_reason && (
            <span className="italic">"{version.change_reason}"</span>
          )}
        </div>

        {/* Hash (integrity fingerprint) */}
        <div className="mt-2 truncate font-mono text-doc-support text-muted-foreground/50">
          {version.data_hash}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppEntityVersionsPage() {
  const params = useParams();
  const router = useRouter();

  const entity = params["entity"] as string;
  const id     = params["id"]     as string;

  const { data, isLoading, isError } = useVersionList(entity, id);
  const amendMutation = useAmendRecord(entity, id);

  // Which version number is pinned as the "from" side for comparison
  const [pinnedVersion, setPinnedVersion] = useState<number | null>(null);

  // Guard — all hooks above; safe to return early from here
  const { guardLoading, denied } = useSubrouteGuard(entity, "hasVersions");
  if (guardLoading) return <GuardSkeleton />;
  if (denied) return <FeatureUnavailablePage entityCode={entity} entityId={id} />;

  const versions = data?.data ?? [];
  const sorted   = [...versions].sort((a, b) => a.version_no - b.version_no);

  function handleSelectCompare(vNo: number) {
    setPinnedVersion((prev) => (prev === vNo ? null : vNo));
  }

  function handleNavigateCompare(from: number, to: number) {
    router.push(
      `/app/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/compare?from=${from}&to=${to}`,
    );
  }

  return (
    <PageFrame
      title="Version History"
      description={`${formatTitle(entity)} — version chain`}
      width="narrow"
      actions={
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
      }
    >
      <div className="space-y-1">

        {/* Compare-mode hint */}
        {pinnedVersion !== null && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-info/20 bg-info/5 px-4 py-2.5">
            <span className="text-sm">
              <span className="font-medium">v{pinnedVersion} selected.</span>{" "}
              Click another version to open the diff view.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPinnedVersion(null)}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-24 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load version history.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Version control may not be supported for this entity.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && sorted.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
            <FileClock className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No version history yet</p>
            <p className="text-xs text-muted-foreground/70">
              Versions appear here when this record is amended or reversed.
            </p>
          </div>
        )}

        {/* Version timeline — oldest first */}
        {sorted.map((version, idx) => (
          <VersionCard
            key={version.version_no}
            version={version}
            isLast={idx === sorted.length - 1}
            onSelectCompare={handleSelectCompare}
            onNavigateCompare={handleNavigateCompare}
            onAmend={() => amendMutation.mutate(undefined)}
            isAmending={amendMutation.isPending}
            pinnedVersion={pinnedVersion}
          />
        ))}

        {/* Amend error */}
        {amendMutation.isError && (
          <p className="mt-2 text-xs text-destructive">
            {amendMutation.error instanceof Error
              ? amendMutation.error.message
              : "Amend failed. Please try again."}
          </p>
        )}

      </div>
    </PageFrame>
  );
}
