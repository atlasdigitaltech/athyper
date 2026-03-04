/**
 * Mapping Engine — transform payloads between internal and external formats.
 * JSON-path based field mapping with value transformations.
 */

import type { Logger } from "../../../../../kernel/logger.js";

export interface MappingSpec {
    fields: FieldMapping[];
    defaults?: Record<string, unknown>;
}

export interface FieldMapping {
    source: string;
    target: string;
    transform?: "string" | "number" | "boolean" | "json" | "template";
    template?: string;
    defaultValue?: unknown;
}

export class MappingEngine {
    constructor(private readonly logger: Logger) {}

    /**
     * Transform input according to a mapping spec.
     */
    transform(input: Record<string, unknown>, mapping: MappingSpec): Record<string, unknown> {
        const output: Record<string, unknown> = {};

        // Apply defaults first
        if (mapping.defaults) {
            for (const [key, value] of Object.entries(mapping.defaults)) {
                this.setPath(output, key, value);
            }
        }

        // Apply field mappings
        for (const field of mapping.fields) {
            let value = this.getPath(input, field.source);

            if (value === undefined) {
                if (field.defaultValue !== undefined) {
                    value = field.defaultValue;
                } else {
                    continue;
                }
            }

            if (field.transform) {
                value = this.applyTransform(value, field);
            }

            this.setPath(output, field.target, value);
        }

        return output;
    }

    /**
     * Evaluate a dot-notation JSON path against an object.
     * Supports: "data.user.name", "items[0].id", "$.data.value"
     */
    getPath(obj: Record<string, unknown>, path: string): unknown {
        const cleanPath = path.startsWith("$.") ? path.slice(2) : path;
        const segments = this.parsePath(cleanPath);

        let current: unknown = obj;
        for (const seg of segments) {
            if (current == null) return undefined;
            if (typeof seg === "number" && Array.isArray(current)) {
                current = current[seg];
            } else if (typeof current === "object") {
                current = (current as Record<string, unknown>)[String(seg)];
            } else {
                return undefined;
            }
        }
        return current;
    }

    private setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
        const cleanPath = path.startsWith("$.") ? path.slice(2) : path;
        const segments = this.parsePath(cleanPath);

        let current: any = obj;
        for (let i = 0; i < segments.length - 1; i++) {
            const seg = segments[i];
            const nextSeg = segments[i + 1];
            const key = String(seg);

            if (current[key] == null) {
                current[key] = typeof nextSeg === "number" ? [] : {};
            }
            current = current[key];
        }

        const lastSeg = segments[segments.length - 1];
        current[String(lastSeg)] = value;
    }

    private parsePath(path: string): (string | number)[] {
        const segments: (string | number)[] = [];
        const parts = path.split(".");

        for (const part of parts) {
            const match = part.match(/^([^[]+)\[(\d+)]$/);
            if (match) {
                segments.push(match[1]);
                segments.push(parseInt(match[2], 10));
            } else {
                segments.push(part);
            }
        }
        return segments;
    }

    private applyTransform(value: unknown, field: FieldMapping): unknown {
        switch (field.transform) {
            case "string":
                return String(value);
            case "number": {
                const n = Number(value);
                return isNaN(n) ? field.defaultValue ?? 0 : n;
            }
            case "boolean":
                return Boolean(value);
            case "json":
                return typeof value === "string" ? JSON.parse(value) : value;
            case "template":
                if (field.template) {
                    return field.template.replace(/\{\{value}}/g, String(value));
                }
                return value;
            default:
                return value;
        }
    }
}
