"use client";

import { Code2, Eye } from "lucide-react";
import { useCallback, useState } from "react";

import { ConditionTreeBuilder } from "@/components/mesh/schemas/validation/ConditionTreeBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ───────────────────────────────────────────────────

interface ConditionLeaf {
    field: string;
    operator: string;
    value: unknown;
}

interface ConditionGroup {
    operator?: "and" | "or";
    conditions: Array<ConditionLeaf | ConditionGroup>;
}

export type PolicyConditions = ConditionGroup | null;

// ─── ABAC Field Paths (categorized) ─────────────────────────

export const ABAC_FIELD_CATEGORIES = {
    "Subject": [
        { path: "subject.principalId", label: "Principal ID", hint: "User or service account ID" },
        { path: "subject.principalType", label: "Principal Type", hint: "user | service" },
        { path: "subject.roles", label: "Roles", hint: "Array of assigned roles" },
        { path: "subject.groups", label: "Groups", hint: "Array of group memberships" },
        { path: "subject.attributes.department", label: "Department", hint: "Organization department" },
        { path: "subject.attributes.level", label: "Level", hint: "Job level / seniority" },
        { path: "subject.attributes.costCenter", label: "Cost Center", hint: "Subject cost center" },
        { path: "subject.ouMembership.path", label: "OU Path", hint: "Org unit path (e.g. /org/div1/)" },
        { path: "subject.ouMembership.code", label: "OU Code", hint: "Org unit code" },
    ],
    "Resource": [
        { path: "resource.type", label: "Type", hint: "Entity type code" },
        { path: "resource.id", label: "ID", hint: "Entity instance ID" },
        { path: "resource.module", label: "Module", hint: "Owning module code" },
        { path: "resource.ownerId", label: "Owner ID", hint: "Record owner principal ID" },
        { path: "resource.costCenter", label: "Cost Center", hint: "Resource cost center" },
        { path: "resource.attributes.status", label: "Status", hint: "Record lifecycle status" },
        { path: "resource.attributes.classification", label: "Classification", hint: "Data classification level" },
    ],
    "Context": [
        { path: "context.tenantId", label: "Tenant ID", hint: "Current tenant" },
        { path: "context.ipAddress", label: "IP Address", hint: "Client IP" },
        { path: "context.userAgent", label: "User Agent", hint: "Client browser/device" },
        { path: "context.channel", label: "Channel", hint: "Access channel (web, api, mobile)" },
        { path: "context.deviceType", label: "Device Type", hint: "desktop | mobile | tablet" },
        { path: "context.geo.country", label: "Country", hint: "ISO country code" },
        { path: "context.geo.region", label: "Region", hint: "Geographic region" },
        { path: "context.time.hour", label: "Hour (UTC)", hint: "Current hour 0-23" },
        { path: "context.time.dayOfWeek", label: "Day of Week", hint: "0=Sun, 6=Sat" },
    ],
    "Action": [
        { path: "action.namespace", label: "Namespace", hint: "Action namespace (e.g. entity)" },
        { path: "action.code", label: "Code", hint: "Action code (e.g. update)" },
        { path: "action.fullCode", label: "Full Code", hint: "namespace:code (e.g. entity:update)" },
    ],
} as const;

const ABAC_FIELDS = Object.values(ABAC_FIELD_CATEGORIES)
    .flat()
    .map((f) => f.path);

// ─── Component ───────────────────────────────────────────────

interface PolicyConditionBuilderProps {
    value: PolicyConditions;
    onChange: (value: PolicyConditions) => void;
}

const EMPTY_GROUP: ConditionGroup = { operator: "and", conditions: [] };

export function PolicyConditionBuilder({ value, onChange }: PolicyConditionBuilderProps) {
    const [mode, setMode] = useState<"visual" | "json">("visual");
    const [jsonText, setJsonText] = useState(() =>
        value ? JSON.stringify(value, null, 2) : "",
    );
    const [jsonError, setJsonError] = useState<string | null>(null);

    const handleVisualChange = useCallback(
        (updated: ConditionGroup) => {
            onChange(updated.conditions.length === 0 ? null : updated);
            setJsonText(updated.conditions.length === 0 ? "" : JSON.stringify(updated, null, 2));
            setJsonError(null);
        },
        [onChange],
    );

    const handleJsonChange = useCallback(
        (text: string) => {
            setJsonText(text);
            if (!text.trim()) {
                onChange(null);
                setJsonError(null);
                return;
            }
            try {
                const parsed = JSON.parse(text) as ConditionGroup;
                if (typeof parsed === "object" && parsed !== null) {
                    onChange(parsed);
                    setJsonError(null);
                } else {
                    setJsonError("Must be a JSON object");
                }
            } catch {
                setJsonError("Invalid JSON");
            }
        },
        [onChange],
    );

    const handleSwitchMode = useCallback(
        (newMode: "visual" | "json") => {
            if (newMode === "json") {
                setJsonText(value ? JSON.stringify(value, null, 2) : "");
                setJsonError(null);
            }
            setMode(newMode);
        },
        [value],
    );

    const handleClear = useCallback(() => {
        onChange(null);
        setJsonText("");
        setJsonError(null);
    }, [onChange]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Conditions (ABAC)</label>
                <div className="flex items-center gap-1.5">
                    {value && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={handleClear}>
                            Clear
                        </Button>
                    )}
                    <Button
                        variant={mode === "visual" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleSwitchMode("visual")}
                    >
                        <Eye className="mr-1 size-3" />
                        Visual
                    </Button>
                    <Button
                        variant={mode === "json" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleSwitchMode("json")}
                    >
                        <Code2 className="mr-1 size-3" />
                        JSON
                    </Button>
                </div>
            </div>

            {mode === "visual" ? (
                <ConditionTreeBuilder
                    value={value ?? EMPTY_GROUP}
                    onChange={handleVisualChange}
                    fields={ABAC_FIELDS}
                    maxDepth={3}
                />
            ) : (
                <div className="space-y-1">
                    <Textarea
                        value={jsonText}
                        onChange={(e) => handleJsonChange(e.target.value)}
                        placeholder='{"operator": "and", "conditions": [...]}'
                        rows={6}
                        className="font-mono text-xs"
                    />
                    {jsonError && (
                        <p className="text-xs text-destructive">{jsonError}</p>
                    )}
                </div>
            )}

            {!value && mode === "visual" && (
                <p className="text-xs text-muted-foreground">
                    No conditions — rule applies to all matching subjects.
                    Click "Add Condition" above to add ABAC conditions.
                </p>
            )}
        </div>
    );
}

// ─── Condition Summary (for read-only display) ───────────────

function countConditions(group: ConditionGroup): number {
    let count = 0;
    for (const c of group.conditions) {
        if ("conditions" in c && Array.isArray((c as ConditionGroup).conditions)) {
            count += countConditions(c as ConditionGroup);
        } else {
            count += 1;
        }
    }
    return count;
}

export function ConditionSummary({ conditions }: { conditions: PolicyConditions }) {
    if (!conditions || conditions.conditions.length === 0) {
        return <span className="text-xs text-muted-foreground">---</span>;
    }

    const total = countConditions(conditions);
    const op = (conditions.operator ?? "and").toUpperCase();

    return (
        <Badge variant="outline" className="text-xs font-mono gap-1">
            {total} {total === 1 ? "condition" : "conditions"} ({op})
        </Badge>
    );
}
