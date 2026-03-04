// lib/schema-manager/schema-diff.ts
//
// Semantic diff engine for entity schema versions.
// Produces structured diffs rather than raw JSON text comparisons.

import type { FieldDefinition, IndexDefinition, RelationDefinition } from "./types";

// ─── Diff Types ───────────────────────────────────────────────

export interface SchemaDiff {
    fields: FieldDiffEntry[];
    relations: RelationDiffEntry[];
    indexes: IndexDiffEntry[];
    breaking: boolean;
    summary: string;
}

export interface FieldDiffEntry {
    kind: "added" | "removed" | "modified" | "renamed" | "type_changed";
    fieldName: string;
    breaking: boolean;
    detail: string;
    before?: Partial<FieldDefinition>;
    after?: Partial<FieldDefinition>;
}

export interface RelationDiffEntry {
    kind: "added" | "removed" | "modified";
    relationName: string;
    breaking: boolean;
    detail: string;
}

export interface IndexDiffEntry {
    kind: "added" | "removed" | "modified";
    indexName: string;
    breaking: boolean;
    detail: string;
}

// ─── Field Diff ───────────────────────────────────────────────

export function diffFields(base: FieldDefinition[], target: FieldDefinition[]): FieldDiffEntry[] {
    const diffs: FieldDiffEntry[] = [];
    const baseMap = new Map(base.map((f) => [f.id, f]));
    const targetMap = new Map(target.map((f) => [f.id, f]));

    // Find removed fields
    for (const [id, f] of baseMap) {
        if (!targetMap.has(id)) {
            diffs.push({
                kind: "removed",
                fieldName: f.name,
                breaking: true,
                detail: `Field '${f.name}' (${f.dataType}) was removed`,
                before: f,
            });
        }
    }

    // Find added fields
    for (const [id, f] of targetMap) {
        if (!baseMap.has(id)) {
            diffs.push({
                kind: "added",
                fieldName: f.name,
                breaking: f.isRequired && f.defaultValue == null,
                detail: f.isRequired && f.defaultValue == null
                    ? `Required field '${f.name}' (${f.dataType}) added without default — may need backfill`
                    : `Field '${f.name}' (${f.dataType}) added`,
                after: f,
            });
        }
    }

    // Find modified fields
    for (const [id, baseField] of baseMap) {
        const targetField = targetMap.get(id);
        if (!targetField) continue;

        // Name changed
        if (baseField.name !== targetField.name) {
            diffs.push({
                kind: "renamed",
                fieldName: targetField.name,
                breaking: true,
                detail: `Field renamed from '${baseField.name}' to '${targetField.name}'`,
                before: { name: baseField.name },
                after: { name: targetField.name },
            });
        }

        // Type changed
        if (baseField.dataType !== targetField.dataType) {
            diffs.push({
                kind: "type_changed",
                fieldName: targetField.name,
                breaking: true,
                detail: `Field '${targetField.name}' type changed from '${baseField.dataType}' to '${targetField.dataType}'`,
                before: { dataType: baseField.dataType },
                after: { dataType: targetField.dataType },
            });
        }

        // Required changed
        if (!baseField.isRequired && targetField.isRequired) {
            diffs.push({
                kind: "modified",
                fieldName: targetField.name,
                breaking: targetField.defaultValue == null,
                detail: `Field '${targetField.name}' is now required${targetField.defaultValue == null ? " (no default — may need backfill)" : ""}`,
                before: { isRequired: false },
                after: { isRequired: true },
            });
        }

        // Unique changed
        if (!baseField.isUnique && targetField.isUnique) {
            diffs.push({
                kind: "modified",
                fieldName: targetField.name,
                breaking: true,
                detail: `Field '${targetField.name}' now has a unique constraint`,
            });
        }
    }

    return diffs;
}

// ─── Relation Diff ────────────────────────────────────────────

export function diffRelations(base: RelationDefinition[], target: RelationDefinition[]): RelationDiffEntry[] {
    const diffs: RelationDiffEntry[] = [];
    const baseMap = new Map(base.map((r) => [r.id, r]));
    const targetMap = new Map(target.map((r) => [r.id, r]));

    for (const [id, r] of baseMap) {
        if (!targetMap.has(id)) {
            diffs.push({
                kind: "removed",
                relationName: r.name,
                breaking: true,
                detail: `Relation '${r.name}' (${r.relationKind} → ${r.targetEntity}) removed`,
            });
        }
    }

    for (const [id, r] of targetMap) {
        if (!baseMap.has(id)) {
            diffs.push({
                kind: "added",
                relationName: r.name,
                breaking: false,
                detail: `Relation '${r.name}' (${r.relationKind} → ${r.targetEntity}) added`,
            });
        }
    }

    for (const [id, baseRel] of baseMap) {
        const targetRel = targetMap.get(id);
        if (!targetRel) continue;

        if (baseRel.relationKind !== targetRel.relationKind) {
            diffs.push({
                kind: "modified",
                relationName: targetRel.name,
                breaking: true,
                detail: `Relation '${targetRel.name}' cardinality changed from '${baseRel.relationKind}' to '${targetRel.relationKind}'`,
            });
        }

        if (baseRel.onDelete !== targetRel.onDelete) {
            diffs.push({
                kind: "modified",
                relationName: targetRel.name,
                breaking: false,
                detail: `Relation '${targetRel.name}' onDelete changed from '${baseRel.onDelete}' to '${targetRel.onDelete}'`,
            });
        }
    }

    return diffs;
}

// ─── Index Diff ───────────────────────────────────────────────

export function diffIndexes(base: IndexDefinition[], target: IndexDefinition[]): IndexDiffEntry[] {
    const diffs: IndexDiffEntry[] = [];
    const baseMap = new Map(base.map((i) => [i.id, i]));
    const targetMap = new Map(target.map((i) => [i.id, i]));

    for (const [id, idx] of baseMap) {
        if (!targetMap.has(id)) {
            diffs.push({
                kind: "removed",
                indexName: idx.name,
                breaking: false,
                detail: `Index '${idx.name}' dropped`,
            });
        }
    }

    for (const [id, idx] of targetMap) {
        if (!baseMap.has(id)) {
            diffs.push({
                kind: "added",
                indexName: idx.name,
                breaking: false,
                detail: `Index '${idx.name}' (${idx.method}${idx.isUnique ? ", unique" : ""}) added`,
            });
        }
    }

    return diffs;
}

// ─── Full Schema Diff ─────────────────────────────────────────

export function computeSchemaDiff(
    base: { fields: FieldDefinition[]; relations: RelationDefinition[]; indexes: IndexDefinition[] },
    target: { fields: FieldDefinition[]; relations: RelationDefinition[]; indexes: IndexDefinition[] },
): SchemaDiff {
    const fieldDiffs = diffFields(base.fields, target.fields);
    const relationDiffs = diffRelations(base.relations, target.relations);
    const indexDiffs = diffIndexes(base.indexes, target.indexes);

    const allDiffs = [...fieldDiffs, ...relationDiffs, ...indexDiffs];
    const breakingCount = allDiffs.filter((d) => d.breaking).length;
    const totalChanges = allDiffs.length;

    return {
        fields: fieldDiffs,
        relations: relationDiffs,
        indexes: indexDiffs,
        breaking: breakingCount > 0,
        summary: totalChanges === 0
            ? "No changes"
            : `${totalChanges} change${totalChanges === 1 ? "" : "s"}${breakingCount > 0 ? ` (${breakingCount} breaking)` : ""}`,
    };
}
