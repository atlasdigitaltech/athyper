"use client";

// components/mesh/policies/PolicyExplorer.tsx
//
// Policy Studio explorer — enhanced version using the generic list page system.

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createPolicyListConfig } from "./policy-list-config";

import type { PolicySummary } from "./types";

import {
  AdvancedFilterPanel,
  FilterChips,
  ListCommandBar,
  ListPageFooter,
  ListPageHeader,
  ListPageProvider,
  SelectionToolbar,
  ViewRouter,
  useListPage,
} from "@/components/mesh/list";
import { Button } from "@/components/ui/button";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";

// ─── Data Hook ───────────────────────────────────────────────

interface UsePolicyListResult {
  policies: PolicySummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function usePolicyList(): UsePolicyListResult {
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPolicies = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/mesh/policy-studio", {
        headers: buildHeaders(),
        credentials: "same-origin",
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(
          body.error?.message ?? `Failed to load policies (${res.status})`,
        );
      }

      const body = (await res.json()) as { data: PolicySummary[] };
      setPolicies(body.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load policies");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
    return () => abortRef.current?.abort();
  }, [fetchPolicies]);

  return { policies, loading, error, refresh: fetchPolicies };
}

// ─── Inner content (consumes context) ────────────────────────

function PolicyExplorerContent() {
  const { error, refresh } = useListPage<PolicySummary>();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Zone 1 — Page Header */}
      <ListPageHeader<PolicySummary>
        breadcrumbs={[
          { label: "Admin", href: "#" },
          { label: "Mesh" },
          { label: "Policy Explorer" },
        ]}
      />

      {/* Zone 3 — Command Bar */}
      <ListCommandBar<PolicySummary> />

      {/* Filter Chips */}
      <FilterChips<PolicySummary> />

      {/* Zone 3B — Advanced Filters */}
      <AdvancedFilterPanel<PolicySummary> />

      {/* Selection Toolbar */}
      <SelectionToolbar<PolicySummary> />

      {/* Zone 4 — Results (4-view router + preview drawer) */}
      <ViewRouter<PolicySummary> />

      {/* Footer */}
      <ListPageFooter<PolicySummary> />
    </div>
  );
}

// ─── Wrapper (provides context) ──────────────────────────────

interface PolicyExplorerProps {
  basePath: string;
}

export function PolicyExplorer({ basePath }: PolicyExplorerProps) {
  const { policies, loading, error, refresh } = usePolicyList();
  const config = useMemo(() => createPolicyListConfig(basePath), [basePath]);

  return (
    <ListPageProvider<PolicySummary>
      config={config}
      items={policies}
      loading={loading}
      error={error}
      refresh={refresh}
    >
      <PolicyExplorerContent />
    </ListPageProvider>
  );
}
