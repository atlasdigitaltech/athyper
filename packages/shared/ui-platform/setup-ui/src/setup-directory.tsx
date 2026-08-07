"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Search } from "lucide-react";
import type { ResolvedSetupScope, SetupDomainState, SetupWorkspaceContract } from "@athyper/runtime-contracts";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@athyper/platform-ui/primitives";

export type SetupPlane = "admin" | "neon" | "mesh";
export type SetupFetch = <T = unknown>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }) => Promise<T>;

export interface SetupDestination {
  id: string;
  plane: SetupPlane;
  workspaceCode: string;
  domainCode: string;
  label: string;
  description?: string;
  href: string;
  requiredPermissions: string[];
  requiredModules: string[];
  readiness?: number;
  issues?: number;
  state?: SetupDomainState;
  lastVisitedAt?: string;
}

export interface SetupDirectoryResponse {
  plane: SetupPlane;
  workspaces: SetupWorkspaceContract[];
  destinations: SetupDestination[];
  scopes: ResolvedSetupScope[];
  recent: SetupDestination[];
}

export interface SetupRedirectResolution {
  kind: "redirect" | "directory" | "unavailable" | "handoff";
  destination?: SetupDestination;
}

export function resolveSetupEntry(destinations: readonly SetupDestination[], currentPlane: SetupPlane): SetupRedirectResolution {
  if (!destinations.length) return { kind: "unavailable" };
  if (destinations.length > 1) return { kind: "directory" };
  const destination = destinations[0]!;
  return destination.plane === currentPlane ? { kind: "redirect", destination } : { kind: "handoff", destination };
}

export function SetupDirectory({ plane, fetcher, navigate }: { plane: SetupPlane; fetcher: SetupFetch; navigate: (href: string) => void }) {
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [data, setData] = useState<SetupDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const loadStartedAt = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await fetcher<SetupDirectoryResponse>(`/api/relay/platform/setup-directory?plane=${plane}`);
      setData(response);
      emitSurfaceEvent({
        name: "surface_opened", plane, scopeType: "tenant",
        scopeId: response.scopes[0]?.id, surfaceCode: "setup.directory",
        route: "/setup", durationMs: performance.now() - loadStartedAt.current, result: "success",
      });
    }
    catch {
      setError(true);
      emitSurfaceEvent({
        name: "surface_load_failed", plane, scopeType: "tenant",
        surfaceCode: "setup.directory", route: "/setup",
        durationMs: performance.now() - loadStartedAt.current, result: "failure",
      });
    }
    finally { setLoading(false); }
  }, [fetcher, plane]);
  useEffect(() => { void load(); }, [load]);

  const destinations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.destinations ?? []).filter((item) => !normalized || `${item.label} ${item.description ?? ""} ${item.workspaceCode}`.toLowerCase().includes(normalized));
  }, [data?.destinations, query]);
  const resolution = useMemo(
    () => resolveSetupEntry(data?.destinations ?? [], plane),
    [data?.destinations, plane],
  );
  useEffect(() => {
    if (resolution.kind === "redirect" && resolution.destination) {
      navigateRef.current(resolution.destination.href);
    }
  }, [resolution]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /></div>;
  if (error || !data) return <div role="alert" className="rounded-xl border border-destructive/40 p-6"><h1 className="font-semibold">Setup directory unavailable</h1><Button variant="outline" className="mt-4" onClick={() => void load()}>Try again</Button></div>;
  if (!data.destinations.length) return <div className="rounded-xl border border-dashed p-10 text-center"><h1 className="font-semibold">No setup destinations available</h1><p className="mt-2 text-sm text-muted-foreground">Your current permissions, modules, and scope do not authorize a setup workspace.</p></div>;

  return (
    <main className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Setup</h1><p className="mt-1 text-sm text-muted-foreground">Authorized configuration workspaces for the current context.</p></header>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
        <label className="relative"><span className="sr-only">Search setup</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search setup destinations" className="pl-9" /></label>
        <Select value={scope || data.scopes[0]?.code} onValueChange={setScope}><SelectTrigger aria-label="Setup scope"><SelectValue placeholder="Current scope" /></SelectTrigger><SelectContent>{data.scopes.map((item) => <SelectItem key={`${item.type}:${item.code}`} value={item.code}>{item.label}</SelectItem>)}</SelectContent></Select>
      </div>
      {data.recent.length > 0 && <section><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4" aria-hidden />Recent setup</h2><div className="flex flex-wrap gap-2">{data.recent.map((item) => <Button key={item.id} variant="outline" size="sm" onClick={() => navigate(item.href)}>{item.label}</Button>)}</div></section>}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {destinations.map((item) => (
          <button key={item.id} type="button" onClick={() => {
            emitSurfaceEvent({
              name: "setup_destination_opened", plane, scopeType: "tenant",
              scopeId: data.scopes[0]?.id, surfaceCode: `setup.${item.workspaceCode}.${item.domainCode}`,
              route: item.href, durationMs: 0, result: "success",
            });
            if (item.plane === plane) navigate(item.href);
            else void fetcher("/api/relay/platform/setup-handoff", { method: "POST", body: { destinationId: item.id, targetPlane: item.plane } }).then(() => navigate(item.href));
          }} className="rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/40">
            <span className="flex items-start justify-between gap-3"><span><span className="font-semibold">{item.label}</span>{item.plane !== plane && <span className="ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase">{item.plane}</span>}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden /></span>
            {item.description && <span className="mt-2 block text-sm text-muted-foreground">{item.description}</span>}
            <span className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {item.readiness != null && <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{item.readiness}% ready</span>}
              {item.issues != null && item.issues > 0 && <span className="flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{item.issues} issues</span>}
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}
