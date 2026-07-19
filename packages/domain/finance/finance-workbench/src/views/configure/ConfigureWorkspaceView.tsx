"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { GlControlsGrid } from "./GlControlsGrid";
import { ChartAssignmentPanel, BookAssignmentPanel } from "./ChartAndBookAssignmentPanels";
import { HouseBanksExplorePanel } from "../explore/BooksAndBanksPanels";
import { FiscalCalendarDesigner } from "./FiscalCalendarDesigner";
import { PostingRoleCoverageMatrix } from "./PostingRoleCoverageMatrix";
import { FinanceAggregateEditor } from "./FinanceAggregateEditor";

export interface ConfigureWorkspaceViewProps {
  companyCode:  string;
  initialTab?:  "fiscal_calendar" | "posting_roles" | "dimension_policies" | "tax_configuration" | "payment_interfaces" | "gl_controls" | "chart_assignment" | "book_assignment" | "house_banks";
}

export function ConfigureWorkspaceView({ companyCode, initialTab = "gl_controls" }: ConfigureWorkspaceViewProps) {
  return (
    <PageFrame>
      <div className="flex flex-col gap-4 pb-10">
        <WorkspaceHeader companyCode={companyCode} workspace="configure" />

        <Tabs defaultValue={initialTab}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="fiscal_calendar">Fiscal calendar</TabsTrigger>
            <TabsTrigger value="posting_roles">Posting roles</TabsTrigger>
            <TabsTrigger value="dimension_policies">Dimensions</TabsTrigger>
            <TabsTrigger value="tax_configuration">Tax</TabsTrigger>
            <TabsTrigger value="payment_interfaces">Payments</TabsTrigger>
            <TabsTrigger value="gl_controls">GL controls</TabsTrigger>
            <TabsTrigger value="chart_assignment">Chart assignment</TabsTrigger>
            <TabsTrigger value="book_assignment">Book assignment</TabsTrigger>
            <TabsTrigger value="house_banks">House banks</TabsTrigger>
          </TabsList>

          <TabsContent value="fiscal_calendar" className="mt-4">
            <FiscalCalendarDesigner companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="posting_roles" className="mt-4">
            <PostingRoleCoverageMatrix companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="dimension_policies" className="mt-4">
            <FinanceAggregateEditor kind="dimensions" companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="tax_configuration" className="mt-4">
            <FinanceAggregateEditor kind="tax" companyCode={companyCode} />
          </TabsContent>
          <TabsContent value="payment_interfaces" className="mt-4">
            <FinanceAggregateEditor kind="payments" companyCode={companyCode} />
          </TabsContent>
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
