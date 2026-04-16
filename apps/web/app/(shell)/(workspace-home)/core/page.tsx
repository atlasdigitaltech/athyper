/**
 * Core Workspace — /core
 *
 * Core workspace dashboard — launcher for core infrastructure
 * modules (integration, automation, workflows, notifications, IAM).
 *
 * This is the workspace landing page owned by (workspace-home).
 * Dynamic core module surfaces live at /core/[code] in (platform-runtime).
 *
 * Rule: No data entry here. Action cards only.
 */

import { Bell, GitBranch, Globe, Shield, Zap } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";

const CORE_ACTIONS = [
  {
    href: "/core/INT",
    title: "Integration Hub",
    description: "API connections, webhooks, and data sync pipelines",
    icon: Globe,
    iconClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  {
    href: "/core/WFL",
    title: "Workflow Engine",
    description: "Approval flows, routing rules, and workflow templates",
    icon: GitBranch,
    iconClass: "text-accent-foreground",
    iconBgClass: "bg-accent/10",
  },
  {
    href: "/core/JOB",
    title: "Automation & Jobs",
    description: "Scheduled jobs, batch operations, and automation rules",
    icon: Zap,
    iconClass: "text-warning",
    iconBgClass: "bg-warning/10",
  },
  {
    href: "/core/NTF",
    title: "Notification Services",
    description: "Notification templates, delivery channels, and digest rules",
    icon: Bell,
    iconClass: "text-destructive",
    iconBgClass: "bg-destructive/10",
  },
  {
    href: "/core/IAM",
    title: "Identity & Access",
    description: "Roles, principals, permissions, and delegation rules",
    icon: Shield,
    iconClass: "text-success",
    iconBgClass: "bg-success/10",
  },
] as const;

export default function CoreWorkspacePage() {
  return (
    <PageFrame
      title="Core"
      description="Infrastructure modules — integration, automation, identity, and notifications"
    >
      <div>
        <SectionLabel>Core Services</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_ACTIONS.map((action) => (
            <ActionLinkCard key={action.href} {...action} />
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
