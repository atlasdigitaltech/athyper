// lib/schema-manager/compile-field-constraints.ts
//
// Compiles field-level constraints (isRequired, minLength, maxLength, pattern,
// min, max, enum allowedValues, visibility/editability rules) into
// entity-level ValidationRule[] for unified display in the Validation tab.

import type { FieldDefinition } from "./types";
import type { ValidationRule } from "./use-entity-validation";

/**
 * Compile field-level constraints into entity-level validation rules.
 * These rules have provenance="field" to distinguish from manually created rules.
 */
export function compileFieldConstraints(
    fields: FieldDefinition[],
): ValidationRule[] {
    const rules: ValidationRule[] = [];

    for (const field of fields) {
        // ── isRequired → required rule ──────────────────
        if (field.isRequired) {
            rules.push({
                id: `fc-${field.id}-required`,
                name: `${field.name} is required`,
                kind: "required",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                provenance: "field",
            });
        }

        // ── isUnique → unique rule ──────────────────────
        if (field.isUnique) {
            rules.push({
                id: `fc-${field.id}-unique`,
                name: `${field.name} must be unique`,
                kind: "unique",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                provenance: "field",
            });
        }

        // ── Parse validation JSON for structured constraints ──
        const validation = field.validation as Record<string, unknown> | null;
        if (!validation) continue;

        // minLength / maxLength → length rule
        const minLength = typeof validation.minLength === "number" ? validation.minLength : undefined;
        const maxLength = typeof validation.maxLength === "number" ? validation.maxLength : undefined;
        if (minLength !== undefined || maxLength !== undefined) {
            const parts: string[] = [];
            if (minLength !== undefined) parts.push(`min ${minLength}`);
            if (maxLength !== undefined) parts.push(`max ${maxLength}`);
            rules.push({
                id: `fc-${field.id}-length`,
                name: `${field.name} length (${parts.join(", ")})`,
                kind: "length",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                minLength,
                maxLength,
                provenance: "field",
            });
        }

        // min / max → min_max rule
        const min = typeof validation.min === "number" ? validation.min : undefined;
        const max = typeof validation.max === "number" ? validation.max : undefined;
        if (min !== undefined || max !== undefined) {
            const parts: string[] = [];
            if (min !== undefined) parts.push(`min ${min}`);
            if (max !== undefined) parts.push(`max ${max}`);
            rules.push({
                id: `fc-${field.id}-minmax`,
                name: `${field.name} range (${parts.join(", ")})`,
                kind: "min_max",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                min,
                max,
                provenance: "field",
            });
        }

        // pattern → regex rule
        if (typeof validation.pattern === "string") {
            rules.push({
                id: `fc-${field.id}-regex`,
                name: `${field.name} pattern`,
                kind: "regex",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                pattern: validation.pattern,
                flags: typeof validation.patternFlags === "string" ? validation.patternFlags : undefined,
                provenance: "field",
            });
        }

        // allowedValues → enum rule
        if (Array.isArray(validation.allowedValues) && validation.allowedValues.length > 0) {
            rules.push({
                id: `fc-${field.id}-enum`,
                name: `${field.name} allowed values`,
                kind: "enum",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                allowedValues: validation.allowedValues as string[],
                provenance: "field",
            });
        }

        // minDate / maxDate → date_range rule
        const minDate = typeof validation.minDate === "string" ? validation.minDate : undefined;
        const maxDate = typeof validation.maxDate === "string" ? validation.maxDate : undefined;
        if (minDate || maxDate) {
            rules.push({
                id: `fc-${field.id}-daterange`,
                name: `${field.name} date range`,
                kind: "date_range",
                severity: "error",
                appliesOn: ["create", "update"],
                phase: "beforePersist",
                fieldPath: field.name,
                minDate,
                maxDate,
                provenance: "field",
            });
        }
    }

    return rules;
}
