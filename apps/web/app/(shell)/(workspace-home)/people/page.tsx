/**
 * People Workspace — /people
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { ArrowRight, CalendarDays, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/employee",
    title: "Employees",
    description: "Employee master records, profiles, and org assignments",
    icon: Users,
    color: "text-accent-foreground",
    bg: "bg-accent/10",
  },
  {
    href: "/app/payroll-run",
    title: "Payroll",
    description: "Payroll processing runs and pay registers",
    icon: Wallet,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    href: "/app/leave-request",
    title: "Leave & Attendance",
    description: "Leave requests, approvals, and attendance records",
    icon: CalendarDays,
    color: "text-primary",
    bg: "bg-primary/10",
  },
] as const;

export default function PeopleWorkspacePage() {
  return (
    <PageFrame
      title="People"
      description="Human resources, payroll, and workforce management"
    >
      <div className="space-y-6">
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            People
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules: HR · PAYROLL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Additional workforce management workbenches will appear here as HR and Payroll modules are activated.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
