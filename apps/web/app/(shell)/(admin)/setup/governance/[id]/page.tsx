"use client";

/**
 * Governance Cycle Type Detail — /setup/governance/[id]
 *
 * Tabs: Phases | Categories | Templates | Dependencies | Carryforward Rules
 */

import { type CSSProperties, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CyclePhase  { id: string; phaseCode: string; phaseName: string; sortOrder: number; isGateEnforced: boolean; minReadinessPct: number | null; }
interface CycleCategory { id: string; categoryCode: string; categoryName: string; sortOrder: number; colorCode: string | null; }
interface CycleTemplate { id: string; taskCode: string; taskName: string; completionMode: string; isMandatory: boolean; severity: string | null; slaHours: number | null; }

// ── Phases tab ────────────────────────────────────────────────────────────────

function PhasesTab({ typeId }: { typeId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phaseCode, setPhaseCode] = useState("");
  const [phaseName, setPhaseName] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const [isGateEnforced, setIsGateEnforced] = useState("true");
  const [minReadiness, setMinReadiness] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: CyclePhase[] }>({
    queryKey: ["governance-phases", typeId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-types/${typeId}/phases`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/governance/cycle-types/${typeId}/phases`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["governance-phases", typeId] }); setOpen(false); setPhaseCode(""); setPhaseName(""); },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  const phases = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Phase</Button>
      </div>

      {isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="space-y-2">
          {phases.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No phases defined.</p>}
          {phases.map((p) => (
            <RowCard
              key={p.id}
              leading={<span className="text-xs font-mono text-muted-foreground w-6 text-right">{p.sortOrder}.</span>}
              badge={<Badge variant="outline" className="text-doc-support font-mono">{p.phaseCode}</Badge>}
              title={p.phaseName}
              metadata={<div className="flex gap-3">
                <span>Gate: {p.isGateEnforced ? "enforced" : "optional"}</span>
                {p.minReadinessPct !== null && <span>Min readiness: {p.minReadinessPct}%</span>}
              </div>}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Phase Code *</Label>
                <Input value={phaseCode} onChange={(e) => setPhaseCode(e.target.value)} className="font-mono uppercase" placeholder="PREP" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sort Order *</Label>
                <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" min={0} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phase Name *</Label>
              <Input value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="Preparation" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Gate Enforced</Label>
                <Select value={isGateEnforced} onValueChange={setIsGateEnforced}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Min Readiness %</Label>
                <Input value={minReadiness} onChange={(e) => setMinReadiness(e.target.value)} type="number" min={0} max={100} placeholder="optional" />
              </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setError(null);
              if (!phaseCode || !phaseName) { setError("Phase code and name required"); return; }
              create.mutate({ phaseCode: phaseCode.toUpperCase(), phaseName, sortOrder: parseInt(sortOrder, 10) || 0, isGateEnforced: isGateEnforced === "true", minReadinessPct: minReadiness ? parseFloat(minReadiness) : null });
            }} disabled={create.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Categories tab ────────────────────────────────────────────────────────────

function CategoriesTab({ typeId }: { typeId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  const { data, isLoading } = useQuery<{ data: CycleCategory[] }>({
    queryKey: ["governance-categories", typeId],
    queryFn: async () => { const res = await fetch(`/api/governance/cycle-types/${typeId}/categories`); return res.ok ? res.json() : { data: [] }; },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/governance/cycle-types/${typeId}/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["governance-categories", typeId] }); setOpen(false); setCode(""); setName(""); },
  });

  const cats = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Category</Button>
      </div>
      {isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="flex flex-wrap gap-2">
          {cats.length === 0 && <p className="py-8 text-sm text-muted-foreground w-full text-center">No categories yet.</p>}
          {cats.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 rounded-full border px-3 py-1">
              {c.colorCode && <span className="h-2.5 w-2.5 rounded-full bg-[var(--category-color)]" style={{ "--category-color": c.colorCode } as CSSProperties} />}
              <span className="text-sm font-medium">{c.categoryName}</span>
              <span className="text-doc-support font-mono text-muted-foreground">{c.categoryCode}</span>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Code *</Label><Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" /></div>
              <div className="space-y-1"><Label className="text-xs">Sort Order</Label><Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" min={0} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!code || !name) return; create.mutate({ categoryCode: code.toUpperCase(), categoryName: name, sortOrder: parseInt(sortOrder, 10) || 0 }); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Templates tab ─────────────────────────────────────────────────────────────

function TemplatesTab({ typeId }: { typeId: string }) {
  const { data, isLoading } = useQuery<{ data: CycleTemplate[] }>({
    queryKey: ["governance-templates", typeId],
    queryFn: async () => { const res = await fetch(`/api/governance/cycle-types/${typeId}/templates`); return res.ok ? res.json() : { data: [] }; },
    staleTime: 30_000,
  });

  const templates = data?.data ?? [];

  return (
    <div className="space-y-3">
      {isLoading ? <Skeleton className="h-24 w-full" /> : templates.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No task templates. Add phases and categories first.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-doc-support text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Code</th>
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Mode</th>
                <th className="pb-2 pr-3 font-medium">Mandatory</th>
                <th className="pb-2 pr-3 font-medium">Severity</th>
                <th className="pb-2 font-medium">SLA (h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-3 font-mono text-doc-subtitle">{t.taskCode}</td>
                  <td className="py-2 pr-3">{t.taskName}</td>
                  <td className="py-2 pr-3"><Badge variant="outline" className="text-doc-support">{t.completionMode}</Badge></td>
                  <td className="py-2 pr-3">{t.isMandatory ? "Yes" : "No"}</td>
                  <td className="py-2 pr-3">{t.severity ?? "—"}</td>
                  <td className="py-2">{t.slaHours ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GovernanceCycleTypeDetailPage() {
  const params = useParams<{ id: string }>();
  const typeId = params.id;

  const { data } = useQuery<{ data: { id: string; typeName: string; typeCode: string; domain: string; frequency: string } | null }>({
    queryKey: ["governance-cycle-type", typeId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-types?limit=200`);
      if (!res.ok) return { data: null };
      const all = await res.json() as { data: { id: string; typeName: string; typeCode: string; domain: string; frequency: string }[] };
      return { data: all.data.find((t) => t.id === typeId) ?? null };
    },
    staleTime: 60_000,
  });

  const cycleType = data?.data;

  return (
    <PageFrame
      title={cycleType?.typeName ?? "Cycle Type"}
      description={cycleType ? `${cycleType.typeCode} · ${cycleType.domain} · ${cycleType.frequency}` : ""}
      actions={
        <Link href="/setup/governance">
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
        </Link>
      }
    >
      <Tabs defaultValue="phases">
        <TabsList className="mb-4">
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="phases" className="mt-4"><PhasesTab typeId={typeId} /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab typeId={typeId} /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab typeId={typeId} /></TabsContent>
      </Tabs>
    </PageFrame>
  );
}
