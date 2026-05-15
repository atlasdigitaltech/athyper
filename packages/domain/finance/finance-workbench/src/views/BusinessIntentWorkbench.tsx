"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Database,
  GitBranch,
  Landmark,
  LockKeyhole,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button } from "@athyper/ui/primitives";
import { ReportMetricCard, ReportMetricGrid } from "../components/ReportScaffold";
import { TaxonomyWorkbenchHeader } from "../components/TaxonomyWorkbenchHeader";
import {
  useBusinessIntents,
  type BusinessIntentRow,
  type BusinessIntentSummary,
} from "../hooks/useTaxonomyWorkbenches";

type IntentMode = "all" | "approval" | "gl-defaults" | "restricted" | "overrides";

const EMPTY_SUMMARY: BusinessIntentSummary = {
  total: 0,
  roots: 0,
  leaves: 0,
  domains: 0,
  approvalRequired: 0,
  glDefaults: 0,
  restricted: 0,
  companyPolicies: 0,
  supplierPolicies: 0,
  deniedPolicies: 0,
};

const DOMAIN_ORDER = [
  "OPEX",
  "CAPEX",
  "COST_OF_SALES",
  "ADMIN",
  "REGULATORY",
  "TRANSFER",
  "REVENUE",
  "DEFERRED_REVENUE",
] as const;

function includesText(value: string | null | undefined, search: string): boolean {
  return (value ?? "").toLowerCase().includes(search);
}

function displayPct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function domainClass(domain: string): string {
  switch (domain) {
    case "OPEX":
    case "ADMIN":
      return "border-info/30 bg-info/10 text-info";
    case "CAPEX":
      return "border-warning/30 bg-warning/10 text-warning";
    case "COST_OF_SALES":
      return "border-success/30 bg-success/10 text-success";
    case "REGULATORY":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function visibilityClass(value: string): string {
  switch (value) {
    case "RESTRICTED":
    case "CONFIDENTIAL":
      return "border-warning/30 bg-warning/10 text-warning";
    default:
      return "border-info/30 bg-info/10 text-info";
  }
}

function formatLimit(row: BusinessIntentRow): string {
  if (row.maxAutoApproveAmount === null) return "Manual";
  return `${row.maxAutoApproveCurrency ?? ""} ${row.maxAutoApproveAmount.toLocaleString()}`.trim();
}

function StatusLine({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {detail && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>}
        </div>
      </div>
      <div className="shrink-0 text-right text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function DomainRail({
  domains,
  items,
  activeDomain,
  onSelectDomain,
}: {
  domains: string[];
  items: BusinessIntentRow[];
  activeDomain: string;
  onSelectDomain: (domain: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intent Domains</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <button
          type="button"
          onClick={() => onSelectDomain("all")}
          className={cn(
            "mb-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
            activeDomain === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", activeDomain === "all" ? "bg-primary-foreground" : "bg-muted-foreground")} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">All domains</span>
            <span className={cn("block text-xs", activeDomain === "all" ? "text-primary-foreground/75" : "text-muted-foreground")}>
              {items.length} intents
            </span>
          </span>
        </button>

        {domains.map((domain) => {
          const domainItems = items.filter((item) => item.domain === domain);
          const active = activeDomain === domain;
          const defaulted = domainItems.filter((item) => item.defaultGlAccountCode).length;
          return (
            <button
              key={domain}
              type="button"
              onClick={() => onSelectDomain(domain)}
              className={cn(
                "mb-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", active ? "bg-primary-foreground" : "bg-success")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{domain.replace(/_/g, " ")}</span>
                <span className={cn("block truncate text-xs", active ? "text-primary-foreground/75" : "text-muted-foreground")}>
                  {domainItems.length} intents / {displayPct(defaulted, domainItems.length)} GL defaults
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function IntentTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: BusinessIntentRow[];
  selectedId?: string;
  onSelect: (row: BusinessIntentRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid min-w-[920px] grid-cols-[1.15fr_1.6fr_1fr_1fr_1fr_0.8fr] border-b bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span>Code</span>
        <span>Name</span>
        <span>Domain</span>
        <span>GL default</span>
        <span>Approval</span>
        <span className="text-right">Policies</span>
      </div>
      <div className="max-h-[44vh] min-w-[920px] overflow-auto">
        {rows.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">No business intents matched.</div>
        ) : rows.map((row) => {
          const active = selectedId === row.id;
          const policyCount = row.companyPolicyCount + row.supplierPolicyCount;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelect(row)}
              className={cn(
                "grid w-full grid-cols-[1.15fr_1.6fr_1fr_1fr_1fr_0.8fr] items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40",
                active && "bg-primary/10",
              )}
            >
              <span className={cn("font-mono text-xs", row.parentId ? "text-muted-foreground" : "font-semibold text-foreground")}>
                {row.code}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.subtype ?? `Depth ${row.depth}`}</span>
              </span>
              <span>
                <Badge variant="outline" className={domainClass(row.domain)}>
                  {row.domain.replace(/_/g, " ")}
                </Badge>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.defaultGlAccountCode ? `${row.defaultGlAccountCode} / ${row.defaultGlAccountName}` : "Rule resolved"}
              </span>
              <span>
                <Badge variant="outline" className={row.isApprovalRequired ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success"}>
                  {row.isApprovalRequired ? "Required" : "Auto"}
                </Badge>
              </span>
              <span className="text-right">
                <Badge variant="outline" className={policyCount ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}>
                  {policyCount}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IntentDetail({ row }: { row?: BusinessIntentRow }) {
  if (!row) {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Select a business intent.
      </section>
    );
  }

  const policyCount = row.companyPolicyCount + row.supplierPolicyCount;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
            <h2 className="mt-1 truncate text-base font-semibold text-foreground">{row.name}</h2>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {row.description ?? "No description"}
            </p>
          </div>
          <Badge variant="outline" className={visibilityClass(row.visibility)}>
            {row.visibility}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <StatusLine
          icon={<GitBranch className="h-4 w-4" />}
          label="Hierarchy"
          value={row.parentId ? `Depth ${row.depth}` : "Domain root"}
          detail={`${row.childCount} child intents / ${row.path ?? "path generated by metadata"}`}
        />
        <StatusLine
          icon={<Landmark className="h-4 w-4" />}
          label="Financial defaults"
          value={row.defaultGlAccountCode ?? "Rules"}
          detail={row.defaultGlAccountName ?? "Engine resolves profiles through intent accounting profile rules."}
        />
        <StatusLine
          icon={<BadgeCheck className="h-4 w-4" />}
          label="Approval"
          value={row.isApprovalRequired ? "Required" : "Optional"}
          detail={`Auto-approve ceiling: ${formatLimit(row)}`}
        />
        <StatusLine
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="Policy overlays"
          value={policyCount}
          detail={`${row.companyPolicyCount} company-code policies / ${row.supplierPolicyCount} supplier policies / ${row.companyDefaultCount} defaults`}
        />
        <StatusLine
          icon={<Database className="h-4 w-4" />}
          label="DDL map"
          value="master"
          detail="business_intent -> company_code_intent_policy -> company_code_supplier_intent_policy"
        />
      </div>
    </section>
  );
}

export function BusinessIntentWorkbench() {
  const { data, isLoading, isError } = useBusinessIntents();
  const [search, setSearch] = useState("");
  const [activeDomain, setActiveDomain] = useState("all");
  const [mode, setMode] = useState<IntentMode>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = data?.items ?? [];
  const summary = data?.summary ?? EMPTY_SUMMARY;
  const searchKey = search.trim().toLowerCase();

  const domains = useMemo(() => {
    const present = new Set(items.map((item) => item.domain));
    return DOMAIN_ORDER.filter((domain) => present.has(domain));
  }, [items]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items.find((item) => item.parentId !== null) ?? items[0],
    [items, selectedId],
  );

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeDomain !== "all" && item.domain !== activeDomain) return false;
      if (mode === "approval" && !item.isApprovalRequired) return false;
      if (mode === "gl-defaults" && !item.defaultGlAccountCode) return false;
      if (mode === "restricted" && item.visibility === "STANDARD") return false;
      if (mode === "overrides" && item.companyPolicyCount + item.supplierPolicyCount === 0) return false;
      if (!searchKey) return true;
      return (
        includesText(item.code, searchKey) ||
        includesText(item.name, searchKey) ||
        includesText(item.description, searchKey) ||
        includesText(item.domain, searchKey) ||
        includesText(item.subtype, searchKey) ||
        includesText(item.defaultGlAccountCode, searchKey) ||
        includesText(item.defaultGlAccountName, searchKey)
      );
    });
  }, [activeDomain, items, mode, searchKey]);

  const approvalPct = displayPct(summary.approvalRequired, summary.total);
  const defaultPct = displayPct(summary.glDefaults, summary.total);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-y-auto sm:gap-3 sm:overflow-hidden">
      <TaxonomyWorkbenchHeader
        active="intent"
        subtitle="master.business_intent / GL fallback / approval and supplier eligibility policy"
        actions={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            <Database className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <section className="shrink-0 rounded-lg border bg-card p-3 shadow-sm">
        <ReportMetricGrid className="lg:grid-cols-5">
          <ReportMetricCard label="Intents" value={summary.total.toLocaleString()} detail={`${summary.roots} domain roots / ${summary.leaves} leaves`} />
          <ReportMetricCard label="Domains" value={summary.domains.toLocaleString()} detail="OPEX, CAPEX, COGS, admin, regulatory" />
          <ReportMetricCard label="Approval" value={approvalPct} detail={`${summary.approvalRequired} require approval`} tone="warning" />
          <ReportMetricCard label="GL Defaults" value={defaultPct} detail={`${summary.glDefaults} direct fallbacks`} tone="success" />
          <ReportMetricCard label="Policy Overlay" value={(summary.companyPolicies + summary.supplierPolicies).toLocaleString()} detail={`${summary.deniedPolicies} deny rows`} tone={summary.deniedPolicies ? "danger" : "neutral"} />
        </ReportMetricGrid>
      </section>

      <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        <DomainRail domains={domains} items={items} activeDomain={activeDomain} onSelectDomain={setActiveDomain} />

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search intents, domains, and GL defaults..."
                className="h-8 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <div className="flex items-center gap-1">
              {(["all", "approval", "gl-defaults", "restricted", "overrides"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={mode === value ? "primary" : "outline"}
                  className="h-8 capitalize"
                  onClick={() => setMode(value)}
                >
                  {value.replace("-", " ")}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground animate-pulse">
                Loading business intents...
              </div>
            ) : isError ? (
              <div className="flex h-48 items-center justify-center text-sm text-destructive">
                Business intent service is unavailable.
              </div>
            ) : (
              <IntentTable rows={filtered} selectedId={selected?.id} onSelect={(row) => setSelectedId(row.id)} />
            )}
          </div>
        </section>

        <IntentDetail row={selected} />
      </section>

      <section className="shrink-0 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> 021_base seeds domain roots and leaves</span>
          <span className="inline-flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> GL defaults remain last-resort fallback</span>
          <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> restricted intents require explicit ALLOW policy</span>
        </div>
      </section>
    </div>
  );
}
