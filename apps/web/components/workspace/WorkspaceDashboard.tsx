import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Card, CardContent, buttonVariants } from "@athyper/ui/primitives";
import { normalizeAppEntityHref } from "@athyper/runtime-shared/core";

export type WorkspaceArchetype = "Simple" | "Rich" | "Doc";
export type WorkspaceSectionKey = "work" | "masterData" | "setup" | "reports";

export interface WorkspaceMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface WorkspaceAction {
  label: string;
  href: string;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

export interface WorkspaceEntityLink {
  label: string;
  href: string;
  archetype: WorkspaceArchetype;
  description: string;
  adminOnly?: boolean;
  primaryAction?: string;
}

export interface WorkspaceEntitySection {
  key: WorkspaceSectionKey;
  title: string;
  items: WorkspaceEntityLink[];
}

export interface WorkspaceModuleModel {
  code: string;
  label: string;
  description: string;
  sections: WorkspaceEntitySection[];
}

export interface WorkspaceDashboardModel {
  href: string;
  title: string;
  description: string;
  statusLabel?: string;
  metrics?: WorkspaceMetric[];
  quickActions: WorkspaceAction[];
  modules: WorkspaceModuleModel[];
  adminStudioHref?: string;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveWorkspaceModuleCode(
  model: WorkspaceDashboardModel,
  value: string | string[] | undefined,
): string {
  const requested = firstParam(value)?.toUpperCase();
  const found = requested
    ? model.modules.find((mod) => mod.code === requested)
    : null;
  return found?.code ?? model.modules[0]?.code ?? "";
}

function archetypeVariant(archetype: WorkspaceArchetype): "muted" | "info" | "warning" {
  if (archetype === "Doc") return "warning";
  if (archetype === "Rich") return "info";
  return "muted";
}

function MetricStrip({ metrics }: { metrics: WorkspaceMetric[] }) {
  if (metrics.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">{metric.value}</p>
          {metric.detail && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{metric.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EntityRow({ item }: { item: WorkspaceEntityLink }) {
  const href = normalizeAppEntityHref(item.href);
  return (
    <Link
      href={href}
      className="group grid gap-2 border-t px-3 py-2.5 transition-colors first:border-t-0 hover:bg-accent/35 md:grid-cols-[minmax(180px,1.1fr)_auto_minmax(260px,1.8fr)_auto]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.label}</p>
        {item.primaryAction && (
          <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{item.primaryAction}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Badge
          variant={archetypeVariant(item.archetype)}
          size="sm"
          className="shrink-0"
        >
          {item.archetype}
        </Badge>
        {item.adminOnly && (
          <Badge variant="outline" size="sm" className="shrink-0 text-muted-foreground">
            Admin
          </Badge>
        )}
      </div>
      <p className="min-w-0 text-sm text-muted-foreground">{item.description}</p>
      <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
        {item.primaryAction && <span>{item.primaryAction}</span>}
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function EntitySection({ section }: { section: WorkspaceEntitySection }) {
  if (section.items.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
        </div>
        <div>
          {section.items.map((item) => (
            <EntityRow key={`${section.key}:${item.href}`} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export interface WorkspaceDashboardProps {
  model: WorkspaceDashboardModel;
  activeModuleCode: string;
  metricSlot?: ReactNode;
}

export function WorkspaceDashboard({
  model,
  activeModuleCode,
  metricSlot,
}: WorkspaceDashboardProps) {
  const activeModule =
    model.modules.find((mod) => mod.code === activeModuleCode) ??
    model.modules[0];

  return (
    <PageFrame
      title={model.title}
      description={model.description}
      width="full"
      actions={
        model.statusLabel ? (
          <Badge variant="muted" className="text-doc-support">
            {model.statusLabel}
          </Badge>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {metricSlot ?? <MetricStrip metrics={model.metrics ?? []} />}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick actions
            </p>
            {model.adminStudioHref && (
              <Link
                href={model.adminStudioHref}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Open Admin Studio
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {model.quickActions.map((action, index) => {
              const Icon = action.icon;
              const href = normalizeAppEntityHref(action.href);
              return (
                <Link
                  key={action.href}
                  href={href}
                  className={buttonVariants({
                    variant: action.variant ?? (index === 0 ? "primary" : "outline"),
                    size: "sm",
                  })}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {action.label}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {model.modules.map((mod) => {
              const active = mod.code === activeModule?.code;
              return (
                <Link
                  key={mod.code}
                  href={`${model.href}?module=${mod.code}`}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {mod.code}
                </Link>
              );
            })}
          </div>

          {activeModule && (
            <div className="rounded-lg border bg-muted/25 px-3 py-2">
              <p className="text-sm font-medium">
                {activeModule.code} {activeModule.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeModule.description}
              </p>
            </div>
          )}
        </section>

        {activeModule && (
          <div className="space-y-3">
            {activeModule.sections.map((section) => (
              <EntitySection key={section.key} section={section} />
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
