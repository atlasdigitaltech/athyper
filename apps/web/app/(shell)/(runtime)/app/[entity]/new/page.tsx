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

import { use, useMemo, useState } from "react";
import { cn } from "@athyper/theme/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EntityForm } from "@athyper/entity-runtime/form";
import { useCreateEntity, useEntityFlow, useCompiledEntity } from "@athyper/query";
import { FlowWizard, FlowWizardSkeleton } from "@athyper/document-runtime/intake";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";
import type { FlowBundle } from "@athyper/api-contracts/documents";

export default function AppEntityNewRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateEntity(entity);

  // ── Source-document pre-population ─────────────────────────────────────────
  // ?invoice=<uuid> — when navigating from an AP invoice's "Propose Payment" action.
  // The mapped fields are written into the intake draft as initialValues; the flow
  // engine ignores keys that don't match its field bindings.
  const sourceInvoiceId = searchParams.get("invoice");

  const { data: sourceInvoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ["new-page-prefill", "purchase_invoice", sourceInvoiceId],
    queryFn: async () => {
      const res = await fetch(
        `/api/relay/api/records/purchase_invoice/${encodeURIComponent(sourceInvoiceId!)}`,
      );
      if (!res.ok) return null;
      const body = await res.json() as { data?: Record<string, unknown> };
      return body.data ?? null;
    },
    enabled: !!sourceInvoiceId,
    staleTime: Infinity,
  });

  // Build initialValues from the source document when present.
  // Unrecognised keys are silently ignored by the flow engine.
  const initialValues = useMemo<Record<string, unknown> | undefined>(() => {
    if (!sourceInvoice) return undefined;
    return {
      supplier_id:       sourceInvoice["supplier_id"]                                  ?? undefined,
      currency_code:     sourceInvoice["currency_code"]                                ?? undefined,
      payment_amount:    sourceInvoice["payable_amount"] ?? sourceInvoice["total_amount"] ?? undefined,
      payment_direction: "OUTBOUND",
      source_invoice_id: sourceInvoiceId,
    };
  }, [sourceInvoice, sourceInvoiceId]);

  // Default flow (is_default=true, trigger=new)
  const { data: defaultBundle, isLoading: flowLoading } = useEntityFlow(entity, "new");

  // ── Alternate flows — driven by display_config.alternate_flows ─────────────
  // The entity's display_config carries an array of alternate flow codes.
  // We eagerly fetch all alternate bundles so their labels are available before
  // the user interacts with the switcher.
  const { data: compiledEntity } = useCompiledEntity(entity);
  const alternateFlowCodes = useMemo(
    () => (compiledEntity?.display_config?.alternate_flows ?? []) as string[],
    [compiledEntity],
  );

  const { data: alternateBundles = [] } = useQuery({
    queryKey: ["entity-flow-alternates", entity, alternateFlowCodes],
    queryFn: async () => {
      const results = await Promise.all(
        alternateFlowCodes.map(async (code) => {
          const res = await fetch(
            `/api/relay/api/metadata/entities/${encodeURIComponent(entity)}/flow?flow_code=${encodeURIComponent(code)}`,
          );
          if (!res.ok) return null;
          const json = await res.json() as { bundle: FlowBundle } | FlowBundle;
          return "bundle" in json ? json.bundle : json;
        }),
      );
      return results.filter((b): b is FlowBundle => b !== null);
    },
    enabled: alternateFlowCodes.length > 0,
    staleTime: Infinity,
  });

  // Active flow code — null means "use default"
  const [activeFlowCode, setActiveFlowCode] = useState<string | null>(null);

  // Resolved bundle — undefined = not yet loaded, null = no flow
  const bundle = activeFlowCode === null
    ? defaultBundle
    : (alternateBundles.find((b) => b.flow_code === activeFlowCode) ?? defaultBundle);

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
    // Brief pause — backend needs ~500ms after the POST before the record is
    // reliably served by GET (Traefik upstream timing). Without this the detail
    // page fires immediately and gets 502s on the main record + lines + distributions.
    await new Promise((resolve) => setTimeout(resolve, 700));
    router.push(id ? `/app/${entity}/${id}` : `/app/${entity}`);
  }

  // Loading state — also wait for source invoice when navigating from ?invoice=
  if (flowLoading || (!!sourceInvoiceId && invoiceLoading)) return <FlowWizardSkeleton />;

  if (bundle) {
    // Build flow-type switcher when the entity has alternate flows in its display_config.
    // Labels come from the eagerly-prefetched bundles — no hardcoded strings.
    const allFlowOptions: { flow_code: string | null; label: string }[] = [
      { flow_code: null, label: defaultBundle?.label ?? entity },
      ...alternateBundles.map((b) => ({ flow_code: b.flow_code, label: b.label })),
    ];

    const flowSwitcher = alternateBundles.length > 0 ? (
      <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5 text-xs">
        {allFlowOptions.map((opt) => {
          const isActive = activeFlowCode === opt.flow_code;
          return (
            <button
              key={opt.flow_code ?? "__default"}
              type="button"
              onClick={() => setActiveFlowCode(opt.flow_code)}
              className={cn(
                "rounded-md px-3 py-1.5 font-semibold transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    ) : undefined;

    return (
      <FlowWizard
        bundle={bundle}
        userPermissions={bundle.user_permissions}
        userCtx={userCtx}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        submitting={createMutation.isPending}
        headerAction={flowSwitcher}
      />
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
