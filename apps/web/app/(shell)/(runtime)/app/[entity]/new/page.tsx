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
 *   /app/supplier/new          → EntityForm  (master record, flat form)
 *
 * Entity naming convention: purchase_invoice (underscore), matching the DB
 * table name. Never use hyphens in entity codes.
 */

import { use, useMemo, useState } from "react";
import { redirect, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EntityForm } from "@athyper/entity-runtime/form";
import {
  appEntityDetailHref,
  appEntityListHref,
  appEntityNewHref,
  entitySlugFromCode,
  normalizeAppEntityHref,
} from "@athyper/runtime-shared/core";
import {
  EntityIntakeLauncher,
  normalizeModes,
  type EntityIntakeMode,
} from "@athyper/entity-runtime/intake";
import { useCreateEntity, useEntityFlow, useCompiledEntity } from "@athyper/query";
import {
  FlowPreflightChooser,
  FlowPreflightLockedSummary,
  FlowWizard,
  FlowWizardSkeleton,
  getFlowPreflightConfig,
  type FlowPreflightSelection,
} from "@athyper/document-runtime/intake";
import { bffFetch } from "@/lib/bff-fetch";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";
import EntityModeFlow from "../../_components/EntityModeFlow";
import { canonicalEntityCode } from "../../_lib/entity-aliases";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityCreateRedirect } from "@athyper/api-contracts/metadata";

export default function AppEntityNewRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);
  const entityCode = canonicalEntityCode(entity);
  const entityListHref = appEntityListHref(entityCode);
  const entityNewHref = appEntityNewHref(entityCode);

  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateEntity(entityCode);
  const [journalSubmitting, setJournalSubmitting] = useState(false);
  const [purchaseInvoiceSubmitting, setPurchaseInvoiceSubmitting] = useState(false);
  const [preflightSelection, setPreflightSelection] = useState<FlowPreflightSelection | null>(null);
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
      values.company_code_id = sourceInvoice["company_code_id"] ?? undefined;
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

  const wizardInitialValues = useMemo<Record<string, unknown> | undefined>(() => {
    const selectedValues = preflightSelection?.values ?? {};
    const values = { ...(initialValues ?? {}), ...selectedValues };
    return Object.keys(values).length > 0 ? values : undefined;
  }, [initialValues, preflightSelection]);

  // Default flow (is_default=true, trigger=new)
  const { data: defaultBundle, isLoading: flowLoading } = useEntityFlow(entityCode, "new");

  // ── Alternate flows — driven by display_config.alternate_flows ─────────────
  // The entity's display_config carries an array of alternate flow codes.
  // We eagerly fetch all alternate bundles so their labels are available before
  // the user interacts with the switcher.
  const { data: compiledEntity, isLoading: metaLoading } = useCompiledEntity(entityCode);
  const entityDisplayLabel = useMemo(
    () => resolveEntityDisplayLabel(compiledEntity, entityCode),
    [compiledEntity, entityCode],
  );
  const createRedirectHref = useMemo(
    () => resolveCreateRedirect(
      compiledEntity?.display_config.create_redirect as EntityCreateRedirect | undefined,
      entityCode,
      searchParams,
    ),
    [compiledEntity?.display_config.create_redirect, entityCode, searchParams],
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
    queryKey: ["entity-flow-alternates", entityCode, alternateFlowCodes],
    queryFn: async () => {
      const results = await Promise.all(
        alternateFlowCodes.map(async (code) => {
          const res = await fetch(
            `/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/flow?flow_code=${encodeURIComponent(code)}`,
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
  const defaultPreflightConfig = useMemo(
    () => getFlowPreflightConfig(defaultBundle),
    [defaultBundle],
  );
  const preflightSuppressesAlternateLauncher = Boolean(defaultPreflightConfig?.suppress_alternate_flow_launcher);
  const needsIntentScreen =
    needsAlternates &&
    activeFlowCode === undefined &&
    !preflightSuppressesAlternateLauncher;

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
  const { guardLoading, denied } = useSubrouteGuard(entityCode, "hasEdit");
  if (createRedirectHref) redirect(createRedirectHref);
  if (guardLoading) return <GuardSkeleton />;
  if (denied) return <FeatureUnavailablePage entityCode={entityCode} />;

  async function handleSubmit(data: Record<string, unknown>) {
    let created: unknown;
    if (entityCode === "journal_entry") {
      setJournalSubmitting(true);
      try {
        created = await createJournalEntryFromIntake(data);
      } finally {
        setJournalSubmitting(false);
      }
    } else if (entityCode === "purchase_invoice") {
      setPurchaseInvoiceSubmitting(true);
      try {
        const { lines: _lines, ...headerData } = data;
        created = await createMutation.mutateAsync(headerData);
        const createdRecord = created as Record<string, unknown>;
        const invoiceId = (createdRecord.id ?? createdRecord.purchase_invoice_id) as string | undefined;
        await createPurchaseInvoiceLinesFromIntake(invoiceId, data);
      } finally {
        setPurchaseInvoiceSubmitting(false);
      }
    } else {
      created = await createMutation.mutateAsync(data);
    }
    const createdRecord = created as Record<string, unknown>;
    const id = (createdRecord.id ?? createdRecord.journal_entry_id) as string | undefined;
    // Brief pause — backend needs ~500ms after the POST before the record is
    // reliably served by GET (Traefik upstream timing). Without this the detail
    // page fires immediately and gets 502s on the main record + lines + distributions.
    await new Promise((resolve) => setTimeout(resolve, 700));
    router.push(id ? appEntityDetailHref(entityCode, id) : entityListHref);
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
        hostEntityCode={entityCode}
        hostEntityLabel={entityDisplayLabel}
        initialValues={initialValues}
        roleModeCodes={intakeRoleModeCodes}
      />
    );
  }

  if (intakeModes.length > 0) {
    return (
      <EntityIntakeLauncher
        entityCode={entityCode}
        title={`${entityDisplayLabel} Management`}
        description={`Create and extend ${entityDisplayLabel.toLowerCase()} records`}
        modes={intakeModes}
        listHref={entityListHref}
        listLabel={`View ${entityDisplayLabel}s`}
        baseNewHref={entityNewHref}
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
            onClick={() => router.push(entityListHref)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const activePreflightConfig = getFlowPreflightConfig(bundle);
  if (bundle && activePreflightConfig && !preflightSelection) {
    return (
      <FlowPreflightChooser
        bundle={bundle}
        entityLabel={entityDisplayLabel}
        onCancel={() => router.push(entityListHref)}
        onContinue={setPreflightSelection}
      />
    );
  }

  if (bundle) {
    const handlePreflightRestart = () => {
      if (window.confirm("Restarting will clear the current draft and return to the chooser.")) {
        setPreflightSelection(null);
      }
    };
    const headerLeadingAction = preflightSelection ? (
      <FlowPreflightLockedSummary
        selection={preflightSelection}
        onRestart={handlePreflightRestart}
      />
    ) : undefined;

    return (
      <FlowWizard
        bundle={bundle}
        userPermissions={bundle.user_permissions}
        userCtx={userCtx}
        initialValues={wizardInitialValues}
        onSubmit={handleSubmit}
        entityLabel={entityDisplayLabel}
        entityCode={entityCode}
        headerLeadingAction={headerLeadingAction}
        lockedFieldNames={preflightSelection?.lockedFields}
        onCancel={() => router.push(entityListHref)}
        submitting={
          entityCode === "journal_entry"
            ? journalSubmitting
            : entityCode === "purchase_invoice"
              ? purchaseInvoiceSubmitting || createMutation.isPending
              : createMutation.isPending
        }
      />
    );
  }

  // Fallback — flat EntityForm for master records and entities without a flow
  return (
    <EntityForm
      entityCode={entityCode}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitting={createMutation.isPending}
    />
  );
}

function resolveEntityDisplayLabel(entityMeta: CompiledEntity | null | undefined, entityCode: string): string {
  const label = entityMeta?.entity_name?.trim();
  return label || formatEntityLabel(entityCode);
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requiredString(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requiredNumber(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) throw new Error(`${label} is required`);
  return numberValue;
}

async function resolveCompanyCodeForJournal(data: Record<string, unknown>): Promise<string> {
  const directCode = String(data["company_code"] ?? "").trim();
  if (directCode && !looksLikeUuid(directCode)) return directCode;

  const directId = String(data["company_code_id"] ?? "").trim();
  const companyValue = requiredString(directId || directCode, "Company Code");
  if (!looksLikeUuid(companyValue)) return companyValue;

  const res = await fetch(`/api/relay/api/records/company_code/${encodeURIComponent(companyValue)}`);
  if (!res.ok) throw new Error("Company Code could not be resolved");
  const body = await res.json() as { data?: Record<string, unknown> };
  const row = body.data ?? {};
  const code = String(row["code"] ?? row["company_code"] ?? "").trim();
  if (!code) throw new Error("Company Code could not be resolved");
  return code;
}

async function createJournalEntryFromIntake(data: Record<string, unknown>) {
  const lines = Array.isArray(data["lines"]) ? data["lines"] : [];
  if (lines.length < 2) throw new Error("At least 2 journal lines are required");

  const postingDate = requiredString(data["posting_date"], "Posting Date");
  const postingDateValue = new Date(postingDate);
  const hasValidPostingDate = Number.isFinite(postingDateValue.getTime());

  const body: Record<string, unknown> = {
    company_code: await resolveCompanyCodeForJournal(data),
    fiscal_year: data["fiscal_year"] == null || data["fiscal_year"] === ""
      ? (hasValidPostingDate ? postingDateValue.getFullYear() : undefined)
      : requiredNumber(data["fiscal_year"], "Fiscal Year"),
    period_number: data["period_number"] == null || data["period_number"] === ""
      ? (hasValidPostingDate ? postingDateValue.getMonth() + 1 : undefined)
      : requiredNumber(data["period_number"], "Period"),
    posting_date: postingDate,
    document_date: String(data["document_date"] ?? "").trim() || postingDate,
    currency_code: requiredString(
      data["transaction_currency"] ??
      data["currency_code"] ??
      data["base_currency_code"] ??
      data["base_currency"],
      "Transaction Currency",
    ),
    description: data["description"] ?? null,
    lines,
  };

  if (data["exchange_rate"] != null && data["exchange_rate"] !== "") {
    body["exchange_rate"] = data["exchange_rate"];
  }

  return bffFetch("/api/finance/journals", {
    method: "POST",
    body,
  });
}

function formatEntityLabel(entityCode: string): string {
  return entityCode
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type PurchaseInvoiceLineInput = {
  item_description?: unknown;
  description?: unknown;
  item_id?: unknown;
  procurement_type?: unknown;
  uom_code?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  price_unit?: unknown;
  commodity_category_id?: unknown;
  business_intent_id?: unknown;
  cost_center_id?: unknown;
  profit_center_id?: unknown;
  project_id?: unknown;
  site_id?: unknown;
};

function invoiceLineText(value: unknown): string {
  return String(value ?? "").trim();
}

function invoiceLineNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePurchaseInvoiceLine(line: PurchaseInvoiceLineInput, headerData: Record<string, unknown>): Record<string, unknown> {
  const itemDescription = invoiceLineText(line.item_description ?? line.description);
  const quantity = invoiceLineNumber(line.quantity, 1);
  const unitPrice = invoiceLineNumber(line.unit_price, 0);
  const procurementType = invoiceLineText(line.procurement_type) || "goods";
  const uomCode = invoiceLineText(line.uom_code).toUpperCase() || "EA";

  return {
    item_description: itemDescription,
    item_id: invoiceLineText(line.item_id) || null,
    procurement_type: procurementType,
    uom_code: uomCode,
    quantity,
    unit_price: unitPrice,
    price_unit: invoiceLineNumber(line.price_unit, 1) || 1,
    commodity_category_id: invoiceLineText(line.commodity_category_id) || null,
    business_intent_id: invoiceLineText(line.business_intent_id) || null,
    cost_center_id: invoiceLineText(line.cost_center_id ?? headerData["cost_center_id"]) || null,
    profit_center_id: invoiceLineText(line.profit_center_id ?? headerData["profit_center_id"]) || null,
    project_id: invoiceLineText(line.project_id ?? headerData["project_id"]) || null,
    site_id: invoiceLineText(line.site_id ?? headerData["site_id"]) || null,
  };
}

async function createPurchaseInvoiceLinesFromIntake(invoiceId: string | undefined, data: Record<string, unknown>) {
  if (!invoiceId) throw new Error("Purchase Invoice id is missing.");
  const lines = Array.isArray(data["lines"]) ? data["lines"] as PurchaseInvoiceLineInput[] : [];
  if (lines.length === 0) throw new Error("At least 1 invoice line is required.");

  for (const line of lines) {
    const body = normalizePurchaseInvoiceLine(line, data);
    if (!invoiceLineText(body["item_description"])) {
      throw new Error("Description is required on every invoice line.");
    }
    if (invoiceLineNumber(body["quantity"]) <= 0) {
      throw new Error("Quantity must be greater than zero on every invoice line.");
    }
    if (invoiceLineNumber(body["unit_price"]) < 0) {
      throw new Error("Unit Price must be zero or greater on every invoice line.");
    }
    await bffFetch(`/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}/lines`, {
      method: "POST",
      body,
    });
  }
}

function resolveCreateRedirect(
  createRedirect: EntityCreateRedirect | undefined,
  entityCode: string,
  searchParams: { toString(): string },
): string | undefined {
  if (!createRedirect) return undefined;

  const template = createRedirect.href_template.trim();
  if (!template) return undefined;

  const entitySlug = entitySlugFromCode(entityCode);
  const templatedHref = template
    .replaceAll("{entity_code}", encodeURIComponent(entityCode))
    .replaceAll("{entity}", encodeURIComponent(entitySlug));
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
  const normalizedTargetPath = normalizeAppEntityHref(targetPath);
  const resolvedHref = mergedQuery ? `${normalizedTargetPath}?${mergedQuery}` : normalizedTargetPath;
  const currentQuery = searchParams.toString();
  const currentHref = appEntityNewHref(entityCode, currentQuery);

  return resolvedHref === currentHref ? undefined : resolvedHref;
}
