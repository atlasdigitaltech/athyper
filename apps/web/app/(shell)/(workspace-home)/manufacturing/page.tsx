/**
 * Manufacturing Workspace — /manufacturing
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { ArrowRight, Factory, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/work-order",
    title: "Work Orders",
    description: "Production work orders, operations, and scheduling",
    icon: Factory,
    color: "text-rose-600",
    bg: "bg-rose-50 dark:bg-rose-950/30",
  },
  {
    href: "/app/bom",
    title: "Bill of Materials",
    description: "Product structures and component definitions",
    icon: Settings,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    href: "/app/maintenance-order",
    title: "Maintenance",
    description: "Preventive and corrective maintenance orders",
    icon: Wrench,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Manufacturing
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
