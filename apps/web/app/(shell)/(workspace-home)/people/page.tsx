/**
 * People Workspace — /people
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { CalendarDays, Users, Wallet } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/employee",
    title: "Employees",
    description: "Employee master records, profiles, and org assignments",
    icon: Users,
    iconClass: "text-accent-foreground",
    iconBgClass: "bg-accent/10",
  },
  {
    href: "/app/payroll_run",
    title: "Payroll",
    description: "Payroll processing runs and pay registers",
    icon: Wallet,
    iconClass: "text-success",
    iconBgClass: "bg-success/10",
  },
  {
    href: "/app/leave_request",
    title: "Leave & Attendance",
    description: "Leave requests, approvals, and attendance records",
    icon: CalendarDays,
    iconClass: "text-primary",
    iconBgClass: "bg-primary/10",
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
          <SectionLabel>People</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} {...action} />
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
