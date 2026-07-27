"use client";

/**
 * useCompanyHub — loads the Finance Settings Hub payload for a company.
 *
 * Endpoint: GET /api/finance/setup/readiness?scopeType=company&scopeCode=<code>
 *
 * Cache: 60s staleTime — Hub is a snapshot, not a live view.
 * Consumers should invalidate on mutations (Phase 2).
 */

import { useQuery } from "@tanstack/react-query";
import type { CompanyHubPayload } from "../lib/finance-setup.types";

export interface UseCompanyHubOptions {
  companyCode: string;
  fiscalYear?: number;
  period?:     number;
  bookId?:     string;
  /** Optional inbox size override (default 5). */
  inboxLimit?: number;
}

async function fetchCompanyHub(opts: UseCompanyHubOptions): Promise<CompanyHubPayload> {
  const params = new URLSearchParams({
    scopeType: "company",
    scopeCode: opts.companyCode,
  });
  if (opts.fiscalYear !== undefined) params.set("fiscalYear", String(opts.fiscalYear));
  if (opts.period     !== undefined) params.set("period",     String(opts.period));
  if (opts.bookId)                   params.set("bookId",     opts.bookId);
  if (opts.inboxLimit !== undefined) params.set("inboxLimit", String(opts.inboxLimit));

  const res = await fetch(`/api/finance/setup/readiness?${params}`, {
    credentials: "include",
    cache:       "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Company hub fetch failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<CompanyHubPayload>;
}

export function useCompanyHub(opts: UseCompanyHubOptions) {
  return useQuery({
    queryKey: [
      "finance", "setup", "company-hub",
      opts.companyCode, opts.fiscalYear ?? null, opts.period ?? null, opts.bookId ?? null,
    ],
    queryFn:  () => fetchCompanyHub(opts),
    enabled:  !!opts.companyCode,
    staleTime: 60 * 1000,
  });
}
