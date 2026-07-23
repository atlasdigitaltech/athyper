"use client";

import { useQuery } from "@tanstack/react-query";
import type { CompanyFoundationPayload } from "../lib/finance-setup.types";

async function fetchCompanyFoundation(companyCode: string): Promise<CompanyFoundationPayload> {
  const response = await fetch(
    `/api/finance/setup/company/${encodeURIComponent(companyCode)}/foundation`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Foundation fetch failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<CompanyFoundationPayload>;
}

export function useCompanyFoundation(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "foundation", companyCode],
    queryFn: () => fetchCompanyFoundation(companyCode),
    enabled: Boolean(companyCode),
    staleTime: 60 * 1000,
  });
}
