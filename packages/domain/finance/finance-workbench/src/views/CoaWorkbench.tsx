"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronLeft,
  FolderOpen,
  GitBranch,
  Layers,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";
import type { ChartOfAccount } from "../data/types";
import { useCharts } from "../hooks/useCharts";
import { parseFinanceScope, type FinanceScope } from "../lib/scope";
import { AccountExplorerView } from "./AccountExplorerView";
import { CoaCatalogView } from "./CoaCatalogView";
import { CompanyControlsView } from "./CompanyControlsView";
import { LegalEntityView } from "./LegalEntityView";
import { MappingWorkbenchView } from "./MappingWorkbenchView";
import { TrialBalanceView } from "./TrialBalanceView";

const COA_TABS = [
  { value: "entities", label: "Entities", icon: GitBranch, schema: "master" },
  { value: "catalog", label: "Catalog", icon: Layers, schema: "master" },
  { value: "explorer", label: "Explorer", icon: FolderOpen, schema: "master" },
  { value: "controls", label: "Controls", icon: SlidersHorizontal, schema: "master" },
  { value: "mapping", label: "Mapping", icon: ArrowLeftRight, schema: "control" },
  { value: "trial-balance", label: "Trial Balance", icon: BarChart3, schema: "ledger" },
] as const;

type CoaTab = (typeof COA_TABS)[number]["value"];

const COA_TAB_VALUES = COA_TABS.map((tab) => tab.value) as CoaTab[];
const SCHEMA_STYLE: Record<string, string> = {
  master: "text-primary bg-primary/10",
  control: "text-accent-foreground bg-accent/10",
  ledger: "text-success bg-success/10",
};

interface CoaWorkbenchProps {
  defaultTab?: CoaTab;
}

function isCoaTab(value: string | null | undefined): value is CoaTab {
  return !!value && (COA_TAB_VALUES as readonly string[]).includes(value);
}

function chartFallback(code: string): ChartOfAccount {
  return {
    id: code,
    code,
    name: code,
    framework: "",
    tier: "operating",
    country: null,
    accountCount: 0,
    version: 1,
    isLocked: false,
  };
}

function CoaTabTrigger({
  tab,
}: {
  tab: (typeof COA_TABS)[number] & { icon: LucideIcon };
}) {
  const Icon = tab.icon;

  return (
    <TabsTrigger
      value={tab.value}
      className={cn(
        "h-9 rounded-none border-b-2 border-transparent px-3 text-sm font-medium gap-1.5",
        "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {tab.label}
      <span className={cn("rounded px-1 py-px font-mono text-[10px] leading-none", SCHEMA_STYLE[tab.schema])}>
        {tab.schema}
      </span>
    </TabsTrigger>
  );
}

export function CoaWorkbench({ defaultTab = "catalog" }: CoaWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const chartCode = searchParams.get("chart");
  const activeTab = isCoaTab(searchParams.get("tab")) ? searchParams.get("tab") as CoaTab : defaultTab;
  const { data: charts = [], isLoading: chartsLoading } = useCharts();

  const rawParams = useMemo(
    () => Object.fromEntries(new URLSearchParams(searchKey).entries()) as Record<string, string>,
    [searchKey],
  );
  const scope: FinanceScope = useMemo(() => parseFinanceScope(rawParams), [rawParams]);

  const selectedChart = useMemo(() => {
    if (chartCode) return charts.find((chart) => chart.code === chartCode) ?? chartFallback(chartCode);
    return charts[0] ?? null;
  }, [chartCode, charts]);

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchKey);
    mutate(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchKey]);

  const setTab = useCallback((nextTab: CoaTab) => {
    replaceParams((params) => {
      params.set("tab", nextTab);
    });
  }, [replaceParams]);

  const openChart = useCallback((chart: ChartOfAccount) => {
    replaceParams((params) => {
      params.set("tab", "explorer");
      params.set("chart", chart.code);
    });
  }, [replaceParams]);

  const returnToCatalog = useCallback(() => {
    replaceParams((params) => {
      params.set("tab", "catalog");
      params.delete("chart");
    });
  }, [replaceParams]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden sm:gap-3">
      <section className="shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex min-h-10 flex-wrap items-center gap-2 border-b px-2 py-1.5 sm:px-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => router.push("/finance")}
            aria-label="Back to Finance"
            title="Back to Finance"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-foreground">COA WORKBENCH</span>
            <Badge variant="muted" className="hidden sm:inline-flex">finance / coa</Badge>
          </div>
          <div className="ml-auto min-w-0 text-sm text-muted-foreground">
            {selectedChart ? (
              <span className="truncate">
                <span className="font-mono text-foreground">{selectedChart.code}</span>
                {" / "}
                {selectedChart.name}
              </span>
            ) : chartsLoading ? (
              "Loading charts..."
            ) : (
              "No charts"
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setTab(value as CoaTab)} className="min-w-0">
          <TabsList className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent px-2 py-0">
            {COA_TABS.map((tab) => (
              <CoaTabTrigger key={tab.value} tab={tab} />
            ))}
          </TabsList>
        </Tabs>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <Tabs value={activeTab} onValueChange={(value) => setTab(value as CoaTab)} className="flex min-h-0 flex-1 flex-col">
          <TabsContent value="entities" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <LegalEntityView />
          </TabsContent>

          <TabsContent value="catalog" className="mt-0 min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-6xl px-4 py-3">
              <CoaCatalogView charts={charts} isLoading={chartsLoading} onOpenChart={openChart} />
            </div>
          </TabsContent>

          <TabsContent value="explorer" className="mt-0 min-h-0 flex-1 overflow-hidden">
            {selectedChart ? (
              <AccountExplorerView chart={selectedChart} onBack={returnToCatalog} />
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Select a chart from the catalog.
              </div>
            )}
          </TabsContent>

          <TabsContent value="controls" className="mt-0 min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-7xl px-4 py-3">
              <CompanyControlsView />
            </div>
          </TabsContent>

          <TabsContent value="mapping" className="mt-0 min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-6xl px-4 py-3">
              <MappingWorkbenchView charts={charts} isLoadingCharts={chartsLoading} />
            </div>
          </TabsContent>

          <TabsContent value="trial-balance" className="mt-0 min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-6xl px-4 py-3">
              <TrialBalanceView scope={scope} />
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
