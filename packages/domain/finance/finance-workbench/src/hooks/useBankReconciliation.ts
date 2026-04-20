"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey, scopeToParams } from "../lib/scope";

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  name: string;
  accountHolderName: string | null;
  accountIdType: string | null;
  accountLast4: string | null;
  currencyCode: string;
  isVerified: boolean;
  status: string;
  companyCodeId: string;
  purpose: string | null;
  isPrimary: boolean;
  glAccountId: string | null;
  glAccountCode: string | null;
  glAccountName: string | null;
}

export function useBankAccounts(scope: FinanceScope) {
  return useQuery<BankAccount[]>({
    queryKey: ["finance", "bank", "accounts", ...scopeCacheKey(scope)],
    queryFn: async () => {
      const res = await fetch(`/api/finance/bank/accounts?${scopeToParams(scope)}`);
      if (!res.ok) throw new Error("Failed to load bank accounts");
      return res.json() as Promise<BankAccount[]>;
    },
    enabled: !!scope.scopeId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Bank Statement ────────────────────────────────────────────────────────────

export interface BankStatementItem {
  id: string;
  paymentNumber: string;
  paymentDirection: string;
  paymentType: string | null;
  counterpartyName: string | null;
  paymentAmount: number;
  currencyCode: string;
  valueDate: string;
  postingDate: string | null;
  paymentReference: string | null;
  bankReference: string | null;
  checkNumber: string | null;
  isPosted: boolean;
  isTransmitted: boolean;
  isVoided: boolean;
  status: string;
  runningBalance: number;
  clearedDate: string | null;
}

export interface BankStatementData {
  items: BankStatementItem[];
  asAt: string;
}

export function useBankStatement(scope: FinanceScope, bankAccountId: string | null) {
  const params = scopeToParams(scope);
  return useQuery<BankStatementData>({
    queryKey: ["finance", "bank", "statement", bankAccountId, ...scopeCacheKey(scope)],
    queryFn: async () => {
      const res = await fetch(`/api/finance/bank/statement/${bankAccountId}?${params}`);
      if (!res.ok) throw new Error("Failed to load bank statement");
      return res.json() as Promise<BankStatementData>;
    },
    enabled: !!scope.scopeId && !!bankAccountId,
    staleTime: 30 * 1000,
  });
}

// ── Unreconciled Items ────────────────────────────────────────────────────────

export interface BankUnreconciledItem {
  id: string;
  paymentNumber: string;
  paymentDirection: string;
  counterpartyName: string | null;
  paymentAmount: number;
  currencyCode: string;
  valueDate: string;
  postingDate: string | null;
  bankReference: string | null;
  paymentReference: string | null;
  status: string;
  isPosted: boolean;
  clearedDate: string | null;
}

export interface BankUnreconciledData {
  items: BankUnreconciledItem[];
  totalUnreconciled: number;
  count: number;
  asAt: string;
}

export function useBankUnreconciled(scope: FinanceScope, bankAccountId: string | null) {
  const params = scopeToParams(scope);
  return useQuery<BankUnreconciledData>({
    queryKey: ["finance", "bank", "unreconciled", bankAccountId, ...scopeCacheKey(scope)],
    queryFn: async () => {
      const res = await fetch(`/api/finance/bank/unreconciled/${bankAccountId}?${params}`);
      if (!res.ok) throw new Error("Failed to load unreconciled items");
      return res.json() as Promise<BankUnreconciledData>;
    },
    enabled: !!scope.scopeId && !!bankAccountId,
    staleTime: 30 * 1000,
  });
}

// ── Bank Reconcile (mutation) ─────────────────────────────────────────────────

export interface ReconcileResult {
  cleared: number;
  cleared_date: string;
}

export function useBankReconcile(bankAccountId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<ReconcileResult, Error, { payment_ids: string[]; cleared_date?: string }>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/finance/bank/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_account_id: bankAccountId, ...payload }),
      });
      if (!res.ok) throw new Error("Failed to mark payments as cleared");
      return res.json() as Promise<ReconcileResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "bank", "unreconciled", bankAccountId] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "bank", "statement", bankAccountId] });
    },
  });
}
