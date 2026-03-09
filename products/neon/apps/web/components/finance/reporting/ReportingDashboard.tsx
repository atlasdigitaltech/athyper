"use client";

// components/finance/reporting/ReportingDashboard.tsx
//
// Container component that wires the P&L, Drilldown, and Month-End
// components together into a tabbed reporting dashboard.
// Includes cube freshness indicator and reconciliation status.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Badge,
  Card,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  Label,
} from "@neon/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  GitCompare,
  Save,
  Trash2,
  XCircle,
  Clock,
  TrendingUp,
  Grid3X3,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { PnLReport } from "./PnLReport";
import { DrilldownExplorer } from "./DrilldownExplorer";
import { MonthEndComparison } from "./MonthEndComparison";
import { PresetSaveDialog } from "./PresetSaveDialog";
import { StatementReport } from "./StatementReport";
import { StatementCompareViewer } from "./StatementCompareViewer";
import { usePnLReport } from "@/lib/finance/use-pnl-report";
import { useDrilldown } from "@/lib/finance/use-drilldown";
import { useMonthEnd } from "@/lib/finance/use-month-end";
import { useStatementReport } from "@/lib/finance/use-statement-report";
import { useStatementCompare } from "@/lib/finance/use-statement-compare";
import { useReportPresets } from "@/lib/finance/use-report-presets";
import { finGet } from "@/lib/finance/fetcher";
import { cachedFetch, buildCacheKey } from "@/lib/finance/reporting-cache";

import type {
  PnLGroupBy,
  CubeStatusDTO,
  ReportPresetDTO,
  ReportPresetType,
  StatementReportFilters,
  StatementCompareFilters,
} from "@/lib/finance/reporting-types";

// ── Props ─────────────────────────────────────────────────────────

interface ReportingDashboardProps {
  entityCode: string;
  fiscalYear?: number;
  currencyCode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ─────────────────────────────────────────────────────

export function ReportingDashboard({
  entityCode,
  fiscalYear: initialYear,
  currencyCode = "USD",
}: ReportingDashboardProps) {
  const currentYear = initialYear ?? new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [groupBy, setGroupBy] = useState<PnLGroupBy>("account");
  const [cubeStatus, setCubeStatus] = useState<CubeStatusDTO | null>(null);
  const [activeTab, setActiveTab] = useState("pnl");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Cube Status ──
  useEffect(() => {
    let cancelled = false;
    const url = `/api/fin/reporting/status?entityCode=${entityCode}&cubeCode=FS_MONTHLY`;
    cachedFetch(buildCacheKey(url), () => finGet<CubeStatusDTO>(url))
      .then((data) => {
        if (!cancelled) setCubeStatus(data);
      })
      .catch(() => {
        // Silently ignore — status is advisory
      });
    return () => { cancelled = true; };
  }, [entityCode]);

  // ── P&L Hook ──
  const pnl = usePnLReport({
    entityCode,
    fiscalYear,
    groupBy,
  });

  // ── Drilldown Hook ──
  const drilldown = useDrilldown();

  // ── Month-End Hook ──
  const monthEnd = useMonthEnd({
    entityCode,
    fiscalYear,
    periodsToCompare: 6,
    accountTypes: ["REVENUE", "EXPENSE"],
  });

  // ── Statement Hook ──
  const [statementCode, setStatementCode] = useState("MGMT_PNL");
  const statement = useStatementReport({
    entityCode,
    statementCode,
    fiscalYear,
  });

  // ── Statement Compare Hook ──
  const compare = useStatementCompare();

  const [compareBaseSource, setCompareBaseSource] = useState("live");
  const [compareCompareSource, setCompareCompareSource] = useState("");

  // Client-side validation for source inputs
  const isValidSource = (v: string) =>
    v === "live" || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const baseSourceValid = isValidSource(compareBaseSource);
  const compareSourceValid = compareCompareSource !== "" && isValidSource(compareCompareSource);
  const isSelfCompare =
    compareBaseSource !== "live" && compareCompareSource !== "live" &&
    compareBaseSource === compareCompareSource;

  const compareReady = baseSourceValid && compareSourceValid && !isSelfCompare;

  const handleCompare = useCallback(() => {
    if (!compareReady) return;
    compare.compare({
      entityCode,
      statementCode,
      fiscalYear,
      baseSource: compareBaseSource,
      compareSource: compareCompareSource,
    });
  }, [entityCode, statementCode, fiscalYear, compareBaseSource, compareCompareSource, compare, compareReady]);

  // Year options (current year - 3 to current year + 1)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // ── Presets ──
  const presets = useReportPresets();

  const applyPreset = useCallback(
    (preset: ReportPresetDTO) => {
      const p = preset.parameters as Record<string, any>;
      const yr = p.fiscalYear ?? currentYear;
      const gb = p.groupBy ?? "account";

      setFiscalYear(yr);
      setGroupBy(gb);
      setActivePresetId(preset.id);

      // Map report type to tab
      const tabMap: Record<string, string> = {
        pnl: "pnl",
        drilldown: "drilldown",
        month_end: "month-end",
        statement: "statement",
      };
      setActiveTab(tabMap[preset.reportType] ?? "pnl");

      // Apply filters to the appropriate hook
      if (preset.reportType === "pnl") {
        pnl.setFilters({
          entityCode,
          fiscalYear: yr,
          groupBy: gb,
          bookCode: p.bookCode,
          cubeCode: p.cubeCode,
          periodFrom: p.periodFrom,
          periodTo: p.periodTo,
          costCenterValueId: p.costCenterValueId,
          profitCenterValueId: p.profitCenterValueId,
          projectValueId: p.projectValueId,
          regionValueId: p.regionValueId,
          segmentValueId: p.segmentValueId,
        });
      } else if (preset.reportType === "month_end") {
        monthEnd.setFilters({
          entityCode,
          fiscalYear: yr,
          bookCode: p.bookCode,
          periodsToCompare: p.periodsToCompare ?? 6,
          accountTypes: p.accountTypes ?? ["REVENUE", "EXPENSE"],
        });
      } else if (preset.reportType === "drilldown") {
        drilldown.drillInto({
          entityCode,
          cubeCode: p.cubeCode ?? "FS_MONTHLY",
          fiscalYear: yr,
          periodNumber: p.periodNumber ?? 1,
          drillAxis: gb,
          bookCode: p.bookCode,
          parentFilters: p.parentFilters ?? {},
        });
      } else if (preset.reportType === "statement") {
        const sc = p.statementCode ?? "MGMT_PNL";
        setStatementCode(sc);
        statement.setFilters({
          entityCode,
          statementCode: sc,
          fiscalYear: yr,
          periodFrom: p.periodFrom,
          periodTo: p.periodTo,
          bookCode: p.bookCode,
          cubeCode: p.cubeCode,
        });
      }
    },
    [currentYear, entityCode, pnl, monthEnd, drilldown, statement],
  );

  const handleSavePreset = useCallback(
    async (data: {
      presetCode: string;
      presetName: string;
      description: string;
      scope: "SYSTEM" | "USER" | "SHARED";
    }) => {
      // Determine current report type from active tab
      const reportTypeMap: Record<string, ReportPresetType> = {
        pnl: "pnl",
        drilldown: "drilldown",
        "month-end": "month_end",
        statement: "statement",
      };
      const reportType = reportTypeMap[activeTab] ?? "pnl";

      // Build parameters from current state
      let parameters: Record<string, unknown> = {};
      if (reportType === "pnl") {
        parameters = {
          ...pnl.filters,
          groupBy,
        };
      } else if (reportType === "month_end") {
        parameters = { ...monthEnd.filters };
      } else if (reportType === "drilldown") {
        parameters = {
          cubeCode: "FS_MONTHLY",
          fiscalYear,
          groupBy: drilldown.axis,
          parentFilters: drilldown.parentFilters,
        };
      } else if (reportType === "statement") {
        parameters = { ...statement.filters };
      }

      setSaving(true);
      const created = await presets.createPreset({
        ...data,
        reportType,
        parameters,
      });
      setSaving(false);

      if (created) {
        setActivePresetId(created.id);
        setSaveDialogOpen(false);
      }
    },
    [activeTab, pnl.filters, groupBy, monthEnd.filters, fiscalYear, drilldown, statement.filters, presets],
  );

  const handleDeletePreset = useCallback(
    async (id: string) => {
      await presets.deletePreset(id);
      if (activePresetId === id) setActivePresetId(null);
    },
    [presets, activePresetId],
  );

  return (
    <div className="space-y-4">
      {/* ── Global Filters + Status ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fiscal Year</Label>
              <Select
                value={String(fiscalYear)}
                onValueChange={(v) => {
                  const yr = parseInt(v, 10);
                  setFiscalYear(yr);
                  pnl.setFilters({ ...pnl.filters, fiscalYear: yr });
                  monthEnd.setFilters({ ...monthEnd.filters, fiscalYear: yr });
                }}
              >
                <SelectTrigger className="h-8 w-28 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      FY {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Entity</Label>
              <Input
                value={entityCode}
                readOnly
                className="h-8 w-28 text-sm bg-muted"
              />
            </div>

            {/* ── Preset Selector ── */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preset</Label>
              <div className="flex items-center gap-1.5">
                <Select
                  value={activePresetId ?? "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setActivePresetId(null);
                      return;
                    }
                    const preset = presets.presets.find((p) => p.id === v);
                    if (preset) applyPreset(preset);
                  }}
                >
                  <SelectTrigger className="h-8 w-48 text-sm">
                    <Bookmark className="mr-1.5 size-3 text-muted-foreground" />
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">No preset</span>
                    </SelectItem>
                    {presets.presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-1.5">
                          {p.presetName}
                          {p.scope !== "USER" && (
                            <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">
                              {p.scope === "SHARED" ? "Team" : "Global"}
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setSaveDialogOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
                  title="Save current configuration as a preset"
                >
                  <Save className="size-3" />
                </button>
                {activePresetId && (
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(activePresetId)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                    title="Delete this preset"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Status Indicators ── */}
          <div className="flex items-center gap-3">
            {/* Cube Freshness */}
            {cubeStatus?.cubeLastBuiltAt && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3" />
                <span>Data refreshed {timeAgo(cubeStatus.cubeLastBuiltAt)}</span>
              </div>
            )}
            {/* Reconciliation Badge */}
            {cubeStatus?.reconciliation && (
              <ReconciliationBadge
                status={cubeStatus.reconciliation.status}
                variance={cubeStatus.reconciliation.variance}
              />
            )}
          </div>
        </div>
      </Card>

      {/* ── Preset Save Dialog ── */}
      <PresetSaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSavePreset}
        reportType={activeTab === "month-end" ? "month_end" : activeTab === "drilldown" ? "drilldown" : activeTab === "statement" ? "statement" : "pnl"}
        saving={saving}
      />

      {/* ── Tabbed Reports ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          <TabsTrigger value="pnl" className="gap-1.5">
            <BarChart3 className="size-3.5" />
            P&L Analysis
          </TabsTrigger>
          <TabsTrigger value="drilldown" className="gap-1.5">
            <Grid3X3 className="size-3.5" />
            Dimension Drilldown
          </TabsTrigger>
          <TabsTrigger value="month-end" className="gap-1.5">
            <TrendingUp className="size-3.5" />
            Month-End Comparison
          </TabsTrigger>
          <TabsTrigger value="statement" className="gap-1.5">
            <FileSpreadsheet className="size-3.5" />
            Financial Statements
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5">
            <GitCompare className="size-3.5" />
            Compare
          </TabsTrigger>
        </TabsList>

        {/* ── P&L Tab ── */}
        <TabsContent value="pnl" className="mt-4">
          <PnLReport
            rows={pnl.rows}
            totals={pnl.totals}
            lastRefreshAt={pnl.lastRefreshAt}
            groupBy={groupBy}
            onGroupByChange={(g) => {
              setGroupBy(g);
              pnl.setFilters({ ...pnl.filters, groupBy: g });
            }}
            onRefresh={pnl.refresh}
            onRowClick={(row) => {
              // On row click, initiate drilldown into that dimension
              if (groupBy !== "account" && groupBy !== "period") {
                drilldown.drillInto({
                  entityCode,
                  cubeCode: pnl.filters.cubeCode ?? "FS_MONTHLY",
                  fiscalYear,
                  periodNumber: 1, // Default to period 1
                  drillAxis: groupBy,
                  parentFilters: { [groupBy]: row.groupKey },
                });
              }
            }}
            currencyCode={currencyCode}
            loading={pnl.loading}
            truncated={pnl.truncated}
            bookCode={pnl.filters.bookCode}
            fiscalYear={fiscalYear}
          />
        </TabsContent>

        {/* ── Drilldown Tab ── */}
        <TabsContent value="drilldown" className="mt-4">
          {!drilldown.axis ? (
            <Card className="p-8 text-center">
              <Grid3X3 className="mx-auto size-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a dimension to start drilling down. Click a row in the P&L
                report, or use the controls below to begin exploration.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {["cost_center", "profit_center", "project", "region", "segment"].map(
                  (axis) => (
                    <button
                      key={axis}
                      type="button"
                      onClick={() =>
                        drilldown.drillInto({
                          entityCode,
                          cubeCode: "FS_MONTHLY",
                          fiscalYear,
                          periodNumber: 1,
                          drillAxis: axis as PnLGroupBy,
                          parentFilters: {},
                        })
                      }
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
                    >
                      {axis.replace(/_/g, " ")}
                    </button>
                  ),
                )}
              </div>
            </Card>
          ) : (
            <DrilldownExplorer
              rows={drilldown.rows}
              totals={drilldown.totals}
              axis={drilldown.axis}
              breadcrumbs={drilldown.breadcrumbs}
              onDrillInto={(row) => {
                // Progressive drill: add current selection to filters and drill next axis
                const nextAxes: PnLGroupBy[] = [
                  "cost_center",
                  "profit_center",
                  "project",
                  "region",
                  "segment",
                ];
                const currentIdx = nextAxes.indexOf(drilldown.axis!);
                const nextAxis = nextAxes[currentIdx + 1];
                if (nextAxis) {
                  drilldown.drillInto({
                    entityCode,
                    cubeCode: "FS_MONTHLY",
                    fiscalYear,
                    periodNumber: 1,
                    drillAxis: nextAxis,
                    parentFilters: {
                      ...drilldown.parentFilters,
                      [drilldown.axis!]: row.dimensionValueId,
                    },
                  });
                }
              }}
              loading={drilldown.loading}
              currencyCode={currencyCode}
              truncated={drilldown.truncated}
            />
          )}
        </TabsContent>

        {/* ── Month-End Tab ── */}
        <TabsContent value="month-end" className="mt-4">
          <MonthEndComparison
            accounts={monthEnd.accounts}
            periodNumbers={monthEnd.periodNumbers}
            fiscalYear={fiscalYear}
            loading={monthEnd.loading}
            currencyCode={currencyCode}
            bookCode={pnl.filters.bookCode}
          />
        </TabsContent>

        {/* ── Financial Statement Tab ── */}
        <TabsContent value="statement" className="mt-4 space-y-3">
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Statement</Label>
              <Select
                value={statementCode}
                onValueChange={(v) => {
                  setStatementCode(v);
                  statement.setFilters({ ...statement.filters, statementCode: v });
                }}
              >
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MGMT_PNL">Management P&L</SelectItem>
                  <SelectItem value="PNL">Statutory P&L</SelectItem>
                  <SelectItem value="BALANCE_SHEET">Balance Sheet</SelectItem>
                  <SelectItem value="CASH_FLOW">Cash Flow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {statement.error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {statement.error}
            </div>
          )}
          <StatementReport
            definition={statement.definition}
            rows={statement.rows}
            fiscalYear={statement.fiscalYear}
            periodFrom={statement.periodFrom}
            periodTo={statement.periodTo}
            bookCode={statement.bookCode}
            loading={statement.loading}
            currencyCode={currencyCode}
            diagnosticCount={statement.diagnosticCount}
            diagnosticSummary={statement.diagnosticSummary}
            onRefresh={statement.refresh}
            onFetchDiagnostics={statement.fetchDiagnostics}
          />
        </TabsContent>

        {/* ── Compare Tab ── */}
        <TabsContent value="compare" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Statement</Label>
              <Select
                value={statementCode}
                onValueChange={(v) => setStatementCode(v)}
              >
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MGMT_PNL">Management P&L</SelectItem>
                  <SelectItem value="PNL">Statutory P&L</SelectItem>
                  <SelectItem value="BALANCE_SHEET">Balance Sheet</SelectItem>
                  <SelectItem value="CASH_FLOW">Cash Flow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Base Source</Label>
              <Input
                value={compareBaseSource}
                onChange={(e) => setCompareBaseSource(e.target.value)}
                placeholder="live or snapshot UUID"
                className={cn(
                  "h-8 w-56 text-sm",
                  compareBaseSource && !baseSourceValid && "border-red-300 dark:border-red-700",
                )}
              />
              {compareBaseSource && !baseSourceValid && (
                <p className="text-[10px] text-red-600 dark:text-red-400">Enter &quot;live&quot; or a valid UUID</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Compare Source</Label>
              <Input
                value={compareCompareSource}
                onChange={(e) => setCompareCompareSource(e.target.value)}
                placeholder="live or snapshot UUID"
                className={cn(
                  "h-8 w-56 text-sm",
                  compareCompareSource && !compareSourceValid && "border-red-300 dark:border-red-700",
                )}
              />
              {compareCompareSource && !compareSourceValid && (
                <p className="text-[10px] text-red-600 dark:text-red-400">Enter &quot;live&quot; or a valid UUID</p>
              )}
              {isSelfCompare && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">Both sources are the same snapshot</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleCompare}
              disabled={!compareReady || compare.loading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium",
                compareReady
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground opacity-50 cursor-not-allowed",
              )}
            >
              <GitCompare className="size-3" />
              Compare
            </button>
          </div>
          <StatementCompareViewer
            data={compare.data}
            loading={compare.loading}
            error={compare.error}
            currencyCode={currencyCode}
            onClear={compare.clear}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Reconciliation Badge ─────────────────────────────────────────

function ReconciliationBadge({
  status,
  variance,
}: {
  status: string;
  variance: string | null;
}) {
  if (status === "OK") {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
        <CheckCircle2 className="size-3" />
        Reconciled
      </Badge>
    );
  }
  if (status === "WARNING") {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700">
        <AlertTriangle className="size-3" />
        Variance: {variance ?? "?"}
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-red-700 border-red-300 dark:text-red-400 dark:border-red-700">
        <XCircle className="size-3" />
        Reconciliation Failed
      </Badge>
    );
  }
  return null;
}
