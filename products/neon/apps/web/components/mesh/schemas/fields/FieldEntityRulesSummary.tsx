"use client";

import { ExternalLink, ShieldAlert, AlertTriangle, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import type { ValidationRule } from "@/lib/schema-manager/use-entity-validation";

import { Badge } from "@/components/ui/badge";

// ─── Kind Labels ────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
    required: "Required",
    min_max: "Min/Max",
    length: "Length",
    regex: "Regex",
    enum: "Enum",
    cross_field: "Cross-Field",
    conditional: "Conditional",
    date_range: "Date Range",
    referential: "Referential",
    unique: "Unique",
};

// ─── Props ──────────────────────────────────────────────────

interface FieldEntityRulesSummaryProps {
    /** Field name to filter rules for */
    fieldName: string;
    /** All entity-level validation rules */
    entityRules: ValidationRule[];
    /** Entity name for navigation link */
    entityName: string;
}

// ─── Component ──────────────────────────────────────────────

export function FieldEntityRulesSummary({
    fieldName,
    entityRules,
    entityName,
}: FieldEntityRulesSummaryProps) {
    // Filter entity-level rules that target this field (custom only, not field-derived)
    const matchingRules = useMemo(
        () =>
            entityRules.filter(
                (r) => r.fieldPath === fieldName && r.provenance !== "field",
            ),
        [entityRules, fieldName],
    );

    if (matchingRules.length === 0) return null;

    return (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium">
                        Entity Validation Rules
                    </p>
                    <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                    >
                        {matchingRules.length}
                    </Badge>
                </div>
                <a
                    href={`/wb/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/validation`}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                    Open Validation Tab
                    <ExternalLink className="size-2.5" />
                </a>
            </div>

            <div className="space-y-1">
                {matchingRules.map((rule) => {
                    const isError = rule.severity === "error";
                    const Icon = isError ? ShieldAlert : AlertTriangle;
                    const iconClass = isError
                        ? "text-destructive"
                        : "text-warning";

                    return (
                        <div
                            key={rule.id}
                            className="flex items-center gap-2 text-xs"
                        >
                            <Icon className={`size-3 shrink-0 ${iconClass}`} />
                            <span className="font-medium truncate">
                                {rule.name}
                            </span>
                            <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                                {KIND_LABELS[rule.kind] ?? rule.kind}
                            </Badge>
                            <span className="text-muted-foreground shrink-0">
                                {rule.appliesOn.join(", ")}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="text-[10px] text-muted-foreground">
                These rules are defined at the entity level. Edit them in the
                Validation tab.
            </p>
        </div>
    );
}
