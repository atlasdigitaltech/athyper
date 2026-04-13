/**
 * Asset Management Workspace — /asset-management
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { ArrowRight, Briefcase, Building, Home } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/asset",
    title: "Fixed Assets",
    description: "Asset register, depreciation schedules, disposals",
    icon: Briefcase,
    color: "text-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    href: "/app/property",
    title: "Real Estate",
    description: "Properties, leases, and rental management",
    icon: Building,
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    href: "/app/facility",
    title: "Facilities",
    description: "Facility management, space allocation, and services",
    icon: Home,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Asset Management
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
