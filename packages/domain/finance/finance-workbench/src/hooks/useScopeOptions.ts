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
        countryCode:          r.countryCode,
        countryName:          r.countryName,
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
  legalEntityCode?: string;
  legalEntityName?: string;
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
  tenantId: string | null;
  tenantCode: string | null;
  tenantName: string | null;
  activeLegalEntityId: string | null;
  activeLegalEntityCode: string | null;
  activeLegalEntityName: string | null;
  defaultCompanyCode: string | null;
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
  const response = await fetch("/api/finance/master/scope-options", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load scope options");
  }
  const payload = await response.json() as {
    tenantId: string | null;
    tenantCode: string | null;
    tenantName: string | null;
    activeLegalEntityId: string | null;
    activeLegalEntityCode: string | null;
    activeLegalEntityName: string | null;
    defaultCompanyCode: string | null;
    legalEntities: Array<{ id: string; code: string; name: string }>;
    companies: CompanyOption[];
  };
  const companyCodesByEntity = new Map<string, string[]>();
  for (const company of payload.companies) {
    const codes = companyCodesByEntity.get(company.legalEntityId) ?? [];
    codes.push(company.code);
    companyCodesByEntity.set(company.legalEntityId, codes);
  }
  const entities: EntityOption[] = payload.legalEntities.map((entity) => ({
    id: entity.id,
    code: entity.code,
    name: entity.name,
    entityType: "legal_entity",
    consolidationMethod: null,
    parentEntityId: null,
    countryCode: "",
    functionalCurrency: "",
    reportingCurrency: "",
    companyCodes: companyCodesByEntity.get(entity.id) ?? [],
  }));
  return {
    companies: payload.companies,
    entities,
    tenantId: payload.tenantId,
    tenantCode: payload.tenantCode,
    tenantName: payload.tenantName,
    activeLegalEntityId: payload.activeLegalEntityId,
    activeLegalEntityCode: payload.activeLegalEntityCode,
    activeLegalEntityName: payload.activeLegalEntityName,
    defaultCompanyCode: payload.defaultCompanyCode,
  };
}

export function useScopeOptions() {
  return useQuery({
    queryKey: ["finance", "scope-options"],
    queryFn: fetchScopeOptions,
    staleTime: 5 * 60 * 1000, // 5 min — master data changes rarely
  });
}
