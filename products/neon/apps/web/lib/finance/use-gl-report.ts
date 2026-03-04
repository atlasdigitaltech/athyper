"use client";

// lib/finance/use-gl-report.ts
//
// Data-fetching hook for the GL report with tab-aware loading.
// Only fetches data for the active tab to minimise unnecessary API calls.
//
// GET /api/fin/gl/summary        -> GLSummaryRowDTO[]
// GET /api/fin/gl/detail         -> GLDetailRowDTO[]   (paginated)
// GET /api/fin/gl/trial-balance  -> TrialBalanceRowDTO[]
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-entity-data.ts.

import { useState, useEffect, useCallback, useRef } from "react";
import { finGet } from "./fetcher";
import { FinanceHttpError } from "./errors";
import type {
    GLReportFilters,
    GLSummaryRowDTO,
    GLDetailRowDTO,
    TrialBalanceRowDTO,
    PaginatedResult,
} from "./types";

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

export type GLReportTab = "summary" | "detail" | "trial-balance";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseGLReportResult {
    summaryRows: GLSummaryRowDTO[];
    detailRows: GLDetailRowDTO[];
    trialBalanceRows: TrialBalanceRowDTO[];
    loading: boolean;
    error: string | null;
    filters: GLReportFilters;
    setFilters: (filters: GLReportFilters) => void;
    activeTab: GLReportTab;
    setActiveTab: (tab: GLReportTab) => void;
    refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilterParams(filters: GLReportFilters): URLSearchParams {
    const params = new URLSearchParams();
    params.set("entityCode", filters.entityCode);
    params.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber != null) params.set("periodNumber", String(filters.periodNumber));
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.costCenterId) params.set("costCenterId", filters.costCenterId);
    if (filters.accountType) params.set("accountType", filters.accountType);
    if (filters.reversalMode) params.set("reversalMode", filters.reversalMode);
    return params;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGLReport(initialFilters: GLReportFilters): UseGLReportResult {
    const [filters, setFilters] = useState<GLReportFilters>(initialFilters);
    const [activeTab, setActiveTab] = useState<GLReportTab>("summary");

    const [summaryRows, setSummaryRows] = useState<GLSummaryRowDTO[]>([]);
    const [detailRows, setDetailRows] = useState<GLDetailRowDTO[]>([]);
    const [trialBalanceRows, setTrialBalanceRows] = useState<TrialBalanceRowDTO[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const refreshCounter = useRef(0);

    // ── Fetch only the active tab's data ──────────────────────────────
    const fetchData = useCallback(async () => {
        // Cancel any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const params = buildFilterParams(filters);
            const qs = params.toString();

            switch (activeTab) {
                case "summary": {
                    const data = await finGet<GLSummaryRowDTO[]>(
                        `/api/fin/gl/summary?${qs}`,
                        controller.signal,
                    );
                    if (controller.signal.aborted) return;
                    setSummaryRows(data);
                    break;
                }
                case "detail": {
                    const data = await finGet<PaginatedResult<GLDetailRowDTO>>(
                        `/api/fin/gl/detail?${qs}`,
                        controller.signal,
                    );
                    if (controller.signal.aborted) return;
                    setDetailRows(data.items);
                    break;
                }
                case "trial-balance": {
                    const data = await finGet<TrialBalanceRowDTO[]>(
                        `/api/fin/gl/trial-balance?${qs}`,
                        controller.signal,
                    );
                    if (controller.signal.aborted) return;
                    setTrialBalanceRows(data);
                    break;
                }
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            if (controller.signal.aborted) return;

            const message =
                err instanceof FinanceHttpError
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Failed to load GL report data";
            setError(message);
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [filters, activeTab]);

    useEffect(() => {
        fetchData();
        return () => {
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchData, refreshCounter.current]);

    const refresh = useCallback(() => {
        refreshCounter.current += 1;
        fetchData();
    }, [fetchData]);

    return {
        summaryRows,
        detailRows,
        trialBalanceRows,
        loading,
        error,
        filters,
        setFilters,
        activeTab,
        setActiveTab,
        refresh,
    };
}
