"use client";

/**
 * Governance Cycle Runs — /governance/cycle-runs
 *
 * Lists all cycle runs. Filter by status or cycle type.
 * Navigate to run detail to manage phases, tasks, and deviations.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, GitBranch, Calendar, ChevronRight } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type RunStatus = "PLANNED" | "OPEN" | "IN_PROGRESS" | "PENDING_CERT" | "CERTIFIED" | "CLOSED";

interface CycleRun {
  id: string;
  cycleTypeId: string;
  cycleTypeName?: string;
  runCode: string;
  runLabel: string;
  status: RunStatus;
  periodStart: string;
  periodEnd: string;
  targetCloseDate: string | null;
  actualCloseDate: string | null;
  ownerUserId: string | null;
  createdAt: string;
}

interface CycleType {
  id: string;
  typeCode: string;
  typeName: string;
}

const STATUS_VARIANT: Record<RunStatus, "warning" | "muted" | "success" | "destructive" | "outline"> = {
  PLANNED: "outline",
  OPEN: "warning",
  IN_PROGRESS: "warning",
  PENDING_CERT: "muted",
  CERTIFIED: "success",
  CLOSED: "muted",
};

const RUN_STATUSES: RunStatus[] = ["PLANNED", "OPEN", "IN_PROGRESS", "PENDING_CERT", "CERTIFIED", "CLOSED"];

// ── New Run Dialog ─────────────────────────────────────────────────────────────

function NewRunDialog({ open, onOpenChange, cycleTypes }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cycleTypes: CycleType[];
}) {
  const qc = useQueryClient();
  const [cycleTypeId, setCycleTypeId] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [targetCloseDate, setTargetCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/governance/cycle-runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["governance-runs"] });
      onOpenChange(false);
      setCycleTypeId(""); setRunLabel(""); setPeriodStart(""); setPeriodEnd(""); setTargetCloseDate(""); setNotes("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!cycleTypeId) { setError("Select a cycle type"); return; }
    if (!periodStart || !periodEnd) { setError("Period start and end are required"); return; }
    create.mutate({
      cycleTypeId, runLabel: runLabel.trim() || undefined,
      periodStart, periodEnd,
      targetCloseDate: targetCloseDate || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Cycle Run</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Cycle Type *</Label>
            <Select value={cycleTypeId} onValueChange={setCycleTypeId}>
              <SelectTrigger><SelectValue placeholder="Select cycle type…" /></SelectTrigger>
              <SelectContent>
                {cycleTypes.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>{ct.typeName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label (optional)</Label>
            <Input value={runLabel} onChange={(e) => setRunLabel(e.target.value)} placeholder="e.g. March 2026 Close" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Period Start *</Label>
              <Input value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} type="date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period End *</Label>
              <Input value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} type="date" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target Close Date</Label>
            <Input value={targetCloseDate} onChange={(e) => setTargetCloseDate(e.target.value)} type="date" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
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

export default function CycleRunsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RunStatus | "">("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data: typesData } = useQuery<{ data: CycleType[] }>({
    queryKey: ["governance-cycle-types-light"],
    queryFn: async () => {
      const res = await fetch("/api/governance/cycle-types?limit=200");
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 60_000,
  });
  const cycleTypes = typesData?.data ?? [];

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (typeFilter) params.set("cycleTypeId", typeFilter);

  const { data, isLoading } = useQuery<{ data: CycleRun[] }>({
    queryKey: ["governance-runs", statusFilter, typeFilter],
    queryFn: async () => {
      const qs = params.toString();
      const res = await fetch(`/api/governance/cycle-runs${qs ? `?${qs}` : ""}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const runs = data?.data ?? [];

  return (
    <PageFrame
      title="Governance Cycle Runs"
      description="Manage close cycle execution: advance phases, complete tasks, certify"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["governance-runs"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Run
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          {(["", ...RUN_STATUSES] as const).map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "primary" : "ghost"} className="h-7 text-xs"
              onClick={() => setStatusFilter(s as RunStatus | "")}>
              {s === "" ? "All" : s}
            </Button>
          ))}
        </div>
        {cycleTypes.length > 0 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All types</SelectItem>
              {cycleTypes.map((ct) => <SelectItem key={ct.id} value={ct.id}>{ct.typeName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No cycle runs found.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Create first run
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <Card key={run.id} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/governance/cycle-runs/${run.id}`)}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_VARIANT[run.status]} className="text-[10px]">{run.status}</Badge>
                    <span className="font-medium text-sm">{run.runLabel || run.runCode}</span>
                    {run.cycleTypeName && (
                      <span className="text-xs text-muted-foreground">{run.cycleTypeName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}
                    </span>
                    {run.targetCloseDate && (
                      <span>Target: {new Date(run.targetCloseDate).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewRunDialog open={dialogOpen} onOpenChange={setDialogOpen} cycleTypes={cycleTypes} />
    </PageFrame>
  );
}
