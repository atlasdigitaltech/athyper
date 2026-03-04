"use client";

// lib/finance/use-payment-allocations.ts
//
// Data-fetching hook for payment allocations and unpaid invoices.
// GET  /api/fin/payments/:id                      -> payment with allocations
// GET  /api/fin/payments/:id/allocations/unpaid   -> UnpaidInvoiceDTO[]
// POST /api/fin/payments/:id/allocations          -> save allocations
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-entity-data.ts.

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost } from "./fetcher";

import type {
  PaymentAllocationDTO,
  UnpaidInvoiceDTO,
  CreateAllocationInput,
} from "./types";

// ---------------------------------------------------------------------------
// Payment detail shape (allocations are embedded in the payment response)
// ---------------------------------------------------------------------------

interface PaymentDetailResponse {
  id: string;
  paymentNumber: string;
  totalAmount: string;
  currencyCode: string;
  status: string;
  version: number;
  allocations: PaymentAllocationDTO[];
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UsePaymentAllocationsResult {
  allocations: PaymentAllocationDTO[];
  unpaidInvoices: UnpaidInvoiceDTO[];
  paymentTotal: string;
  currencyCode: string;
  loading: boolean;
  error: string | null;
  saveAllocations: (
    allocations: CreateAllocationInput[],
    version: number,
  ) => Promise<void>;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaymentAllocations(
  paymentId: string | undefined,
): UsePaymentAllocationsResult {
  const [allocations, setAllocations] = useState<PaymentAllocationDTO[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoiceDTO[]>([]);
  const [paymentTotal, setPaymentTotal] = useState("0");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  // ── Fetch payment detail + unpaid invoices in parallel ────────────
  const fetchData = useCallback(async () => {
    if (!paymentId) {
      setAllocations([]);
      setUnpaidInvoices([]);
      setPaymentTotal("0");
      setCurrencyCode("USD");
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
      const paymentUrl = `/api/fin/payments/${encodeURIComponent(paymentId)}`;
      const unpaidUrl = `/api/fin/payments/${encodeURIComponent(paymentId)}/allocations/unpaid`;

      const [paymentData, unpaidData] = await Promise.all([
        finGet<PaymentDetailResponse>(paymentUrl, controller.signal),
        finGet<UnpaidInvoiceDTO[]>(unpaidUrl, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      setAllocations(paymentData.allocations);
      setPaymentTotal(paymentData.totalAmount);
      setCurrencyCode(paymentData.currencyCode);
      setUnpaidInvoices(unpaidData);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load payment allocations";
      setError(message);
      setAllocations([]);
      setUnpaidInvoices([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [paymentId]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  // ── Save allocations ──────────────────────────────────────────────
  const saveAllocations = useCallback(
    async (inputAllocations: CreateAllocationInput[], version: number) => {
      if (!paymentId) return;

      setError(null);

      try {
        const url = `/api/fin/payments/${encodeURIComponent(paymentId)}/allocations`;
        await finPost<{ ok: boolean }>(url, {
          allocations: inputAllocations,
          version,
        });
        // Re-fetch after successful save
        refreshCounter.current += 1;
        await fetchData();
      } catch (err) {
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to save allocations";
        setError(message);
        throw err;
      }
    },
    [paymentId, fetchData],
  );

  // ── Manual refresh ────────────────────────────────────────────────
  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return {
    allocations,
    unpaidInvoices,
    paymentTotal,
    currencyCode,
    loading,
    error,
    saveAllocations,
    refresh,
  };
}
