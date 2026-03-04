"use client";

import { AlertTriangle, Database, Layers, Zap } from "lucide-react";

import type { ImpactReport } from "@/lib/schema-manager/impact-analysis";

import { Badge } from "@/components/ui/badge";


// ─── Component ───────────────────────────────────────────────

interface ImpactPanelProps {
    impact: ImpactReport;
}

export function ImpactPanel({ impact }: ImpactPanelProps) {
    const hasImpacts = impact.migrations.length > 0 || impact.apiImpacts.length > 0 || impact.dataImpacts.length > 0;

    if (!hasImpacts) {
        return (
            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                No impacts detected for this change
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">Impact Analysis</h4>
                <Badge
                    variant={impact.riskLevel === "high" ? "destructive" : impact.riskLevel === "medium" ? "outline" : "secondary"}
                    className="text-xs"
                >
                    {impact.riskLevel} risk
                </Badge>
            </div>

            {/* Migrations */}
            {impact.migrations.length > 0 && (
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Database className="size-3.5 text-muted-foreground" />
                        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Database Migrations ({impact.migrations.length})
                        </h5>
                    </div>
                    <div className="rounded-md border divide-y">
                        {impact.migrations.map((m, i) => (
                            <div key={i} className="px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                                    <span className="font-mono text-xs">{m.target}</span>
                                    {m.breaking && (
                                        <Badge variant="destructive" className="text-[10px] gap-1">
                                            <AlertTriangle className="size-2.5" />
                                            Breaking
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                                {m.ddlPreview && (
                                    <pre className="text-[10px] font-mono text-muted-foreground bg-muted/30 p-2 rounded mt-1 overflow-x-auto">
                                        {m.ddlPreview}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* API Impacts */}
            {impact.apiImpacts.length > 0 && (
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Zap className="size-3.5 text-muted-foreground" />
                        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            API Impacts ({impact.apiImpacts.length})
                        </h5>
                    </div>
                    <div className="rounded-md border divide-y">
                        {impact.apiImpacts.map((a, i) => (
                            <div key={i} className="px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">{a.method} {a.endpoint}</Badge>
                                    {a.breaking && (
                                        <Badge variant="destructive" className="text-[10px]">Breaking</Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Data Impacts */}
            {impact.dataImpacts.length > 0 && (
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Layers className="size-3.5 text-muted-foreground" />
                        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Data Impacts ({impact.dataImpacts.length})
                        </h5>
                    </div>
                    <div className="rounded-md border divide-y">
                        {impact.dataImpacts.map((d, i) => (
                            <div key={i} className="px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                                    <span className="font-mono text-xs">{d.target}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                                {d.estimatedRows != null && (
                                    <p className="text-[10px] text-muted-foreground">
                                        Estimated affected rows: {d.estimatedRows.toLocaleString()}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-[10px] text-muted-foreground">{impact.summary}</p>
        </div>
    );
}
