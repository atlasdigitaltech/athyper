"use client";

/**
 * Generic Entity ListPageConfig Builder
 *
 * Generates a ListPageConfig from entity field metadata and capabilities.
 * Produces configs that work with the mesh/list component system for any entity.
 */

import { Boxes } from "lucide-react";

import type {
    ColumnDef,
    ListPageConfig,
    QuickFilterDef,
    RowAction,
    BulkAction,
    TreeConfig,
    ViewMode,
} from "@/components/mesh/list/types";
import type { EntityCapabilities } from "@/lib/entity-capabilities";
import type { ListPrimaryAction } from "@/lib/entity-list-actions";
import type { FieldMeta } from "@/lib/use-entity-fields";

import { entityNameToSlug, entityNameToDisplayName } from "@/lib/entity-meta-utils";


// ============================================================================
// Types
// ============================================================================

type EntityRecord = Record<string, unknown>;

// System fields to exclude from list columns
const SYSTEM_FIELDS = new Set([
    "id", "tenant_id", "realm_id",
    "created_at", "created_by", "updated_at", "updated_by",
    "deleted_at", "deleted_by", "version",
    "entity_type_code", "source_system", "metadata",
]);

// Fields that should appear first in the column order
const PRIORITY_FIELDS = [
    "code", "name", "title", "description", "label",
    "document_number", "status",
];

// ============================================================================
// Config Builder
// ============================================================================

export function buildEntityListConfig(options: {
    entityKey: string;
    entityName: string;
    fields: FieldMeta[];
    capabilities: EntityCapabilities | null;
    featureFlags?: Record<string, unknown> | null;
    primaryAction?: ListPrimaryAction;
    rowActions?: RowAction<EntityRecord>[];
    bulkActions?: BulkAction<EntityRecord>[];
}): ListPageConfig<EntityRecord> {
    const {
        entityKey,
        entityName,
        fields,
        capabilities,
        featureFlags,
        primaryAction,
        rowActions,
        bulkActions,
    } = options;

    const slug = entityNameToSlug(entityName);
    const displayName = entityNameToDisplayName(entityName);
    const basePath = `/app/${slug}/view/list`;

    // Parse tree view config from feature flags
    const treeFlag = featureFlags?.treeView as { parentField?: string; levelField?: string; isGroupField?: string } | undefined;
    const treeConfig: TreeConfig | undefined = treeFlag?.parentField
        ? { parentField: treeFlag.parentField, levelField: treeFlag.levelField, isGroupField: treeFlag.isGroupField }
        : undefined;

    // Build columns from field metadata (with groupability heuristic)
    const columns = buildColumns(fields);

    // Allow entity-level featureFlags to explicitly opt-in additional groupable
    // fields (e.g. FK fields that are known low-cardinality: region_id, dept_id)
    const explicitGroupable = (featureFlags?.groupableFields as string[]) ?? [];
    for (const col of columns) {
        if (explicitGroupable.includes(col.id)) {
            col.groupable = true;
        }
    }

    // Build quick filters from filterable enum-like fields
    const quickFilters = buildQuickFilters(fields);

    // Build search function
    const searchableFields = fields
        .filter((f) => f.isSearchable || f.dataType === "string")
        .map((f) => f.columnName);

    return {
        pageTitle: displayName,
        entityLabel: displayName.toLowerCase(),
        entityLabelPlural: naivePluralize(displayName.toLowerCase()),
        icon: Boxes,
        basePath,
        getId: (item) => {
            if (item.id != null && item.id !== "") return String(item.id);
            // Fallback: use a deterministic key from the first few non-null fields
            const fallback = Object.values(item).filter((v) => v != null).slice(0, 3).join(":");
            return fallback || crypto.randomUUID();
        },
        getItemHref: (item) => `/app/${slug}/${String(item.id)}`,

        // Search
        searchPlaceholder: `Search ${displayName.toLowerCase()}...`,
        searchFn: (item, query) => {
            const q = query.toLowerCase();
            return searchableFields.some((fieldName) => {
                const val = item[fieldName];
                return val != null && String(val).toLowerCase().includes(q);
            });
        },

        // Filters
        quickFilters,
        filterFn: (item, filters) => {
            const qfIds = new Set(quickFilters.map((qf) => qf.id));
            for (const [key, value] of Object.entries(filters)) {
                if (!value || value === "all") continue;
                const itemValue = item[key];
                if (itemValue == null) return false;
                if (qfIds.has(key)) {
                    // Quick filters: exact match
                    if (String(itemValue).toLowerCase() !== value.toLowerCase()) return false;
                } else {
                    // Column text filters: contains match
                    if (!String(itemValue).toLowerCase().includes(value.toLowerCase())) return false;
                }
            }
            return true;
        },

        // Columns
        columns,

        // Card renderer — uses the EntityCard component (generic)
        cardRenderer: (item) => null, // Will be overridden by EntityCard in the page

        // Tree view (from feature flags)
        tree: treeConfig,

        // View configuration
        availableViews: treeConfig
            ? (["tree", "table", "table-columns", "card-grid"] as ViewMode[])
            : (["table", "table-columns", "card-grid"] as ViewMode[]),
        defaultViewMode: treeConfig ? "tree" as ViewMode : "card-grid",
        defaultViewModeDesktop: treeConfig ? "tree" as ViewMode : "table",
        defaultDensity: "compact",
        defaultDensityDesktop: "compact",

        // Actions
        primaryAction: primaryAction
            ? { label: primaryAction.label, onClick: primaryAction.onClick }
            : undefined,
        rowActions: rowActions ?? [],
        bulkActions: bulkActions ?? [],

        // Presets
        presets: [
            { id: "default", label: "Default", isDefault: true },
        ],
    };
}

// ============================================================================
// Column Builder
// ============================================================================

function buildColumns(fields: FieldMeta[]): ColumnDef<EntityRecord>[] {
    // Filter out system fields
    const userFields = fields.filter((f) => !SYSTEM_FIELDS.has(f.columnName));

    // Sort: priority fields first, then by sortOrder
    const sorted = [...userFields].sort((a, b) => {
        const aPriority = PRIORITY_FIELDS.indexOf(a.columnName);
        const bPriority = PRIORITY_FIELDS.indexOf(b.columnName);
        const aIdx = aPriority >= 0 ? aPriority : 100 + a.sortOrder;
        const bIdx = bPriority >= 0 ? bPriority : 100 + b.sortOrder;
        return aIdx - bIdx;
    });

    return sorted.map((field) => {
        const col: ColumnDef<EntityRecord> = {
            id: field.columnName,
            header: formatHeader(field.name),
            sortKey: field.columnName,
            accessor: buildAccessor(field),
            filterable: field.isFilterable,
            groupable: isGroupableField(field),
        };

        // Hide columns beyond the first 8
        const idx = sorted.indexOf(field);
        if (idx >= 8) {
            col.hidden = true;
        }

        return col;
    });
}

function buildAccessor(field: FieldMeta): (item: EntityRecord) => React.ReactNode {
    const hasLookup = !!field.lookupConfig;

    return (item: EntityRecord) => {
        // For FK fields, check for resolved reference label first
        if (hasLookup) {
            // 1. Check _ref_<column> decoration (collision-safe: only when key exists)
            const refKey = `_ref_${field.columnName}`;
            if (refKey in item && item[refKey] != null) {
                return String(item[refKey]);
            }
        }

        const value = item[field.columnName];
        if (value == null) return "\u2014";

        switch (field.dataType) {
            case "number": {
                const num = Number(value);
                if (isNaN(num)) return String(value);
                // Format with appropriate decimal places
                if (field.columnName.includes("amount") || field.columnName.includes("price") || field.columnName.includes("rate")) {
                    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
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
    };
}

// ============================================================================
// Filter Builder
// ============================================================================

function buildQuickFilters(fields: FieldMeta[]): QuickFilterDef[] {
    const filters: QuickFilterDef[] = [];

    // Add status filter if entity has a status field
    const statusField = fields.find((f) =>
        f.columnName === "status" || f.columnName === "is_active",
    );

    if (statusField) {
        filters.push({
            id: statusField.columnName,
            label: formatHeader(statusField.columnName),
            defaultValue: "all",
            options: [
                { value: "all", label: "All" },
                ...(statusField.columnName === "is_active"
                    ? [
                        { value: "true", label: "Active" },
                        { value: "false", label: "Inactive" },
                    ]
                    : [
                        { value: "DRAFT", label: "Draft" },
                        { value: "ACTIVE", label: "Active" },
                        { value: "INACTIVE", label: "Inactive" },
                    ]),
            ],
        });
    }

    return filters;
}

// ============================================================================
// Groupability Heuristic
// ============================================================================

/** Known safe exact column names for grouping (low-cardinality by convention). */
const GROUPABLE_SAFE_NAMES = new Set([
    "status", "type", "category", "kind", "region", "zone",
    "priority", "grade", "currency", "country", "state",
    "department", "is_active",
]);

/** Known safe suffixes for grouping. */
const GROUPABLE_SAFE_SUFFIXES = [
    "_status", "_type", "_category", "_kind", "_class",
    "_group", "_region", "_zone", "_level", "_priority", "_grade",
];

/**
 * Conservative heuristic: determine if a field is safe for group-by.
 *
 * Only marks known-safe patterns (enums, booleans, status fields).
 * FK fields are NOT automatic — they require explicit opt-in via
 * entity featureFlags.groupableFields to avoid high-cardinality explosions
 * (e.g., Supplier, Customer, Employee with thousands of values).
 */
function isGroupableField(field: FieldMeta): boolean {
    const name = field.columnName;

    // EXCLUDE: id-ish patterns (high cardinality identifiers)
    if (name === "id" || name.endsWith("_id") || name === "uuid") return false;

    // EXCLUDE: name/description fields (usually unique-ish)
    if (name === "name" || name === "description" || name === "title"
        || name.endsWith("_name") || name.endsWith("_desc")) return false;

    // EXCLUDE: code fields (often high cardinality identifiers)
    if (name === "code" || name.endsWith("_code")
        || name.endsWith("_number") || name.endsWith("_no")) return false;

    // INCLUDE: PostgreSQL enum types (USER-DEFINED → mapped as "enum")
    if (field.dataType === "enum") return true;

    // INCLUDE: boolean fields (natural two-group split)
    if (field.dataType === "boolean") return true;

    // INCLUDE: known safe exact names
    if (GROUPABLE_SAFE_NAMES.has(name)) return true;

    // INCLUDE: known safe suffixes
    if (GROUPABLE_SAFE_SUFFIXES.some(s => name.endsWith(s))) return true;

    return false;
}

// ============================================================================
// Helpers
// ============================================================================

function naivePluralize(label: string): string {
    if (label.endsWith("s") || label.endsWith("sh") || label.endsWith("ch")) return label;
    if (label.endsWith("y") && !/[aeiou]y$/i.test(label)) return label.slice(0, -1) + "ies";
    return label + "s";
}

function formatHeader(name: string): string {
    return name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
