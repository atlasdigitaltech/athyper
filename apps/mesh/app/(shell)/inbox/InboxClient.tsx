"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  WorkInbox,
  createMeshInboxAdapter,
  type WorkInboxFetch,
  type WorkInboxQuery,
} from "@athyper/work-inbox-ui";
import { bffFetch } from "@/lib/bff-fetch";

export function InboxClient({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adapter = useMemo(() => createMeshInboxAdapter(bffFetch as WorkInboxFetch), []);
  const query = readQuery(searchParams);
  const navigate = (next: WorkInboxQuery, id = selectedId) => {
    const params = writeQuery(next);
    router.push(`/inbox${id ? `/${encodeURIComponent(id)}` : ""}?${params}`);
  };
  return <WorkInbox adapter={adapter} selectedId={selectedId} query={query} onQueryChange={(next) => navigate(next)} onSelect={(id) => navigate(query, id)} />;
}

function readQuery(params: URLSearchParams): WorkInboxQuery {
  const view = params.get("view");
  const sort = params.get("sort");
  return {
    view: view === "delegated" || view === "escalated" || view === "completed" ? view : "assigned",
    search: params.get("q") ?? "",
    sort: sort === "oldest" || sort === "priority" ? sort : "newest",
    page: Math.max(0, Number(params.get("page") ?? 1) - 1 || 0),
    pageSize: 25,
  };
}

function writeQuery(query: WorkInboxQuery): string {
  const params = new URLSearchParams({ view: query.view, sort: query.sort, page: String(query.page + 1) });
  if (query.search) params.set("q", query.search);
  return params.toString();
}
