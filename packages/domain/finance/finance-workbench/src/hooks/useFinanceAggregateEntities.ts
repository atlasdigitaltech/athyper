"use client";

import { useQueries } from "@tanstack/react-query";

export interface AggregateEntityDefinition {
  entityCode: string;
  label: string;
  description: string;
  role: "root" | "child" | "reference";
}

export interface AggregateRuntimeRecord {
  id: string;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface AggregateEntityResult extends AggregateEntityDefinition {
  records: AggregateRuntimeRecord[];
  isLoading: boolean;
  isFetched: boolean;
  error: Error | null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeRecord(value: unknown): AggregateRuntimeRecord | null {
  const raw = objectValue(value);
  const data = { ...raw, ...objectValue(raw["data"]) };
  const id = String(data["id"] ?? raw["id"] ?? "");
  return id ? { id, data, raw } : null;
}

async function fetchEntity(entityCode: string): Promise<AggregateRuntimeRecord[]> {
  const params = new URLSearchParams({ page: "1", page_size: "100" });
  const response = await fetch(`/api/runtime/v1/entities/${encodeURIComponent(entityCode)}?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(String(body?.["message"] ?? `${entityCode} returned ${response.status}`));
  const source = Array.isArray(body?.["records"])
    ? body?.["records"] as unknown[]
    : Array.isArray(body?.["data"])
      ? body?.["data"] as unknown[]
      : [];
  return source.map(normalizeRecord).filter((record): record is AggregateRuntimeRecord => Boolean(record));
}

export function useFinanceAggregateEntities(definitions: AggregateEntityDefinition[], enabledEntityCodes?: readonly string[]): AggregateEntityResult[] {
  const enabled = enabledEntityCodes ? new Set(enabledEntityCodes) : null;
  const queries = useQueries({
    queries: definitions.map((definition) => ({
      queryKey: ["finance", "stage7", "aggregate", definition.entityCode],
      queryFn: () => fetchEntity(definition.entityCode),
      enabled: enabled ? enabled.has(definition.entityCode) : true,
      staleTime: 30_000,
      retry: false,
    })),
  });

  return definitions.map((definition, index) => ({
    ...definition,
    records: queries[index]?.data ?? [],
    isLoading: queries[index]?.isLoading ?? false,
    isFetched: queries[index]?.isFetched ?? false,
    error: queries[index]?.error instanceof Error ? queries[index]!.error : null,
  }));
}
