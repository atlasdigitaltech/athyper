// lib/schema-manager/bulk-ops.ts
//
// Bulk import/export operations for entity schemas.

import type { EntitySummary, FieldDefinition, IndexDefinition, OverlayDefinition, RelationDefinition } from "./types";

// ─── Schema Bundle ────────────────────────────────────────────

export interface EntitySchemaBundle {
    version: "1.0";
    exportedAt: string;
    entity: EntitySummary;
    fields: FieldDefinition[];
    relations: RelationDefinition[];
    indexes: IndexDefinition[];
    overlays: OverlayDefinition[];
}

/**
 * Build a portable schema bundle from entity data.
 */
export function buildEntityBundle(
    entity: EntitySummary,
    fields: FieldDefinition[],
    relations: RelationDefinition[],
    indexes: IndexDefinition[],
    overlays: OverlayDefinition[],
): EntitySchemaBundle {
    return {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        entity,
        fields,
        relations,
        indexes,
        overlays,
    };
}

/**
 * Download a bundle as a JSON file.
 */
export function downloadBundle(bundle: EntitySchemaBundle): void {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.entity.name}-schema-v${bundle.entity.currentVersion?.versionNo ?? 0}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── CSV Import ───────────────────────────────────────────────

export interface CsvFieldRow {
    name: string;
    columnName: string;
    dataType: string;
    uiType: string;
    isRequired: string;
    isUnique: string;
    isSearchable: string;
    isFilterable: string;
    defaultValue: string;
}

/**
 * Parse a CSV string into field definitions for import.
 * Expects headers: name,columnName,dataType,uiType,isRequired,isUnique,isSearchable,isFilterable,defaultValue
 */
export function parseCsvFields(csv: string): { fields: Partial<FieldDefinition>[]; errors: string[] } {
    const lines = csv.trim().split("\n");
    if (lines.length < 2) {
        return { fields: [], errors: ["CSV must have a header row and at least one data row"] };
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const expectedHeaders = ["name", "columnname", "datatype"];
    for (const eh of expectedHeaders) {
        if (!headers.includes(eh)) {
            return { fields: [], errors: [`Missing required column: ${eh}`] };
        }
    }

    const fields: Partial<FieldDefinition>[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j] ?? "";
        }

        if (!row.name) {
            errors.push(`Row ${i + 1}: missing name`);
            continue;
        }

        fields.push({
            name: row.name,
            columnName: row.columnname || row.name,
            dataType: row.datatype || "string",
            uiType: row.uitype || null,
            isRequired: row.isrequired === "true",
            isUnique: row.isunique === "true",
            isSearchable: row.issearchable === "true",
            isFilterable: row.isfilterable === "true",
            defaultValue: row.defaultvalue || undefined,
        });
    }

    return { fields, errors };
}

/**
 * Parse a JSON array of field definitions for import.
 */
export function parseJsonFields(json: string): { fields: Partial<FieldDefinition>[]; errors: string[] } {
    try {
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) {
            return { fields: [], errors: ["JSON must be an array of field definitions"] };
        }

        const fields: Partial<FieldDefinition>[] = [];
        const errors: string[] = [];

        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i] as Record<string, unknown>;
            if (!item.name || typeof item.name !== "string") {
                errors.push(`Item ${i}: missing or invalid 'name'`);
                continue;
            }
            fields.push({
                name: item.name as string,
                columnName: (item.columnName as string) || (item.name as string),
                dataType: (item.dataType as string) || "string",
                uiType: (item.uiType as string) || null,
                isRequired: item.isRequired === true,
                isUnique: item.isUnique === true,
                isSearchable: item.isSearchable === true,
                isFilterable: item.isFilterable === true,
                defaultValue: item.defaultValue,
            });
        }

        return { fields, errors };
    } catch (err) {
        return { fields: [], errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
    }
}
