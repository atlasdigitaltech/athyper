"use client";

import { useState } from "react";
import {
  ArrowLeftRight, BarChart3, FolderOpen, GitBranch,
  Layers, SlidersHorizontal,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { ChartOfAccount } from "./data/types";
import { CHARTS } from "./data/demo-data";
import { LegalEntityView } from "./views/LegalEntityView";
import { CoaCatalogView } from "./views/CoaCatalogView";
import { AccountExplorerView } from "./views/AccountExplorerView";
import { CompanyControlsView } from "./views/CompanyControlsView";
import { MappingWorkbenchView } from "./views/MappingWorkbenchView";
import { TrialBalanceView } from "./views/TrialBalanceView";

const SCHEMA_STYLE: Record<string, string> = {
  master:  "text-primary bg-primary/10",
  control: "text-accent-foreground bg-accent/10",
  ledger:  "text-success bg-success/10",
};

const TAB_DEFS = [
  { value: "entities", label: "Group structure",   icon: GitBranch,         schema: "master"  },
  { value: "catalog",  label: "COA catalog",       icon: Layers,            schema: "master"  },
  { value: "explorer", label: "Account explorer",  icon: FolderOpen,        schema: "master"  },
  { value: "controls", label: "Company controls",  icon: SlidersHorizontal, schema: "master"  },
  { value: "mapping",  label: "Mapping",           icon: ArrowLeftRight,    schema: "control" },
  { value: "trial",    label: "Trial balance",     icon: BarChart3,         schema: "ledger"  },
] as const;

export function GlWorkbench() {
  const [tab, setTab] = useState("entities");
  const [chart, setChart] = useState<ChartOfAccount>(CHARTS[0]);

  const handleOpenChart = (c: ChartOfAccount) => {
    setChart(c);
    setTab("explorer");
  };

  return (
    /*
     * Negative margin cancels the shell <main>'s p-4 / lg:p-6 padding so
     * the workbench fills edge-to-edge. The height calc accounts for the
     * shell topbar (h-14 = 56px).
     */
    <div className="-m-4 lg:-m-6 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
        {/* Slim underline tabs -- no bg-muted box */}
        <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent px-2 py-0 gap-0 shrink-0">
          {TAB_DEFS.map(({ value, label, icon: Icon, schema }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "rounded-none border-b-2 border-transparent px-2.5 py-2 text-[11px] gap-1",
                "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              )}
            >
              <Icon size={12} />
              {label}
              <span className={cn("text-[7px] font-mono px-1 py-px rounded leading-none", SCHEMA_STYLE[schema])}>
                {schema}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="entities" className="flex-1 mt-0 min-h-0 overflow-hidden">
          <LegalEntityView />
        </TabsContent>

        <TabsContent value="catalog" className="flex-1 mt-0 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <CoaCatalogView onOpenChart={handleOpenChart} />
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="flex-1 mt-0 min-h-0 overflow-hidden">
          <AccountExplorerView chart={chart} onBack={() => setTab("catalog")} />
        </TabsContent>

        <TabsContent value="controls" className="flex-1 mt-0 min-h-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <CompanyControlsView />
          </div>
        </TabsContent>

        <TabsContent value="mapping" className="flex-1 mt-0 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <MappingWorkbenchView />
          </div>
        </TabsContent>

        <TabsContent value="trial" className="flex-1 mt-0 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <TrialBalanceView />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
