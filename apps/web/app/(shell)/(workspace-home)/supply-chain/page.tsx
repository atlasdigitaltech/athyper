/**
 * Supply Chain Workspace — /supply-chain
 *
 * Domain launcher. No data entry. Action cards only.
 * Routes users into supply-chain workbenches and document lists.
 */

import { ArrowRight, FileText, Package, ShoppingCart, Truck, Warehouse } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/purchase-order",
    title: "Purchase Orders",
    description: "Create and manage procurement orders",
    icon: ShoppingCart,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    href: "/app/purchase-invoice",
    title: "Supplier Invoices",
    description: "Receive, match, and approve supplier invoices",
    icon: FileText,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    href: "/app/vendor",
    title: "Vendors",
    description: "Supplier master records and onboarding",
    icon: Package,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    href: "/app/item",
    title: "Item Master",
    description: "Products, materials, and services catalog",
    icon: Package,
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    href: "/app/warehouse",
    title: "Warehouses",
    description: "Storage locations and inventory positions",
    icon: Warehouse,
    color: "text-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    href: "/app/shipment",
    title: "Shipments",
    description: "Logistics and transportation tracking",
    icon: Truck,
    color: "text-rose-600",
    bg: "bg-rose-50 dark:bg-rose-950/30",
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Supply Chain
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map(({ href, title, description, icon: Icon, color, bg }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
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
