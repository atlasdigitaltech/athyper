"use client";

/**
 * Governance Setup — /setup/governance
 *
 * Lists cycle type definitions. Create new types and navigate to
 * the detail page to manage phases, categories, templates, and dependencies.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, GitBranch, Calendar } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CycleType {
  id: string;
  typeCode: string;
  typeName: string;
  description: string | null;
  frequency: string;
  domain: string;
  isActive: boolean;
  createdAt: string;
}

const FREQUENCIES = ["MONTHLY", "QUARTERLY", "ANNUAL", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "SEMI_ANNUAL", "DAILY", "AD_HOC"];
const DOMAINS = ["FINANCE", "HR", "INVENTORY", "WAREHOUSE", "PROCUREMENT", "PROJECT", "SUPPLIER", "SAFETY", "COMPLIANCE", "CUSTOM"];

const DOMAIN_VARIANT: Record<string, "success" | "muted" | "outline"> = {
  FINANCE: "success", HR: "muted", COMPLIANCE: "muted",
};

// ── New Cycle Type Dialog ─────────────────────────────────────────────────────

function NewCycleTypeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [typeCode, setTypeCode]     = useState("");
  const [typeName, setTypeName]     = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency]   = useState("MONTHLY");
  const [domain, setDomain]         = useState("FINANCE");
  const [error, setError]           = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/governance/cycle-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["governance-cycle-types"] });
      onOpenChange(false);
      setTypeCode(""); setTypeName(""); setDescription("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!typeCode.trim() || !typeName.trim()) { setError("Type code and name are required"); return; }
    create.mutate({ typeCode: typeCode.trim().toUpperCase(), typeName: typeName.trim(), description: description.trim() || null, frequency, domain });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Cycle Type</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Code *</Label>
              <Input value={typeCode} onChange={(e) => setTypeCode(e.target.value)} placeholder="e.g. MONTH_CLOSE" className="font-mono text-sm uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="e.g. Monthly Close" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Domain</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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

export default function GovernanceSetupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");

  const params = new URLSearchParams();
  if (domainFilter) params.set("domain", domainFilter);

  const { data, isLoading } = useQuery<{ data: CycleType[] }>({
    queryKey: ["governance-cycle-types", domainFilter],
    queryFn: async () => {
      const qs = params.toString();
      const res = await fetch(`/api/governance/cycle-types${qs ? `?${qs}` : ""}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });

  const types = data?.data ?? [];

  return (
    <PageFrame
      title="Governance Cycle Types"
      description="Define close cycle templates: phases, task categories, and templates"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["governance-cycle-types"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Cycle Type
          </Button>
        </div>
      }
    >
      {/* Domain filter */}
      <div className="mb-4 flex flex-wrap gap-1">
        {["", ...DOMAINS].map((d) => (
          <Button key={d} size="sm" variant={domainFilter === d ? "primary" : "ghost"} className="h-7 text-xs"
            onClick={() => setDomainFilter(d)}>
            {d === "" ? "All" : d}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : types.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No cycle types defined yet.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Create your first cycle type
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {types.map((ct) => (
            <Card key={ct.id} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/setup/governance/${ct.id}`)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{ct.typeName}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{ct.typeCode}</p>
                  </div>
                  <Badge variant={!ct.isActive ? "muted" : "outline"} className="text-[10px] shrink-0">
                    {ct.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {ct.description && <p className="text-xs text-muted-foreground line-clamp-2">{ct.description}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant={DOMAIN_VARIANT[ct.domain] ?? "muted"} className="text-[10px]">{ct.domain}</Badge>
                  <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />{ct.frequency}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewCycleTypeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
