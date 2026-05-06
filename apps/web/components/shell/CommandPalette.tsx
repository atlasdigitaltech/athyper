"use client";

/**
 * CommandPalette — Universal Launcher.
 *
 * Three tabs, one dialog, one interaction model:
 *
 *   Search  → Modules (from runtime), global pages, module sub-pages
 *   Create  → Permissioned create actions, filtered to tenant modules
 *   Recent  → Route-tracked history with pin/unpin, time ago, type badges
 *
 * Design rules enforced here:
 *   - No hardcoded domain groups (Finance, HR, etc.) — everything flows through
 *     the module registry keyed by RuntimeModule.code
 *   - No Help stubs — removed until real help content exists
 *   - Recent fed by useRecentTracker (all route visits), not palette nav only
 *   - Launcher is the single create surface — QuickCreateMenu is retired
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck,
  Home,
  Inbox,
  LayoutDashboard,
  Layers,
  Package,
  Pin,
  Plus,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { CommandPaletteBase, type PaletteTab } from "@athyper/ui/composites";
import type { RuntimeModule } from "@athyper/auth";
import {
  getRecentItems,
  pushRecentItem,
  togglePinItem,
  timeAgo,
  type RecentItem,
} from "@/lib/recent-items";
import { useGlobalSearch, type SearchHit } from "@/hooks/useGlobalSearch";

// ── Module icons registry (module-code → icon) ────────────────────────────────

const MODULE_ICONS: Record<string, LucideIcon> = {
  // Finance & Accounting
  ACC: BookOpen,
  FIN: BookOpen,
  GL: Layers,
  PAY: CreditCard,
  AP: CreditCard,
  INV: Receipt,
  AR: Receipt,
  // Procurement & Supply
  PRC: Package,
  BUY: ShoppingCart,
  SOURCE: Search,
  SRM: Building2,
  CONTRACT: FileCheck,
  // HR & People
  HR: Users,
  // Budgeting
  BUDGET: DollarSign,
  // Platform
  GEN: LayoutDashboard,
  REP: BarChart3,
  WF: Workflow,
  SET: Settings,
};

function moduleIcon(code: string): LucideIcon {
  return MODULE_ICONS[code] ?? ScrollText;
}

// ── Create actions registry (module-code → actions) ──────────────────────────
//
// Only actions for modules present in runtime.modules are shown.
// Ordered within each module by frequency (most common first).

interface CreateAction {
  label: string;
  href: string;
  moduleCode: string;
  keywords: string[];
}

const MODULE_CREATE_ACTIONS: Partial<Record<string, CreateAction[]>> = {
  ACC: [
    { label: "New Journal Entry", href: "/app/journal/new", moduleCode: "ACC", keywords: ["journal", "entry", "je", "posting", "debit", "credit"] },
    { label: "New Purchase Invoice", href: "/app/purchase_invoice/new", moduleCode: "ACC", keywords: ["purchase", "invoice", "ap", "payable", "supplier invoice"] },
    { label: "New Business Partner", href: "/app/business_partner/new", moduleCode: "ACC", keywords: ["business partner", "bp", "customer", "supplier", "partner"] },
  ],
  AP: [
    { label: "New Purchase Invoice", href: "/app/purchase_invoice/new", moduleCode: "AP", keywords: ["purchase", "invoice", "ap", "payable", "vendor", "supplier invoice", "pi"] },
  ],
  PAY: [
    { label: "New Payment", href: "/app/payment/new", moduleCode: "PAY", keywords: ["payment", "pay", "disbursement"] },
    { label: "New Expense Claim", href: "/app/expense/new", moduleCode: "PAY", keywords: ["expense", "claim", "reimburse", "travel"] },
  ],
  PRC: [
    { label: "New Purchase Order", href: "/app/purchase_order/new", moduleCode: "PRC", keywords: ["po", "purchase", "order"] },
    { label: "New Requisition", href: "/app/requisition/new", moduleCode: "PRC", keywords: ["pr", "requisition", "request", "purchase request"] },
  ],
  BUY: [
    { label: "New Requisition", href: "/app/requisition/new", moduleCode: "BUY", keywords: ["pr", "requisition", "request"] },
    { label: "New Purchase Order", href: "/app/purchase_order/new", moduleCode: "BUY", keywords: ["po", "purchase", "order", "buy"] },
    { label: "New Business Partner", href: "/app/business_partner/new?mode=supplier", moduleCode: "BUY", keywords: ["supplier", "vendor", "business partner", "bp"] },
  ],
  SRM: [
    { label: "New Supplier BP", href: "/app/business_partner/new?mode=supplier", moduleCode: "SRM", keywords: ["supplier", "vendor", "srm", "new supplier", "business partner"] },
    { label: "New Supplier Evaluation", href: "/app/supplier_eval/new", moduleCode: "SRM", keywords: ["evaluation", "assess", "qualify", "approve supplier"] },
  ],
  SOURCE: [
    { label: "Submit RFQ", href: "/app/rfq/new", moduleCode: "SOURCE", keywords: ["rfq", "quote", "request for quotation", "source", "bid"] },
    { label: "New Sourcing Event", href: "/app/sourcing_event/new", moduleCode: "SOURCE", keywords: ["sourcing", "event", "tender", "auction"] },
  ],
  CONTRACT: [
    { label: "New Contract", href: "/app/contract/new", moduleCode: "CONTRACT", keywords: ["contract", "agreement", "legal"] },
    { label: "New Contract Amendment", href: "/app/contract_amendment/new", moduleCode: "CONTRACT", keywords: ["amendment", "change", "modify contract"] },
  ],
  INV: [
    { label: "New Invoice", href: "/app/invoice/new", moduleCode: "INV", keywords: ["invoice", "billing", "ar", "receivable"] },
    { label: "New Credit Note", href: "/app/credit_note/new", moduleCode: "INV", keywords: ["credit", "note", "refund", "adjustment"] },
  ],
  HR: [
    { label: "New Employee", href: "/app/employee/new", moduleCode: "HR", keywords: ["employee", "hire", "onboard", "staff", "headcount"] },
    { label: "New Leave Request", href: "/app/leave/new", moduleCode: "HR", keywords: ["leave", "holiday", "absence", "pto", "time off"] },
  ],
  BUDGET: [
    { label: "New Budget Request", href: "/app/budget_request/new", moduleCode: "BUDGET", keywords: ["budget", "request", "allocation", "fund"] },
    { label: "New Budget Version", href: "/app/budget_version/new", moduleCode: "BUDGET", keywords: ["budget", "version", "plan", "revision"] },
  ],
};

// ── Module sub-page navigation registry (search tab) ─────────────────────────
//
// Shown as secondary results in Search tab when user drills into a module.
// Only rendered for modules present in runtime.modules.

interface NavPage {
  label: string;
  href: string;
  keywords: string[];
}

const MODULE_PAGES_NAV: Partial<Record<string, NavPage[]>> = {
  ACC: [
    { label: "Business Partners", href: "/app/business_partner", keywords: ["business partner", "bp", "supplier", "customer", "master"] },
    { label: "GL Workbench", href: "/finance/gl", keywords: ["gl", "general ledger", "workbench", "journals", "ledger entries"] },
    { label: "Chart of Accounts", href: "/finance/coa", keywords: ["coa", "chart", "accounts", "account tree", "account structure"] },
    { label: "Trial Balance", href: "/finance/views/trial-balance", keywords: ["trial balance", "tb", "debit credit summary"] },
    { label: "Financial Reports", href: "/finance/reports", keywords: ["reports", "p&l", "income statement", "balance sheet", "cash flow", "fin reports"] },
    { label: "Period Close", href: "/finance/close", keywords: ["close", "period", "month end", "period close", "sign off", "close books"] },
    { label: "Finance Admin", href: "/finance/admin", keywords: ["admin", "controls", "mapping", "legal entity", "company controls", "coa mapping"] },
  ],
};

// ── Global pages (always visible in Search tab) ───────────────────────────────

const GLOBAL_PAGES: Array<{ label: string; href: string; keywords: string[]; icon: LucideIcon; badge: string }> = [
  { label: "Home", href: "/home", keywords: ["home", "start", "dashboard", "overview"], icon: Home, badge: "HOME" },
  { label: "Work Inbox", href: "/inbox", keywords: ["inbox", "tasks", "approvals", "my work", "work queue"], icon: Inbox, badge: "INBOX" },
  { label: "Settings", href: "/settings", keywords: ["settings", "preferences", "profile", "account", "config"], icon: Settings, badge: "SET" },
];

// ── Record family label ───────────────────────────────────────────────────────

const FAMILY_LABELS = {
  master: "master",
  document: "document",
  ledger: "ledger entry",
  page: "page",
  module: "module",
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  modules: RuntimeModule[];
}

// ── Entity-type → detail URL builder ──────────────────────────────────────────
// Placeholder mapping — defaults to /records/:entity/:id which works for the
// generic records CRUD. Domain-specific overrides can be added here as they
// surface (e.g. finance pages have their own routes for invoices + JEs).
function hitHref(hit: SearchHit): string {
  return `/app/${hit.entity_type.replace(/_/g, "-")}/${hit.entity_id}`;
}

export function CommandPalette({ open, onClose, modules }: CommandPaletteProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PaletteTab>("search");
  const [query, setQuery] = useState("");

  // Live cross-entity search. Disabled automatically when query < 2 chars
  // or when the palette is closed (no round-trip while idle).
  const searchResults = useGlobalSearch(open ? query : "", {
    pageSize: 10,
    staleTimeMs: 15_000,
  });
  const searchHits: SearchHit[] = searchResults.data?.hits ?? [];

  function handleTabChange(tab: PaletteTab) {
    setActiveTab(tab);
    setQuery("");
  }

  const navigate = useCallback(
    (href: string, item: Omit<RecentItem, "visitedAt">) => {
      onClose();
      pushRecentItem(item);
      router.push(href);
    },
    [onClose, router],
  );

  // Snapshot recent items when palette opens
  const recentItems = open ? getRecentItems() : [];
  const pinnedItems = recentItems.filter((i) => i.pinned);
  const unpinnedItems = recentItems.filter((i) => !i.pinned);

  // Derive create actions available for the current tenant's modules
  const moduleCodes = new Set(modules.map((m) => m.code));
  const availableCreateActions = modules
    .flatMap((mod) => MODULE_CREATE_ACTIONS[mod.code] ?? [])
    .filter((action) => moduleCodes.has(action.moduleCode));

  return (
    <CommandPaletteBase
      open={open}
      onClose={onClose}
      search={query}
      onSearchChange={setQuery}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      emptyMessage="No results — try a module name, record code, or action"
    >
      {/* ══════════════════════════════════════════════════
          SEARCH TAB
      ══════════════════════════════════════════════════ */}
      {activeTab === "search" && (
        <>
          {/* Global pages */}
          <CommandPaletteBase.Group heading="Pages">
            {GLOBAL_PAGES.map((page) => {
              const Icon = page.icon;
              return (
                <CommandPaletteBase.Item
                  key={page.href}
                  value={page.label}
                  keywords={page.keywords}
                  onSelect={() =>
                    navigate(page.href, {
                      href: page.href,
                      label: page.label,
                      recordFamily: "page",
                    })
                  }
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{page.label}</span>
                  <CommandPaletteBase.Badge>{page.badge}</CommandPaletteBase.Badge>
                </CommandPaletteBase.Item>
              );
            })}
          </CommandPaletteBase.Group>

          <CommandPaletteBase.Separator />

          {/* Runtime modules */}
          {modules.length > 0 && (
            <>
              <CommandPaletteBase.Group heading="Modules">
                {modules.map((mod) => {
                  const Icon = moduleIcon(mod.code);
                  const href = `/module/${mod.code.toLowerCase()}`;
                  return (
                    <CommandPaletteBase.Item
                      key={mod.code}
                      value={mod.name}
                      keywords={[mod.code, mod.name]}
                      onSelect={() =>
                        navigate(href, {
                          href,
                          label: mod.name,
                          moduleCode: mod.code,
                          recordFamily: "module",
                        })
                      }
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{mod.name}</span>
                      <CommandPaletteBase.Badge>{mod.code}</CommandPaletteBase.Badge>
                    </CommandPaletteBase.Item>
                  );
                })}
              </CommandPaletteBase.Group>

              {/* Module sub-pages — shown always, auto-filtered by cmdk when query is set */}
              {modules
                .filter((mod) => MODULE_PAGES_NAV[mod.code])
                .map((mod) => {
                  const pages = MODULE_PAGES_NAV[mod.code]!;
                  return (
                    <CommandPaletteBase.Group key={`pages-${mod.code}`} heading={mod.name}>
                      {pages.map((page) => (
                        <CommandPaletteBase.Item
                          key={page.href}
                          value={page.label}
                          keywords={[...page.keywords, mod.code, mod.name]}
                          onSelect={() =>
                            navigate(page.href, {
                              href: page.href,
                              label: page.label,
                              moduleCode: mod.code,
                              recordFamily: "page",
                            })
                          }
                        >
                          <div className="ml-1 size-4 shrink-0" />
                          <span className="flex-1 truncate">{page.label}</span>
                          <CommandPaletteBase.Badge>{mod.code}</CommandPaletteBase.Badge>
                        </CommandPaletteBase.Item>
                      ))}
                    </CommandPaletteBase.Group>
                  );
                })}
            </>
          )}

          {/* Cross-entity records — Meilisearch hits. Rendered only while the
              user has typed ≥ 2 chars; the hook short-circuits otherwise. */}
          {searchHits.length > 0 && (
            <>
              <CommandPaletteBase.Separator />
              <CommandPaletteBase.Group heading="Records">
                {searchHits.map((hit) => {
                  const href = hitHref(hit);
                  return (
                    <CommandPaletteBase.Item
                      key={hit.id}
                      value={`${hit.title} ${hit.entity_type}`}
                      keywords={[hit.entity_type, hit.entity_id]}
                      onSelect={() =>
                        navigate(href, {
                          href,
                          label: hit.title,
                          recordFamily: "document",
                        })
                      }
                    >
                      <Search className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">
                        {hit.title}
                        {hit.summary ? <span className="ml-2 text-muted-foreground">— {hit.summary}</span> : null}
                      </span>
                      <CommandPaletteBase.Badge>{hit.entity_type}</CommandPaletteBase.Badge>
                    </CommandPaletteBase.Item>
                  );
                })}
              </CommandPaletteBase.Group>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          CREATE TAB
      ══════════════════════════════════════════════════ */}
      {activeTab === "create" && (
        <>
          {availableCreateActions.length > 0 ? (
            <CommandPaletteBase.Group heading="Actions">
              {availableCreateActions.map((action) => {
                const Icon = moduleIcon(action.moduleCode);
                return (
                  <CommandPaletteBase.Item
                    key={`${action.moduleCode}:${action.href}`}
                    value={action.label}
                    keywords={action.keywords}
                    onSelect={() =>
                      navigate(action.href, {
                        href: action.href,
                        label: action.label,
                        moduleCode: action.moduleCode,
                        recordFamily: "document",
                      })
                    }
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{action.label}</span>
                    <CommandPaletteBase.Badge>{action.moduleCode}</CommandPaletteBase.Badge>
                  </CommandPaletteBase.Item>
                );
              })}
            </CommandPaletteBase.Group>
          ) : (
            // Fallback: no modules loaded yet
            <CommandPaletteBase.Group heading="Actions">
              <CommandPaletteBase.Item
                value="New Journal Entry"
                keywords={["journal", "entry", "je"]}
                onSelect={() =>
                  navigate("/app/journal/new", {
                    href: "/app/journal/new",
                    label: "New Journal Entry",
                    moduleCode: "ACC",
                    recordFamily: "document",
                  })
                }
              >
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">New Journal Entry</span>
                <CommandPaletteBase.Badge>ACC</CommandPaletteBase.Badge>
              </CommandPaletteBase.Item>
            </CommandPaletteBase.Group>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          RECENT TAB
      ══════════════════════════════════════════════════ */}
      {activeTab === "recent" && (
        <>
          {pinnedItems.length > 0 && (
            <>
              <CommandPaletteBase.Group heading="Pinned">
                {pinnedItems.map((item) => (
                  <RecentRow
                    key={item.href}
                    item={item}
                    onSelect={() =>
                      navigate(item.href, {
                        href: item.href,
                        label: item.label,
                        refCode: item.refCode,
                        moduleCode: item.moduleCode,
                        recordFamily: item.recordFamily,
                        pinned: item.pinned,
                      })
                    }
                  />
                ))}
              </CommandPaletteBase.Group>
              {unpinnedItems.length > 0 && <CommandPaletteBase.Separator />}
            </>
          )}

          {unpinnedItems.length > 0 && (
            <CommandPaletteBase.Group heading="Recently Viewed">
              {unpinnedItems.map((item) => (
                <RecentRow
                  key={item.href}
                  item={item}
                  onSelect={() =>
                    navigate(item.href, {
                      href: item.href,
                      label: item.label,
                      refCode: item.refCode,
                      moduleCode: item.moduleCode,
                      recordFamily: item.recordFamily,
                      pinned: item.pinned,
                    })
                  }
                />
              ))}
            </CommandPaletteBase.Group>
          )}

          {recentItems.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No recent activity yet
            </div>
          )}
        </>
      )}
    </CommandPaletteBase>
  );
}

// ── Recent row ────────────────────────────────────────────────────────────────

function RecentRow({
  item,
  onSelect,
}: {
  item: RecentItem;
  onSelect: () => void;
}) {
  const keywords = [
    item.label,
    item.refCode,
    item.moduleCode,
    item.recordFamily ? FAMILY_LABELS[item.recordFamily] : undefined,
  ].filter(Boolean) as string[];

  return (
    <CommandPaletteBase.Item
      value={item.refCode ?? item.label}
      keywords={keywords}
      onSelect={onSelect}
    >
      {/* Pin / clock indicator */}
      {item.pinned ? (
        <Pin className="size-4 shrink-0 text-amber-500" />
      ) : (
        <Clock className="size-4 shrink-0 text-muted-foreground" />
      )}

      {/* Reference code (record ID) if available */}
      {item.refCode && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {item.refCode}
        </span>
      )}

      {/* Label */}
      <span className="flex-1 truncate">{item.label}</span>

      {/* Module badge */}
      {item.moduleCode && (
        <CommandPaletteBase.Badge>{item.moduleCode}</CommandPaletteBase.Badge>
      )}

      {/* Time ago */}
      <span className="shrink-0 text-xs text-muted-foreground">
        {timeAgo(item.visitedAt)}
      </span>
    </CommandPaletteBase.Item>
  );
}
