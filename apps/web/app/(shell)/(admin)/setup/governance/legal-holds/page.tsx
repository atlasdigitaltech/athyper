"use client";

/**
 * Legal Hold Admin — /setup/governance/legal-holds
 *
 * Lists all legal holds (active / released / expired) for the tenant.
 * Allows creating new holds and releasing active ones.
 * Shows the partition manifest for each hold on detail expand.
 */

import { useState } from "react";
import { cn } from "@athyper/theme/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock, LockOpen, RefreshCw, Plus, ChevronDown, ChevronRight,
  AlertTriangle, Shield, Database,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Textarea, Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem,
  Collapsible, CollapsibleContent, CollapsibleTrigger,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
  AlertDialogAction,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManifestRow {
  id: string;
  partitionSchema: string;
  partitionTable: string;
  partitionRangeLo: string;
  partitionRangeHi: string;
  isReleased: boolean;
  releasedAt: string | null;
}

interface LegalHold {
  id: string;
  holdName: string;
  holdCode: string;
  description: string | null;
  custodianId: string;
  scopeEntityType: string | null;
  scopeDateFrom: string | null;
  scopeDateTo: string | null;
  scopeLogSchemas: string[] | null;
  status: "active" | "released" | "expired";
  effectiveFrom: string;
  effectiveTo: string | null;
  releaseDate: string | null;
  releaseReason: string | null;
  createdAt: string;
  manifest?: ManifestRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "destructive" | "success" | "muted"> = {
  active:   "destructive",
  released: "success",
  expired:  "muted",
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── New Hold Dialog ───────────────────────────────────────────────────────────

function NewHoldDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [holdName, setHoldName]       = useState("");
  const [holdCode, setHoldCode]       = useState("");
  const [description, setDescription] = useState("");
  const [custodianId, setCustodianId] = useState("");
  const [scopeEntityType, setScopeEntityType] = useState("");
  const [scopeDateFrom, setScopeDateFrom]     = useState("");
  const [scopeDateTo, setScopeDateTo]         = useState("");
  const [scopeLogSchemas, setScopeLogSchemas] = useState<string[]>(["log"]);
  const [effectiveTo, setEffectiveTo]         = useState("");
  const [error, setError]                     = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/relay/audit/legal-holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create hold");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal-holds"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function resetForm() {
    setHoldName(""); setHoldCode(""); setDescription(""); setCustodianId("");
    setScopeEntityType(""); setScopeDateFrom(""); setScopeDateTo(""); setScopeLogSchemas(["log"]);
    setEffectiveTo(""); setError(null);
  }

  function submit() {
    setError(null);
    if (!holdName.trim()) { setError("Hold name is required"); return; }
    if (!holdCode.trim()) { setError("Hold code is required"); return; }
    if (!custodianId.trim()) { setError("Custodian ID is required"); return; }
    if (!scopeEntityType && !scopeDateFrom && !scopeLogSchemas.length) {
      setError("At least one scope dimension is required"); return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      holdName: holdName.trim(),
      holdCode: holdCode.trim().toLowerCase().replace(/\s+/g, "-"),
      description: description.trim() || null,
      custodianId: custodianId.trim(),
    };
    if (scopeEntityType.trim()) body["scopeEntityType"] = scopeEntityType.trim();
    if (scopeDateFrom) body["scopeDateFrom"] = scopeDateFrom;
    if (scopeDateTo)   body["scopeDateTo"] = scopeDateTo;
    if (scopeLogSchemas.length) body["scopeLogSchemas"] = scopeLogSchemas;
    if (effectiveTo)   body["effectiveTo"] = effectiveTo;

    create.mutate(body);
  }

  const LOG_SCHEMA_OPTIONS = ["log", "audit", "governance"];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-destructive" />
            New Legal Hold
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Hold Name *</Label>
              <Input value={holdName} onChange={(e) => setHoldName(e.target.value)} placeholder="e.g. Q3 Audit Hold" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hold Code *</Label>
              <Input
                value={holdCode}
                onChange={(e) => setHoldCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="e.g. q3-audit-hold"
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Legal basis or reference…" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Custodian Principal ID *</Label>
            <Input
              value={custodianId}
              onChange={(e) => setCustodianId(e.target.value)}
              placeholder="UUID of responsible principal"
              className="font-mono text-xs"
            />
          </div>

          <div className="border rounded-md p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scope (at least one)</p>

            <div className="space-y-1">
              <Label className="text-xs">Entity Type</Label>
              <Input value={scopeEntityType} onChange={(e) => setScopeEntityType(e.target.value)} placeholder="e.g. journal_entry (blank = all)" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Date From</Label>
                <Input type="date" value={scopeDateFrom} onChange={(e) => setScopeDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date To</Label>
                <Input type="date" value={scopeDateTo} onChange={(e) => setScopeDateTo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Log Schemas</Label>
              <div className="flex flex-wrap gap-1.5">
                {LOG_SCHEMA_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScopeLogSchemas((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                    )}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-mono border transition-colors",
                      scopeLogSchemas.includes(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Effective Until (optional — blank = indefinite)</Label>
            <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} variant="destructive">
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            Create Hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Release Dialog ────────────────────────────────────────────────────────────

function ReleaseHoldDialog({
  hold,
  open,
  onOpenChange,
}: {
  hold: LegalHold | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError]   = useState<string | null>(null);

  const release = useMutation({
    mutationFn: async ({ id, releaseReason }: { id: string; releaseReason: string }) => {
      const res = await fetch(`/api/relay/audit/legal-holds/${id}/release`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseReason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to release hold");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal-holds"] });
      onOpenChange(false);
      setReason(""); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  if (!hold) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LockOpen className="h-4 w-4 text-warning" />
            Release Hold: {hold.holdName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Releasing this hold will unblock all associated log partitions, allowing the archive worker to
            process them. This action requires a documented reason.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-xs">Release Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Legal authorisation, case closure, or other basis…"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setReason(""); setError(null); }}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!reason.trim()) { setError("Release reason is required"); return; }
              release.mutate({ id: hold.id, releaseReason: reason.trim() });
            }}
            disabled={release.isPending}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            Release Hold
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Hold Card ─────────────────────────────────────────────────────────────────

function HoldCard({
  hold,
  onRelease,
}: {
  hold: LegalHold;
  onRelease: (hold: LegalHold) => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const detail = useQuery<{ data: LegalHold }>({
    queryKey: ["legal-hold-detail", hold.id],
    queryFn: async () => {
      const res = await fetch(`/api/relay/audit/legal-holds/${hold.id}`);
      return res.ok ? res.json() : { data: hold };
    },
    enabled: expanded,
    staleTime: 30_000,
  });

  const refreshManifest = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/relay/audit/legal-holds/${id}/manifest/refresh`, { method: "POST" });
      return res.ok ? res.json() : Promise.reject();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legal-hold-detail", hold.id] }),
  });

  const manifestRows = detail.data?.data?.manifest ?? [];
  const blockedCount = manifestRows.filter((m) => !m.isReleased).length;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className={cn(hold.status === "active" && "border-destructive/30")}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-medium text-sm">{hold.holdName}</span>
                  </button>
                </CollapsibleTrigger>
                <Badge variant={STATUS_VARIANT[hold.status] ?? "muted"} className="text-[10px]">
                  {hold.status}
                </Badge>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground ml-5">{hold.holdCode}</p>
              {hold.description && (
                <p className="text-xs text-muted-foreground mt-1 ml-5 line-clamp-2">{hold.description}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {hold.status === "active" && (
                <>
                  <Button
                    size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => refreshManifest.mutate(hold.id)}
                    disabled={refreshManifest.isPending}
                    title="Refresh partition manifest"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshManifest.isPending && "animate-spin")} />
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs border-warning text-warning hover:bg-warning/10"
                    onClick={() => onRelease(hold)}
                  >
                    <LockOpen className="mr-1 h-3 w-3" />
                    Release
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Scope summary */}
          <div className="flex flex-wrap gap-1.5 mt-3 ml-5">
            {hold.scopeEntityType && (
              <Badge variant="outline" className="text-[10px] font-mono">{hold.scopeEntityType}</Badge>
            )}
            {hold.scopeDateFrom && (
              <Badge variant="outline" className="text-[10px]">
                {fmt(hold.scopeDateFrom)} → {fmt(hold.scopeDateTo)}
              </Badge>
            )}
            {hold.scopeLogSchemas?.map((s) => (
              <Badge key={s} variant="muted" className="text-[10px] font-mono">{s}</Badge>
            ))}
            {hold.effectiveTo && (
              <Badge variant="outline" className="text-[10px]">
                Until {fmt(hold.effectiveTo)}
              </Badge>
            )}
            {expanded && blockedCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                <Database className="mr-1 h-2.5 w-2.5" />
                {blockedCount} partition{blockedCount !== 1 ? "s" : ""} blocked
              </Badge>
            )}
          </div>

          {/* Release info */}
          {hold.status === "released" && (
            <p className="mt-2 ml-5 text-xs text-muted-foreground">
              Released {fmt(hold.releaseDate)} — {hold.releaseReason}
            </p>
          )}
        </CardContent>

        {/* Expanded manifest */}
        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-3">
            {detail.isLoading ? (
              <div className="space-y-1">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
            ) : manifestRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No partitions in manifest. Use Refresh to scan.</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">Blocked Partitions</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Partition</th>
                        <th className="px-3 py-1.5 text-left font-medium">Range</th>
                        <th className="px-3 py-1.5 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manifestRows.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-[11px]">
                            {m.partitionSchema}.{m.partitionTable}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-[11px]">
                            {fmt(m.partitionRangeLo)} → {fmt(m.partitionRangeHi)}
                          </td>
                          <td className="px-3 py-1.5">
                            <Badge
                              variant={m.isReleased ? "success" : "destructive"}
                              className="text-[9px]"
                            >
                              {m.isReleased ? "released" : "blocked"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LegalHoldsPage() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen]       = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<LegalHold | null>(null);
  const [statusFilter, setStatusFilter]   = useState<string>("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);

  const { data, isLoading } = useQuery<{ data: LegalHold[] }>({
    queryKey: ["legal-holds", statusFilter],
    queryFn: async () => {
      const qs = params.toString();
      const res = await fetch(`/api/relay/audit/legal-holds${qs ? `?${qs}` : ""}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });

  const holds = data?.data ?? [];
  const activeCount = holds.filter((h) => h.status === "active").length;

  return (
    <PageFrame
      title="Legal Holds"
      description="Manage legal holds that block log partition archival"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["legal-holds"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Hold
          </Button>
        </div>
      }
    >
      {/* Active holds banner */}
      {activeCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <Shield className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {activeCount} active hold{activeCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              The partition archive worker will skip all blocked partitions until holds are released.
            </p>
          </div>
        </div>
      )}

      <FilterPillBar
        items={["active", "released", "expired"].map((s) => ({
          value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
        }))}
        value={statusFilter}
        onChange={setStatusFilter}
        allItem={{ label: "All" }}
        className="mb-4"
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : holds.length === 0 ? (
        <EmptyState
          icon={<Lock className="h-10 w-10 text-muted-foreground/30" />}
          title={statusFilter ? `No ${statusFilter} legal holds.` : "No legal holds created yet."}
          action={!statusFilter ? (
            <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create first hold
            </Button>
          ) : undefined}
          className="py-20"
        />
      ) : (
        <div className="space-y-3">
          {holds.map((hold) => (
            <HoldCard
              key={hold.id}
              hold={hold}
              onRelease={(h) => setReleaseTarget(h)}
            />
          ))}
        </div>
      )}

      <NewHoldDialog open={newOpen} onOpenChange={setNewOpen} />
      <ReleaseHoldDialog
        hold={releaseTarget}
        open={releaseTarget !== null}
        onOpenChange={(v) => { if (!v) setReleaseTarget(null); }}
      />
    </PageFrame>
  );
}
