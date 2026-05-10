"use client";

import { useQuery } from "@tanstack/react-query";
import type { LegalEntity } from "../data/types";
import type { FinanceScope } from "../lib/scope";

export function useLegalEntities() {
  return useQuery<LegalEntity[]>({
    queryKey: ["finance", "master", "entities"],
    queryFn: async () => {
      const res = await fetch("/api/finance/master/entities");
      if (!res.ok) throw new Error("Failed to load entities");
      const rows = await res.json() as Array<{
        id: string; code: string; name: string;
        entityType: string; consolidationMethod: string | null;
        parentEntityId: string | null; countryCode: string; countryName?: string | null;
        ownershipPct: number | null;
        functionalCurrency: string; reportingCurrency: string;
        companyCodes: string[];
      }>;
      return rows.map((r) => ({
        id:                   r.id,
        code:                 r.code,
        name:                 r.name,
        parentId:             r.parentEntityId,
        entityType:           r.entityType as LegalEntity["entityType"],
        consolidationMethod:  r.consolidationMethod as LegalEntity["consolidationMethod"],
        ownershipPct:         r.ownershipPct,
        country:              r.countryName ?? r.countryCode,
        functionalCurrency:   r.functionalCurrency ?? "",
        reportingCurrency:    r.reportingCurrency ?? "",
        companyCodes:         r.companyCodes ?? [],
        status:               "active" as const,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

async function fetchLedgerBookOptions(
  scope?: Pick<FinanceScope, "scopeType" | "scopeId">,
): Promise<LedgerBookOption[]> {
  const params = new URLSearchParams();
  if (scope?.scopeId) {
    params.set("scopeType", scope.scopeType);
    params.set("scopeId", scope.scopeId);
  }

  const query = params.toString();
  const res = await fetch(`/api/finance/master/ledger-books${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error("Failed to load ledger books");
  return res.json() as Promise<LedgerBookOption[]>;
}

export function useLedgerBookOptions(scope?: FinanceScope) {
  return useQuery({
    queryKey: ["finance", "master", "ledger-books", scope?.scopeType ?? "all", scope?.scopeId ?? "all"],
    queryFn: () => fetchLedgerBookOptions(scope),
    staleTime: 5 * 60 * 1000,
  });
}

export interface CompanyOption {
  id: string;
  code: string;
  name: string;
  functionalCurrency: string;
  legalEntityId: string;
  /** 1–12. Defines how period numbers map to calendar months. */
  fiscalYearStartMonth: number;
}

export interface EntityOption {
  id: string;
  code: string;
  name: string;
  entityType: string;
  consolidationMethod: string | null;
  parentEntityId: string | null;
  countryCode: string;
  countryName?: string | null;
  functionalCurrency: string;
  reportingCurrency: string;
  companyCodes: string[];
}

export interface ScopeOptionsData {
  companies: CompanyOption[];
  entities: EntityOption[];
}

export interface LedgerBookOption {
  id: string;
  code: string;
  name: string;
  category: string | null;
  reportingStandard: string | null;
  baseCurrencyCode: string | null;
  isPrimary: boolean;
}

async function fetchScopeOptions(): Promise<ScopeOptionsData> {
  const [companiesRes, entitiesRes] = await Promise.all([
    fetch("/api/finance/master/companies"),
    fetch("/api/finance/master/entities"),
  ]);
  if (!companiesRes.ok || !entitiesRes.ok) {
    throw new Error("Failed to load scope options");
  }
  const [companies, entities] = await Promise.all([
    companiesRes.json() as Promise<CompanyOption[]>,
    entitiesRes.json() as Promise<EntityOption[]>,
  ]);
  return { companies, entities };
}

export function useScopeOptions() {
  return useQuery({
    queryKey: ["finance", "scope-options"],
    queryFn: fetchScopeOptions,
    staleTime: 5 * 60 * 1000, // 5 min — master data changes rarely
  });
}
