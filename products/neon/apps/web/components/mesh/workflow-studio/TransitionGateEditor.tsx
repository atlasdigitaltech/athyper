"use client";

import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Edge } from "@xyflow/react";

import { ConditionTreeBuilder } from "@/components/mesh/schemas/validation/ConditionTreeBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";


// ─── Types ───────────────────────────────────────────────────

interface ConditionGroup {
    operator?: "and" | "or";
    conditions: Array<{ field: string; operator: string; value: unknown } | ConditionGroup>;
}

export interface TransitionGateData {
    operationCode: string;
    requiredOperations: string[];
    approvalTemplateId: string;
    conditions: ConditionGroup | null;
    slaDurationMinutes: number;
}

interface TransitionGateEditorProps {
    edge: Edge | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (edgeId: string, data: TransitionGateData) => void;
}

const GATE_FIELDS = [
    "subject.roles",
    "subject.groups",
    "subject.principalType",
    "resource.status",
    "resource.ownerId",
    "context.channel",
    "context.ipAddress",
];

const EMPTY_GROUP: ConditionGroup = { operator: "and", conditions: [] };

// ─── Component ───────────────────────────────────────────────

export function TransitionGateEditor({ edge, open, onOpenChange, onSave }: TransitionGateEditorProps) {
    const gateData = (edge?.data as Record<string, unknown> | undefined)?.gate as TransitionGateData | undefined;

    const [operationCode, setOperationCode] = useState("");
    const [requiredOps, setRequiredOps] = useState("");
    const [approvalTemplateId, setApprovalTemplateId] = useState("");
    const [conditions, setConditions] = useState<ConditionGroup | null>(null);
    const [slaHours, setSlaHours] = useState(0);
    const [slaMinutes, setSlaMinutes] = useState(0);

    // Sync form when edge changes
    useEffect(() => {
        if (edge && open) {
            setOperationCode(gateData?.operationCode ?? (typeof edge.label === "string" ? edge.label : ""));
            setRequiredOps(gateData?.requiredOperations?.join(", ") ?? "");
            setApprovalTemplateId(gateData?.approvalTemplateId ?? "");
            setConditions(gateData?.conditions ?? null);
            const totalMins = gateData?.slaDurationMinutes ?? 0;
            setSlaHours(Math.floor(totalMins / 60));
            setSlaMinutes(totalMins % 60);
        }
    }, [edge, open, gateData]);

    const handleSave = useCallback(() => {
        if (!edge) return;
        onSave(edge.id, {
            operationCode,
            requiredOperations: requiredOps
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            approvalTemplateId,
            conditions,
            slaDurationMinutes: slaHours * 60 + slaMinutes,
        });
        onOpenChange(false);
    }, [edge, operationCode, requiredOps, approvalTemplateId, conditions, slaHours, slaMinutes, onSave, onOpenChange]);

    const fromLabel = edge?.source ?? "?";
    const toLabel = edge?.target ?? "?";

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Transition Gate</SheetTitle>
                    <SheetDescription>
                        <span className="inline-flex items-center gap-1.5">
                            <Badge variant="outline" className="font-mono text-xs">{fromLabel}</Badge>
                            <ArrowRight className="size-3" />
                            <Badge variant="outline" className="font-mono text-xs">{toLabel}</Badge>
                        </span>
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Operation Code</label>
                        <Input
                            value={operationCode}
                            onChange={(e) => setOperationCode(e.target.value)}
                            placeholder="e.g., WORKFLOW.APPROVE"
                            className="font-mono text-xs"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Required Operations</label>
                        <Input
                            value={requiredOps}
                            onChange={(e) => setRequiredOps(e.target.value)}
                            placeholder="Comma-separated operation codes"
                            className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                            Operations that must be completed before this transition can fire.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Approval Template ID</label>
                        <Input
                            value={approvalTemplateId}
                            onChange={(e) => setApprovalTemplateId(e.target.value)}
                            placeholder="Optional — leave blank for auto-transition"
                            className="font-mono text-xs"
                        />
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">SLA Timer</label>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min={0}
                                value={slaHours}
                                onChange={(e) => setSlaHours(parseInt(e.target.value, 10) || 0)}
                                className="w-20 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">hours</span>
                            <Input
                                type="number"
                                min={0}
                                max={59}
                                value={slaMinutes}
                                onChange={(e) => setSlaMinutes(parseInt(e.target.value, 10) || 0)}
                                className="w-20 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">minutes</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Time limit for this transition. Set to 0 for no SLA.
                        </p>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Gate Conditions</label>
                        <ConditionTreeBuilder
                            value={conditions ?? EMPTY_GROUP}
                            onChange={(g) => setConditions(g.conditions.length === 0 ? null : g)}
                            fields={GATE_FIELDS}
                            maxDepth={2}
                        />
                        {!conditions && (
                            <p className="text-xs text-muted-foreground">
                                No conditions — transition is unrestricted.
                            </p>
                        )}
                    </div>
                </div>

                <SheetFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Gate</Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
