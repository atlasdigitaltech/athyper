"use client";

/**
 * Subscription Plans — /setup/platform/plans
 *
 * Operator-only console for managing SaaS subscription plans, plan versions,
 * and the module / feature / permission composition matrix.
 *
 * Visibility: requires PLATFORM.SUBSCRIPTIONS.VIEW (enforced at API level).
 * Write actions: require PLATFORM.SUBSCRIPTIONS.MANAGE + PLATFORM_CATALOG_WRITABLE=true.
 * The UI shows write controls always; the backend returns 403/CATALOG_LOCKED
 * if either gate is not satisfied.
 */

import { useState } from "react";
import {
  Plus, Loader2, ChevronRight, ChevronDown,
  Layers3, Shield, Cpu, GitBranch, Trash2, Check, X as XIcon,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsList, TabsTrigger, TabsContent, Skeleton,
} from "@athyper/ui/primitives";
import {
  SearchInput, StatusPill, EmptyState, SectionHeader, CodeBadge,
  useRelayQuery, useRelayMut, relayFetch,
} from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string; code: string; name: string;
  max_users: number | null; sort_order: number; status: string;
  created_at: string;
}

interface PlanVersion {
  id: string; plan_id: string; version_number: number;
  valid_from: string; valid_to: string | null;
  max_users: number | null; status: string; created_at: string;
}

interface PlanModule {
  id: string; code: string; name: string;
  is_included: boolean; is_addon: boolean;
  addon_price_monthly: number | null; user_limit: number | null; created_at: string;
}

interface PlanFeature {
  id: string; code: string; name: string;
  is_included: boolean; is_addon: boolean;
  addon_price_monthly: number | null; max_users: number | null; created_at: string;
}

interface PlanPermission {
  id: string; code: string; name: string; is_plan_restricted: boolean;
  is_included: boolean; is_addon: boolean;
  addon_price_monthly: number | null; usage_limit: number | null; created_at: string;
}

interface Module    { id: string; code: string; name: string; status: string; }
interface Feature   { id: string; code: string; name: string; status: string; }
interface Permission { id: string; code: string; name: string; is_plan_restricted: boolean; status: string; }

// ─── DataTable ────────────────────────────────────────────────────────────────

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b last:border-0 hover:bg-muted/20">{children}</tr>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`px-3 py-2 ${mono ? "font-mono text-primary text-2xs" : ""}`}>{children ?? "—"}</td>;
}

function BoolCell({ value, label }: { value: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${value ? "text-green-600" : "text-muted-foreground"}`}>
      {value ? <Check className="size-3" /> : <XIcon className="size-3" />}
      {label}
    </span>
  );
}

// ─── Create Plan Version dialog ───────────────────────────────────────────────

function CreateVersionDialog({ open, onOpenChange, planCode, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  planCode: string; onDone: () => void;
}) {
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [maxUsers, setMaxUsers]   = useState("");
  const [error, setError]         = useState<string | null>(null);

  const mut = useRelayMut<unknown, void>(
    async () => relayFetch(`/platform/control/commerce/plans/${planCode}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valid_from: validFrom,
        ...(maxUsers ? { max_users: Number(maxUsers) } : {}),
      }),
    }),
    {
      onSuccess: () => { onOpenChange(false); onDone(); setError(null); },
      onError: (e) => setError(e.message),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Create new plan version</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Creates a new active version for <strong>{planCode}</strong>. The current active version will be closed automatically.
          </p>
          <div>
            <Label className="text-xs mb-1 block">Valid from</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Max users override <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)}
              placeholder="Inherit from plan…" className="h-8 text-xs" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate(undefined)} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}Create version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add item dialogs (module / feature / permission) ─────────────────────────

function AddItemDialog<T extends { id: string; code: string; name: string }>({
  open, onOpenChange, title, items, onAdd, loading, error,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; items: T[];
  onAdd: (code: string, isIncluded: boolean, isAddon: boolean) => void;
  loading: boolean; error: string | null;
}) {
  const [code, setCode]           = useState("");
  const [isIncluded, setIncluded] = useState(true);
  const [isAddon, setAddon]       = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs mb-1 block">Item</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.code} value={i.code} className="text-xs">
                    {i.code} — {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={isIncluded} onChange={(e) => {
                setIncluded(e.target.checked);
                if (e.target.checked) setAddon(false);
              }} className="rounded" />
              Included
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={isAddon} onChange={(e) => {
                setAddon(e.target.checked);
                if (e.target.checked) setIncluded(false);
              }} className="rounded" />
              Add-on
            </label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onAdd(code, isIncluded, isAddon)} disabled={!code || loading}>
            {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Plan detail panel ────────────────────────────────────────────────────────

function PlanDetail({ planCode, onVersionCreated }: { planCode: string; onVersionCreated: () => void }) {
  const [addModOpen, setAddModOpen]   = useState(false);
  const [addFeatOpen, setAddFeatOpen] = useState(false);
  const [addPermOpen, setAddPermOpen] = useState(false);
  const [createVerOpen, setCreateVerOpen] = useState(false);
  const [mutError, setMutError]       = useState<string | null>(null);
  const [mutLoading, setMutLoading]   = useState(false);

  const { data: mods,  refetch: refMods  } = useRelayQuery<{ data: PlanModule[]    }>(["plans", planCode, "modules"],     `/platform/control/commerce/plans/${planCode}/modules`);
  const { data: feats, refetch: refFeats } = useRelayQuery<{ data: PlanFeature[]   }>(["plans", planCode, "features"],    `/platform/control/commerce/plans/${planCode}/features`);
  const { data: perms, refetch: refPerms } = useRelayQuery<{ data: PlanPermission[]}>(["plans", planCode, "permissions"], `/platform/control/commerce/plans/${planCode}/permissions`);

  const { data: allMods  } = useRelayQuery<{ data: Module[]     }>(["ref","modules","all"],     "/platform/ref/modules?pageSize=200&status=active");
  const { data: allFeats } = useRelayQuery<{ data: Feature[]    }>(["ref","features","all"],    "/platform/control/commerce/features");
  const { data: allPerms } = useRelayQuery<{ data: Permission[] }>(["ref","permissions","all"], "/platform/ref/permissions?pageSize=500&status=active");

  async function addModule(code: string, isIncluded: boolean, isAddon: boolean) {
    setMutLoading(true); setMutError(null);
    try {
      await relayFetch(`/platform/control/commerce/plans/${planCode}/modules/${code}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_included: isIncluded, is_addon: isAddon }),
      });
      setAddModOpen(false); void refMods();
    } catch (e) { setMutError(e instanceof Error ? e.message : "Failed"); }
    finally { setMutLoading(false); }
  }

  async function removeModule(code: string) {
    if (!confirm(`Remove module ${code} from plan ${planCode}?`)) return;
    await relayFetch(`/platform/control/commerce/plans/${planCode}/modules/${code}`, { method: "DELETE" });
    void refMods();
  }

  async function addFeature(code: string, isIncluded: boolean, isAddon: boolean) {
    setMutLoading(true); setMutError(null);
    try {
      await relayFetch(`/platform/control/commerce/plans/${planCode}/features/${code}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_included: isIncluded, is_addon: isAddon }),
      });
      setAddFeatOpen(false); void refFeats();
    } catch (e) { setMutError(e instanceof Error ? e.message : "Failed"); }
    finally { setMutLoading(false); }
  }

  async function removeFeature(code: string) {
    if (!confirm(`Remove feature ${code} from plan ${planCode}?`)) return;
    await relayFetch(`/platform/control/commerce/plans/${planCode}/features/${code}`, { method: "DELETE" });
    void refFeats();
  }

  async function addPermission(code: string, isIncluded: boolean, isAddon: boolean) {
    setMutLoading(true); setMutError(null);
    try {
      await relayFetch(`/platform/control/commerce/plans/${planCode}/permissions/${code}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_included: isIncluded, is_addon: isAddon }),
      });
      setAddPermOpen(false); void refPerms();
    } catch (e) { setMutError(e instanceof Error ? e.message : "Failed"); }
    finally { setMutLoading(false); }
  }

  async function removePermission(code: string) {
    if (!confirm(`Remove permission ${code} from plan ${planCode}?`)) return;
    await relayFetch(`/platform/control/commerce/plans/${planCode}/permissions/${code}`, { method: "DELETE" });
    void refPerms();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Plan composition</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateVerOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />New version
        </Button>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">
            <Layers3 className="mr-1.5 size-3.5" />Modules ({mods?.data.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="features">
            <Cpu className="mr-1.5 size-3.5" />Features ({feats?.data.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Shield className="mr-1.5 size-3.5" />Permissions ({perms?.data.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-3">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAddModOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />Add module
              </Button>
            </div>
            <DataTable headers={["Code","Name","Included","Add-on","Price/mo","User limit",""]}>
              {(mods?.data ?? []).map((m) => (
                <Tr key={m.id}>
                  <Td mono>{m.code}</Td><Td>{m.name}</Td>
                  <Td><BoolCell value={m.is_included} /></Td>
                  <Td><BoolCell value={m.is_addon} /></Td>
                  <Td>{m.addon_price_monthly != null ? `$${m.addon_price_monthly}` : "—"}</Td>
                  <Td>{m.user_limit ?? "—"}</Td>
                  <Td>
                    <button onClick={() => void removeModule(m.code)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        </TabsContent>

        <TabsContent value="features" className="mt-3">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAddFeatOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />Add feature
              </Button>
            </div>
            <DataTable headers={["Code","Name","Included","Add-on","Price/mo","Max users",""]}>
              {(feats?.data ?? []).map((f) => (
                <Tr key={f.id}>
                  <Td mono>{f.code}</Td><Td>{f.name}</Td>
                  <Td><BoolCell value={f.is_included} /></Td>
                  <Td><BoolCell value={f.is_addon} /></Td>
                  <Td>{f.addon_price_monthly != null ? `$${f.addon_price_monthly}` : "—"}</Td>
                  <Td>{f.max_users ?? "—"}</Td>
                  <Td>
                    <button onClick={() => void removeFeature(f.code)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="mt-3">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAddPermOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />Add permission
              </Button>
            </div>
            <DataTable headers={["Code","Name","Plan-restricted","Included","Add-on",""]}>
              {(perms?.data ?? []).map((p) => (
                <Tr key={p.id}>
                  <Td mono>{p.code}</Td><Td>{p.name}</Td>
                  <Td><BoolCell value={p.is_plan_restricted} /></Td>
                  <Td><BoolCell value={p.is_included} /></Td>
                  <Td><BoolCell value={p.is_addon} /></Td>
                  <Td>
                    <button onClick={() => void removePermission(p.code)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        </TabsContent>
      </Tabs>

      <CreateVersionDialog
        open={createVerOpen} onOpenChange={setCreateVerOpen}
        planCode={planCode} onDone={onVersionCreated}
      />

      <AddItemDialog<Module>
        open={addModOpen} onOpenChange={setAddModOpen}
        title={`Add module to ${planCode}`}
        items={allMods?.data ?? []}
        onAdd={(c, inc, adn) => void addModule(c, inc, adn)}
        loading={mutLoading} error={mutError}
      />

      <AddItemDialog<Feature>
        open={addFeatOpen} onOpenChange={setAddFeatOpen}
        title={`Add feature to ${planCode}`}
        items={allFeats?.data ?? []}
        onAdd={(c, inc, adn) => void addFeature(c, inc, adn)}
        loading={mutLoading} error={mutError}
      />

      <AddItemDialog<Permission>
        open={addPermOpen} onOpenChange={setAddPermOpen}
        title={`Add permission to ${planCode}`}
        items={(allPerms?.data ?? []).filter((p) => p.is_plan_restricted)}
        onAdd={(c, inc, adn) => void addPermission(c, inc, adn)}
        loading={mutLoading} error={mutError}
      />
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, expanded, onToggle, onRefresh }: {
  plan: Plan; expanded: boolean; onToggle: () => void; onRefresh: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
        {expanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{plan.name}</span>
            <CodeBadge>{plan.code}</CodeBadge>
            <StatusPill value={plan.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {plan.max_users != null ? `Up to ${plan.max_users.toLocaleString()} users` : "Unlimited users"}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="border-t px-4 py-4 bg-muted/10">
          <PlanDetail planCode={plan.code} onVersionCreated={onRefresh} />
        </div>
      )}
    </div>
  );
}

// ─── Create plan dialog ───────────────────────────────────────────────────────

function CreatePlanDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const [code, setCode]         = useState("");
  const [name, setName]         = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [error, setError]       = useState<string | null>(null);

  const mut = useRelayMut<unknown, void>(
    async () => relayFetch("/platform/control/commerce/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name,
        ...(maxUsers ? { max_users: Number(maxUsers) } : {}),
      }),
    }),
    {
      onSuccess: () => { onOpenChange(false); onDone(); setCode(""); setName(""); setMaxUsers(""); setError(null); },
      onError: (e) => setError(e.message),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Create subscription plan</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs mb-1 block">Code <span className="text-destructive">*</span></Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="enterprise" className="h-8 text-xs font-mono" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Display name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Enterprise" className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Max users <span className="text-muted-foreground">(leave blank for unlimited)</span></Label>
            <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)}
              placeholder="∞" className="h-8 text-xs" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate(undefined)} disabled={!code || !name || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = useRelayQuery<{ data: Plan[] }>(
    ["plans", "list"],
    "/platform/control/commerce/plans",
  );

  const plans = (data?.data ?? []).filter((p) =>
    !search ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PageFrame
      title="Subscription Plans"
      description="Operator console — plan composition matrix for modules, features, and plan-restricted permissions. Requires PLATFORM.SUBSCRIPTIONS.VIEW."
      width="default"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />New plan
        </Button>
      }
    >
      <div className="space-y-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Filter plans…" className="max-w-xs" />

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            icon={<Layers3 className="size-8 text-muted-foreground/30" />}
            title={search ? "No matching plans" : "No plans configured"}
            description={search ? "Try a different search term." : "Create a subscription plan to get started."}
            action={!search ? (
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />New plan
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {plans
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  expanded={expanded === plan.code}
                  onToggle={() => setExpanded(expanded === plan.code ? null : plan.code)}
                  onRefresh={() => void refetch()}
                />
              ))}
          </div>
        )}
      </div>

      <CreatePlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={() => void refetch()}
      />
    </PageFrame>
  );
}
