/**
 * Supply Chain Workspace — /supply-chain
 *
 * Domain launcher. No data entry. Action cards only.
 * Routes users into supply-chain workbenches and document lists.
 *
 * Icon and color are derived from control.entity.icon_key / color_token
 * via the @athyper/icons registries — no palette values in this file.
 */

import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";
import { getEntityIcon } from "@athyper/icons/entity-icons";
import { getEntityColorClasses } from "@athyper/icons/color-tokens";

// ── Entity config — matches control.entity seeds (icon_key / color_token) ─────
// href, title, description come from label_singular / label_plural in the seed.
// icon_key and color_token are the exact values stored in control.entity.

const SUPPLY_CHAIN_ENTITIES = [
  {
    href:        "/app/purchase_order",
    title:       "Purchase Orders",
    description: "Create and manage procurement orders",
    icon_key:    "shopping-cart",
    color_token: "orange",
  },
  {
    href:        "/app/purchase_invoice",
    title:       "Supplier Invoices",
    description: "Receive, match, and approve supplier invoices",
    icon_key:    "file-text",
    color_token: "violet",
  },
  {
    href:        "/app/supplier",
    title:       "Suppliers",
    description: "Supplier master records and onboarding",
    icon_key:    "building-2",
    color_token: "blue",
  },
  {
    href:        "/app/customer",
    title:       "Customers",
    description: "Customer master records and accounts",
    icon_key:    "users",
    color_token: "teal",
  },
  {
    href:        "/app/item",
    title:       "Item Master",
    description: "Products, materials, and services catalog",
    icon_key:    "box",
    color_token: "rose",
  },
  {
    href:        "/app/warehouse",
    title:       "Warehouses",
    description: "Storage locations and inventory positions",
    icon_key:    "warehouse",
    color_token: "emerald",
  },
  {
    href:        "/app/shipment",
    title:       "Shipments",
    description: "Logistics and transportation tracking",
    icon_key:    "truck",
    color_token: "orange",
  },
] satisfies Array<{
  href: string;
  title: string;
  description: string;
  icon_key: string;
  color_token: string;
}>;

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
            {SUPPLY_CHAIN_ENTITIES.map((entity) => {
              const { iconClass, iconBgClass } = getEntityColorClasses(entity.color_token);
              return (
                <ActionLinkCard
                  key={entity.href}
                  href={entity.href}
                  title={entity.title}
                  description={entity.description}
                  icon={getEntityIcon(entity.icon_key)}
                  iconClass={iconClass}
                  iconBgClass={iconBgClass}
                />
              );
            })}
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
