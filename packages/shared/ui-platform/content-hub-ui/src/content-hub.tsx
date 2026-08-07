"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Grid2X2, History, List, Paperclip, Search, ShieldCheck } from "lucide-react";
import { Button, Input, Skeleton } from "@athyper/platform-ui/primitives";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";

export type ContentPlane = "admin" | "neon" | "mesh";
export type ContentFetch = <T = unknown>(path: string) => Promise<T>;
export interface ContentAttachment { id: string; name: string; contentType?: string; sizeBytes?: number; downloadHref?: string }
export interface ContentVersion { id: string; label: string; createdAt?: string; status?: string }
export interface ContentItem {
  id: string; provider: string; title: string; summary?: string; kind: string; status?: string; updatedAt?: string;
  preview?: string; accessLabel?: string; attachments: ContentAttachment[]; versions: ContentVersion[];
  related: Array<{ id: string; title: string }>;
}
export interface ContentHubResponse { plane: ContentPlane; projection: string; items: ContentItem[] }

export interface ContentProviderAdapter {
  plane: ContentPlane;
  endpoint: string;
  projection: string;
}

export function ContentHub({ adapter, fetcher }: { adapter: ContentProviderAdapter; fetcher: ContentFetch }) {
  const [data, setData] = useState<ContentHubResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [mode, setMode] = useState<"list" | "grid">("list");
  const [failure, setFailure] = useState<"denied" | "error" | null>(null);
  const loadStartedAt = useMemo(() => typeof performance === "undefined" ? 0 : performance.now(), []);
  const load = useCallback(async () => {
    setFailure(null);
    try {
      const response = await fetcher<ContentHubResponse>(adapter.endpoint);
      setData(response);
      setSelected((current) => current ?? response.items[0]?.id ?? null);
      emitSurfaceEvent({
        name: "surface_opened", plane: adapter.plane, scopeType: adapter.plane === "mesh" ? "network_account" : adapter.plane === "admin" ? "platform" : "tenant",
        surfaceCode: "content.hub", route: "/content",
        durationMs: performance.now() - loadStartedAt, result: "success",
      });
    }
    catch (cause) {
      const status = typeof cause === "object" && cause !== null && "status" in cause
        ? Number((cause as { status?: unknown }).status)
        : undefined;
      setFailure(status === 401 || status === 403 ? "denied" : "error");
      emitSurfaceEvent({
        name: "surface_load_failed", plane: adapter.plane, scopeType: adapter.plane === "mesh" ? "network_account" : adapter.plane === "admin" ? "platform" : "tenant",
        surfaceCode: "content.hub", route: "/content",
        durationMs: performance.now() - loadStartedAt,
        result: status === 401 || status === 403 ? "denied" : "failure",
      });
    }
  }, [adapter.endpoint, adapter.plane, fetcher, loadStartedAt]);
  useEffect(() => { void load(); }, [load]);
  const kinds = useMemo(
    () => Array.from(new Set((data?.items ?? []).map((item) => item.kind))).sort(),
    [data?.items],
  );
  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.items ?? []).filter((item) =>
      (kind === "all" || item.kind === kind)
      && (!normalized || `${item.title} ${item.summary ?? ""} ${item.kind}`.toLowerCase().includes(normalized)));
  }, [data?.items, kind, query]);
  const active = data?.items.find((item) => item.id === selected);
  if (failure === "denied") return <div role="alert" className="rounded-xl border border-dashed p-10 text-center"><h1 className="font-semibold">Content access denied</h1><p className="mt-2 text-sm text-muted-foreground">The current account and scope do not authorize this content projection.</p></div>;
  if (failure === "error") return <div role="alert" className="rounded-xl border border-destructive/40 p-6"><h1 className="font-semibold">Content unavailable</h1><Button variant="outline" className="mt-4" onClick={() => void load()}>Try again</Button></div>;
  if (!data) return <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (!data.items.length) return <div className="rounded-xl border border-dashed p-10 text-center"><h1 className="font-semibold">No authorized content</h1><p className="mt-2 text-sm text-muted-foreground">No content is available through the {data.projection} projection.</p></div>;
  return (
    <main className="space-y-5">
      <header><h1 className="text-2xl font-semibold">Content</h1><p className="mt-1 text-sm text-muted-foreground">{data.projection}</p></header>
      <div className="flex flex-wrap gap-2"><label className="relative min-w-64 flex-1"><span className="sr-only">Search content</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search content" /></label><label><span className="sr-only">Filter content by type</span><select aria-label="Filter content by type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All content types</option>{kinds.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><Button variant={mode === "list" ? "secondary" : "outline"} size="icon" aria-label="List view" onClick={() => setMode("list")}><List className="h-4 w-4" /></Button><Button variant={mode === "grid" ? "secondary" : "outline"} size="icon" aria-label="Grid view" onClick={() => setMode("grid")}><Grid2X2 className="h-4 w-4" /></Button></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.4fr)]">
        <section className={mode === "grid" ? "grid grid-cols-2 gap-2" : "space-y-2"}>{items.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`rounded-lg border p-3 text-left ${selected === item.id ? "border-primary bg-accent" : "bg-card"}`}><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.kind}{item.status ? ` · ${item.status}` : ""}</span></button>)}{items.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No content matches the current search and filter.</p>}</section>
        {active && <article className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">{active.title}</h2>{active.summary && <p className="mt-2 text-sm text-muted-foreground">{active.summary}</p>}{active.preview && <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm whitespace-pre-wrap">{active.preview}</div>}
          <div className="mt-5 grid gap-4 md:grid-cols-2"><section><h3 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" />Attachments</h3>{active.attachments.length ? <ul className="mt-2 space-y-2">{active.attachments.map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"><span>{attachment.name}</span>{attachment.downloadHref && <a href={attachment.downloadHref} onClick={() => emitSurfaceEvent({ name: "content_downloaded", plane: adapter.plane, scopeType: adapter.plane === "mesh" ? "network_account" : adapter.plane === "admin" ? "platform" : "tenant", surfaceCode: "content.attachment", route: attachment.downloadHref!, durationMs: 0, result: "success" })} className="rounded p-1 text-primary" aria-label={`Download ${attachment.name}`}><Download className="h-4 w-4" /></a>}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No attachments.</p>}</section>
          <section><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />Version history</h3>{active.versions.length ? <ul className="mt-2 space-y-1 text-sm">{active.versions.map((version) => <li key={version.id}>{version.label}{version.status ? ` · ${version.status}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No version history.</p>}</section></div>
          <p className="mt-5 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />{active.accessLabel ?? "Access is evaluated by the provider."}</p>
          {active.related.length > 0 && <section className="mt-4"><h3 className="text-sm font-semibold">Related documents</h3><ul className="mt-2 text-sm text-muted-foreground">{active.related.map((item) => <li key={item.id}>{item.title}</li>)}</ul></section>}
        </article>}
      </div>
    </main>
  );
}
