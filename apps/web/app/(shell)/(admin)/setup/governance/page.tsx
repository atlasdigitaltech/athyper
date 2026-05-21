"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bffFetch } from "@/lib/bff-fetch";
import {
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Layers3,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState, FilterPillBar } from "@athyper/ui/composites";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@athyper/ui/primitives";

interface CycleType {
  id: string;
  typeCode: string;
  typeName: string;
  description: string | null;
  frequency: Frequency;
  domain: Domain;
  isActive: boolean;
  cleanCyclePolicy?: unknown;
  approvalPolicies?: unknown;
  createdAt: string;
  updatedAt: string | null;
}

type Domain =
  | "FINANCE"
  | "HR"
  | "INVENTORY"
  | "WAREHOUSE"
  | "PROCUREMENT"
  | "PROJECT"
  | "SUPPLIER"
  | "SAFETY"
  | "COMPLIANCE"
  | "CUSTOM";

type Frequency =
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "SEMI_MONTHLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL"
  | "AD_HOC";

const FREQUENCIES: Frequency[] = [
  "MONTHLY",
  "QUARTERLY",
  "ANNUAL",
  "WEEKLY",
  "BIWEEKLY",
  "SEMI_MONTHLY",
  "SEMI_ANNUAL",
  "DAILY",
  "AD_HOC",
];

const DOMAINS: Domain[] = [
  "FINANCE",
  "COMPLIANCE",
  "HR",
  "PROCUREMENT",
  "INVENTORY",
  "WAREHOUSE",
  "PROJECT",
  "SUPPLIER",
  "SAFETY",
  "CUSTOM",
];

const DOMAIN_VARIANT: Record<Domain, "success" | "info" | "warning" | "muted" | "outline"> = {
  FINANCE: "success",
  COMPLIANCE: "info",
  HR: "muted",
  PROCUREMENT: "warning",
  INVENTORY: "outline",
  WAREHOUSE: "outline",
  PROJECT: "muted",
  SUPPLIER: "muted",
  SAFETY: "warning",
  CUSTOM: "outline",
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  SEMI_MONTHLY: "Semi-monthly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-annual",
  ANNUAL: "Annual",
  AD_HOC: "Ad hoc",
};

function normalizeCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function formatCount(value: number, label: string) {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function DdlModelStrip() {
  const items = [
    {
      icon: CalendarClock,
      title: "Fiscal period",
      detail: "future -> open -> soft close -> hard close",
    },
    {
      icon: ShieldCheck,
      title: "Book gate",
      detail: "per ledger book posting status",
    },
    {
      icon: ListChecks,
      title: "Close template",
      detail: "phases, categories, tasks, dependencies",
    },
    {
      icon: TimerReset,
      title: "Close run",
      detail: "run, deviations, certification, carryforward",
    },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-4">
      {items.map(({ icon: Icon, title, detail }) => (
        <div key={title} className="rounded-lg border bg-background px-3 py-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  );
}

function NewCycleTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const qc = useQueryClient();
  const [typeCode, setTypeCode] = useState("MONTHLY_CLOSE");
  const [typeName, setTypeName] = useState("Monthly Close");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [domain, setDomain] = useState<Domain>("FINANCE");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return bffFetch("/api/governance/cycle-types", { method: "POST", body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["governance-cycle-types"] });
      onOpenChange(false);
      setTypeCode("MONTHLY_CLOSE");
      setTypeName("Monthly Close");
      setDescription("");
      setFrequency("MONTHLY");
      setDomain("FINANCE");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to create cycle type"),
  });

  function submit() {
    setError(null);
    const code = normalizeCode(typeCode);
    if (!code || !typeName.trim()) {
      setError("Code and name are required");
      return;
    }
    create.mutate({
      typeCode: code,
      typeName: typeName.trim(),
      description: description.trim() || null,
      frequency,
      domain,
      cleanCyclePolicy: {},
      approvalPolicies: {},
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Cycle Type</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input
                value={typeCode}
                onChange={(e) => setTypeCode(normalizeCode(e.target.value))}
                className="font-mono uppercase"
                placeholder="MONTHLY_CLOSE"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="Monthly Close"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Frequency</Label>
              <Select value={frequency} onValueChange={(value) => setFrequency(value as Frequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((item) => (
                    <SelectItem key={item} value={item}>{FREQUENCY_LABEL[item]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Domain</Label>
              <Select value={domain} onValueChange={(value) => setDomain(value as Domain)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOMAINS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
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

export default function GovernanceSetupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [domainFilter, setDomainFilter] = useState<Domain | "">("FINANCE");
  const [frequencyFilter, setFrequencyFilter] = useState<Frequency | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const params = new URLSearchParams();
  if (domainFilter) params.set("domain", domainFilter);
  params.set("limit", "200");

  const { data, isLoading, isError } = useQuery<{ data: CycleType[] }>({
    queryKey: ["governance-cycle-types", domainFilter],
    queryFn: async () => {
      const qs = params.toString();
      const res = await fetch(`/api/governance/cycle-types${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load cycle types");
      return res.json() as Promise<{ data: CycleType[] }>;
    },
    staleTime: 30_000,
  });

  const types = data?.data ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return types.filter((ct) => {
      const matchesFrequency = frequencyFilter === "ALL" || ct.frequency === frequencyFilter;
      const matchesQuery = !needle
        || ct.typeName.toLowerCase().includes(needle)
        || ct.typeCode.toLowerCase().includes(needle)
        || (ct.description ?? "").toLowerCase().includes(needle);
      return matchesFrequency && matchesQuery;
    });
  }, [frequencyFilter, query, types]);

  const financeCount = types.filter((item) => item.domain === "FINANCE").length;
  const monthlyCount = types.filter((item) => item.frequency === "MONTHLY").length;
  const activeCount = types.filter((item) => item.isActive).length;

  return (
    <PageFrame
      width="full"
      title="Governance Cycle Types"
      description="Fiscal close model setup for period gates, task templates, dependencies, and certification."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void qc.invalidateQueries({ queryKey: ["governance-cycle-types"] })}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Type
          </Button>
        </div>
      }
    >
      <DdlModelStrip />

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-success" />
            {formatCount(activeCount, "active type")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{formatCount(financeCount, "finance model")}</p>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4 text-info" />
            {formatCount(monthlyCount, "monthly cadence")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Period close templates normally bind here.</p>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers3 className="h-4 w-4 text-warning" />
            Fiscal period status
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Open, soft close, and hard close remain controlled by fiscal period records.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
          <FilterPillBar
            items={DOMAINS.map((domain) => ({ value: domain, label: domain }))}
            value={domainFilter}
            onChange={(value) => setDomainFilter(value as Domain | "")}
            allItem={{ label: "All domains" }}
            compact
          />
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-7 text-sm"
              placeholder="Search cycle types"
            />
          </div>
        </div>
        <Select value={frequencyFilter} onValueChange={(value) => setFrequencyFilter(value as Frequency | "ALL")}>
          <SelectTrigger className="h-8 w-full text-sm md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All cadences</SelectItem>
            {FREQUENCIES.map((item) => (
              <SelectItem key={item} value={item}>{FREQUENCY_LABEL[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load governance cycle types.
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-10 w-10 text-muted-foreground/30" />}
          title="No cycle types match the current filters."
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create Type
            </Button>
          }
          className="py-20"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ct) => (
            <button
              key={ct.id}
              type="button"
              onClick={() => router.push(`/setup/governance/${ct.id}`)}
              className={cn(
                "min-h-32 rounded-lg border bg-background p-4 text-left transition-colors",
                "hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{ct.typeName}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{ct.typeCode}</p>
                </div>
                <Badge variant={ct.isActive ? "success" : "muted"} size="sm">
                  {ct.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              {ct.description && (
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{ct.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <Badge variant={DOMAIN_VARIANT[ct.domain] ?? "outline"} size="sm">{ct.domain}</Badge>
                <Badge variant="outline" size="sm">{FREQUENCY_LABEL[ct.frequency]}</Badge>
                {ct.domain === "FINANCE" && <Badge variant="muted" size="sm">period close</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}

      <NewCycleTypeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageFrame>
  );
}
