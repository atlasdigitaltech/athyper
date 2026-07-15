"use client";

import { useQuery } from "@tanstack/react-query";
import type { PostingPreviewPayload } from "../lib/finance-setup.types";

/**
 * Fetches PeriodPostability and (when glAccountCode is provided) AccountPostability
 * for the inspector panel in the Explore workspace.
 */

export interface UseAccountPostabilityOptions {
  companyCode:   string;
  fiscalYear:    number;
  period:        number;
  bookId?:       string;
  glAccountCode?: string;
}

async function fetchPreview(opts: UseAccountPostabilityOptions): Promise<PostingPreviewPayload> {
  const params = new URLSearchParams({
    scopeType:  "company",
    scopeCode:  opts.companyCode,
    fiscalYear: String(opts.fiscalYear),
    period:     String(opts.period),
  });
  if (opts.bookId)        params.set("bookId",        opts.bookId);
  if (opts.glAccountCode) params.set("glAccountCode", opts.glAccountCode);
  const res = await fetch(`/api/finance/setup/posting-preview?${params}`, {
    credentials: "include",
    cache:       "no-store",
  });
  if (!res.ok) throw new Error(`posting-preview → ${res.status}`);
  return res.json() as Promise<PostingPreviewPayload>;
}

export function useAccountPostability(opts: UseAccountPostabilityOptions) {
  return useQuery({
    queryKey: [
      "finance", "setup", "account-postability",
      opts.companyCode, opts.fiscalYear, opts.period, opts.bookId ?? null, opts.glAccountCode ?? null,
    ],
    queryFn:  () => fetchPreview(opts),
    enabled:  !!opts.companyCode && Number.isFinite(opts.fiscalYear) && Number.isFinite(opts.period),
    staleTime: 30 * 1000,
  });
}
