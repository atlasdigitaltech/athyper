"use client";

/**
 * Setup — Blueprint Catalog — /setup/blueprints
 *
 * Browse and apply configuration blueprints (COA frameworks, industry packs,
 * default rules). Applied blueprints are tracked per-tenant in the database.
 *
 * Live data: GET /api/relay/platform/blueprints
 * Apply:     POST /api/relay/platform/blueprints/:code/apply
 * Unapply:   DELETE /api/relay/platform/blueprints/:code/apply
 */

import { useState } from "react";
import { cn } from "@athyper/theme/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, CheckCircle2, CircleDashed, AlertTriangle,
  Loader2, RefreshCw, Package, Unplug,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge, Button, Skeleton,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@athyper/ui/primitives";
import type { Blueprint } from "@athyper/api-contracts/platform";

// ── Static fallback catalog ───────────────────────────────────────────────────

const STATIC_BLUEPRINTS: Blueprint[] = [
  {
    code: "ifrs_full",
    name: "IFRS — Full Standard",
    category: "coa_framework",
    industry_vertical: null,
    framework: "IFRS",
    description: "Complete Chart of Accounts framework aligned to IFRS standards. Includes balance sheet, P&L, and cash flow statement structures.",
    status: "active",
    dependencies: [],
  },
  {
    code: "gaap_us",
    name: "US GAAP",
    category: "coa_framework",
    industry_vertical: null,
    framework: "US GAAP",
    description: "Chart of Accounts framework for US Generally Accepted Accounting Principles. Includes ASC 606 revenue recognition account structures.",
    status: "active",
    dependencies: [],
  },
  {
    code: "manufacturing_core",
    name: "Manufacturing — Core Pack",
    category: "industry_pack",
    industry_vertical: ["manufacturing", "automotive", "industrial"],
    framework: null,
    description: "Pre-built entity definitions, workflows, and dimension hierarchies for manufacturing operations: BOMs, work orders, production variances.",
    status: "active",
    dependencies: ["ifrs_full"],
  },
  {
    code: "retail_core",
    name: "Retail & Distribution",
    category: "industry_pack",
    industry_vertical: ["retail", "fmcg", "distribution"],
    framework: null,
    description: "Optimised for multi-channel retail: store-level P&L, inter-company eliminations, markdown and promotion tracking.",
    status: "active",
    dependencies: ["ifrs_full"],
  },
  {
    code: "professional_services",
    name: "Professional Services",
    category: "industry_pack",
    industry_vertical: ["consulting", "legal", "technology"],
    framework: null,
    description: "Project-centric accounting: engagement P&L, time and expense capture, WIP valuation, milestone billing.",
    status: "active",
    dependencies: ["ifrs_full"],
  },
  {
    code: "ap_defaults",
    name: "Accounts Payable — Default Rules",
    category: "default_rules",
    industry_vertical: null,
    framework: null,
    description: "Standard AP workflow rules: three-way match, early payment discount capture, duplicate invoice detection, hold codes.",
    status: "active",
    dependencies: [],
  },
  {
    code: "ar_defaults",
    name: "Accounts Receivable — Default Rules",
    category: "default_rules",
    industry_vertical: null,
    framework: null,
    description: "Standard AR rules: credit limit enforcement, aging bucket configuration, dunning schedule, write-off thresholds.",
    status: "active",
    dependencies: [],
  },
  {
    code: "base_dimensions",
    name: "Base Dimension Framework",
    category: "base",
    industry_vertical: null,
    framework: null,
    description: "Core analytical dimensions: Cost Centre, Profit Centre, Project, Product Line, Geography. Required by most industry packs.",
    status: "active",
    dependencies: [],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<Blueprint["category"], string> = {
  base:          "Base Framework",
  industry_pack: "Industry Pack",
  coa_framework: "COA Framework",
  default_rules: "Default Rules",
};

const CATEGORY_COLORS: Record<Blueprint["category"], string> = {
  base:          "bg-muted text-muted-foreground border-border",
  coa_framework: "bg-info/10 text-info border-info/30",
  industry_pack: "bg-accent/10 text-accent-foreground border-accent/30",
  default_rules: "bg-warning/10 text-warning border-warning/30",
};

const ALL_CATEGORIES: Array<{ key: Blueprint["category"] | "all"; label: string }> = [
  { key: "all",          label: "All" },
  { key: "base",         label: "Base" },
  { key: "coa_framework",label: "COA Framework" },
  { key: "industry_pack",label: "Industry Pack" },
  { key: "default_rules",label: "Default Rules" },
];

// ── Blueprint card ────────────────────────────────────────────────────────────

function BlueprintCard({
  bp,
  onApply,
  onUnapply,
  applying,
}: {
  bp:        Blueprint;
  onApply:   (code: string) => void;
  onUnapply: (code: string) => void;
  applying:  string | null;   // code of the blueprint currently being toggled
}) {
  const [confirmUnapply, setConfirmUnapply] = useState(false);
  const isApplied  = bp.status === "applied";
  const isBusy     = applying === bp.code;
  const colorClass = CATEGORY_COLORS[bp.category];

  return (
    <>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm">{bp.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{bp.code}</p>
            </div>
          </div>
          <span className={cn("shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", colorClass)}>
            {CATEGORY_LABELS[bp.category]}
          </span>
        </div>

        {bp.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{bp.description}</p>
        )}

        <div className="flex items-center flex-wrap gap-1.5">
          {bp.framework && (
            <Badge variant="outline" className="text-[10px]">{bp.framework}</Badge>
          )}
          {bp.industry_vertical?.map((v) => (
            <Badge key={v} variant="secondary" className="text-[10px] capitalize">{v}</Badge>
          ))}
          {bp.dependencies && bp.dependencies.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              Requires: {bp.dependencies.join(", ")}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          {isApplied ? (
            <div className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Applied to tenant</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CircleDashed className="h-3.5 w-3.5" />
              <span>Available</span>
            </div>
          )}

          {isApplied ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmUnapply(true)}
              disabled={isBusy}
            >
              {isBusy
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Unplug className="mr-1.5 h-3.5 w-3.5" />}
              {isBusy ? "Removing…" : "Remove"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onApply(bp.code)}
              disabled={isBusy}
            >
              {isBusy
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Package className="mr-1.5 h-3.5 w-3.5" />}
              {isBusy ? "Applying…" : "Apply"}
            </Button>
          )}
        </div>
      </div>

      {/* Unapply confirmation dialog */}
      <AlertDialog open={confirmUnapply} onOpenChange={setConfirmUnapply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Remove blueprint?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{bp.name}</strong> will be marked as removed for this tenant.
              {" "}Any data that was seeded by this blueprint will remain — blueprints are additive
              and this action does not roll back existing records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmUnapply(false); onUnapply(bp.code); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BlueprintSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type BpWithStatus = Blueprint & { status: "active" | "applied" | "deprecated" };

export default function BlueprintsPage() {
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<Blueprint["category"] | "all">("all");
  const [applying,       setApplying]       = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  const { data: apiBlueprints, isLoading, refetch, isFetching } = useQuery<BpWithStatus[]>({
    queryKey: ["platform", "blueprints"],
    queryFn:  async () => {
      const res = await fetch("/api/relay/platform/blueprints");
      if (!res.ok) throw new Error("API unavailable");
      return res.json() as Promise<BpWithStatus[]>;
    },
    retry:     1,
    staleTime: 60_000,
  });

  // Fall back to static catalog (all "active") when API is unavailable
  const allBlueprints: BpWithStatus[] = apiBlueprints
    ?? (isLoading ? [] : STATIC_BLUEPRINTS.map((b) => ({ ...b, status: "active" as const })));

  const filtered = activeCategory === "all"
    ? allBlueprints
    : allBlueprints.filter((b) => b.category === activeCategory);

  const appliedCount = allBlueprints.filter((b) => b.status === "applied").length;

  const applyMut = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/relay/platform/blueprints/${code}/apply`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onMutate: (code) => { setApplying(code); setError(null); },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "blueprints"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Apply failed"),
    onSettled: () => setApplying(null),
  });

  const unapplyMut = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/relay/platform/blueprints/${code}/apply`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onMutate: (code) => { setApplying(code); setError(null); },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "blueprints"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Remove failed"),
    onSettled: () => setApplying(null),
  });

  return (
    <PageFrame
      title="Configuration Blueprints"
      description="Pre-built frameworks, industry packs, and default rule sets"
    >
      <div className="space-y-4">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {ALL_CATEGORIES.map(({ key, label }) => (
              <Button
                key={key}
                variant={activeCategory === key ? "primary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setActiveCategory(key as Blueprint["category"] | "all")}
              >
                {label}
                {key !== "all" && !isLoading && (
                  <span className="ml-1 text-[10px] opacity-60">
                    ({allBlueprints.filter((b) => b.category === key).length})
                  </span>
                )}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {appliedCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {appliedCount} applied
              </span>
            )}
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto underline">Dismiss</button>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <BlueprintSkeleton key={i} />)
            : filtered.map((bp) => (
                <BlueprintCard
                  key={bp.code}
                  bp={bp}
                  onApply={(code) => applyMut.mutate(code)}
                  onUnapply={(code) => unapplyMut.mutate(code)}
                  applying={applying}
                />
              ))
          }
        </div>

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No blueprints in this category.
          </div>
        )}

      </div>
    </PageFrame>
  );
}
