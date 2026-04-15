"use client";

import { useState, useMemo } from "react";
import {
  Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import { useCompanyList } from "../hooks/useCharts";
import { useCompanyControls } from "../hooks/useCompanyControls";
import type { AccountClass, OwnerType } from "../data/types";
import { AccountClassBadge, OwnerBadge, ReconBadge } from "../components/ChartBadge";
import { CheckIcon, BlockIcon, PostIcon } from "../components/StatusIcons";

export function CompanyControlsView() {
  const { data: companies = [] } = useCompanyList();
  const [company, setCompany] = useState("");
  const selectedCode = company || (companies[0]?.code ?? "");

  const { data: allRows = [], isLoading } = useCompanyControls(selectedCode);
  const [filterClass, setFilterClass] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterDim, setFilterDim] = useState("all");

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (filterClass !== "all" && r.accountClass !== filterClass) return false;
      if (filterOwner !== "all" && r.ownerType !== filterOwner) return false;
      if (filterDim === "cc" && !r.requiresCostCenter) return false;
      if (filterDim === "pc" && !r.requiresProfitCenter) return false;
      if (filterDim === "proj" && !r.requiresProject) return false;
      return true;
    });
  }, [allRows, filterClass, filterOwner, filterDim]);

  const stats = {
    total: allRows.length,
    blocked: allRows.filter((r) => !r.postingAllowed).length,
    customer: allRows.filter((r) => r.ownerType === "customer").length,
    supplier: allRows.filter((r) => r.ownerType === "supplier").length,
    employee: allRows.filter((r) => r.ownerType === "employee").length,
  };

  return (
    <div className="space-y-3">

      {/* Company selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedCode} onValueChange={setCompany}>
          <SelectTrigger className="h-7 w-64 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.functionalCurrency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? "Loading…" : `${stats.total} controls · ${stats.blocked} blocked`}
        </span>
      </div>

      {/* Filters inline */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="h-6 w-28 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(["asset","liability","equity","income","expense"] as AccountClass[]).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOwner} onValueChange={setFilterOwner}>
          <SelectTrigger className="h-6 w-28 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {(["customer","supplier","employee","internal"] as OwnerType[]).map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterDim} onValueChange={setFilterDim}>
          <SelectTrigger className="h-6 w-32 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dimensions</SelectItem>
            <SelectItem value="cc">Requires CC</SelectItem>
            <SelectItem value="pc">Requires PC</SelectItem>
            <SelectItem value="proj">Requires Project</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-primary">{stats.customer} customer</span>
        <span className="text-[10px] text-accent-foreground">{stats.supplier} supplier</span>
        <span className="text-[10px] text-warning">{stats.employee} employee</span>
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground">{rows.length} of {allRows.length} shown</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-2 text-left font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10">Account</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Class</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Owner</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Post</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Man.</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Auto</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">CC</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">PC</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Proj</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Def CC</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Def PC</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Recon</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Tax</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">OI</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">SL</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">LI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-1.5 px-2 font-mono font-medium sticky left-0 bg-background z-10">{r.accountCode}</td>
                <td className="py-1.5 px-2 truncate max-w-[140px]">{r.accountName}</td>
                <td className="py-1.5 px-2"><AccountClassBadge cls={r.accountClass} /></td>
                <td className="py-1.5 px-2"><OwnerBadge owner={r.ownerType} /></td>
                <td className="py-1.5 px-2 text-center"><PostIcon allowed={r.postingAllowed} /></td>
                <td className="py-1.5 px-2 text-center"><BlockIcon blocked={r.blockedForManual} /></td>
                <td className="py-1.5 px-2 text-center"><BlockIcon blocked={r.blockedForAuto} /></td>
                <td className="py-1.5 px-2 text-center"><CheckIcon value={r.requiresCostCenter} /></td>
                <td className="py-1.5 px-2 text-center"><CheckIcon value={r.requiresProfitCenter} /></td>
                <td className="py-1.5 px-2 text-center"><CheckIcon value={r.requiresProject} /></td>
                <td className="py-1.5 px-2 font-mono text-[9px] text-muted-foreground">{r.defaultCostCenter ?? "—"}</td>
                <td className="py-1.5 px-2 font-mono text-[9px] text-muted-foreground">{r.defaultProfitCenter ?? "—"}</td>
                <td className="py-1.5 px-2"><ReconBadge value={r.reconciliation} /></td>
                <td className="py-1.5 px-2">
                  {r.taxTreatment
                    ? <Badge variant="warning" className="text-[10px] py-0">{r.taxTreatment}</Badge>
                    : <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className="py-1.5 px-2 text-center"><CheckIcon value={r.openItemManaged} /></td>
                <td className="py-1.5 px-2">
                  {r.subledgerType
                    ? <Badge variant="info" className="text-[10px] py-0">{r.subledgerType}</Badge>
                    : <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className="py-1.5 px-2 text-center"><CheckIcon value={r.lineItemDisplay} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
