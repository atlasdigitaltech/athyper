/**
 * Customer Experience Workspace — /customer-experience
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { FileText, ShoppingBag, Users } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/customer",
    title: "Customers",
    description: "Customer master records, credit terms, and contacts",
    icon: Users,
    iconClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    href: "/app/sales_order",
    title: "Sales Orders",
    description: "Order entry, fulfilment, and delivery tracking",
    icon: ShoppingBag,
    iconClass: "text-success",
    iconBgClass: "bg-success/10",
  },
  {
    href: "/app/sales_invoice",
    title: "Sales Invoices",
    description: "Customer billing and AR management",
    icon: FileText,
    iconClass: "text-warning",
    iconBgClass: "bg-warning/10",
  },
] as const;

export default function CustomerExperienceWorkspacePage() {
  return (
    <PageFrame
      title="Customer Experience"
      description="CRM, selling, and customer relationship management"
    >
      <div className="space-y-6">
        <div>
          <SectionLabel>Customer Experience</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} {...action} />
            ))}
          </div>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules: CRM · SALE</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              CRM pipeline, quotation management, and selling workbenches will appear here as modules are activated.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
