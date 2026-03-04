// lib/schema-manager/validation.ts
//
// Server-side validation service for schema invariant checks.
// These run in the BFF for fast feedback before proxying to the runtime.

import type { FieldDefinition, IndexDefinition, RelationDefinition } from "./types";

// ─── Result Types ─────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}

export interface ValidationIssue {
    code: string;
    field?: string;
    message: string;
}

// ─── Reserved Names ───────────────────────────────────────────

const RESERVED_FIELD_NAMES = new Set([
    "id", "tenant_id", "realm_id",
    "created_at", "created_by", "updated_at", "updated_by",
    "deleted_at", "deleted_by", "version",
]);

// ─── Safe Type Cast Matrix ────────────────────────────────────
// key = fromType, value = set of allowed toTypes

const SAFE_CASTS: Record<string, Set<string>> = {
    string: new Set(["text", "json"]),
    text: new Set(["json"]),
    integer: new Set(["number", "decimal", "string", "text"]),
    number: new Set(["decimal", "string", "text"]),
    decimal: new Set(["string", "text"]),
    boolean: new Set(["string", "text"]),
    date: new Set(["datetime", "string", "text"]),
    datetime: new Set(["string", "text"]),
    uuid: new Set(["string", "text"]),
    enum: new Set(["string", "text"]),
};

// ─── Field Validation ─────────────────────────────────────────

export function validateField(
    field: { name: string; columnName?: string; dataType: string },
    existingFields: FieldDefinition[],
    editingFieldId?: string,
): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Non-empty name
    if (!field.name || field.name.trim().length === 0) {
        errors.push({ code: "FIELD_NAME_EMPTY", field: "name", message: "Field name is required" });
    }

    // Snake_case format
    if (field.name && !/^[a-z][a-z0-9_]*$/.test(field.name)) {
        errors.push({ code: "FIELD_NAME_FORMAT", field: "name", message: "Field name must be lowercase snake_case" });
    }

    // Reserved name check
    if (RESERVED_FIELD_NAMES.has(field.name)) {
        errors.push({ code: "FIELD_NAME_RESERVED", field: "name", message: `'${field.name}' is a reserved system field name` });
    }

    // Unique name check
    const nameConflict = existingFields.find(
        (f) => f.name === field.name && f.id !== editingFieldId,
    );
    if (nameConflict) {
        errors.push({ code: "FIELD_NAME_DUPLICATE", field: "name", message: `A field named '${field.name}' already exists` });
    }

    // Column name uniqueness
    if (field.columnName) {
        const columnConflict = existingFields.find(
            (f) => f.columnName === field.columnName && f.id !== editingFieldId,
        );
        if (columnConflict) {
            errors.push({ code: "COLUMN_NAME_DUPLICATE", field: "columnName", message: `Column name '${field.columnName}' is already in use` });
        }
    }

    // Type change safety (for updates)
    if (editingFieldId) {
        const existing = existingFields.find((f) => f.id === editingFieldId);
        if (existing && existing.dataType !== field.dataType) {
            const safeCasts = SAFE_CASTS[existing.dataType];
            if (!safeCasts || !safeCasts.has(field.dataType)) {
                warnings.push({
                    code: "UNSAFE_TYPE_CAST",
                    field: "dataType",
                    message: `Changing type from '${existing.dataType}' to '${field.dataType}' may require a migration strategy`,
                });
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ─── Relation Validation ──────────────────────────────────────

export function validateRelation(
    relation: { name: string; relationKind: string; targetEntity: string },
    existingRelations: RelationDefinition[],
    entityName: string,
): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Non-empty name
    if (!relation.name || relation.name.trim().length === 0) {
        errors.push({ code: "RELATION_NAME_EMPTY", field: "name", message: "Relation name is required" });
    }

    // Unique name check
    const nameConflict = existingRelations.find((r) => r.name === relation.name);
    if (nameConflict) {
        errors.push({ code: "RELATION_NAME_DUPLICATE", field: "name", message: `A relation named '${relation.name}' already exists` });
    }

    // Self-referencing ownership cycle check
    if (relation.relationKind === "belongs_to" && relation.targetEntity === entityName) {
        warnings.push({
            code: "SELF_OWNERSHIP",
            field: "targetEntity",
            message: "Self-referencing belongs_to may create ownership cycles",
        });
    }

    // Circular ownership detection (A belongs_to B AND B already belongs_to A)
    if (relation.relationKind === "belongs_to") {
        const reverseOwnership = existingRelations.find(
            (r) => r.relationKind === "belongs_to" && r.targetEntity === entityName,
        );
        if (reverseOwnership) {
            errors.push({
                code: "CIRCULAR_OWNERSHIP",
                field: "targetEntity",
                message: `Circular ownership: '${relation.targetEntity}' already has a belongs_to relation targeting this entity`,
            });
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ─── Index Validation ─────────────────────────────────────────

export function validateIndex(
    index: { name: string; columns: string[]; method?: string; isUnique?: boolean },
    existingIndexes: IndexDefinition[],
    fields: FieldDefinition[],
): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Non-empty name
    if (!index.name || index.name.trim().length === 0) {
        errors.push({ code: "INDEX_NAME_EMPTY", field: "name", message: "Index name is required" });
    }

    // Columns exist
    const fieldNames = new Set(fields.map((f) => f.columnName));
    for (const col of index.columns) {
        if (!fieldNames.has(col)) {
            errors.push({ code: "INDEX_COLUMN_NOT_FOUND", field: "columns", message: `Column '${col}' does not exist on this entity` });
        }
    }

    // Max columns
    if (index.columns.length > 16) {
        errors.push({ code: "INDEX_TOO_MANY_COLUMNS", field: "columns", message: "Indexes can have at most 16 columns" });
    }

    // Duplicate index detection (same columns + method)
    const existingCols = existingIndexes.map((idx) => {
        const cols = Array.isArray(idx.columns) ? (idx.columns as string[]) : [];
        return cols.sort().join(",");
    });
    const newCols = [...index.columns].sort().join(",");
    if (existingCols.includes(newCols)) {
        warnings.push({ code: "INDEX_DUPLICATE", field: "columns", message: "An index with the same columns already exists" });
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ─── Policy Validation ────────────────────────────────────────

export function validatePolicy(
    policy: { fieldPath?: string },
    fields: FieldDefinition[],
): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Field security policy: validate field path exists
    if (policy.fieldPath) {
        const fieldExists = fields.some((f) => f.name === policy.fieldPath || f.columnName === policy.fieldPath);
        if (!fieldExists) {
            errors.push({
                code: "POLICY_FIELD_NOT_FOUND",
                field: "fieldPath",
                message: `Field '${policy.fieldPath}' does not exist on this entity`,
            });
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}
