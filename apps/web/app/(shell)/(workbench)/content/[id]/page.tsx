"use client";

/**
 * Content Editor — /content/[id]
 *
 * View and edit a content item's body and metadata.
 * Shows status lifecycle actions (submit → publish → archive).
 * Links to version history and access grant pages.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, Users, Save, AlertCircle } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Card, CardContent, Skeleton, Textarea, Label, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
  description: string | null;
  tags: string[] | null;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContentVersion {
  id: string;
  versionNumber: number;
  body: unknown;
  createdAt: string;
}

const STATUS_VARIANT: Record<ContentStatus, "warning" | "muted" | "success" | "outline"> = {
  DRAFT: "outline", REVIEW: "warning", PUBLISHED: "success", ARCHIVED: "muted",
};

// ── Status Actions ─────────────────────────────────────────────────────────────

function StatusActions({ item }: { item: ContentItem }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: async (act: string) => {
      const res = await fetch(`/api/content/items/${item.id}/${act}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-item", item.id] });
      setConfirmOpen(false);
    },
  });

  const actionLabel: Record<string, string> = {
    submit: "Submit for Review",
    publish: "Publish",
    archive: "Archive",
  };

  const availableActions: string[] = {
    DRAFT: ["submit", "archive"],
    REVIEW: ["publish", "archive"],
    PUBLISHED: ["archive"],
    ARCHIVED: [],
  }[item.status] ?? [];

  if (availableActions.length === 0) return null;

  return (
    <>
      <div className="flex gap-2">
        {availableActions.map((act) => (
          <Button key={act} size="sm"
            variant={act === "archive" ? "ghost" : "primary"}
            onClick={() => { setPendingAction(act); setConfirmOpen(true); }}>
            {actionLabel[act]}
          </Button>
        ))}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm: {pendingAction && actionLabel[pendingAction]}</DialogTitle></DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            This will change the status of <strong>{item.title}</strong>.
          </p>
          {action.error && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />{(action.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => pendingAction && action.mutate(pendingAction)} disabled={action.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Body Editor ────────────────────────────────────────────────────────────────

function BodyEditor({ itemId, version }: { itemId: string; version: ContentVersion | null | undefined }) {
  const qc = useQueryClient();
  const [bodyText, setBodyText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (version?.body !== undefined) {
      setBodyText(JSON.stringify(version.body, null, 2));
      setDirty(false);
    }
  }, [version?.id]);

  const save = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(bodyText); } catch { throw new Error("Invalid JSON"); }
      const res = await fetch(`/api/content/items/${itemId}/versions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: parsed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error === "DUPLICATE_BODY" ? "Content unchanged — no new version needed" : (err.error ?? "Failed"));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-item", itemId] });
      qc.invalidateQueries({ queryKey: ["content-versions", itemId] });
      setDirty(false); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            Body (JSON)
            {version && <span className="ml-2 text-muted-foreground font-normal">v{version.versionNumber}</span>}
          </Label>
          <Button size="sm" variant={dirty ? "primary" : "ghost"} className="h-7 text-xs"
            onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
            <Save className="mr-1 h-3 w-3" />Save Version
          </Button>
        </div>
        <Textarea
          className="font-mono text-xs min-h-[320px]"
          value={bodyText}
          onChange={(e) => { setBodyText(e.target.value); setDirty(true); }}
          placeholder='{ "text": "Hello world" }'
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentEditorPage() {
  const params = useParams<{ id: string }>();
  const itemId = params.id;

  const { data: itemData, isLoading } = useQuery<{ data: ContentItem }>({
    queryKey: ["content-item", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/content/items/${itemId}`);
      return res.ok ? res.json() : { data: null };
    },
    staleTime: 30_000,
  });
  const item = itemData?.data;

  const { data: versionData } = useQuery<{ data: ContentVersion }>({
    queryKey: ["content-current-version", itemId],
    queryFn: async () => {
      if (!item?.currentVersionId) return { data: null };
      const res = await fetch(`/api/content/items/${itemId}/versions/${item.currentVersionId}`);
      return res.ok ? res.json() : { data: null };
    },
    enabled: !!item?.currentVersionId,
    staleTime: 30_000,
  });

  return (
    <PageFrame
      title={item?.title ?? "Content Item"}
      description={item ? `${item.contentType} · ${item.itemCode}${item.locale ? ` · ${item.locale}` : ""}` : ""}
      actions={
        <div className="flex items-center gap-2">
          {item && <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>}
          {item && <StatusActions item={item} />}
          <Link href={`/content/${itemId}/versions`}>
            <Button variant="ghost" size="sm"><History className="mr-1.5 h-3.5 w-3.5" />Versions</Button>
          </Link>
          <Link href={`/content/${itemId}/access`}>
            <Button variant="ghost" size="sm"><Users className="mr-1.5 h-3.5 w-3.5" />Access</Button>
          </Link>
          <Link href="/content">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !item ? (
        <p className="py-20 text-center text-sm text-muted-foreground">Content item not found.</p>
      ) : (
        <div className="space-y-4">
          {/* Metadata */}
          <Card>
            <CardContent className="p-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-0.5">
                <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Code</p>
                <p className="font-mono text-sm">{item.itemCode}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Type</p>
                <p className="text-sm">{item.contentType}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Locale</p>
                <p className="text-sm">{item.locale ?? "—"}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Updated</p>
                <p className="text-sm">{new Date(item.updatedAt).toLocaleDateString()}</p>
              </div>
              {item.description && (
                <div className="col-span-2 sm:col-span-4 space-y-0.5">
                  <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Description</p>
                  <p className="text-sm">{item.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Body editor */}
          <BodyEditor itemId={itemId} version={versionData?.data} />
        </div>
      )}
    </PageFrame>
  );
}
