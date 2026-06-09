"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronDown, Clock, Search } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import type { FinanceScope, ScopeType } from "../lib/scope";
import type { CompanyOption, EntityOption, ScopeOptionsData } from "../hooks/useScopeOptions";

const RECENT_SCOPE_KEY = "finance_scope_recent_v1";

type ScopeChooserType = Extract<ScopeType, "company" | "legal_entity">;

interface ScopeChooserItem {
  key: string;
  scopeType: ScopeChooserType;
  scopeId: string;
  code: string;
  name: string;
  typeLabel: string;
  subtitle: string;
  meta: string;
  searchText: string;
}

type ScopeTab = "all" | "entities" | "companies" | "recent";

interface FinanceScopeChooserProps {
  scope: FinanceScope;
  scopeOptions?: ScopeOptionsData;
  onChange: (scope: FinanceScope) => void;
  className?: string;
}

function readRecentScopes(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SCOPE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecentScopes(keys: string[]) {
  try {
    window.localStorage.setItem(RECENT_SCOPE_KEY, JSON.stringify(keys.slice(0, 8)));
  } catch {
    // Best effort only.
  }
}

function scopeKey(scopeType: ScopeChooserType, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

function companyMeta(company: CompanyOption): string {
  const parts = [
    company.functionalCurrency,
    company.fiscalYearStartMonth !== 1 ? `FY starts ${monthShortName(company.fiscalYearStartMonth)}` : null,
  ].filter(Boolean);
  return parts.join(" / ");
}

function monthShortName(month: number): string {
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[month] ?? "Jan";
}

function entityMeta(entity: EntityOption, companiesByCode: Map<string, CompanyOption>): string {
  const currencies = new Set<string>();
  for (const code of entity.companyCodes ?? []) {
    const currency = companiesByCode.get(code)?.functionalCurrency;
    if (currency) currencies.add(currency);
  }
  const currencyText = currencies.size > 0 ? [...currencies].join(", ") : entity.functionalCurrency;
  return [currencyText, entity.countryName ?? entity.countryCode].filter(Boolean).join(" / ");
}

function buildItems(options?: ScopeOptionsData): ScopeChooserItem[] {
  if (!options) return [];

  const companiesByCode = new Map(options.companies.map((company) => [company.code, company]));
  const accessibleCodes = new Set(options.companies.map((company) => company.code));

  const entities = options.entities
    .filter((entity) => (entity.companyCodes ?? []).some((code) => accessibleCodes.has(code)))
    .map((entity) => {
      const companyCount = (entity.companyCodes ?? []).filter((code) => accessibleCodes.has(code)).length;
      const subtitle = `${companyCount} company code${companyCount === 1 ? "" : "s"}`;
      const meta = entityMeta(entity, companiesByCode);
      return {
        key: scopeKey("legal_entity", entity.id),
        scopeType: "legal_entity" as const,
        scopeId: entity.id,
        code: entity.code,
        name: entity.name,
        typeLabel: "Legal Entity",
        subtitle,
        meta,
        searchText: `${entity.code} ${entity.name} ${subtitle} ${entity.countryCode} ${meta}`.toLowerCase(),
      };
    });

  const companies = options.companies.map((company) => {
    const entity = options.entities.find((item) => item.id === company.legalEntityId);
    const subtitle = entity ? `Company code in ${entity.code}` : "Company code";
    const meta = companyMeta(company);
    return {
      key: scopeKey("company", company.code),
      scopeType: "company" as const,
      scopeId: company.code,
      code: company.code,
      name: company.name,
      typeLabel: "Company Code",
      subtitle,
      meta,
      searchText: `${company.code} ${company.name} ${subtitle} ${meta}`.toLowerCase(),
    };
  });

  return [...entities, ...companies];
}

function activeScopeLabel(scope: FinanceScope, items: ScopeChooserItem[]): string {
  const active = items.find((item) => item.key === scopeKey(scope.scopeType as ScopeChooserType, scope.scopeId));
  if (active) return `${active.code} - ${active.name}`;
  if (scope.scopeId) return scope.scopeId;
  return "Select scope";
}

export function FinanceScopeChooser({
  scope,
  scopeOptions,
  onChange,
  className,
}: FinanceScopeChooserProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ScopeTab>("all");
  const [recentKeys, setRecentKeys] = useState<string[]>([]);

  const items = useMemo(() => buildItems(scopeOptions), [scopeOptions]);
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  const activeKey = scope.scopeType === "legal_entity" || scope.scopeType === "company"
    ? scopeKey(scope.scopeType, scope.scopeId)
    : "";
  const label = activeScopeLabel(scope, items);

  useEffect(() => {
    setRecentKeys(readRecentScopes());
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let base = items;

    if (tab === "entities") {
      base = items.filter((item) => item.scopeType === "legal_entity");
    } else if (tab === "companies") {
      base = items.filter((item) => item.scopeType === "company");
    } else if (tab === "recent") {
      base = recentKeys.map((key) => itemByKey.get(key)).filter((item): item is ScopeChooserItem => !!item);
    }

    if (!normalizedQuery) return base;
    return base.filter((item) => item.searchText.includes(normalizedQuery));
  }, [itemByKey, items, query, recentKeys, tab]);

  function selectItem(item: ScopeChooserItem) {
    const nextRecent = [item.key, ...recentKeys.filter((key) => key !== item.key)];
    setRecentKeys(nextRecent);
    writeRecentScopes(nextRecent);
    onChange({
      ...scope,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      bookId: undefined,
    });
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-2 rounded-md px-0 py-1 text-sm font-normal text-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          title={label}
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={10}
        collisionPadding={16}
        className="max-w-[calc(100vw-2rem)] p-0"
        style={{ width: "min(560px, calc(100vw - 2rem))" }}
      >
        <div
          className="overflow-hidden rounded-md bg-popover text-popover-foreground"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search legal entity or company code..."
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <div className="flex gap-1 border-b bg-muted/20 px-2 py-2">
            {([
              ["all", "All"],
              ["entities", "Legal Entities"],
              ["companies", "Company Codes"],
              ["recent", "Recent"],
            ] as const).map(([id, tabLabel]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  tab === id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          <div className="max-h-[min(440px,calc(100vh-16rem))] overflow-y-auto py-1">
            {tab === "recent" && visibleItems.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Recently used
              </div>
            )}
            {visibleItems.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {tab === "recent" ? "No recent scopes yet." : "No matching scope found."}
              </div>
            ) : (
              visibleItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectItem(item)}
                  className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                      <span className="shrink-0 rounded-full border bg-muted/30 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {item.typeLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">{item.code}</span>
                      <span>{item.subtitle}</span>
                      {item.meta && <span>{item.meta}</span>}
                    </span>
                  </span>
                  {activeKey === item.key && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
