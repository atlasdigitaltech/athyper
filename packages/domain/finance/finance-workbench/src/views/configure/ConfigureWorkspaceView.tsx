"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { GlControlsGrid } from "./GlControlsGrid";
import { ChartAssignmentPanel, BookAssignmentPanel } from "./ChartAndBookAssignmentPanels";
import { HouseBanksExplorePanel } from "../explore/BooksAndBanksPanels";

export interface ConfigureWorkspaceViewProps {
  companyCode:  string;
  initialTab?:  "gl_controls" | "chart_assignment" | "book_assignment" | "house_banks";
}

export function ConfigureWorkspaceView({ companyCode, initialTab = "gl_controls" }: ConfigureWorkspaceViewProps) {
  return (
    <PageFrame>
      <div className="flex flex-col gap-4 pb-10">
        <WorkspaceHeader companyCode={companyCode} workspace="configure" />

        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value="gl_controls">GL controls</TabsTrigger>
            <TabsTrigger value="chart_assignment">Chart assignment</TabsTrigger>
            <TabsTrigger value="book_assignment">Book assignment</TabsTrigger>
            <TabsTrigger value="house_banks">House banks</TabsTrigger>
          </TabsList>

          <TabsContent value="gl_controls" className="mt-4">
            <GlControlsGrid companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="chart_assignment" className="mt-4">
            <ChartAssignmentPanel companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="book_assignment" className="mt-4">
            <BookAssignmentPanel companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="house_banks" className="mt-4">
            <HouseBanksExplorePanel companyCode={companyCode} />
          </TabsContent>
        </Tabs>
      </div>
    </PageFrame>
  );
}
