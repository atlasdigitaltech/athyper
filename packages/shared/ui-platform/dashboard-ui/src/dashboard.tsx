"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import type {
  DashboardAggregate,
  DashboardMetricData,
  DashboardPlane,
  DashboardQueueData,
  DashboardWidgetResult,
} from "@athyper/api-contracts/dashboard";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";

export type DashboardFetch = <T = unknown>(
  path: string,
  init?: { method?: "GET" | "POST"; signal?: AbortSignal },
) => Promise<T>;

export interface DashboardWidgetRegistration {
  id: string;
  title: string;
  description?: string;
  kind: "attention" | "metric" | "queue" | "status" | "recent" | "saved-views" | "setup-readiness";
  layout: { columnSpan: 1 | 2 | 3 | 4; rowSpan?: 1 | 2 };
  permission?: string;
  query: { key: string; freshnessMs: number };
}

export interface DashboardExperience {
  plane: DashboardPlane;
  title: string;
  subtitle: string;
  registrations: readonly DashboardWidgetRegistration[];
}

export function visibleDashboardRegistrations(
  registrations: readonly DashboardWidgetRegistration[],
  permissions: readonly string[],
): DashboardWidgetRegistration[] {
  const granted = new Set(permissions);
  return registrations.filter((registration) =>
    !registration.permission || granted.has(registration.permission) || granted.has("*"),
  );
}

export function isDashboardResultStale(result: DashboardWidgetResult | undefined, now = Date.now()): boolean {
  return Boolean(result && (result.state === "stale" || now >= Date.parse(result.staleAt)));
}

function DashboardHostHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>
      {actions}
    </header>
  );
}

function WidgetFrame({ registration, children, stale }: {
  registration: DashboardWidgetRegistration;
  children: ReactNode;
  stale?: boolean;
}) {
  const spanClass = {
    1: "xl:col-span-1",
    2: "md:col-span-2 xl:col-span-2",
    3: "md:col-span-2 xl:col-span-3",
    4: "md:col-span-2 xl:col-span-4",
  }[registration.layout.columnSpan];
  return (
    <section
      className={`rounded-xl border bg-card p-5 ${spanClass}`}
      aria-labelledby={`widget-${registration.id}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 id={`widget-${registration.id}`} className="text-sm font-semibold">{registration.title}</h2>{registration.description && <p className="mt-1 text-xs text-muted-foreground">{registration.description}</p>}</div>
        {stale && <span className="flex items-center gap-1 text-xs text-amber-700"><Clock3 className="h-3 w-3" aria-hidden /> Stale</span>}
      </div>
      {children}
    </section>
  );
}

export function DashboardWidgetSkeleton({ registration }: { registration: DashboardWidgetRegistration }) {
  return <WidgetFrame registration={registration}><div className="space-y-2"><Skeleton className="h-8 w-2/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div></WidgetFrame>;
}

export function DashboardWidgetEmpty({ label = "No items require attention." }: { label?: string }) {
  return <p className="py-5 text-center text-sm text-muted-foreground">{label}</p>;
}

export function DashboardWidgetFailed({ retry }: { retry?: () => void }) {
  return <div role="alert" className="rounded-md bg-destructive/5 p-3 text-sm text-destructive"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden />Data is temporarily unavailable.</div>{retry && <Button variant="outline" size="sm" className="mt-3" onClick={retry}>Retry</Button>}</div>;
}

function MetricContent({ data }: { data: DashboardMetricData }) {
  return <div><p className="text-3xl font-semibold tabular-nums">{data.value}</p>{data.detail && <p className="mt-1 text-sm text-muted-foreground">{data.detail}</p>}{data.trend && <p className="mt-2 text-xs text-muted-foreground">{data.trend}</p>}</div>;
}

function QueueContent({ data }: { data: DashboardQueueData }) {
  if (!data.items.length) return <DashboardWidgetEmpty />;
  return <ul className="divide-y">{data.items.slice(0, 6).map((item) => <li key={item.id} className="py-2.5"><a href={item.href} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block text-sm font-medium">{item.title}</span>{item.detail && <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>}</a></li>)}</ul>;
}

export function MetricWidget({ data }: { data: DashboardMetricData }) { return <MetricContent data={data} />; }
export function AttentionWidget({ data }: { data: DashboardQueueData | DashboardMetricData }) { return "items" in data ? <QueueContent data={data} /> : <MetricContent data={data} />; }
export function QueueWidget({ data }: { data: DashboardQueueData }) { return <QueueContent data={data} />; }
export function StatusWidget({ data }: { data: DashboardMetricData }) { return <MetricContent data={data} />; }
export function RecentItemsWidget({ data }: { data: DashboardQueueData }) { return <QueueContent data={data} />; }
export function SavedViewsWidget({ data }: { data: DashboardQueueData }) { return <QueueContent data={data} />; }
export function SetupReadinessWidget({ data }: { data: DashboardMetricData }) { return <MetricContent data={data} />; }

function WidgetBody({ registration, result, retry }: {
  registration: DashboardWidgetRegistration;
  result: DashboardWidgetResult | undefined;
  retry: () => void;
}) {
  if (!result) return <DashboardWidgetFailed retry={retry} />;
  if (result.state === "failed") return <DashboardWidgetFailed retry={retry} />;
  if (result.state === "empty") return <DashboardWidgetEmpty />;
  if (result.state === "denied") return <DashboardWidgetEmpty label="This widget is not available for your current permissions." />;
  const data = result.data as DashboardMetricData | DashboardQueueData | undefined;
  if (!data) return <DashboardWidgetFailed retry={retry} />;
  if (registration.kind === "queue" || registration.kind === "recent" || registration.kind === "saved-views") return <QueueWidget data={data as DashboardQueueData} />;
  if (registration.kind === "attention") return <AttentionWidget data={data} />;
  if (registration.kind === "setup-readiness") return <SetupReadinessWidget data={data as DashboardMetricData} />;
  if (registration.kind === "status") return <StatusWidget data={data as DashboardMetricData} />;
  return <MetricWidget data={data as DashboardMetricData} />;
}

export function DashboardHost({ experience, fetcher }: { experience: DashboardExperience; fetcher: DashboardFetch }) {
  const [aggregate, setAggregate] = useState<DashboardAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [, tick] = useState(0);
  const reportedWidgetFailures = useRef(new Set<string>());
  const scopeType = experience.plane === "admin"
    ? "platform"
    : experience.plane === "mesh"
      ? "network_account"
      : "tenant";

  const load = useCallback(async (force = false) => {
    setFailed(false);
    const startedAt = performance.now();
    try {
      const response = await fetcher<DashboardAggregate>(`/api/relay/platform/dashboard?plane=${experience.plane}${force ? "&refresh=1" : ""}`);
      setAggregate(response);
      emitSurfaceEvent({
        name: "surface_opened",
        plane: experience.plane,
        scopeType,
        surfaceCode: "dashboard.host",
        route: "/dashboard",
        durationMs: performance.now() - startedAt,
        result: "success",
      });
    } catch {
      setFailed(true);
      emitSurfaceEvent({
        name: "surface_load_failed",
        plane: experience.plane,
        scopeType,
        surfaceCode: "dashboard.host",
        route: "/dashboard",
        durationMs: performance.now() - startedAt,
        result: "failure",
      });
    } finally {
      setLoading(false);
    }
  }, [experience.plane, fetcher, scopeType]);

  useEffect(() => { void load(false); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!aggregate) return;
    for (const [queryKey, result] of Object.entries(aggregate.widgets)) {
      const eventKey = `${queryKey}:${result?.state ?? "missing"}`;
      if (result?.state === "failed" && !reportedWidgetFailures.current.has(eventKey)) {
        reportedWidgetFailures.current.add(eventKey);
        emitSurfaceEvent({
          name: "widget_load_failed",
          plane: experience.plane,
          scopeType,
          surfaceCode: `dashboard.widget.${queryKey}`,
          route: "/dashboard",
          durationMs: 0,
          result: "failure",
        });
      } else if (result?.state !== "failed") {
        reportedWidgetFailures.current.delete(`${queryKey}:failed`);
      }
    }
  }, [aggregate, experience.plane, scopeType]);

  const visible = useMemo(() => {
    return visibleDashboardRegistrations(experience.registrations, aggregate?.permissions ?? []);
  }, [aggregate?.permissions, experience.registrations]);
  const aggregateStale = aggregate ? Date.now() >= Date.parse(aggregate.staleAt) : false;

  return (
    <div className="space-y-6">
      <DashboardHostHeader title={experience.title} subtitle={experience.subtitle} actions={<Button variant="outline" size="sm" className="gap-2" onClick={() => void load(true)}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Refresh</Button>} />
      {failed && !aggregate ? <DashboardWidgetFailed retry={() => void load(true)} /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {loading && !aggregate
            ? experience.registrations.map((registration) => <DashboardWidgetSkeleton key={registration.id} registration={registration} />)
            : visible.map((registration) => {
              const result = aggregate?.widgets[registration.query.key];
              const stale = aggregateStale || isDashboardResultStale(result);
              return <WidgetFrame key={registration.id} registration={registration} stale={stale}><WidgetBody registration={registration} result={result} retry={() => void load(true)} /></WidgetFrame>;
            })}
        </div>
      )}
    </div>
  );
}
