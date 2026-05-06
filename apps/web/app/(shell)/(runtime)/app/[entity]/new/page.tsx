"use client";

/**
 * Runtime entity create — /app/[entity]/new
 *
 * Renders either:
 *   IntentScreen — pre-wizard card picker when the entity exposes alternate
 *                  flows (display_config.alternate_flows non-empty). The user
 *                  picks a flow type; the chosen wizard then loads.
 *   FlowWizard   — when the entity has an active 'create' flow in the flow
 *                  engine (document records, guided intake).
 *   EntityForm   — for all other entities (master records, simple forms).
 *
 * Examples:
 *   /app/purchase_invoice/new  → IntentScreen → FlowWizard (Standard or Proforma)
 *   /app/journal_entry/new     → FlowWizard (when flow is seeded)
 *   /app/vendor/new            → EntityForm  (master record, flat form)
 *
 * Entity naming convention: purchase_invoice (underscore), matching the DB
 * table name. Never use hyphens in entity codes.
 */

import { use, useMemo, useState } from "react";
import { redirect, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EntityForm } from "@athyper/entity-runtime/form";
import {
  EntityIntakeLauncher,
  normalizeModes,
  type EntityIntakeMode,
} from "@athyper/entity-runtime/intake";
import { useCreateEntity, useEntityFlow, useCompiledEntity } from "@athyper/query";
import { FlowWizard, FlowWizardSkeleton } from "@athyper/document-runtime/intake";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";
import EntityModeFlow from "../../_components/EntityModeFlow";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import type { EntityCreateRedirect } from "@athyper/api-contracts/metadata";

export default function AppEntityNewRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);

  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateEntity(entity);
  const requestedMode = searchParams.get("mode") ?? searchParams.get("role");
  const businessPartnerId = searchParams.get("bp");

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
    const values: Record<string, unknown> = {};

    if (sourceInvoice) {
      values.supplier_id = sourceInvoice["supplier_id"] ?? undefined;
      values.currency_code = sourceInvoice["currency_code"] ?? undefined;
      values.payment_amount = sourceInvoice["payable_amount"] ?? sourceInvoice["total_amount"] ?? undefined;
      values.payment_direction = "OUTBOUND";
      values.source_invoice_id = sourceInvoiceId;
    }

    if (requestedMode === "extension" && businessPartnerId) {
      values.code = businessPartnerId;
    }

    return Object.keys(values).length > 0 ? values : undefined;
  }, [businessPartnerId, requestedMode, sourceInvoice, sourceInvoiceId]);

  // Default flow (is_default=true, trigger=new)
  const { data: defaultBundle, isLoading: flowLoading } = useEntityFlow(entity, "new");

  // ── Alternate flows — driven by display_config.alternate_flows ─────────────
  // The entity's display_config carries an array of alternate flow codes.
  // We eagerly fetch all alternate bundles so their labels are available before
  // the user interacts with the switcher.
  const { data: compiledEntity, isLoading: metaLoading } = useCompiledEntity(entity);
  const createRedirectHref = useMemo(
    () => resolveCreateRedirect(
      compiledEntity?.display_config.create_redirect as EntityCreateRedirect | undefined,
      entity,
      searchParams,
    ),
    [compiledEntity?.display_config.create_redirect, entity, searchParams],
  );
  const alternateFlowCodes = useMemo(
    () => (compiledEntity?.display_config?.alternate_flows ?? []) as string[],
    [compiledEntity],
  );
  const intakeModes = useMemo(
    () => normalizeModes(compiledEntity?.display_config.intake_modes as EntityIntakeMode[] | undefined),
    [compiledEntity?.display_config.intake_modes],
  );
  const activeIntakeMode = requestedMode
    ? intakeModes.find((mode) => mode.code === requestedMode)
    : undefined;
  const intakeRoleModeCodes = useMemo(
    () => intakeModes
      .filter((mode) => mode.persistence_mode?.endsWith("_intake"))
      .map((mode) => mode.code),
    [intakeModes],
  );

  const { data: alternateBundles = [], isLoading: alternatesLoading } = useQuery({
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

  // Active flow code:
  //   undefined = intent screen (user hasn't chosen yet — only when alternates exist)
  //   null      = use default flow
  //   string    = use a specific alternate flow by flow_code
  const [activeFlowCode, setActiveFlowCode] = useState<string | null | undefined>(undefined);

  const needsAlternates = alternateFlowCodes.length > 0;
  const needsIntentScreen = needsAlternates && activeFlowCode === undefined;

  // Resolved bundle — undefined when intent screen is shown or while loading
  const bundle = needsIntentScreen
    ? undefined
    : activeFlowCode === null || activeFlowCode === undefined
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
  if (createRedirectHref) redirect(createRedirectHref);
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

  // Loading state — wait for default flow + alternates (if any) + source invoice
  if (
    metaLoading ||
    flowLoading ||
    (needsAlternates && alternatesLoading) ||
    (!!sourceInvoiceId && invoiceLoading)
  ) {
    return <FlowWizardSkeleton />;
  }

  // Intent screen — shown before the wizard when the entity has alternate flows
  if (activeIntakeMode) {
    return (
      <EntityModeFlow
        mode={activeIntakeMode}
        hostEntityCode={entity}
        hostEntityLabel={formatEntityLabel(entity)}
        initialValues={initialValues}
        roleModeCodes={intakeRoleModeCodes}
      />
    );
  }

  if (intakeModes.length > 0) {
    const label = formatEntityLabel(entity);
    return (
      <EntityIntakeLauncher
        entityCode={entity}
        title={`${label} Management`}
        description={`Create and extend ${label.toLowerCase()} records`}
        modes={intakeModes}
        listHref={`/app/${entity}`}
        listLabel={`View ${label}s`}
        baseNewHref={`/app/${entity}/new`}
      />
    );
  }

  if (needsIntentScreen && defaultBundle) {
    const options = [
      { code: null as null, bundle: defaultBundle },
      ...alternateBundles.map((b) => ({ code: b.flow_code as string, bundle: b })),
    ];
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-xl space-y-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            What are you creating?
          </p>
          <div className="grid grid-cols-2 gap-4">
            {options.map(({ code, bundle: b }) => (
              <button
                key={code ?? "__default"}
                type="button"
                onClick={() => setActiveFlowCode(code)}
                className="group text-left rounded-xl border bg-card px-5 py-4 hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <div className="font-semibold text-sm text-foreground mb-1.5">{b.label}</div>
                {b.description && (
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {b.description}
                  </div>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/app/${entity}`)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (bundle) {
    return (
      <FlowWizard
        bundle={bundle}
        userPermissions={bundle.user_permissions}
        userCtx={userCtx}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        entityCode={entity}
        onCancel={() => router.push(`/app/${entity}`)}
        submitting={createMutation.isPending}
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

function formatEntityLabel(entityCode: string): string {
  return entityCode
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveCreateRedirect(
  createRedirect: EntityCreateRedirect | undefined,
  entityCode: string,
  searchParams: { toString(): string },
): string | undefined {
  if (!createRedirect) return undefined;

  const template = createRedirect.href_template.trim();
  if (!template) return undefined;

  const templatedHref = template
    .replaceAll("{entity_code}", encodeURIComponent(entityCode))
    .replaceAll("{entity}", encodeURIComponent(entityCode));
  const queryIndex = templatedHref.indexOf("?");
  const targetPath = queryIndex >= 0 ? templatedHref.slice(0, queryIndex) : templatedHref;
  const targetQuery = queryIndex >= 0 ? templatedHref.slice(queryIndex + 1) : "";

  if (!targetPath.startsWith("/") || targetPath.startsWith("//")) return undefined;

  const mergedParams = new URLSearchParams(
    createRedirect.preserve_query === false ? "" : searchParams.toString(),
  );
  const targetParams = new URLSearchParams(targetQuery);
  targetParams.forEach((value, key) => mergedParams.set(key, value));

  const mergedQuery = mergedParams.toString();
  const resolvedHref = mergedQuery ? `${targetPath}?${mergedQuery}` : targetPath;
  const currentQuery = searchParams.toString();
  const currentHref = `/app/${encodeURIComponent(entityCode)}/new${currentQuery ? `?${currentQuery}` : ""}`;

  return resolvedHref === currentHref ? undefined : resolvedHref;
}
