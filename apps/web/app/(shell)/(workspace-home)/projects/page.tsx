/**
 * Projects Workspace — /projects
 *
 * Domain launcher. No data entry. Action cards only.
 */

import { FolderKanban, HeadphonesIcon, Timer } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const WORKBENCH_ACTIONS = [
  {
    href: "/app/project",
    title: "Projects",
    description: "Project setup, milestones, and resource planning",
    icon: FolderKanban,
    iconClass: "text-success",
    iconBgClass: "bg-success/10",
  },
  {
    href: "/app/timesheet",
    title: "Timesheets",
    description: "Time and expense capture against project tasks",
    icon: Timer,
    iconClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    href: "/app/support-ticket",
    title: "Support Tickets",
    description: "ITSM — service requests, incidents, and resolutions",
    icon: HeadphonesIcon,
    iconClass: "text-accent-foreground",
    iconBgClass: "bg-accent/10",
  },
] as const;

export default function ProjectsWorkspacePage() {
  return (
    <PageFrame
      title="Projects"
      description="Project management, costing, and ITSM"
    >
      <div className="space-y-6">
        <div>
          <SectionLabel>Projects</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} {...action} />
            ))}
          </div>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules: PRJCOST · ITSM</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Project planning workbenches, Gantt views, and resource allocation surfaces will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
