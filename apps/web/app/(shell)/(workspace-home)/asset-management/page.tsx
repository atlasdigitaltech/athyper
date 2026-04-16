/**
 * Asset Management Workspace — /asset-management
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { Briefcase, Building, Home } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/asset",
    title: "Fixed Assets",
    description: "Asset register, depreciation schedules, disposals",
    icon: Briefcase,
    iconClass: "text-info",
    iconBgClass: "bg-info/10",
  },
  {
    href: "/app/property",
    title: "Real Estate",
    description: "Properties, leases, and rental management",
    icon: Building,
    iconClass: "text-accent-foreground",
    iconBgClass: "bg-accent/10",
  },
  {
    href: "/app/facility",
    title: "Facilities",
    description: "Facility management, space allocation, and services",
    icon: Home,
    iconClass: "text-success",
    iconBgClass: "bg-success/10",
  },
] as const;

export default function AssetManagementWorkspacePage() {
  return (
    <PageFrame
      title="Asset Management"
      description="Fixed assets, real estate, and facility management"
    >
      <div className="space-y-6">
        <div>
          <SectionLabel>Asset Management</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} {...action} />
            ))}
          </div>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules: ASSET · ASSETREMS · ASSETFM</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Asset lifecycle workbenches, depreciation analysis, and lease management surfaces will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
