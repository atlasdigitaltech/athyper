"use client";

// components/finance/admin/DimensionDiagnostics.tsx
//
// Admin diagnostic panel for the Universal Ledger Dimension Engine.
// Four sections:
//   1. Resolution Meta Viewer — inspect how dimensions were resolved for a target
//   2. Policy Match Trace — simulate policy evaluation for a context
//   3. Dimension Hash Compare — compare two dimension sets side-by-side
//   4. Orphan/Inactive Scan — find stale dimension values still referenced

import { Badge, Button, Input } from "@neon/ui";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Diff,
  Eye,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { useState, useCallback } from "react";

import { cn } from "@/lib/utils";
import {
  useDimensionResolutionMeta,
  useDimensionPolicyTrace,
  useDimensionOrphanScan,
  useDimensionHashCompare,
} from "@/lib/finance/use-dimension-diagnostics";
import type { PolicyTraceContext } from "@/lib/finance/use-dimension-diagnostics";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DimensionDiagnosticsProps {
  entityCode: string;
}

// ---------------------------------------------------------------------------
// Source badge color map
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  USER: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  FIXED_POLICY:
    "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  DERIVED_POLICY:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  OU_DEFAULT:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  HEADER_INHERITED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SYSTEM_INHERITED:
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  AI_SUGGESTED:
    "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  FEDERATION_CONTEXT:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
};

const BEHAVIOR_COLORS: Record<string, string> = {
  REQUIRED: "text-red-700 dark:text-red-400",
  FORBIDDEN: "text-red-800 dark:text-red-300",
  FIXED_VALUE: "text-purple-700 dark:text-purple-400",
  DERIVE_IF_MISSING: "text-blue-700 dark:text-blue-400",
  INHERIT_FROM_HEADER: "text-amber-700 dark:text-amber-400",
  OPTIONAL: "text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DimensionDiagnostics({
  entityCode,
}: DimensionDiagnosticsProps) {
  const [activeSection, setActiveSection] = useState<
    "resolution" | "policy" | "compare" | "orphan"
  >("resolution");

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-1 rounded-md border bg-muted/30 p-1">
        {(
          [
            {
              key: "resolution" as const,
              label: "Resolution Meta",
              icon: Eye,
            },
            { key: "policy" as const, label: "Policy Trace", icon: Shield },
            { key: "compare" as const, label: "Hash Compare", icon: Diff },
            {
              key: "orphan" as const,
              label: "Orphan Scan",
              icon: AlertTriangle,
            },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSection(key)}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              activeSection === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Section content */}
      {activeSection === "resolution" && (
        <ResolutionMetaViewer entityCode={entityCode} />
      )}
      {activeSection === "policy" && (
        <PolicyTraceViewer entityCode={entityCode} />
      )}
      {activeSection === "compare" && <HashCompareViewer />}
      {activeSection === "orphan" && (
        <OrphanScanViewer entityCode={entityCode} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Resolution Meta Viewer
// ---------------------------------------------------------------------------

function ResolutionMetaViewer({ entityCode }: { entityCode: string }) {
  const [targetKind, setTargetKind] = useState("journal_line");
  const [targetId, setTargetId] = useState("");
  const [query, setQuery] = useState<{
    kind: string;
    id: string;
  } | null>(null);

  const { data, loading, error, refresh } = useDimensionResolutionMeta(
    query?.kind ?? null,
    query?.id ?? null,
  );

  const handleSearch = useCallback(() => {
    if (targetId.trim()) {
      setQuery({ kind: targetKind, id: targetId.trim() });
    }
  }, [targetKind, targetId]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Target Kind
          </label>
          <select
            value={targetKind}
            onChange={(e) => setTargetKind(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="journal_line">Journal Line</option>
            <option value="document_line">Document Line</option>
            <option value="transaction_pipeline">Transaction Pipeline</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Target ID
          </label>
          <Input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="UUID of the journal line, document line, etc."
            className="h-9"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button size="sm" onClick={handleSearch} disabled={!targetId.trim()}>
          <Search className="mr-1 size-3.5" />
          Inspect
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading resolution
          metadata...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Dimension Set</p>
              <p className="mt-1 truncate font-mono text-sm">
                {data.dimensionSetId ?? "NULL (undimensioned)"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Resolved At</p>
              <p className="mt-1 text-sm">{data.resolvedAt}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Policies Evaluated</p>
              <p className="mt-1 text-sm">{data.evaluatedPolicies.length}</p>
            </div>
          </div>

          {/* Resolution log */}
          <div>
            <h4 className="mb-2 text-sm font-medium">Resolution Log</h4>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">
                      Dimension Type
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Value</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Policy</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.resolutionLog.map((entry, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {entry.dimensionTypeCode}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {entry.dimensionValueCode}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            SOURCE_COLORS[entry.source] ?? "bg-muted",
                          )}
                        >
                          {entry.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {entry.policyCode
                          ? `${entry.policyCode} v${entry.policyVersion}`
                          : "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {(entry.confidence * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                  {data.resolutionLog.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-4 text-center text-muted-foreground"
                      >
                        No dimensions resolved
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Evaluated policies */}
          {data.evaluatedPolicies.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">
                Evaluated Policies (Frozen Snapshot)
              </h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">
                        Policy
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Version
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Behavior
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Matched
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.evaluatedPolicies.map((p, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.policyCode}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          v{p.policyVersion}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              BEHAVIOR_COLORS[p.behavior] ??
                                "text-muted-foreground",
                            )}
                          >
                            {p.behavior}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {p.matched ? (
                            <Check className="size-4 text-green-600" />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Policy Trace Viewer
// ---------------------------------------------------------------------------

function PolicyTraceViewer({ entityCode }: { entityCode: string }) {
  const [ctx, setCtx] = useState<PolicyTraceContext>({
    entityCode,
  });
  const [activeCtx, setActiveCtx] = useState<PolicyTraceContext | null>(null);

  const { data, loading, error } = useDimensionPolicyTrace(activeCtx);

  const handleTrace = useCallback(() => {
    setActiveCtx({ ...ctx });
  }, [ctx]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Account Code
          </label>
          <Input
            value={ctx.accountCode ?? ""}
            onChange={(e) =>
              setCtx((c) => ({ ...c, accountCode: e.target.value || undefined }))
            }
            placeholder="e.g. 5000"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Account Type
          </label>
          <Input
            value={ctx.accountType ?? ""}
            onChange={(e) =>
              setCtx((c) => ({
                ...c,
                accountType: e.target.value || undefined,
              }))
            }
            placeholder="EXPENSE"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Doc Type
          </label>
          <Input
            value={ctx.docType ?? ""}
            onChange={(e) =>
              setCtx((c) => ({ ...c, docType: e.target.value || undefined }))
            }
            placeholder="PURCHASE_INVOICE"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Book Code
          </label>
          <Input
            value={ctx.bookCode ?? ""}
            onChange={(e) =>
              setCtx((c) => ({ ...c, bookCode: e.target.value || undefined }))
            }
            placeholder="STAT"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Button size="sm" onClick={handleTrace}>
        <Shield className="mr-1 size-3.5" />
        Trace Policy Evaluation
      </Button>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Evaluating policies...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Effective behaviors */}
          <div>
            <h4 className="mb-2 text-sm font-medium">
              Effective Behaviors ({data.effectiveBehaviors.length} dimension
              types)
            </h4>
            <div className="flex flex-wrap gap-2">
              {data.effectiveBehaviors.map((eb) => (
                <div
                  key={eb.dimensionTypeCode}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    eb.conflictsDetected &&
                      "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30",
                  )}
                >
                  <span className="font-mono text-xs">
                    {eb.dimensionTypeCode}
                  </span>
                  <ChevronRight className="mx-1 inline size-3 text-muted-foreground" />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      BEHAVIOR_COLORS[eb.effectiveBehavior],
                    )}
                  >
                    {eb.effectiveBehavior}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({eb.resolvedByPolicy})
                  </span>
                  {eb.conflictsDetected && (
                    <AlertTriangle className="ml-1 inline size-3 text-amber-600" />
                  )}
                </div>
              ))}
              {data.effectiveBehaviors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No dimension policies matched this context
                </p>
              )}
            </div>
          </div>

          {/* All matches */}
          {data.matches.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">
                All Policy Matches ({data.matches.length})
              </h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">
                        Policy
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Dim Type
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Behavior
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Tier
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Priority
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matches.map((m, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.policyCode} v{m.policyVersion}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.dimensionTypeCode}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              BEHAVIOR_COLORS[m.behavior],
                            )}
                          >
                            {m.behavior}
                          </span>
                          {m.fixedValueCode && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({m.fixedValueCode})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {m.scopeTier}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {m.priority}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Hash Compare Viewer
// ---------------------------------------------------------------------------

function HashCompareViewer() {
  const [setIdA, setSetIdA] = useState("");
  const [setIdB, setSetIdB] = useState("");
  const [activeA, setActiveA] = useState<string | null>(null);
  const [activeB, setActiveB] = useState<string | null>(null);

  const { data, loading, error } = useDimensionHashCompare(activeA, activeB);

  const handleCompare = useCallback(() => {
    if (setIdA.trim() && setIdB.trim()) {
      setActiveA(setIdA.trim());
      setActiveB(setIdB.trim());
    }
  }, [setIdA, setIdB]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Dimension Set A
          </label>
          <Input
            value={setIdA}
            onChange={(e) => setSetIdA(e.target.value)}
            placeholder="UUID"
            className="h-9 font-mono text-sm"
          />
        </div>
        <ArrowRight className="mb-2 size-5 text-muted-foreground" />
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Dimension Set B
          </label>
          <Input
            value={setIdB}
            onChange={(e) => setSetIdB(e.target.value)}
            placeholder="UUID"
            className="h-9 font-mono text-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={handleCompare}
          disabled={!setIdA.trim() || !setIdB.trim()}
        >
          <Diff className="mr-1 size-3.5" />
          Compare
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Comparing dimension
          sets...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {/* Set headers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Set A</p>
              <p className="mt-1 text-sm font-medium">
                {data.setA.displayLabel}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {data.setA.hash}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Set B</p>
              <p className="mt-1 text-sm font-medium">
                {data.setB.displayLabel}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {data.setB.hash}
              </p>
            </div>
          </div>

          {/* Diff */}
          <div className="flex flex-wrap gap-2">
            {data.unchanged.map((item) => (
              <Badge
                key={`same-${item.typeCode}`}
                variant="secondary"
                className="text-xs"
              >
                {item.typeCode}: {item.valueCode}
              </Badge>
            ))}
            {data.removed.map((item) => (
              <Badge
                key={`rem-${item.typeCode}`}
                variant="destructive"
                className="text-xs"
              >
                - {item.typeCode}: {item.valueCode}
              </Badge>
            ))}
            {data.added.map((item) => (
              <Badge
                key={`add-${item.typeCode}`}
                className="bg-green-100 text-xs text-green-800 dark:bg-green-950 dark:text-green-300"
              >
                + {item.typeCode}: {item.valueCode}
              </Badge>
            ))}
          </div>

          {data.added.length === 0 &&
            data.removed.length === 0 &&
            data.unchanged.length > 0 && (
              <p className="text-sm text-green-700 dark:text-green-400">
                <Check className="mr-1 inline size-4" />
                Sets are identical
              </p>
            )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Orphan Scan Viewer
// ---------------------------------------------------------------------------

function OrphanScanViewer({ entityCode }: { entityCode: string }) {
  const [active, setActive] = useState(false);
  const { data, loading, error, refresh } = useDimensionOrphanScan(
    active ? entityCode : null,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={active ? "outline" : "default"}
          onClick={() => {
            if (active) {
              refresh();
            } else {
              setActive(true);
            }
          }}
        >
          {loading ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-3.5" />
          )}
          {active ? "Re-scan" : "Run Orphan Scan"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Finds inactive/archived dimension values still referenced in GL
          balances or journal lines
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-center dark:border-green-800/30 dark:bg-green-950/30">
          <Check className="mx-auto mb-2 size-6 text-green-600" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            All clear
          </p>
          <p className="text-xs text-green-600/80 dark:text-green-500">
            No orphaned or inactive dimension values found in active balances
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">
                  Dimension Type
                </th>
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">
                  In Balances
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  In JE Lines
                </th>
                <th className="px-3 py-2 text-left font-medium">Set Label</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.dimensionTypeCode}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">
                      {item.dimensionValueCode}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {item.dimensionValueName}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        item.valueStatus === "ARCHIVED"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {item.valueStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {item.referencedInBalances}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {item.referencedInJournalLines}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">
                    {item.dimensionSetLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
