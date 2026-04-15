"use client";

/**
 * Content Browser — /content
 *
 * Lists content items across all types and statuses.
 * Filter by status or content type. Create new items. Navigate to editor.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, FileText, ChevronRight } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/feedback";
import { FilterPillBar } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type ContentStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";

interface ContentItem {
  id: string;
  itemCode: string;
  title: string;
  contentType: string;
  status: ContentStatus;
  locale: string | null;
  tags: string[] | null;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_VARIANT: Record<ContentStatus, "warning" | "muted" | "success" | "outline"> = {
  DRAFT: "outline",
  REVIEW: "warning",
  PUBLISHED: "success",
  ARCHIVED: "muted",
};

const CONTENT_TYPES = ["ARTICLE", "PAGE", "SNIPPET", "POLICY", "TEMPLATE", "FAQ", "ANNOUNCEMENT"];
const STATUSES: ContentStatus[] = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];

// ── New Item Dialog ────────────────────────────────────────────────────────────

function NewItemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [itemCode, setItemCode] = useState("");
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("ARTICLE");
  const [locale, setLocale] = useState("en");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/content/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json() as Promise<{ data: ContentItem }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
      onOpenChange(false);
      router.push(`/content/${result.data.id}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!itemCode.trim() || !title.trim()) { setError("Code and title are required"); return; }
    create.mutate({
      itemCode: itemCode.trim().toUpperCase(),
      title: title.trim(),
      contentType,
      locale: locale.trim() || null,
      description: description.trim() || null,
      body: {},
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Content Item</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Code *</Label>
              <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)}
                className="font-mono uppercase" placeholder="HELP-001" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Content title" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Locale</Label>
              <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentBrowserPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "">("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (typeFilter) params.set("contentType", typeFilter);
  if (search.trim()) params.set("q", search.trim());

  const { data, isLoading } = useQuery<{ data: ContentItem[] }>({
    queryKey: ["content-items", statusFilter, typeFilter, search],
    queryFn: async () => {
      const qs = params.toString();
      const res = await fetch(`/api/content/items${qs ? `?${qs}` : ""}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const items = data?.data ?? [];

  return (
    <PageFrame
      title="Content"
      description="Manage articles, pages, snippets, and templates"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["content-items"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Item
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <div className="mb-4 space-y-2">
        <FilterPillBar
          items={STATUSES.map((s) => ({ value: s, label: s }))}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ContentStatus | "")}
          allItem={{ label: "All" }}
        />
        <div className="flex gap-2">
          <Input
            className="h-8 max-w-xs text-sm"
            placeholder="Search title or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All types</SelectItem>
              {CONTENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10 text-muted-foreground/30" />}
          title="No content items found."
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Create first item
            </Button>
          }
          className="py-20"
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <RowCard
              key={item.id}
              onClick={() => router.push(`/content/${item.id}`)}
              badge={<>
                <Badge variant={STATUS_VARIANT[item.status]} className="text-[10px]">{item.status}</Badge>
                <Badge variant="outline" className="text-[10px]">{item.contentType}</Badge>
              </>}
              title={item.title}
              metadata={<div className="flex flex-wrap items-center gap-3">
                <span className="font-mono">{item.itemCode}</span>
                {item.locale && <span>{item.locale}</span>}
                {item.tags?.length ? <span>{item.tags.join(", ")}</span> : null}
                <span>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
              </div>}
              actions={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
            />
          ))}
        </div>
      )}

      <NewItemDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
