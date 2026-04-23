"use client";

/**
 * Runtime entity create — /app/[entity]/new
 *
 * Renders either:
 *   FlowWizard  — when the entity has an active 'create' flow in the flow
 *                 engine (approvable documents, guided intake).
 *   EntityForm  — for all other entities (master records, simple forms).
 *
 * Flow detection: fetches GET /meta/flow?entity=…&trigger=new via
 * useEntityFlow(). Falls back to EntityForm on any error or null response.
 *
 * Alternate flows: entities may expose additional non-default flows for the
 * same trigger (e.g. purchase_invoice exposes create_proforma alongside the
 * default create flow). When present, an "alternate flow" pill appears at the
 * top right so users can switch before entering the wizard.
 *
 * Examples:
 *   /app/purchase_invoice/new   → FlowWizard (3-step AP intake)
 *                                  + "Create Pro-forma instead" pill
 *   /app/journal_entry/new      → FlowWizard (when flow is seeded)
 *   /app/vendor/new             → EntityForm  (master record, flat form)
 *
 * Entity naming convention: purchase_invoice (underscore), matching the DB
 * table name. Never use hyphens in entity codes.
 */

import { use, useMemo, useState, useCallback } from "react";
import { cn } from "@athyper/theme/utils";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EntityForm } from "@athyper/entity-runtime/form";
import { useCreateEntity, useEntityFlow } from "@athyper/query";
import { FlowWizard, FlowWizardSkeleton } from "@athyper/document-runtime/intake";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";
import type { FlowBundle } from "@athyper/api-contracts/documents";
/**
 * Alternate flow codes available per entity. Keyed by entity_code (underscore).
 * Populated here because the metadata API only exposes the *default* flow via
 * useEntityFlow(). Non-default flows are fetched on demand when the user
 * explicitly requests them.
 *
 * Add entries for other entities as their alternate flows are seeded.
 */
const ALTERNATE_FLOWS: Record<string, { flow_code: string; label: string }[]> = {
  purchase_invoice: [
    { flow_code: "create_proforma", label: "Create Pro-forma instead" },
  ],
};


export default function AppEntityNewRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);
  const router = useRouter();
  const createMutation = useCreateEntity(entity);

  // Default flow (is_default=true, trigger=new)
  const { data: defaultBundle, isLoading: flowLoading } = useEntityFlow(entity, "new");

  // Active bundle: starts as the default; user can switch to an alternate
  const [activeBundle, setActiveBundle] = useState<FlowBundle | null | undefined>(undefined);
  const [altLoading, setAltLoading] = useState(false);

  // Resolved bundle — undefined = not yet loaded, null = no flow
  const bundle = activeBundle !== undefined ? activeBundle : defaultBundle;

  // Fetch the current user's profile to seed ctx.user.* derived fields
  const { data: profileData } = useQuery({
    queryKey: ["user", "profile"],
    queryFn: async () => {
      const res = await fetch("/api/user/profile");
      if (!res.ok) return null;
      return res.json() as Promise<{ profile: Record<string, unknown> | null }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const userCtx = useMemo(() => {
    const p = profileData?.profile;
    if (!p) return undefined;
    return {
      default_company_code: p["default_company_code_id"] ?? undefined,
      default_cost_center:  p["default_cost_center_id"]  ?? undefined,
    };
  }, [profileData]);

  // Guard — all hooks above; safe to return early from here
  const { guardLoading, denied } = useSubrouteGuard(entity, "hasEdit");
  if (guardLoading) return <GuardSkeleton />;
  if (denied) return <FeatureUnavailablePage entityCode={entity} />;

  async function handleSubmit(data: Record<string, unknown>) {
    const created = await createMutation.mutateAsync(data);
    const id = (created as Record<string, unknown>).id as string | undefined;
    router.push(id ? `/app/${entity}/${id}` : `/app/${entity}`);
  }

  const switchToAlternateFlow = useCallback(async (flowCode: string) => {
    setAltLoading(true);
    try {
      const res = await fetch(
        `/api/relay/api/meta/flow?entity=${encodeURIComponent(entity)}&flow_code=${encodeURIComponent(flowCode)}`,
      );
      if (!res.ok) return;
      const json = await res.json() as { bundle: FlowBundle } | FlowBundle;
      const fetched = "bundle" in json ? json.bundle : json;
      setActiveBundle(fetched);
    } finally {
      setAltLoading(false);
    }
  }, [entity]);

  const switchToDefaultFlow = useCallback(() => {
    setActiveBundle(undefined);
  }, []);

  // Loading state
  if (flowLoading || altLoading) return <FlowWizardSkeleton />;

  const alternates = ALTERNATE_FLOWS[entity] ?? [];
  // We're on an alternate flow when activeBundle is set and differs from the default
  const isAlternate = activeBundle !== undefined && activeBundle !== null;

  if (bundle) {
    return (
      <div className="space-y-0">
        {/* Flow mode switcher — [Invoice | Pro-forma] peer segmented control.
            Placed above the wizard so both entry points feel equal, not
            "correct path vs. fallback". is_default=true is 'Invoice';
            alternate flows are peer options, not secondary actions. */}
        {alternates.length > 0 && (
          <div className="flex justify-end px-4 pt-4">
            <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={switchToDefaultFlow}
                className={cn(
                  "rounded-md px-3 py-1.5 font-semibold transition-colors",
                  !isAlternate
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Invoice
              </button>
              {alternates.map((alt) => (
                <button
                  key={alt.flow_code}
                  type="button"
                  onClick={!isAlternate ? () => void switchToAlternateFlow(alt.flow_code) : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-semibold transition-colors",
                    isAlternate
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Pro-forma
                </button>
              ))}
            </div>
          </div>
        )}

        <FlowWizard
          bundle={bundle}
          userPermissions={bundle.user_permissions}
          userCtx={userCtx}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          submitting={createMutation.isPending}
        />
      </div>
    );
  }

  // Fallback — flat EntityForm for master records and entities without a flow
  return (
    <EntityForm
      entityCode={entity}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitting={createMutation.isPending}
    />
  );
}
