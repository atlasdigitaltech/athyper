"use client";

import { useState } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Layers,
  RefreshCw,
  Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useRetentionExplain, useTieringExplain } from "@/lib/governance/hooks";

const SCOPE_COLORS: Record<string, string> = {
  entity: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  table: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  schema: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function RetentionPolicyExplorer() {
  const [schema, setSchema] = useState("evt");
  const [table, setTable] = useState("event");

  const retention = useRetentionExplain(schema, table);
  const tiering = useTieringExplain(schema, table);

  const [expandedSection, setExpandedSection] = useState<string | null>("retention");

  const loading = retention.loading || tiering.loading;
  const error = retention.error || tiering.error;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Retention Policy Explorer</h2>
          <p className="text-sm text-muted-foreground">
            Inspect resolved retention and tiering policies with full decision traces
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { retention.refresh(); tiering.refresh(); }}
          disabled={loading}
        >
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {/* Scope selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Schema:</span>
          <Input
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            className="w-28"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Table:</span>
          <Input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="w-28"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !retention.data && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading policies...</span>
        </div>
      )}

      {/* Legal Hold Banner */}
      {retention.data?.resolvedPolicy?.legalHold && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <Shield className="mt-0.5 size-5 text-red-600" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              Legal Hold Active — Processing Frozen
            </p>
            {retention.data.activeHolds.map((h) => (
              <p key={h.holdId} className="mt-1 text-sm text-red-600 dark:text-red-300">
                {h.reference} ({h.source}): {h.reason} — issued by {h.issuedBy}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Retention Section */}
      {retention.data && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedSection(expandedSection === "retention" ? null : "retention")}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" />
                Retention Policy
                {expandedSection === "retention" ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </CardTitle>
              {retention.data.resolvedPolicy && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {retention.data.resolvedPolicy.retentionDays} days
                  </Badge>
                  <Badge className={SCOPE_COLORS[retention.data.resolvedPolicy.resolvedScope] ?? ""}>
                    {retention.data.resolvedPolicy.resolvedScope}
                  </Badge>
                  {retention.data.resolvedPolicy.complianceFramework && (
                    <Badge variant="outline">
                      {retention.data.resolvedPolicy.complianceFramework}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          {expandedSection === "retention" && (
            <CardContent>
              {!retention.data.resolvedPolicy ? (
                <p className="text-sm text-muted-foreground">
                  No active retention policy. Default 90-day retention applies.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                    <div>
                      <span className="text-muted-foreground">Retention:</span>{" "}
                      <span className="font-medium">{retention.data.resolvedPolicy.retentionDays} days</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Action:</span>{" "}
                      <span className="font-medium">{retention.data.resolvedPolicy.actionOnExpiry}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Scope:</span>{" "}
                      <span className="font-medium">{retention.data.resolvedPolicy.resolvedScope}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priority:</span>{" "}
                      <span className="font-medium">{retention.data.resolvedPolicy.priority}</span>
                    </div>
                  </div>

                  {/* Candidate Policies */}
                  {retention.data.candidatePolicies.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                        Candidate Policies ({retention.data.candidatePolicies.length})
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Scope</TableHead>
                            <TableHead>Retention</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {retention.data.candidatePolicies.map((c) => (
                            <TableRow key={c.policyId} className={c.isWinner ? "bg-green-50 dark:bg-green-950/30" : ""}>
                              <TableCell>
                                <Badge className={SCOPE_COLORS[c.scope] ?? ""} variant="secondary">
                                  {c.scope}
                                </Badge>
                              </TableCell>
                              <TableCell>{c.retentionDays} days</TableCell>
                              <TableCell>{c.priority}</TableCell>
                              <TableCell>
                                {c.isWinner ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                                    <CheckCircle2 className="mr-1 size-3" /> Winner
                                  </Badge>
                                ) : !c.isActive ? (
                                  <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                                ) : (
                                  <Badge variant="outline">Outranked</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Tiering Section */}
      {tiering.data && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedSection(expandedSection === "tiering" ? null : "tiering")}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4" />
                Tiering Policy
                {expandedSection === "tiering" ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </CardTitle>
              {tiering.data.resolvedPolicy && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    HOT {tiering.data.resolvedPolicy.hotMonths}mo
                  </Badge>
                  <Badge variant="outline">
                    WARM {tiering.data.resolvedPolicy.warmMonths}mo / {tiering.data.resolvedPolicy.warmStrategy}
                  </Badge>
                  <Badge variant="outline">
                    COLD / {tiering.data.resolvedPolicy.coldStrategy}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          {expandedSection === "tiering" && (
            <CardContent>
              {!tiering.data.resolvedPolicy ? (
                <p className="text-sm text-muted-foreground">
                  No active tiering policy. Data stays in HOT tier.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Tier visualization */}
                  <div className="flex items-center gap-1 rounded-lg border p-3">
                    <div className="flex-1 rounded bg-red-100 p-2 text-center text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                      HOT (0–{tiering.data.resolvedPolicy.hotMonths}mo)
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex-1 rounded bg-amber-100 p-2 text-center text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      WARM ({tiering.data.resolvedPolicy.hotMonths}–{tiering.data.resolvedPolicy.warmMonths}mo)
                      <br />{tiering.data.resolvedPolicy.warmStrategy}
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex-1 rounded bg-blue-100 p-2 text-center text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      COLD ({tiering.data.resolvedPolicy.warmMonths}mo+)
                      <br />{tiering.data.resolvedPolicy.coldStrategy}
                    </div>
                  </div>

                  {/* Consistency check */}
                  {!tiering.data.retentionConstraint.isConsistent && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      <AlertTriangle className="size-4" />
                      {tiering.data.retentionConstraint.warning}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Explanation */}
      {(retention.data || tiering.data) && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          {retention.data?.explanation}
          {tiering.data?.explanation && (
            <>
              <br />
              {tiering.data.explanation}
            </>
          )}
        </div>
      )}
    </div>
  );
}
