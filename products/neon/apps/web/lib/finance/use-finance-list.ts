"use client";

// lib/finance/use-finance-list.ts
//
// Data-fetching hooks for finance list pages.
// Each hook follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-invoice-lines.ts.
//
//   usePurchaseInvoiceList(options) -> PaginatedResult<PurchaseInvoiceSummary>
//   usePaymentEntryList(options)    -> PaginatedResult<PaymentEntrySummary>
//   useJournalEntryList(options)    -> PaginatedResult<JournalEntrySummary>

import { useState, useEffect, useCallback, useRef } from "react";
import { finGet } from "./fetcher";
import { FinanceHttpError } from "./errors";
import type {
    PaginatedResult,
    PurchaseInvoiceSummary,
    PaymentEntrySummary,
    JournalEntrySummary,
} from "./types";

// ---------------------------------------------------------------------------
// Shared filter options
// ---------------------------------------------------------------------------

export interface ListFilterOptions {
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
    sort?: string;
    dir?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

export interface UseFinanceListResult<T> {
    data: PaginatedResult<T> | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

// ---------------------------------------------------------------------------
// Internal: build query string from filter options
// ---------------------------------------------------------------------------

function buildQueryString(base: string, options: ListFilterOptions): string {
    const params = new URLSearchParams();

    if (options.limit != null)  params.set("limit", String(options.limit));
    if (options.offset != null) params.set("offset", String(options.offset));
    if (options.status && options.status !== "all") params.set("status", options.status);
    if (options.search) params.set("search", options.search);
    if (options.sort)   params.set("sort", options.sort);
    if (options.dir)    params.set("dir", options.dir);

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Internal: generic list hook
// ---------------------------------------------------------------------------

function useFinanceList<T>(
    basePath: string,
    options: ListFilterOptions,
): UseFinanceListResult<T> {
    const [data, setData] = useState<PaginatedResult<T> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const refreshCounter = useRef(0);

    // Serialise options for dependency tracking
    const optionsKey = JSON.stringify(options);

    const fetchData = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const url = buildQueryString(basePath, options);
            const result = await finGet<PaginatedResult<T>>(url, controller.signal);

            if (controller.signal.aborted) return;

            setData(result);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            if (controller.signal.aborted) return;

            const message =
                err instanceof FinanceHttpError
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Failed to load data";
            setError(message);
            setData(null);
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basePath, optionsKey]);

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

    return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Purchase Invoice List
// ---------------------------------------------------------------------------

export function usePurchaseInvoiceList(
    options: ListFilterOptions = {},
): UseFinanceListResult<PurchaseInvoiceSummary> {
    return useFinanceList<PurchaseInvoiceSummary>(
        "/api/fin/purchase-invoices",
        options,
    );
}

// ---------------------------------------------------------------------------
// Payment Entry List
// ---------------------------------------------------------------------------

export function usePaymentEntryList(
    options: ListFilterOptions = {},
): UseFinanceListResult<PaymentEntrySummary> {
    return useFinanceList<PaymentEntrySummary>(
        "/api/fin/payment-entries",
        options,
    );
}

// ---------------------------------------------------------------------------
// Journal Entry List
// ---------------------------------------------------------------------------

export function useJournalEntryList(
    options: ListFilterOptions = {},
): UseFinanceListResult<JournalEntrySummary> {
    return useFinanceList<JournalEntrySummary>(
        "/api/fin/journal-entries",
        options,
    );
}
