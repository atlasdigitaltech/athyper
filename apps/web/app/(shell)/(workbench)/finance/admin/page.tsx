"use client";

/**
 * Finance Administration — /finance/admin
 *
 * Bespoke workbench surface. No [id] child routes.
 * Configuration and reference views for finance structure:
 *   - Legal Entities (group hierarchy, consolidation)
 *   - Company Controls (account class rules, recon flags)
 *   - COA Mapping (cross-chart translation rules)
 *
 * Tab state preserved in query params:
 *   /finance/admin?tab=legal-entities  (default)
 *   /finance/admin?tab=controls
 *   /finance/admin?tab=mapping
 *   /finance/admin?period=2026-03      → period detail in side panel
 */

import { useSearchParams, useRouter } from "next/navigation";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";
import { LegalEntityView, CompanyControlsView, MappingWorkbenchView } from "@athyper/finance-workbench/views";

type AdminTab = "legal-entities" | "controls" | "mapping";
const VALID_TABS: AdminTab[] = ["legal-entities", "controls", "mapping"];

function isValidTab(s: string | null): s is AdminTab {
  return VALID_TABS.includes(s as AdminTab);
}

export default function FinanceAdminPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const rawTab       = searchParams.get("tab");
  const activeTab: AdminTab = isValidTab(rawTab) ? rawTab : "legal-entities";

  function handleTabChange(tab: string) {
    router.push(`/finance/admin?tab=${tab}`);
  }

  return (
    <PageFrame
      title="Finance Administration"
      description="Legal entities, company controls, and COA mapping rules"
      actions={<Badge variant="muted">finance / admin</Badge>}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="legal-entities">Legal Entities</TabsTrigger>
          <TabsTrigger value="controls">Company Controls</TabsTrigger>
          <TabsTrigger value="mapping">COA Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="legal-entities" className="mt-4">
          <LegalEntityView />
        </TabsContent>

        <TabsContent value="controls" className="mt-4">
          <CompanyControlsView />
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <MappingWorkbenchView />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
