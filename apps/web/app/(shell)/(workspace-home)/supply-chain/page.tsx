/**
 * Supply Chain Workspace — /supply-chain
 *
 * Domain launcher. No data entry. Action cards only.
 * Routes users into supply-chain workbenches and document lists.
 */

import { FileText, Package, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/purchase_order",
    title: "Purchase Orders",
    description: "Create and manage procurement orders",
    icon: ShoppingCart,
    iconClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    href: "/app/purchase_invoice",
    title: "Supplier Invoices",
    description: "Receive, match, and approve supplier invoices",
    icon: FileText,
    iconClass: "text-warning",
    iconBgClass: "bg-warning/10",
  },
  {
    href: "/app/vendor",
    title: "Vendors",
    description: "Supplier master records and onboarding",
    icon: Package,
    iconClass: "text-success",
    iconBgClass: "bg-success/10",
  },
  {
    href: "/app/item",
    title: "Item Master",
    description: "Products, materials, and services catalog",
    icon: Package,
    iconClass: "text-accent-foreground",
    iconBgClass: "bg-accent/10",
  },
  {
    href: "/app/warehouse",
    title: "Warehouses",
    description: "Storage locations and inventory positions",
    icon: Warehouse,
    iconClass: "text-info",
    iconBgClass: "bg-info/10",
  },
  {
    href: "/app/shipment",
    title: "Shipments",
    description: "Logistics and transportation tracking",
    icon: Truck,
    iconClass: "text-destructive",
    iconBgClass: "bg-destructive/10",
  },
] as const;

export default function SupplyChainWorkspacePage() {
  return (
    <PageFrame
      title="Supply Chain"
      description="Procurement, inventory, logistics, and supplier management"
    >
      <div className="space-y-6">
        <div>
          <SectionLabel>Supply Chain</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} {...action} />
            ))}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Modules: SRM · SOURCE · CONTRACT · BUY · INVENTORY · QMS · WMS · LOGISTICS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Additional workbench surfaces for sourcing, contracting, quality management,
              warehouse operations, and logistics will appear here as modules are activated.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
