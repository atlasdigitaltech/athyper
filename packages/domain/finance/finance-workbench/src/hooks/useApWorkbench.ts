"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// ── AP Invoice detail ─────────────────────────────────────────────────────────

export interface ApInvoiceLine {
  id: string;
  line_no: number;
  item_description: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_amount: number;
}

export interface ApInvoiceAllocation {
  id: string;
  allocatedAmount: number;
  netPaymentAmount: number;
  paymentNumber: string;
  postingDate: string | null;
  paymentStatus: string;
}

export interface ApInvoiceDetail extends ApInvoice {
  description: string | null;
  tax_amount: number;
  lines: ApInvoiceLine[];
  allocations: ApInvoiceAllocation[];
}

export function useApInvoiceDetail(invoiceId: string | null) {
  return useQuery<ApInvoiceDetail>({
    queryKey: ["finance", "ap", "invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ap/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to load invoice detail");
      return res.json() as Promise<ApInvoiceDetail>;
    },
    enabled: !!invoiceId,
    staleTime: 30 * 1000,
  });
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

// ── AP Payment methods ────────────────────────────────────────────────────────

export interface ApPaymentMethod {
  id:        string;
  code:      string;
  name:      string;
  direction: string;
}

export function useApPaymentMethods() {
  return useQuery<{ items: ApPaymentMethod[] }>({
    queryKey: ["finance", "ap", "payment-methods"],
    queryFn: async () => {
      const res = await fetch("/api/finance/ap/payment-methods");
      if (!res.ok) throw new Error("Failed to load payment methods");
      return res.json() as Promise<{ items: ApPaymentMethod[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Create AP payment ─────────────────────────────────────────────────────────

export interface CreateApPaymentPayload {
  invoice_id:        string;
  payment_method_id: string;
  value_date?:       string;
  notes?:            string;
}

export interface CreateApPaymentResult {
  payment_entry_id: string;
  payment_number:   string;
  status:           string;
}

export function useCreateApPayment() {
  const queryClient = useQueryClient();

  return useMutation<CreateApPaymentResult, Error, CreateApPaymentPayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/finance/ap/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to create payment"));
      }
      return res.json() as Promise<CreateApPaymentResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices"] });
    },
  });
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

// ── AR Invoices ───────────────────────────────────────────────────────────────

export interface ArInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currencyCode: string;
  totalAmount: number;
  receivableAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: string;
  fiscalYear: number;
  periodNumber: number;
  postingDate: string | null;
  isPosted: boolean;
  isVoided: boolean;
}

export interface ArInvoicesData {
  items: ArInvoice[];
  total: number;
  /** True when the sales module is not yet activated (sales_invoice table missing). */
  _inactive?: boolean;
}

export function useArInvoices(
  scope: FinanceScope,
  opts?: { status?: string; page?: number; limit?: number },
) {
  const params = buildPageParams(scope, opts);
  if (opts?.status) params.set("status", opts.status);

  return useQuery<ArInvoicesData>({
    queryKey: ["finance", "ar", "invoices", ...scopeCacheKey(scope), opts?.status ?? "all", opts?.page ?? 1],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ar/invoices?${params}`);
      if (!res.ok) throw new Error("Failed to load AR invoices");
      return res.json() as Promise<ArInvoicesData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}

// ── AR Payment methods ────────────────────────────────────────────────────────

export interface ArPaymentMethod {
  id:        string;
  code:      string;
  name:      string;
  direction: string;
}

export function useArPaymentMethods() {
  return useQuery<{ items: ArPaymentMethod[] }>({
    queryKey: ["finance", "ar", "payment-methods"],
    queryFn: async () => {
      const res = await fetch("/api/finance/ar/payment-methods");
      if (!res.ok) throw new Error("Failed to load AR payment methods");
      return res.json() as Promise<{ items: ArPaymentMethod[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Create AR Receipt ─────────────────────────────────────────────────────────

export interface CreateArReceiptPayload {
  payment_method_id:  string;
  payment_amount:     number;
  currency_code:      string;
  counterparty_name:  string;
  value_date?:        string;
  payment_reference?: string;
  notes?:             string;
}

export interface CreateArReceiptResult {
  payment_entry_id: string;
  payment_number:   string;
  status:           string;
}

export function useCreateArReceipt(scope: FinanceScope) {
  const queryClient = useQueryClient();
  const params = scopeToParams(scope);

  return useMutation<CreateArReceiptResult, Error, CreateArReceiptPayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/finance/ar/receipts?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to create receipt"));
      }
      return res.json() as Promise<CreateArReceiptResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ar", "receipts"] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "ar", "invoices"] });
    },
  });
}
