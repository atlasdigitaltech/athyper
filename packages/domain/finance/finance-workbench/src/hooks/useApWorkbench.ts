"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey, scopeToParams } from "../lib/scope";

function buildPageParams(scope: FinanceScope, opts?: { page?: number; limit?: number }): URLSearchParams {
  const params = scopeToParams(scope);
  const limit = opts?.limit ?? 50;
  const page = opts?.page ?? 1;
  params.set("limit", String(limit));
  params.set("offset", String((page - 1) * limit));
  return params;
}

// ── AP Invoice ────────────────────────────────────────────────────────────────

export interface ApInvoice {
  id: string;
  invoiceNumber: string;
  invoiceSource: string;
  supplierId: string | null;
  supplierName: string | null;
  invoiceDate: string;
  dueDate: string | null;
  payableAmount: number;
  outstandingAmount: number;
  currencyCode: string;
  status: string;
  fiscalYear: number;
  periodNumber: number;
  postingDate: string | null;
  isPosted: boolean;
  isVoided: boolean;
}

export interface ApInvoicesData {
  items: ApInvoice[];
  total: number;
}

export function useApInvoices(
  scope: FinanceScope,
  opts?: { status?: string; page?: number; limit?: number },
) {
  const params = buildPageParams(scope, opts);
  if (opts?.status) params.set("status", opts.status);

  return useQuery<ApInvoicesData>({
    queryKey: ["finance", "ap", "invoices", ...scopeCacheKey(scope), opts?.status ?? "all", opts?.page ?? 1],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ap/invoices?${params}`);
      if (!res.ok) throw new Error("Failed to load AP invoices");
      return res.json() as Promise<ApInvoicesData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}

// ── AP Payments ───────────────────────────────────────────────────────────────

export interface ApPayment {
  id: string;
  paymentNumber: string;
  paymentType: string;
  supplierName: string | null;
  paymentAmount: number;
  currencyCode: string;
  valueDate: string;
  postingDate: string | null;
  paymentReference: string | null;
  isPosted: boolean;
  status: string;
}

export interface ApPaymentsData {
  items: ApPayment[];
  total: number;
}

export function useApPayments(
  scope: FinanceScope,
  opts?: { page?: number; limit?: number },
) {
  const params = buildPageParams(scope, opts);

  return useQuery<ApPaymentsData>({
    queryKey: ["finance", "ap", "payments", ...scopeCacheKey(scope), opts?.page ?? 1],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ap/payments?${params}`);
      if (!res.ok) throw new Error("Failed to load AP payments");
      return res.json() as Promise<ApPaymentsData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}

// ── AP Aging ──────────────────────────────────────────────────────────────────

export interface ApAgingRow {
  supplierId: string | null;
  supplierName: string | null;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface ApAgingData {
  rows: ApAgingRow[];
  asAt: string;
}

export function useApAging(scope: FinanceScope) {
  return useQuery<ApAgingData>({
    queryKey: ["finance", "ap", "aging", ...scopeCacheKey(scope)],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ap/aging?${scopeToParams(scope)}`);
      if (!res.ok) throw new Error("Failed to load AP aging");
      return res.json() as Promise<ApAgingData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}

// ── AR Aging ──────────────────────────────────────────────────────────────────

export interface ArAgingRow {
  customerId:   string | null;
  customerName: string | null;
  current:      number;
  days1to30:    number;
  days31to60:   number;
  days61to90:   number;
  over90:       number;
  total:        number;
}

export interface ArAgingData {
  rows: ArAgingRow[];
  asAt: string;
}

export function useArAging(scope: FinanceScope) {
  return useQuery<ArAgingData>({
    queryKey: ["finance", "ar", "aging", ...scopeCacheKey(scope)],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ar/aging?${scopeToParams(scope)}`);
      if (!res.ok) throw new Error("Failed to load AR aging");
      return res.json() as Promise<ArAgingData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}

// ── AR Receipts ───────────────────────────────────────────────────────────────

export interface ArReceipt {
  id: string;
  paymentNumber: string;
  paymentType: string;
  counterpartyName: string | null;
  paymentAmount: number;
  currencyCode: string;
  valueDate: string;
  postingDate: string | null;
  paymentReference: string | null;
  isPosted: boolean;
  status: string;
}

export interface ArReceiptsData {
  items: ArReceipt[];
  total: number;
}

export function useArReceipts(
  scope: FinanceScope,
  opts?: { page?: number; limit?: number },
) {
  const params = buildPageParams(scope, opts);

  return useQuery<ArReceiptsData>({
    queryKey: ["finance", "ar", "receipts", ...scopeCacheKey(scope), opts?.page ?? 1],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ar/receipts?${params}`);
      if (!res.ok) throw new Error("Failed to load AR receipts");
      return res.json() as Promise<ArReceiptsData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}
