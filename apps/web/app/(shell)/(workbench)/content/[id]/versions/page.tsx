"use client";

/**
 * Content Version History — /content/[id]/versions
 *
 * Read-only list of all versions for a content item.
 * Shows version number, checksum, creator, and creation date.
 */

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/feedback";
import { Button, Badge, Skeleton } from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentVersion {
  id: string;
  versionNumber: number;
  contentType: string;
  checksum: string;
  createdBy: string | null;
  createdAt: string;
}

interface ContentItem {
  id: string;
  title: string;
  itemCode: string;
  currentVersionId: string | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentVersionsPage() {
  const params = useParams<{ id: string }>();
  const itemId = params.id;

  const { data: itemData } = useQuery<{ data: ContentItem }>({
    queryKey: ["content-item", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/content/items/${itemId}`);
      return res.ok ? res.json() : { data: null };
    },
    staleTime: 60_000,
  });
  const item = itemData?.data;

  const { data, isLoading } = useQuery<{ data: ContentVersion[] }>({
    queryKey: ["content-versions", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/content/items/${itemId}/versions`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const versions = data?.data ?? [];

  return (
    <PageFrame
      title={item?.title ?? "Version History"}
      description={item?.itemCode ? `Version history for ${item.itemCode}` : ""}
      actions={
        <Link href={`/content/${itemId}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back to Editor</Button>
        </Link>
      }
    >
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : versions.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8 text-muted-foreground/30" />}
          title="No versions yet. Save a body to create the first version."
          className="py-20"
        />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Checksum</th>
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 font-medium">Created By</th>
                <th className="pb-2 font-medium">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {versions.map((v) => (
                <tr key={v.id} className={v.id === item?.currentVersionId ? "bg-primary/5" : ""}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">v{v.versionNumber}</span>
                      {v.id === item?.currentVersionId && (
                        <Badge variant="success" className="text-[10px]">current</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px] text-muted-foreground">
                    {v.checksum.substring(0, 12)}…
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant="outline" className="text-[10px]">{v.contentType}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{v.createdBy ?? "—"}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  );
}
