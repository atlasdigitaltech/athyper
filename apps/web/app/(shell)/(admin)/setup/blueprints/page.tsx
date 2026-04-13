"use client";

/**
 * Setup — Blueprint Catalog — /setup/blueprints
 *
 * Browse available configuration blueprints (COA frameworks, industry packs,
 * default rules). Fetches live data from /api/relay/platform/blueprints with
 * a curated static fallback so the page renders even before that route exists.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, CircleDashed } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import type { Blueprint } from "@athyper/api-contracts/platform";

// ── Static fallback catalog ───────────────────────────────────────────────────
// Used when /api/relay/platform/blueprints is not yet available.

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

// ── Data hook ─────────────────────────────────────────────────────────────────

function useBlueprints() {
  return useQuery<Blueprint[]>({
    queryKey: ["platform", "blueprints"],
    queryFn:  async () => {
      const res = await fetch("/api/relay/platform/blueprints");
      if (!res.ok) throw new Error("API unavailable");
      return res.json() as Promise<Blueprint[]>;
    },
    retry:     false,                 // fall back to static on any error
    staleTime: 10 * 60 * 1000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<Blueprint["category"], string> = {
  base:          "Base Framework",
  industry_pack: "Industry Pack",
  coa_framework: "COA Framework",
  default_rules: "Default Rules",
};

const CATEGORY_COLORS: Record<Blueprint["category"], string> = {
  base:          "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700",
  coa_framework: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40",
  industry_pack: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40",
  default_rules: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40",
};

const ALL_CATEGORIES: Array<{ key: Blueprint["category"] | "all"; label: string }> = [
  { key: "all",          label: "All" },
  { key: "base",         label: "Base" },
  { key: "coa_framework",label: "COA Framework" },
  { key: "industry_pack",label: "Industry Pack" },
  { key: "default_rules",label: "Default Rules" },
];

// ── Blueprint card ────────────────────────────────────────────────────────────

function BlueprintCard({ bp }: { bp: Blueprint }) {
  const colorClass = CATEGORY_COLORS[bp.category];
  const isApplied  = false; // Blueprint.status is "active"|"deprecated"; applied state not tracked here

  return (
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
        <span className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}>
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
          <div className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Applied to tenant</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" />
            <span>Available</span>
          </div>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled>
          {isApplied ? "Applied" : "Apply"}
        </Button>
      </div>
    </div>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────

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

export default function BlueprintsPage() {
  const [activeCategory, setActiveCategory] = useState<Blueprint["category"] | "all">("all");
  const { data: apiBlueprints, isLoading } = useBlueprints();

  // Use live data from API; fall back to the curated static catalog
  const allBlueprints = apiBlueprints ?? (isLoading ? [] : STATIC_BLUEPRINTS);

  const filtered = activeCategory === "all"
    ? allBlueprints
    : allBlueprints.filter((b) => b.category === activeCategory);

  return (
    <PageFrame
      title="Configuration Blueprints"
      description="Pre-built frameworks, industry packs, and default rule sets"
    >
      <div className="space-y-4">

        {/* Category filter */}
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

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <BlueprintSkeleton key={i} />)
            : filtered.map((bp) => <BlueprintCard key={bp.code} bp={bp} />)
          }
        </div>

      </div>
    </PageFrame>
  );
}
