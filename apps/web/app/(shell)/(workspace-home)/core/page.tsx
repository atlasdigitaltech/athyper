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

import { ArrowRight, Bell, GitBranch, Globe, Shield, Zap } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";

const CORE_ACTIONS = [
  {
    href: "/core/INT",
    title: "Integration Hub",
    description: "API connections, webhooks, and data sync pipelines",
    icon: Globe,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    href: "/core/WFL",
    title: "Workflow Engine",
    description: "Approval flows, routing rules, and workflow templates",
    icon: GitBranch,
    color: "text-accent-foreground",
    bg: "bg-accent/10",
  },
  {
    href: "/core/JOB",
    title: "Automation & Jobs",
    description: "Scheduled jobs, batch operations, and automation rules",
    icon: Zap,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    href: "/core/NTF",
    title: "Notification Services",
    description: "Notification templates, delivery channels, and digest rules",
    icon: Bell,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  {
    href: "/core/IAM",
    title: "Identity & Access",
    description: "Roles, principals, permissions, and delegation rules",
    icon: Shield,
    color: "text-success",
    bg: "bg-success/10",
  },
] as const;

export default function CoreWorkspacePage() {
  return (
    <PageFrame
      title="Core"
      description="Infrastructure modules — integration, automation, identity, and notifications"
    >
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Core Services
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_ACTIONS.map(({ href, title, description, icon: Icon, color, bg }) => (
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
    </PageFrame>
  );
}
