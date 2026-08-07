"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@athyper/platform-ui/primitives";
import { PageFrame } from "@athyper/platform-ui/layout";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { ChartTreePanel } from "./ChartTreePanel";
import { GlAccountsListPanel } from "./GlAccountsListPanel";
import { InspectorPanel } from "./InspectorPanel";
import { BooksListPanel, HouseBanksExplorePanel } from "./BooksAndBanksPanels";
import type { ExploreChartNode } from "../../hooks/useFinanceExplore";

export interface ExploreWorkspaceViewProps {
  companyCode: string;
}

export function ExploreWorkspaceView({ companyCode }: ExploreWorkspaceViewProps) {
  const [selectedNode, setSelectedNode] = useState<ExploreChartNode | null>(null);

  return (
    <PageFrame>
      <div className="flex flex-col gap-4 pb-10">
        <WorkspaceHeader companyCode={companyCode} workspace="explore" />

        <Tabs defaultValue="chart">
          <TabsList>
            <TabsTrigger value="chart">Chart tree</TabsTrigger>
            <TabsTrigger value="accounts">GL accounts</TabsTrigger>
            <TabsTrigger value="books">Books</TabsTrigger>
            <TabsTrigger value="banks">House banks</TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_360px]">
              <div className="min-h-[560px] rounded-lg border bg-card">
                <ChartTreePanel
                  companyCode={companyCode}
                  selectedId={selectedNode?.id}
                  onSelect={setSelectedNode}
                />
              </div>
              <div className="min-h-[560px]">
                <InspectorPanel companyCode={companyCode} node={selectedNode} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="accounts" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_360px]">
              <GlAccountsListPanel
                companyCode={companyCode}
                selectedCode={selectedNode?.code}
                onSelect={(row) => setSelectedNode({
                  id:                row.glAccountId,
                  parentId:          null,
                  code:              row.accountCode,
                  name:              row.accountName,
                  accountClass:      row.accountClass,
                  normalBalance:     row.normalBalance,
                  nodeType:          "posting",
                  isPosting:         true,
                  isActive:          row.postingAllowed,
                  status:            row.hasCompanyControl ? "active" : "draft",
                  levelNo:           1,
                  hasCompanyControl: row.hasCompanyControl,
                  subledgerType:     row.subledgerType,
                })}
              />
              <div className="min-h-[560px]">
                <InspectorPanel companyCode={companyCode} node={selectedNode} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="books" className="mt-4">
            <BooksListPanel companyCode={companyCode} />
          </TabsContent>

          <TabsContent value="banks" className="mt-4">
            <HouseBanksExplorePanel companyCode={companyCode} />
          </TabsContent>
        </Tabs>
      </div>
    </PageFrame>
  );
}
