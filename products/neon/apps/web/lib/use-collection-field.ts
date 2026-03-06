"use client";

/**
 * Collection Field Hook
 *
 * Fetches and manages child rows for a cardinality=many collection field.
 * Uses the generic /api/data/:entity/:id/children/:fieldName endpoint.
 *
 * Usage:
 *   const { rows, childFields, loading, addRow, removeRow, updateRow, save } =
 *     useCollectionField("purchase-invoice", invoiceId, "lines");
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

import type { FieldMeta, EntityFieldsMeta } from "@/lib/use-entity-fields";

// ============================================================================
// Types
// ============================================================================

export interface CollectionRow {
  /** Absent for new (unsaved) rows */
  id?: string;
  /** Tracks client-side state */
  _clientId: string;
  /** Whether this row has been modified since last save */
  _dirty: boolean;
  /** Whether this is a new row (not yet persisted) */
  _isNew: boolean;
  /** Actual field values */
  [key: string]: unknown;
}

export interface CollectionMeta {
  parentEntity: string;
  parentId: string;
  fieldName: string;
  childEntity: string;
  total: number;
  ordering: boolean;
  orderField: string;
}

export interface UseCollectionFieldResult {
  rows: CollectionRow[];
  childFields: FieldMeta[] | null;
  childEntityMeta: EntityFieldsMeta | null;
  collectionMeta: CollectionMeta | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  addRow: (defaults?: Record<string, unknown>) => void;
  removeRow: (clientId: string) => void;
  updateRow: (clientId: string, fieldName: string, value: unknown) => void;
  reorderRows: (fromIndex: number, toIndex: number) => void;
  save: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

// ============================================================================
// Module Cache for Child Entity Fields
// ============================================================================

const childFieldsCache = new Map<string, EntityFieldsMeta>();

async function fetchChildFields(
  childEntityKey: string,
): Promise<EntityFieldsMeta | null> {
  const cached = childFieldsCache.get(childEntityKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `/api/entity-meta/${encodeURIComponent(childEntityKey)}/fields`,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as { data?: EntityFieldsMeta };
    const data = json.data ?? null;
    if (data) {
      childFieldsCache.set(childEntityKey, data);
    }
    return data;
  } catch {
    return null;
  }
}

// ============================================================================
// Hook
// ============================================================================

let clientIdCounter = 0;
function nextClientId(): string {
  return `_new_${++clientIdCounter}_${Date.now()}`;
}

export function useCollectionField(
  parentEntity: string,
  parentId: string | undefined,
  fieldName: string,
  childEntityName: string,
): UseCollectionFieldResult {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [collectionMeta, setCollectionMeta] =
    useState<CollectionMeta | null>(null);
  const [childEntityMeta, setChildEntityMeta] =
    useState<EntityFieldsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track deleted row IDs for batch save
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // ── Fetch child rows + field metadata ──
  const fetchData = useCallback(async () => {
    if (!parentId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [rowsResponse, fieldsData] = await Promise.all([
        fetch(
          `/api/data/${encodeURIComponent(parentEntity)}/${encodeURIComponent(parentId)}/children/${encodeURIComponent(fieldName)}`,
        ).then(async (res) => {
          if (!res.ok) throw new Error(`Failed to load children (${res.status})`);
          return (await res.json()) as {
            data: { data: Record<string, unknown>[]; meta: CollectionMeta };
          };
        }),
        fetchChildFields(childEntityName),
      ]);

      const serverRows = rowsResponse.data.data;
      const meta = rowsResponse.data.meta;

      setCollectionMeta(meta);
      setChildEntityMeta(fieldsData);
      setRows(
        serverRows.map((row) => ({
          ...row,
          _clientId: (row.id as string) ?? nextClientId(),
          _dirty: false,
          _isNew: false,
        })),
      );
      deletedIdsRef.current.clear();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load collection";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [parentEntity, parentId, fieldName, childEntityName]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Row operations ──

  const addRow = useCallback(
    (defaults?: Record<string, unknown>) => {
      setRows((prev) => [
        ...prev,
        {
          ...defaults,
          _clientId: nextClientId(),
          _dirty: true,
          _isNew: true,
        },
      ]);
    },
    [],
  );

  const removeRow = useCallback((clientId: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r._clientId === clientId);
      if (row?.id) {
        deletedIdsRef.current.add(row.id);
      }
      return prev.filter((r) => r._clientId !== clientId);
    });
  }, []);

  const updateRow = useCallback(
    (clientId: string, field: string, value: unknown) => {
      setRows((prev) =>
        prev.map((r) =>
          r._clientId === clientId
            ? { ...r, [field]: value, _dirty: true }
            : r,
        ),
      );
    },
    [],
  );

  const reorderRows = useCallback((fromIndex: number, toIndex: number) => {
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((r) => ({ ...r, _dirty: true }));
    });
  }, []);

  // ── Save (diff-based batch) ──

  const save = useCallback(async (): Promise<boolean> => {
    if (!parentId) return false;

    setSaving(true);
    try {
      // Build payload: strip client-side markers
      const payloadRows = rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
          if (key.startsWith("_")) continue;
          clean[key] = val;
        }
        return clean;
      });

      const deleteIds = [...deletedIdsRef.current];

      const res = await fetch(
        `/api/data/${encodeURIComponent(parentEntity)}/${encodeURIComponent(parentId)}/children/${encodeURIComponent(fieldName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ rows: payloadRows, deleteIds }),
        },
      );

      if (!res.ok) {
        const errorBody = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          errorBody.error?.message ?? `Save failed (${res.status})`,
        );
      }

      toast.success("Collection saved");

      // Refresh to get server-generated IDs and updated state
      await fetchData();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [parentEntity, parentId, fieldName, rows, fetchData]);

  return {
    rows,
    childFields: childEntityMeta?.fields ?? null,
    childEntityMeta,
    collectionMeta,
    loading,
    saving,
    error,
    addRow,
    removeRow,
    updateRow,
    reorderRows,
    save,
    refresh: fetchData,
  };
}
