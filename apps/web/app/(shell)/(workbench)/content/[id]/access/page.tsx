"use client";

/**
 * Content Access Grants — /content/[id]/access
 *
 * Manage who can access this content item (read/write/admin).
 * Grants are tenant-scoped and attached to a principal (user/role/group).
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Shield } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccessLevel = "READ" | "WRITE" | "ADMIN";
type PrincipalType = "USER" | "ROLE" | "GROUP";

interface AccessGrant {
  id: string;
  principalType: PrincipalType;
  principalId: string;
  accessLevel: AccessLevel;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string | null;
}

const LEVEL_VARIANT: Record<AccessLevel, "warning" | "success" | "destructive"> = {
  READ: "success", WRITE: "warning", ADMIN: "destructive",
};

// ── Add Grant Dialog ──────────────────────────────────────────────────────────

function AddGrantDialog({ itemId, open, onOpenChange }: {
  itemId: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [principalType, setPrincipalType] = useState<PrincipalType>("USER");
  const [principalId, setPrincipalId] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("READ");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/content/items/${itemId}/access-grants`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-grants", itemId] });
      onOpenChange(false);
      setPrincipalId(""); setExpiresAt(""); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Access Grant</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Principal Type</Label>
            <Select value={principalType} onValueChange={(v) => setPrincipalType(v as PrincipalType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["USER", "ROLE", "GROUP"] as PrincipalType[]).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Principal ID *</Label>
            <Input value={principalId} onChange={(e) => setPrincipalId(e.target.value)}
              placeholder="UUID or identifier" className="font-mono text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Access Level</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as AccessLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["READ", "WRITE", "ADMIN"] as AccessLevel[]).map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expires At (optional)</Label>
            <Input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="datetime-local" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => {
            setError(null);
            if (!principalId.trim()) { setError("Principal ID is required"); return; }
            create.mutate({ principalType, principalId: principalId.trim(), accessLevel, expiresAt: expiresAt || null });
          }} disabled={create.isPending}>
            Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentAccessPage() {
  const params = useParams<{ id: string }>();
  const itemId = params.id;
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: itemData } = useQuery<{ data: { title: string; itemCode: string } }>({
    queryKey: ["content-item", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/content/items/${itemId}`);
      return res.ok ? res.json() : { data: null };
    },
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery<{ data: AccessGrant[] }>({
    queryKey: ["content-grants", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/content/items/${itemId}/access-grants`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const grants = data?.data ?? [];

  const revoke = useMutation({
    mutationFn: async (grantId: string) => {
      const res = await fetch(`/api/content/items/${itemId}/access-grants/${grantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-grants", itemId] }),
  });

  return (
    <PageFrame
      title="Access Grants"
      description={itemData?.data?.title ? `Access control for ${itemData.data.title}` : ""}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Grant
          </Button>
          <Link href={`/content/${itemId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : grants.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-8 w-8 text-muted-foreground/30" />}
          title="No access grants. Add grants to control visibility."
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add Grant
            </Button>
          }
          className="py-20"
        />
      ) : (
        <div className="space-y-2">
          {grants.map((g) => (
            <RowCard
              key={g.id}
              badge={<>
                <Badge variant={LEVEL_VARIANT[g.accessLevel]} className="text-[10px]">{g.accessLevel}</Badge>
                <Badge variant="outline" className="text-[10px]">{g.principalType}</Badge>
              </>}
              title={<span className="font-mono">{g.principalId}</span>}
              metadata={<div className="flex gap-3">
                <span>Granted {new Date(g.grantedAt).toLocaleDateString()}</span>
                {g.expiresAt && <span>Expires {new Date(g.expiresAt).toLocaleDateString()}</span>}
              </div>}
              actions={
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                  onClick={() => revoke.mutate(g.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              }
            />
          ))}
        </div>
      )}

      <AddGrantDialog itemId={itemId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
