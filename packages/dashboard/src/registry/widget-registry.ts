/**
 * WidgetRegistry — code-owned registry of allowed widget types.
 *
 * Widget types are registered at startup. The registry provides:
 * - Type validation (is this a known widget type?)
 * - Param validation (does the config match the schema?)
 * - Widget metadata (icon, label, description, default size)
 *
 * NO user-defined JavaScript in DB — only declarative JSON.
 */

import type { WidgetDefinition, WidgetType } from "../types/widget.types.js";

export class WidgetRegistry {
    private widgets = new Map<string, WidgetDefinition>();

    /**
     * Register a widget type definition.
     * @throws if the type is already registered
     */
    register(def: WidgetDefinition): void {
        if (this.widgets.has(def.type)) {
            throw new Error(`Widget type "${def.type}" is already registered`);
        }
        this.widgets.set(def.type, def);
    }

    /**
     * Get a widget definition by type.
     * Returns undefined for unknown types (caller should render fallback).
     */
    get(type: string): WidgetDefinition | undefined {
        return this.widgets.get(type);
    }

    /**
     * Check if a widget type is registered.
     */
    has(type: string): boolean {
        return this.widgets.has(type);
    }

    /**
     * List all registered widget definitions.
     */
    list(): WidgetDefinition[] {
        return Array.from(this.widgets.values());
    }

    /**
     * Validate params for a given widget type.
     * Returns `{ success: true, data }` or `{ success: false, error }`.
     */
    validate(type: string, params: unknown): { success: boolean; error?: string } {
        const def = this.widgets.get(type);
        if (!def) {
            return { success: false, error: `Unknown widget type: "${type}"` };
        }

        const result = def.paramsSchema.safeParse(params);
        if (!result.success) {
            return {
                success: false,
                error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
            };
        }

        return { success: true };
    }

    /**
     * Get all registered widget type keys.
     */
    types(): WidgetType[] {
        return Array.from(this.widgets.keys()) as WidgetType[];
    }
}
