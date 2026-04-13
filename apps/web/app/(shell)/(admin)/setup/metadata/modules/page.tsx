"use client";

/**
 * Setup — Module Subscriptions — /setup/metadata/modules
 *
 * Lists the modules the tenant has subscribed to via master.tenant_module_subscription.
 */

import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Skeleton } from "@athyper/ui/primitives";
import { statusVariant } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModuleSubscription {
  id: string;
  module_id: string;
  status: "active" | "suspended" | "trial";
  subscribed_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useModules() {
  return useQuery<ModuleSubscription[]>({
    queryKey: ["setup", "modules"],
    queryFn: async () => {
      const res = await fetch("/api/relay/platform/modules");
      if (!res.ok) throw new Error("Failed to load modules");
      return res.json() as Promise<ModuleSubscription[]>;
    },
    staleTime: 60 * 1000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function moduleLabel(moduleId: string): string {
  return moduleId
    .split(/[-_.]/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Components ────────────────────────────────────────────────────────────────

function ModuleRow({ mod }: { mod: ModuleSubscription }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/50">
        <Package className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{moduleLabel(mod.module_id)}</p>
        <p className="text-xs font-mono text-muted-foreground">{mod.module_id}</p>
      </div>
      <div className="shrink-0 flex items-center gap-3 text-right">
        <div className="hidden sm:block">
          <p className="text-xs text-muted-foreground">Subscribed</p>
          <p className="text-xs font-medium">{fmtDate(mod.subscribed_at)}</p>
        </div>
        {mod.expires_at && (
          <div className="hidden sm:block">
            <p className="text-xs text-muted-foreground">Expires</p>
            <p className="text-xs font-medium">{fmtDate(mod.expires_at)}</p>
          </div>
        )}
        <Badge variant={statusVariant(mod.status)} className="capitalize">{mod.status}</Badge>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModulesSetupPage() {
  const { data: modules, isLoading } = useModules();

  return (
    <PageFrame
      title="Module Subscriptions"
      description="Product modules enabled for this tenant"
    >
      <div className="max-w-3xl space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : !modules || modules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <Package className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No module subscriptions found</p>
            <p className="text-xs text-muted-foreground/70">
              Contact your platform administrator to activate modules.
            </p>
          </div>
        ) : (
          modules.map((m) => <ModuleRow key={m.id} mod={m} />)
        )}
      </div>
    </PageFrame>
  );
}
