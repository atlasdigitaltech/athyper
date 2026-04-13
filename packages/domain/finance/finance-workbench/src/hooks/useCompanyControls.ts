"use client";

import { useQuery } from "@tanstack/react-query";
import type { PostingControl, AccountClass, OwnerType, ReconciliationType } from "../data/types";

interface RawControl {
  companyCode: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  subledgerType: string | null;
  postingAllowed: boolean;
  blockedForManual: boolean;
  blockedForAuto: boolean;
  requiresCostCenter: boolean;
  requiresProfitCenter: boolean;
  requiresProject: boolean;
  defaultCostCenter: string | null;
  taxTreatment: string | null;
  reconciliation: string | null;
}

function ownerFromSubledger(subledgerType: string | null): OwnerType {
  if (subledgerType === "ar") return "customer";
  if (subledgerType === "ap") return "supplier";
  return "internal";
}

function toReconciliationType(v: string | null): ReconciliationType {
  if (v === "auto" || v === "manual" || v === "none") return v;
  return "none";
}

function toPostingControl(r: RawControl): PostingControl {
  return {
    companyCode:        r.companyCode,
    accountCode:        r.accountCode,
    accountName:        r.accountName,
    accountClass:       r.accountClass,
    subledgerType:      r.subledgerType,
    ownerType:          ownerFromSubledger(r.subledgerType),
    postingAllowed:     r.postingAllowed,
    blockedForManual:   r.blockedForManual,
    blockedForAuto:     r.blockedForAuto,
    requiresCostCenter: r.requiresCostCenter,
    requiresProfitCenter: r.requiresProfitCenter,
    requiresProject:    r.requiresProject,
    defaultCostCenter:  r.defaultCostCenter,
    defaultProfitCenter: null,
    defaultSite:        null,
    reconciliation:     toReconciliationType(r.reconciliation),
    taxTreatment:       r.taxTreatment,
    openItemManaged:    false,
    lineItemDisplay:    false,
  };
}

export function useCompanyControls(companyCode: string) {
  return useQuery<PostingControl[]>({
    queryKey: ["finance", "master", "controls", companyCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/finance/master/controls?companyCode=${encodeURIComponent(companyCode)}`,
      );
      if (!res.ok) throw new Error("Failed to load controls");
      const raw = await res.json() as RawControl[];
      return raw.map(toPostingControl);
    },
    enabled: !!companyCode,
    staleTime: 5 * 60 * 1000,
  });
}
