/**
 * Manufacturing Workspace — /manufacturing
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { Factory, Settings, Wrench } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/work-order",
    title: "Work Orders",
    description: "Production work orders, operations, and scheduling",
    icon: Factory,
    iconClass: "text-destructive",
    iconBgClass: "bg-destructive/10",
  },
  {
    href: "/app/bom",
    title: "Bill of Materials",
    description: "Product structures and component definitions",
    icon: Settings,
    iconClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    href: "/app/maintenance-order",
    title: "Maintenance",
    description: "Preventive and corrective maintenance orders",
    icon: Wrench,
    iconClass: "text-warning",
    iconBgClass: "bg-warning/10",
  },
] as const;

export default function ManufacturingWorkspacePage() {
  return (
    <PageFrame
      title="Manufacturing"
      description="Production operations and maintenance management"
    >
      <div className="space-y-6">
        <div>
          <SectionLabel>Manufacturing</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} {...action} />
            ))}
          </div>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules: MFG · MAINT</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Production scheduling, capacity planning, and quality management workbenches will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
