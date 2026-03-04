"use client";

// lib/finance/use-invoice-lines.ts
//
// Data-fetching hook for purchase invoice lines.
// GET  /api/fin/purchase-invoices/:id/lines          -> InvoiceLineDTO[]
// GET  /api/fin/purchase-invoices/:id/lines/defaults  -> InvoiceLineDefaults
// POST /api/fin/purchase-invoices/:id/lines           -> save
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-entity-data.ts.

import { useState, useEffect, useCallback, useRef } from "react";
import { finGet, finPost } from "./fetcher";
import { FinanceHttpError } from "./errors";
import type { InvoiceLineDTO, InvoiceLineDefaults, CreateInvoiceLineInput } from "./types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseInvoiceLinesResult {
    lines: InvoiceLineDTO[];
    defaults: InvoiceLineDefaults | null;
    loading: boolean;
    error: string | null;
    saveLines: (lines: CreateInvoiceLineInput[], version: number) => Promise<void>;
    refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInvoiceLines(invoiceId: string | undefined): UseInvoiceLinesResult {
    const [lines, setLines] = useState<InvoiceLineDTO[]>([]);
    const [defaults, setDefaults] = useState<InvoiceLineDefaults | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const refreshCounter = useRef(0);

    // ── Fetch lines + defaults in parallel ────────────────────────────
    const fetchData = useCallback(async () => {
        if (!invoiceId) {
            setLines([]);
            setDefaults(null);
            setLoading(false);
            return;
        }

        // Cancel any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const baseUrl = `/api/fin/purchase-invoices/${encodeURIComponent(invoiceId)}/lines`;

            const [linesData, defaultsData] = await Promise.all([
                finGet<InvoiceLineDTO[]>(baseUrl, controller.signal),
                finGet<InvoiceLineDefaults>(`${baseUrl}/defaults`, controller.signal),
            ]);

            if (controller.signal.aborted) return;

            setLines(linesData);
            setDefaults(defaultsData);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            if (controller.signal.aborted) return;

            const message =
                err instanceof FinanceHttpError
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : "Failed to load invoice lines";
            setError(message);
            setLines([]);
            setDefaults(null);
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [invoiceId]);

    useEffect(() => {
        fetchData();
        return () => {
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchData, refreshCounter.current]);

    // ── Save lines ────────────────────────────────────────────────────
    const saveLines = useCallback(
        async (inputLines: CreateInvoiceLineInput[], version: number) => {
            if (!invoiceId) return;

            setError(null);

            try {
                const url = `/api/fin/purchase-invoices/${encodeURIComponent(invoiceId)}/lines`;
                await finPost<{ ok: boolean }>(url, { lines: inputLines, version });
                // Re-fetch after successful save
                refreshCounter.current += 1;
                await fetchData();
            } catch (err) {
                const message =
                    err instanceof FinanceHttpError
                        ? err.message
                        : err instanceof Error
                            ? err.message
                            : "Failed to save invoice lines";
                setError(message);
                throw err;
            }
        },
        [invoiceId, fetchData],
    );

    // ── Manual refresh ────────────────────────────────────────────────
    const refresh = useCallback(() => {
        refreshCounter.current += 1;
        fetchData();
    }, [fetchData]);

    return { lines, defaults, loading, error, saveLines, refresh };
}
