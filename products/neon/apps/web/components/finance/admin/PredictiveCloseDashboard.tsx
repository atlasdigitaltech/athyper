"use client";

// components/finance/admin/PredictiveCloseDashboard.tsx
//
// Phase 9B: Predictive Close Intelligence dashboard.
// Sub-tabs: Breach Forecast, Entity Risk Map, Defect Correlation,
// Remediation Forecast, Override Patterns, Action Effectiveness.

import { useState, useEffect, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Loader2,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  useSlaBreachForecast,
  useCrossEntityRisk,
  useDefectDelayCorrelation,
  useRemediationForecast,
  useOverrideFailureCorrelation,
  useActionEffectiveness,
} from "@/lib/finance/use-predictive-close";

import type {
  SlaBreachForecastDTO,
  CrossEntityRiskDTO,
  DefectDelayCorrelationDTO,
  RemediationCompletionForecastDTO,
  OverrideFailureCorrelationDTO,
  ActionEffectivenessDTO,
  RiskTierDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Sub-tabs
// ---------------------------------------------------------------------------

const PRED_TABS = [
  { id: "breach", label: "Breach Forecast", icon: AlertTriangle },
  { id: "risk-map", label: "Entity Risk Map", icon: Target },
  { id: "defects", label: "Defect Correlation", icon: Activity },
  { id: "remediation", label: "Remediation Forecast", icon: Zap },
  { id: "overrides", label: "Override Patterns", icon: Shield },
  { id: "actions", label: "Action Effectiveness", icon: BarChart3 },
] as const;

type PredTabId = (typeof PRED_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PredictiveCloseDashboardProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Set by copilot drill-through to open a specific sub-tab */
  initialSubTab?: string;
  /** Set by copilot drill-through to highlight a specific item */
  focusId?: string;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PredictiveCloseDashboard({
  entityCode,
  fiscalYear,
  periodNumber,
  initialSubTab,
  focusId,
}: PredictiveCloseDashboardProps) {
  const [activeTab, setActiveTab] = useState<PredTabId>("breach");

  // Respond to drill-through navigation from copilot
  useEffect(() => {
    if (initialSubTab && PRED_TABS.some((t) => t.id === initialSubTab)) {
      setActiveTab(initialSubTab as PredTabId);
    }
  }, [initialSubTab]);

  const entityParams = useMemo(() => ({ entityCode }), [entityCode]);
  const periodParams = useMemo(
    () => ({ entityCode, fiscalYear, periodNumber }),
    [entityCode, fiscalYear, periodNumber],
  );

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {PRED_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "breach" && <BreachForecastTab params={entityParams} />}
      {activeTab === "risk-map" && <EntityRiskMapTab params={entityParams} />}
      {activeTab === "defects" && <DefectCorrelationTab params={entityParams} />}
      {activeTab === "remediation" && <RemediationForecastTab params={periodParams} />}
      {activeTab === "overrides" && <OverridePatternsTab params={entityParams} />}
      {activeTab === "actions" && <ActionEffectivenessTab params={entityParams} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Breach Forecast Tab
// ---------------------------------------------------------------------------

function BreachForecastTab({ params }: { params: { entityCode?: string } }) {
  const { forecasts, loading, error } = useSlaBreachForecast(params);

  if (loading && !forecasts) {
    return <LoadingCard message="Loading breach forecasts..." />;
  }
  if (error) return <ErrorCard message={error} />;

  const sorted = forecasts
    ? [...forecasts].sort((a, b) => b.hardCloseBreachPct - a.hardCloseBreachPct)
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          SLA Breach Forecast
        </CardTitle>
        <CardDescription>
          Probability of breaching soft/hard close targets for open periods
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <div className="space-y-4">
            {/* Summary strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard
                label="Critical Risk"
                value={String(sorted.filter((f) => f.riskTier === "CRITICAL").length)}
                warn={sorted.some((f) => f.riskTier === "CRITICAL")}
              />
              <KpiCard
                label="High Risk"
                value={String(sorted.filter((f) => f.riskTier === "HIGH").length)}
                warn={sorted.some((f) => f.riskTier === "HIGH")}
              />
              <KpiCard
                label="Medium Risk"
                value={String(sorted.filter((f) => f.riskTier === "MEDIUM").length)}
              />
              <KpiCard
                label="Low Risk"
                value={String(sorted.filter((f) => f.riskTier === "LOW").length)}
              />
            </div>

            {/* Detail table */}
            <div className="max-h-[350px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Hard Close</TableHead>
                    <TableHead>Breach %</TableHead>
                    <TableHead>Buffer</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Blockers</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((f) => (
                    <TableRow key={`${f.entityCode}-${f.fiscalYear}-${f.periodNumber}`}>
                      <TableCell className="text-xs font-medium">{f.entityCode}</TableCell>
                      <TableCell className="text-xs font-mono">
                        P{f.periodNumber} FY{f.fiscalYear}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(f.hardCloseTarget)}
                      </TableCell>
                      <TableCell>
                        <BreachPctBadge pct={f.hardCloseBreachPct} />
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {f.hardCloseBufferHours != null
                          ? `${f.hardCloseBufferHours > 0 ? "+" : ""}${f.hardCloseBufferHours.toFixed(0)}h`
                          : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <RiskTierBadge tier={f.riskTier} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {f.completionPct}%
                        <span className="text-muted-foreground"> ({f.satisfiedCount ?? 0}/{f.totalTasks ?? 0})</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {(f.blockedCount ?? 0) > 0 && (
                          <span className="text-orange-600">{f.blockedCount} blocked</span>
                        )}
                        {(f.failedCount ?? 0) > 0 && (
                          <span className="ml-1 text-red-600">{f.failedCount} failed</span>
                        )}
                        {(f.blockedCount ?? 0) === 0 && (f.failedCount ?? 0) === 0 && "\u2014"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {f.slippageCount > 0 ? (
                          <span className="flex items-center gap-0.5 text-orange-600">
                            <TrendingDown className="h-3 w-3" />
                            {f.slippageCount}/{f.totalSnapshots}
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-green-600">
                            <TrendingUp className="h-3 w-3" />
                            Stable
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">
            No open close runs to forecast.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Entity Risk Map Tab
// ---------------------------------------------------------------------------

function EntityRiskMapTab({ params }: { params: { entityCode?: string } }) {
  const { entities, loading, error } = useCrossEntityRisk(params);

  if (loading && !entities) return <LoadingCard message="Loading risk ranking..." />;
  if (error) return <ErrorCard message={error} />;

  const sorted = entities ? [...entities].sort((a, b) => a.riskRank - b.riskRank) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          Cross-Entity Risk Ranking
        </CardTitle>
        <CardDescription>
          Composite risk score across all open close runs — higher score = more at risk
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Overrides</TableHead>
                  <TableHead>Exceptions</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Doc Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e) => (
                  <TableRow key={`${e.entityCode}-${e.fiscalYear}-${e.periodNumber}`}>
                    <TableCell className="text-xs font-bold">{e.riskRank}</TableCell>
                    <TableCell className="text-xs font-medium">{e.entityCode}</TableCell>
                    <TableCell className="text-xs font-mono">
                      P{e.periodNumber} FY{e.fiscalYear}
                    </TableCell>
                    <TableCell>
                      <RiskScoreBadge score={e.compositeRiskScore} />
                    </TableCell>
                    <TableCell>
                      <SlaStatusBadge status={e.slaStatus ?? "ON_TRACK"} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.daysRemaining != null ? `${e.daysRemaining}d` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">{e.completionPct ?? 0}%</TableCell>
                    <TableCell className="text-xs">
                      {e.totalOverrides > 0 ? (
                        <span className="text-orange-600">{e.totalOverrides}</span>
                      ) : "0"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.criticalExceptions > 0 ? (
                        <span className="text-red-600">{e.criticalExceptions} crit</span>
                      ) : e.openExceptions > 0 ? (
                        <span className="text-orange-600">{e.openExceptions} open</span>
                      ) : "0"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.criticalSignalCount > 0 ? (
                        <span className="text-red-600">{e.criticalSignalCount} crit</span>
                      ) : e.activeSignalCount > 0 ? (
                        <span className="text-orange-600">{e.activeSignalCount}</span>
                      ) : "0"}
                    </TableCell>
                    <TableCell>
                      <HealthBadge rating={e.docHealthRating} score={e.docHealthScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">No open close runs.</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Defect Correlation Tab
// ---------------------------------------------------------------------------

function DefectCorrelationTab({ params }: { params: { entityCode?: string } }) {
  const { correlations, loading, error } = useDefectDelayCorrelation(params);

  if (loading && !correlations) return <LoadingCard message="Loading defect correlations..." />;
  if (error) return <ErrorCard message={error} />;

  // Compute cross-period averages for defect rates where SLA was breached vs met
  const breached = correlations?.filter((c) => c.slaMet === false) ?? [];
  const met = correlations?.filter((c) => c.slaMet === true) ?? [];

  const avg = (arr: DefectDelayCorrelationDTO[], key: keyof DefectDelayCorrelationDTO) => {
    const nums = arr.map((c) => c[key] as number).filter((n) => n != null);
    return nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "N/A";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Defect-Delay Correlation
        </CardTitle>
        <CardDescription>
          Which document defect classes are most predictive of close delays
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comparative summary: breached vs met */}
        {(breached.length > 0 || met.length > 0) && (
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
              Average Defect Rates: SLA Breached vs Met
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CompareCard
                label="Unposted Rate"
                breachedVal={`${avg(breached, "unpostedRate")}%`}
                metVal={`${avg(met, "unpostedRate")}%`}
              />
              <CompareCard
                label="Missing JE Rate"
                breachedVal={`${avg(breached, "missingJeRate")}%`}
                metVal={`${avg(met, "missingJeRate")}%`}
              />
              <CompareCard
                label="Reversal Rate"
                breachedVal={`${avg(breached, "reversalRate")}%`}
                metVal={`${avg(met, "reversalRate")}%`}
              />
              <CompareCard
                label="Blocked Approvals"
                breachedVal={`${avg(breached, "blockedApprovalRate")}%`}
                metVal={`${avg(met, "blockedApprovalRate")}%`}
              />
            </div>
          </div>
        )}

        {/* Detail table */}
        {correlations && correlations.length > 0 && (
          <div className="max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Unposted</TableHead>
                  <TableHead>Missing JE</TableHead>
                  <TableHead>Reversals</TableHead>
                  <TableHead>Blocked</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Days Over</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {correlations.map((c) => (
                  <TableRow key={`${c.entityCode}-${c.fiscalYear}-${c.periodNumber}`}>
                    <TableCell className="text-xs font-medium">{c.entityCode}</TableCell>
                    <TableCell className="text-xs font-mono">P{c.periodNumber} FY{c.fiscalYear}</TableCell>
                    <TableCell className="text-xs">{c.unpostedRate}% ({c.unpostedCount})</TableCell>
                    <TableCell className="text-xs">{c.missingJeRate}% ({c.missingJeCount})</TableCell>
                    <TableCell className="text-xs">{c.reversalRate}% ({c.reversedCount})</TableCell>
                    <TableCell className="text-xs">{c.blockedApprovalRate}% ({c.blockedApprovalCount})</TableCell>
                    <TableCell>
                      {c.slaMet != null ? (
                        c.slaMet ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                            <CheckCircle2 className="h-2.5 w-2.5" /> MET
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600">
                            <XCircle className="h-2.5 w-2.5" /> BREACH
                          </span>
                        )
                      ) : <span className="text-[10px] text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {c.daysOverTarget != null ? (
                        <span className={c.daysOverTarget > 0 ? "text-red-600" : "text-green-600"}>
                          {c.daysOverTarget > 0 ? "+" : ""}{c.daysOverTarget}d
                        </span>
                      ) : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <HealthBadge rating={c.healthRating} score={c.healthScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {(!correlations || correlations.length === 0) && (
          <div className="py-4 text-sm text-muted-foreground">No correlation data available.</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Remediation Forecast Tab
// ---------------------------------------------------------------------------

function RemediationForecastTab({ params }: { params: { entityCode: string; fiscalYear: number; periodNumber: number } }) {
  const { forecasts, loading, error } = useRemediationForecast(params);

  if (loading && !forecasts) return <LoadingCard message="Loading remediation forecasts..." />;
  if (error) return <ErrorCard message={error} />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" />
          Remediation Completion Forecast
        </CardTitle>
        <CardDescription>
          Campaign completion probability based on current action progress
        </CardDescription>
      </CardHeader>
      <CardContent>
        {forecasts && forecasts.length > 0 ? (
          <div className="max-h-[350px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Forecast</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Executing</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecasts.map((f) => (
                  <TableRow key={f.campaignId}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{f.campaignCode}</div>
                      <div className="text-muted-foreground">{f.campaignName}</div>
                    </TableCell>
                    <TableCell className="text-xs">{f.campaignStatus}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded bg-gray-200">
                          <div
                            className={cn("h-full rounded", f.completionPct >= 80 ? "bg-green-500" : f.completionPct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                            style={{ width: `${Math.min(100, f.completionPct)}%` }}
                          />
                        </div>
                        <span className="text-xs">{f.completionPct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ProbabilityBadge value={f.completionProbability} />
                    </TableCell>
                    <TableCell>
                      <ForecastStatusBadge status={f.forecastStatus} />
                    </TableCell>
                    <TableCell className="text-xs text-green-600">{f.completedActions}</TableCell>
                    <TableCell className="text-xs text-blue-600">{f.executingActions}</TableCell>
                    <TableCell className="text-xs text-red-600">{f.failedActions}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {f.suggestedActions + f.approvedActions}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">No remediation campaigns.</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Override Patterns Tab
// ---------------------------------------------------------------------------

function OverridePatternsTab({ params }: { params: { entityCode?: string } }) {
  const { patterns, loading, error } = useOverrideFailureCorrelation(params);

  if (loading && !patterns) return <LoadingCard message="Loading override patterns..." />;
  if (error) return <ErrorCard message={error} />;

  // Compute correlation summary
  const withOverrides = patterns?.filter((p) => p.totalOverrides > 0) ?? [];
  const gateBreachCorr = withOverrides.filter((p) => p.patternClassification === "GATE_BREACH_CORRELATION");
  const highOverrideBreach = withOverrides.filter((p) => p.patternClassification === "HIGH_OVERRIDE_BREACH");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Override-Failure Correlation
        </CardTitle>
        <CardDescription>
          Override patterns that correlate with SLA breaches and reopens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Insight strip */}
        {withOverrides.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiCard
              label="Gate+Breach"
              value={String(gateBreachCorr.length)}
              warn={gateBreachCorr.length > 0}
              sub="Gate overrides with SLA breach"
            />
            <KpiCard
              label="High Override+Breach"
              value={String(highOverrideBreach.length)}
              warn={highOverrideBreach.length > 0}
              sub=">3 overrides with SLA breach"
            />
            <KpiCard
              label="Total Analyzed"
              value={String(withOverrides.length)}
              sub="Periods with overrides"
            />
            <KpiCard
              label="Failure Rate"
              value={withOverrides.length > 0
                ? `${Math.round((withOverrides.filter((p) => p.closeFailed).length / withOverrides.length) * 100)}%`
                : "N/A"}
              warn={withOverrides.filter((p) => p.closeFailed).length > 0}
            />
          </div>
        )}

        {/* Detail table */}
        {patterns && patterns.length > 0 && (
          <div className="max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.map((p) => (
                  <TableRow key={`${p.entityCode}-${p.fiscalYear}-${p.periodNumber}`}>
                    <TableCell className="text-xs font-medium">{p.entityCode}</TableCell>
                    <TableCell className="text-xs font-mono">P{p.periodNumber} FY{p.fiscalYear}</TableCell>
                    <TableCell>
                      <PatternBadge pattern={p.patternClassification} />
                    </TableCell>
                    <TableCell className="text-xs">{p.totalOverrides}</TableCell>
                    <TableCell className="text-xs">
                      {p.gateOverrides > 0 ? <span className="text-red-600">{p.gateOverrides}</span> : "0"}
                    </TableCell>
                    <TableCell className="text-xs">{p.categoryOverrides}</TableCell>
                    <TableCell className="text-xs font-mono">{formatCurrency(p.totalImpact)}</TableCell>
                    <TableCell>
                      {p.slaBreached ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600">
                          <XCircle className="h-2.5 w-2.5" /> BREACH
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                          <CheckCircle2 className="h-2.5 w-2.5" /> MET
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.closeFailed ? (
                        <Badge variant="destructive" className="text-[10px]">FAILED</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {(!patterns || patterns.length === 0) && (
          <div className="py-4 text-sm text-muted-foreground">No override pattern data.</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Action Effectiveness Tab
// ---------------------------------------------------------------------------

function ActionEffectivenessTab({ params }: { params: { entityCode?: string } }) {
  const { actions, loading, error } = useActionEffectiveness(params);

  if (loading && !actions) return <LoadingCard message="Loading action effectiveness..." />;
  if (error) return <ErrorCard message={error} />;

  const sorted = actions
    ? [...actions].sort((a, b) => (b.effectivenessPct ?? -1) - (a.effectivenessPct ?? -1))
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Action Effectiveness
        </CardTitle>
        <CardDescription>
          Which recommended actions actually improve close outcomes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <div className="max-h-[350px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Effectiveness</TableHead>
                  <TableHead>Acceptance</TableHead>
                  <TableHead>Avg Decision</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((a, i) => (
                  <TableRow key={`${a.triggerType}-${a.actionType}-${i}`}>
                    <TableCell className="text-xs">{formatLabel(a.triggerType)}</TableCell>
                    <TableCell className="text-xs font-medium">{formatLabel(a.actionType)}</TableCell>
                    <TableCell className="text-xs">{a.executionMode}</TableCell>
                    <TableCell className="text-xs">{a.totalActions}</TableCell>
                    <TableCell className="text-xs text-green-600">{a.effectiveCount}</TableCell>
                    <TableCell>
                      {a.effectivenessPct != null ? (
                        <span className={cn(
                          "text-xs font-semibold",
                          a.effectivenessPct >= 70 ? "text-green-600" :
                          a.effectivenessPct >= 40 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {a.effectivenessPct}%
                        </span>
                      ) : <span className="text-[10px] text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.acceptancePct != null ? `${a.acceptancePct}%` : "N/A"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {a.avgDecisionHours != null ? `${a.avgDecisionHours}h` : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge confidence={a.sampleConfidence} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">No action effectiveness data yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared Sub-components
// ---------------------------------------------------------------------------

function LoadingCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {message}
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-4 text-sm text-destructive">{message}</CardContent>
    </Card>
  );
}

function KpiCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded border p-2 ${warn ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30" : ""}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CompareCard({ label, breachedVal, metVal }: { label: string; breachedVal: string; metVal: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-red-600">Breach: {breachedVal}</span>
        <span className="text-green-600">Met: {metVal}</span>
      </div>
    </div>
  );
}

function RiskTierBadge({ tier }: { tier: RiskTierDTO }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-green-100 text-green-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[tier] ?? ""}`}>
      {tier}
    </span>
  );
}

function BreachPctBadge({ pct }: { pct: number }) {
  const color = pct >= 70 ? "text-red-600" : pct >= 40 ? "text-orange-600" : pct >= 20 ? "text-yellow-600" : "text-green-600";
  return <span className={`text-xs font-bold ${color}`}>{pct}%</span>;
}

function RiskScoreBadge({ score }: { score: number }) {
  const color = score >= 60 ? "bg-red-100 text-red-700" : score >= 40 ? "bg-orange-100 text-orange-700" : score >= 20 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>
      {score}
    </span>
  );
}

function SlaStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
    ON_TRACK: { color: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    MET: { color: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    AT_RISK: { color: "bg-yellow-100 text-yellow-700", Icon: AlertTriangle },
    BREACHED: { color: "bg-red-100 text-red-700", Icon: XCircle },
  };
  const c = config[status] ?? config.ON_TRACK!;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.color}`}>
      <c.Icon className="h-2.5 w-2.5" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function HealthBadge({ rating, score }: { rating: string | null; score: number | null }) {
  if (!rating) return <span className="text-[10px] text-muted-foreground">N/A</span>;
  const colors: Record<string, string> = {
    GREEN: "text-green-600",
    AMBER: "text-yellow-600",
    RED: "text-red-600",
  };
  return (
    <span className={`text-xs font-medium ${colors[rating] ?? ""}`}>
      {score != null ? `${score}%` : rating}
    </span>
  );
}

function ProbabilityBadge({ value }: { value: number }) {
  const color = value >= 80 ? "bg-green-100 text-green-700" : value >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{value}%</span>;
}

function ForecastStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETE: "bg-green-100 text-green-700",
    ON_TRACK: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    AT_RISK: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-gray-100"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PatternBadge({ pattern }: { pattern: string }) {
  const colors: Record<string, string> = {
    GATE_BREACH_CORRELATION: "bg-red-100 text-red-700",
    HIGH_OVERRIDE_BREACH: "bg-orange-100 text-orange-700",
    GATE_OVERRIDE_PRESENT: "bg-yellow-100 text-yellow-700",
    HIGH_OVERRIDE_COUNT: "bg-yellow-100 text-yellow-700",
    BREACH_NO_OVERRIDES: "bg-blue-100 text-blue-700",
    NORMAL: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[pattern] ?? "bg-gray-100"}`}>
      {pattern.replace(/_/g, " ")}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    HIGH: "bg-green-100 text-green-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[confidence] ?? ""}`}>
      {confidence}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}

function formatLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
