"use client";

/**
 * Entity Field Metadata Client Hook
 *
 * Fetches field definitions for a single entity type from the BFF.
 * Module-level cache prevents redundant fetches across components.
 *
 * Usage:
 *   const { fields, entityMeta, loading, error } = useEntityFields("purchase-order");
 */

import { useState, useEffect } from "react";

// ============================================================================
// Types (mirrors server-side FieldMeta)
// ============================================================================

export interface FieldMeta {
    name: string;
    columnName: string;
    dataType: string;
    uiType: string | null;
    isRequired: boolean;
    isSearchable: boolean;
    isFilterable: boolean;
    sortOrder: number;
    validation: Record<string, unknown> | null;
    lookupConfig: Record<string, unknown> | null;

    // ── Phase 1: Structured configs & semantic format ──

    /** Semantic format hint (email, money, url, etc.) */
    format: string | null;
    /** Measurement unit */
    unit: string | null;
    /** Field multiplicity: "one" or "many" */
    cardinality: string;
    /** Field origin: "system" or "business" */
    origin: string;
    /** First-class display label */
    label: string | null;
    /** First-class description */
    description: string | null;
    /** Canonical constraints */
    constraints: Record<string, unknown> | null;
    /** Structured enum config */
    enumConfig: Record<string, unknown> | null;
    /** Structured reference config */
    referenceConfig: Record<string, unknown> | null;
    /** JSON field config */
    jsonConfig: Record<string, unknown> | null;
    /** Money config */
    moneyConfig: Record<string, unknown> | null;
    /** Datetime config */
    datetimeConfig: Record<string, unknown> | null;
    /** UI override layer */
    uiHint: Record<string, unknown> | null;
    /** Read-only */
    isReadOnly: boolean;
    /** Computed/derived */
    isComputed: boolean;
    /** Write-once (locked after creation) */
    writeOnce: boolean;
}

export interface EntityFieldsMeta {
    entityName: string;
    kind: string;
    governanceLevel: string;
    entityShort: string | null;
    featureFlags: Record<string, unknown> | null;
    fields: FieldMeta[];
}

// ============================================================================
// Module-Level Cache
// ============================================================================

const cache = new Map<string, EntityFieldsMeta>();
const inflight = new Map<string, Promise<EntityFieldsMeta | null>>();

async function fetchEntityFields(
    entityKey: string,
): Promise<EntityFieldsMeta | null> {
    const cached = cache.get(entityKey);
    if (cached) return cached;

    const existing = inflight.get(entityKey);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const res = await fetch(`/api/entity-meta/${encodeURIComponent(entityKey)}/fields`);
            if (!res.ok) return null;

            const json = (await res.json()) as { data?: EntityFieldsMeta };
            const data = json.data ?? null;
            if (data) {
                cache.set(entityKey, data);
            }
            return data;
        } catch {
            return null;
        } finally {
            inflight.delete(entityKey);
        }
    })();

    inflight.set(entityKey, promise);
    return promise;
}

// ============================================================================
// Hook
// ============================================================================

export function useEntityFields(entityKey: string): {
    fields: FieldMeta[] | null;
    entityMeta: EntityFieldsMeta | null;
    loading: boolean;
    error: string | null;
} {
    const [entityMeta, setEntityMeta] = useState<EntityFieldsMeta | null>(
        () => cache.get(entityKey) ?? null,
    );
    const [loading, setLoading] = useState(!cache.has(entityKey));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!entityKey) return;

        const cached = cache.get(entityKey);
        if (cached) {
            setEntityMeta(cached);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        fetchEntityFields(entityKey).then((result) => {
            if (cancelled) return;
            setEntityMeta(result);
            setLoading(false);
            if (!result) {
                setError(`Failed to load fields for ${entityKey}`);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [entityKey]);

    return {
        fields: entityMeta?.fields ?? null,
        entityMeta,
        loading,
        error,
    };
}

/**
 * Invalidate the field metadata cache.
 */
export function invalidateFieldsCache(entityKey?: string): void {
    if (entityKey) {
        cache.delete(entityKey);
    } else {
        cache.clear();
    }
}
