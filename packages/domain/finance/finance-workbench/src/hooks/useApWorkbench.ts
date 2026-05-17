"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scopeCacheKey, scopeToParams, type FinanceScope } from "../lib/scope";


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
  invoiceType: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string | null;
  commitmentId: string | null;
  invoiceDate: string;
  documentDate: string | null;
  dueDate: string | null;
  baselineDate: string | null;
  receivedDate: string | null;
  payableAmount: number;
  outstandingAmount: number;
  subtotalAmount: number;
  taxAmount: number;
  withholdingTaxAmount: number;
  totalAmount: number;
  paidAmount: number;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number | null;
  status: string;
  fiscalYear: number;
  periodNumber: number;
  postingDate: string | null;
  isPosted: boolean;
  isVoided: boolean;
  isReversal: boolean;
  reversalOfId: string | null;
  isCreditNote: boolean;
  matchType: string;
  matchStatus: string;
  workflowRequestId: string | null;
  apJeId: string | null;
  isOnHold: boolean;
  holdReason: string | null;
  paymentTermId: string | null;
  paymentMethodId: string | null;
  budgetAllocationId: string | null;
  budgetCheckResult: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  projectId: string | null;
  lineCount: number;
  notes: string | null;
  tags: string[];
  created_at: string;
  created_by: string;
  updated_at: string | null;
  companyCodeId: string;
}

export interface ApInvoicesData {
  items: ApInvoice[];
  total: number;
}

// ── AP Invoice detail ─────────────────────────────────────────────────────────

export interface ApInvoiceLine {
  id: string;
  line_no: number;
  item_id: string | null;
  item_description: string;
  procurement_type: string;
  uom_code: string;
  quantity: number;
  unit_price: number;
  price_unit: number;
  net_amount: number;
  discount_pct: number | null;
  discount_amount: number | null;
  tax_group_id: string | null;
  tax_amount: number;
  withholding_tax_group_id: string | null;
  withholding_tax_amount: number;
  gross_amount: number;
  commodity_category_id: string | null;
  business_intent_id: string | null;
  cost_center_id: string | null;
  profit_center_id: string | null;
  project_id: string | null;
  site_id: string | null;
  is_asset: boolean;
  asset_category_id: string | null;
  commitment_line_id: string | null;
  goods_receipt_line_id: string | null;
  ses_line_id: string | null;
  matched_quantity: number;
  match_status: string;
  notes: string | null;
  status: string;
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

// ── AP Invoice write mutations ─────────────────────────────────────────────────

export interface CreateApInvoicePayload {
  invoice_source:          string;
  invoice_type?:           string;
  company_code_id:         string;
  supplier_id?:            string;
  commitment_id?:          string;
  document_date?:          string;
  currency_code:           string;
  payment_term_id?:        string;
  payment_method_id?:      string;
  notes?:                  string;
  tags?:                   string[];
  /** Set by BFF from X-Idempotency-Key header */
  idempotency_key?:        string;
}

export interface CreateApInvoiceResult {
  id:             string;
  invoice_number: string;
  status:         string;
}

export function useCreateApInvoice(scope: FinanceScope) {
  const queryClient = useQueryClient();
  const params = scopeToParams(scope);

  return useMutation<CreateApInvoiceResult, Error, CreateApInvoicePayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/finance/ap/invoices?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to create invoice"));
      }
      return res.json() as Promise<CreateApInvoiceResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices"] });
    },
  });
}

export interface UpdateApInvoicePayload {
  supplier_invoice_number?: string;
  supplier_invoice_date?:   string;
  document_date?:           string;
  posting_date?:            string;
  received_date?:           string;
  payment_term_id?:         string;
  payment_method_id?:       string;
  commitment_id?:           string | null;
  budget_allocation_id?:    string | null;
  notes?:                   string;
  tags?:                    string[];
  tax_mode?:                string;
  freight_amount?:          number;
  misc_charges_amount?:     number;
  discount_amount?:         number;
  retention_pct?:           number | null;
  cost_center_id?:          string | null;
  profit_center_id?:        string | null;
  project_id?:              string | null;
}

export function useUpdateApInvoice(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean; record: ApInvoiceDetail }, Error, UpdateApInvoicePayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/finance/ap/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to update invoice"));
      }
      return res.json() as Promise<{ ok: boolean; record: ApInvoiceDetail }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices", invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices"] });
    },
  });
}

// ── AP Invoice line mutations ──────────────────────────────────────────────────

export interface CreateApInvoiceLinePayload {
  item_id?:                   string;
  item_description:           string;
  procurement_type?:          string;
  uom_code:                   string;
  quantity:                   number;
  unit_price:                 number;
  price_unit?:                number;
  discount_pct?:              number;
  tax_group_id?:              string;
  withholding_tax_group_id?:  string;
  commodity_category_id?:         string;
  business_intent_id?:        string;
  cost_center_id?:            string;
  profit_center_id?:          string;
  project_id?:                string;
  site_id?:                   string;
  is_asset?:                  boolean;
  asset_category_id?:         string;
  commitment_line_id?:        string;
  goods_receipt_line_id?:     string;
  notes?:                     string;
}

export interface UpdateApInvoiceLinePayload extends Partial<CreateApInvoiceLinePayload> {
  line_no?: number;
}

export function useCreateApInvoiceLine(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean; line: ApInvoiceLine }, Error, CreateApInvoiceLinePayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/finance/ap/invoices/${invoiceId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to add line"));
      }
      return res.json() as Promise<{ ok: boolean; line: ApInvoiceLine }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices", invoiceId] });
    },
  });
}

export function useUpdateApInvoiceLine(invoiceId: string, lineId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean; line: ApInvoiceLine }, Error, UpdateApInvoiceLinePayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/finance/ap/invoices/${invoiceId}/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to update line"));
      }
      return res.json() as Promise<{ ok: boolean; line: ApInvoiceLine }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices", invoiceId] });
    },
  });
}

export function useDeleteApInvoiceLine(invoiceId: string, lineId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/finance/ap/invoices/${invoiceId}/lines/${lineId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to delete line"));
      }
      return res.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices", invoiceId] });
    },
  });
}

// ── Promote proforma ───────────────────────────────────────────────────────────

export interface PromoteProformaPayload {
  supplier_invoice_number: string;
  supplier_invoice_date:   string;
  posting_date?:           string;
  received_date?:          string;
  commitment_id?:          string | null;
  remarks?:                string;
}

export function usePromoteProforma(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean; record: ApInvoiceDetail }, Error, PromoteProformaPayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/records/purchase_invoice/${invoiceId}/action/promote_proforma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to promote proforma"));
      }
      return res.json() as Promise<{ ok: boolean; record: ApInvoiceDetail }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices", invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "ap", "invoices"] });
    },
  });
}
