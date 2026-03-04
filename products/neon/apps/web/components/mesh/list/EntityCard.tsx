"use client";

/**
 * Generic Entity Card
 *
 * Renders a card for any entity type in card-grid view.
 * Auto-selects the most relevant fields to display.
 */

import Link from "next/link";

import type { FieldMeta } from "@/lib/use-entity-fields";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";


// ============================================================================
// Types
// ============================================================================

interface EntityCardProps {
    item: Record<string, unknown>;
    basePath: string;
    fields: FieldMeta[];
}

// Fields that make good card titles (in priority order)
const TITLE_CANDIDATES = [
    "name", "title", "label", "code", "document_number",
    "account_name", "invoice_number", "description",
];

// Fields that make good subtitles
const SUBTITLE_CANDIDATES = [
    "code", "account_code", "document_number", "description",
    "type", "category", "kind",
];

// Status field names
const STATUS_FIELDS = new Set(["status", "is_active"]);

// Fields to skip in card detail rows
const SKIP_FIELDS = new Set([
    "id", "tenant_id", "realm_id",
    "created_at", "created_by", "updated_at", "updated_by",
    "deleted_at", "deleted_by", "version",
    "entity_type_code", "source_system", "metadata",
]);

// ============================================================================
// Component
// ============================================================================

export function EntityCard({ item, basePath, fields }: EntityCardProps) {
    const id = String(item.id ?? "");
    const href = `${basePath}/${id}`;

    // Pick title field
    const titleField = findField(fields, TITLE_CANDIDATES);
    const title = titleField
        ? String(item[titleField.columnName] ?? "Untitled")
        : String(item.id ?? "—");

    // Pick subtitle field (different from title)
    const subtitleField = findField(
        fields,
        SUBTITLE_CANDIDATES.filter((c) => c !== titleField?.columnName),
    );
    const subtitle = subtitleField
        ? String(item[subtitleField.columnName] ?? "")
        : null;

    // Status badge
    const statusField = fields.find((f) => STATUS_FIELDS.has(f.columnName));
    const statusValue = statusField ? item[statusField.columnName] : null;

    // Pick 2–3 extra detail fields
    const shownFieldNames = new Set([
        titleField?.columnName,
        subtitleField?.columnName,
        statusField?.columnName,
    ]);
    const detailFields = fields
        .filter((f) => !SKIP_FIELDS.has(f.columnName) && !shownFieldNames.has(f.columnName))
        .slice(0, 3);

    return (
        <Link href={href} className="block">
            <Card className="p-4 transition-colors hover:bg-accent/50 cursor-pointer h-full">
                <div className="space-y-2">
                    {/* Header: title + status */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{title}</p>
                            {subtitle && (
                                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                            )}
                        </div>
                        {statusValue != null && (
                            <Badge
                                variant={getStatusVariant(String(statusValue))}
                                className="text-xs shrink-0"
                            >
                                {formatStatus(String(statusValue))}
                            </Badge>
                        )}
                    </div>

                    {/* Detail rows */}
                    {detailFields.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                            {detailFields.map((field) => {
                                const val = item[field.columnName];
                                return (
                                    <div key={field.columnName} className="min-w-0">
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {formatHeader(field.name)}
                                        </p>
                                        <p className="text-xs truncate">
                                            {formatValue(field, val)}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>
        </Link>
    );
}

// ============================================================================
// Helpers
// ============================================================================

function findField(
    fields: FieldMeta[],
    candidates: string[],
): FieldMeta | undefined {
    for (const name of candidates) {
        const field = fields.find((f) => f.columnName === name || f.name === name);
        if (field) return field;
    }
    return undefined;
}

function formatHeader(name: string): string {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(field: FieldMeta, value: unknown): string {
    if (value == null) return "\u2014";

    switch (field.dataType) {
        case "number": {
            const num = Number(value);
            if (isNaN(num)) return String(value);
            return num.toLocaleString();
        }
        case "date": {
            try {
                const date = new Date(String(value));
                if (isNaN(date.getTime())) return String(value);
                return date.toLocaleDateString();
            } catch {
                return String(value);
            }
        }
        case "boolean":
            return value ? "Yes" : "No";
        default:
            return String(value);
    }
}

function formatStatus(status: string): string {
    return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusVariant(
    status: string,
): "default" | "secondary" | "destructive" | "outline" {
    const lower = status.toLowerCase();
    if (lower === "active" || lower === "published" || lower === "approved" || lower === "paid" || lower === "true") {
        return "default";
    }
    if (lower === "inactive" || lower === "cancelled" || lower === "rejected" || lower === "false") {
        return "destructive";
    }
    if (lower === "draft") return "secondary";
    if (lower === "submitted" || lower === "pending") return "default";
    return "outline";
}
