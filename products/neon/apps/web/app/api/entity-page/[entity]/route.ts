/**
 * GET /api/entity-page/:entity
 *
 * Static entity page descriptor endpoint.
 * Returns cacheable metadata (tabs, sections, feature flags) for a given entity type.
 *
 * Resolution order:
 *   1. ENTITY_REGISTRY (hardcoded, backward compatible)
 *   2. meta.entity.feature_flags.ui.descriptorOverride (DB-stored manual override)
 *   3. Auto-generate from meta.field + section grouping engine
 *   4. DEFAULT_DEFINITION (fallback when DB unavailable)
 */

import { NextResponse } from "next/server";

import type {
  EntityPageStaticDescriptor,
  SectionDescriptor,
  TabDescriptor,
} from "@/lib/entity-page/types";
import type { NextRequest } from "next/server";

import { getApiContext, resolveTenantUuid } from "@/lib/api-context";
import { getDb } from "@/lib/db";
import { resolveEntityMeta } from "@/lib/entity-meta";
import { resolveFieldsWithFKs } from "@/lib/entity-meta-fields";
import { groupFieldsIntoSections } from "@/lib/entity-page/section-grouping";

// ---------------------------------------------------------------------------
// Entity descriptor registry (backward compatible)
// ---------------------------------------------------------------------------

interface EntityDefinition {
  entityClass: string;
  tabs: TabDescriptor[];
  sections: SectionDescriptor[];
  featureFlags: Record<string, boolean>;
}

const DEFAULT_DEFINITION: EntityDefinition = {
  entityClass: "master",
  tabs: [
    { code: "details", label: "Details", enabled: true },
    { code: "documents", label: "Documents", enabled: true },
  ],
  sections: [],
  featureFlags: {
    lifecycle: false,
    approvals: false,
    documents: true,
  },
};

const ENTITY_REGISTRY: Record<string, EntityDefinition> = {
  account: {
    entityClass: "master",
    tabs: [
      { code: "details", label: "Details", enabled: true },
      { code: "documents", label: "Documents", enabled: true },
    ],
    sections: [
      {
        code: "general",
        label: "General",
        columns: 2,
        fields: ["account_code", "account_name", "account_type", "currency"],
      },
      {
        code: "details",
        label: "Details",
        columns: 2,
        fields: ["parent_account", "status", "description", "created_at"],
      },
    ],
    featureFlags: {
      lifecycle: false,
      approvals: false,
      documents: true,
    },
  },
  "chart-of-accounts": {
    entityClass: "master",
    tabs: [
      { code: "details", label: "Details", enabled: true },
      { code: "documents", label: "Documents", enabled: true },
    ],
    sections: [
      {
        code: "general",
        label: "General",
        columns: 2,
        fields: ["account_code", "account_name", "account_type", "currency"],
      },
      {
        code: "details",
        label: "Details",
        columns: 2,
        fields: ["parent_account", "status", "description", "created_at"],
      },
    ],
    featureFlags: {
      lifecycle: false,
      approvals: false,
      documents: true,
    },
  },
  "purchase-invoice": {
    entityClass: "document",
    tabs: [
      { code: "details", label: "Details", enabled: true },
      { code: "lifecycle", label: "Lifecycle", enabled: true },
      { code: "approvals", label: "Approvals", enabled: true },
      { code: "documents", label: "Documents", enabled: true },
    ],
    sections: [
      {
        code: "header",
        label: "Header",
        columns: 2,
        fields: [
          "invoice_number",
          "supplier",
          "invoice_date",
          "due_date",
          "payment_terms",
        ],
      },
      {
        code: "amounts",
        label: "Amounts",
        columns: 2,
        fields: ["net_amount", "tax_amount", "total_amount", "currency"],
      },
      {
        code: "status",
        label: "Status",
        columns: 1,
        fields: ["status"],
      },
    ],
    featureFlags: {
      lifecycle: true,
      approvals: true,
      documents: true,
    },
  },
  "purchase-non-po-invoice": {
    entityClass: "document",
    tabs: [
      { code: "details", label: "Details", enabled: true },
      { code: "invoice-lines", label: "Line Items", enabled: true },
      { code: "accounting-details", label: "Accounting", enabled: true },
      { code: "related-documents", label: "Related Documents", enabled: true },
      { code: "lifecycle", label: "Lifecycle", enabled: true },
      { code: "approvals", label: "Approvals", enabled: true },
      { code: "decision-score", label: "Decision Score", enabled: true },
      { code: "documents", label: "Attachments", enabled: true },
    ],
    sections: [
      {
        code: "header",
        label: "Invoice Header",
        columns: 2,
        fields: [
          "invoice_number",
          "supplier_id",
          "ou_id",
          "entity_code",
        ],
      },
      {
        code: "dates",
        label: "Dates",
        columns: 2,
        fields: [
          "invoice_date",
          "received_date",
          "due_date",
          "posting_date",
        ],
      },
      {
        code: "amounts",
        label: "Financial Summary",
        columns: 2,
        fields: [
          "subtotal",
          "tax_amount",
          "total_amount",
          "currency_code",
          "paid_amount",
          "functional_currency_code",
          "exchange_rate",
          "functional_amount",
        ],
      },
      {
        code: "classification",
        label: "Classification",
        columns: 2,
        fields: [
          "intent_id",
          "spend_category_id",
          "fp_id",
          "accounting_profile_id",
        ],
      },
      {
        code: "workflow",
        label: "Workflow & Status",
        columns: 2,
        fields: [
          "status",
          "decision_score",
          "approval_route",
          "approval_instance_id",
        ],
      },
      {
        code: "posting",
        label: "Posting",
        columns: 2,
        fields: [
          "je_id",
          "posted_at",
          "posted_by",
        ],
      },
      {
        code: "audit",
        label: "Audit Trail",
        columns: 2,
        fields: [
          "submitted_at",
          "submitted_by",
          "approved_at",
          "approved_by",
          "cancelled_at",
          "cancelled_by",
          "created_at",
          "updated_at",
          "version",
        ],
      },
    ],
    featureFlags: {
      lifecycle: true,
      approvals: true,
      documents: true,
    },
  },
  "purchase-invoice-line": {
    entityClass: "detail",
    tabs: [
      { code: "details", label: "Line Details", enabled: true },
      { code: "accounting-details", label: "Accounting", enabled: true },
      { code: "related-documents", label: "Parent Invoice", enabled: true },
    ],
    sections: [
      {
        code: "line-header",
        label: "Line Item",
        columns: 2,
        fields: [
          "line_no",
          "description",
          "invoice_id",
          "item_id",
        ],
      },
      {
        code: "quantity-pricing",
        label: "Quantity & Pricing",
        columns: 2,
        fields: [
          "quantity",
          "uom",
          "unit_price",
          "amount",
        ],
      },
      {
        code: "tax",
        label: "Tax",
        columns: 2,
        fields: [
          "tax_code",
          "tax_rate",
          "tax_amount",
          "tax_inclusive",
        ],
      },
      {
        code: "accounting",
        label: "Accounting Dimensions",
        columns: 2,
        fields: [
          "account_id",
          "cost_center_id",
          "profit_center_id",
          "fp_id",
        ],
      },
      {
        code: "downstream",
        label: "Downstream References",
        columns: 2,
        fields: [
          "asset_id",
          "inventory_movement_id",
          "commitment_id",
          "commitment_schedule_id",
          "warehouse_id",
        ],
      },
      {
        code: "metadata",
        label: "Metadata",
        columns: 2,
        fields: [
          "spend_category_id",
          "tags",
          "created_at",
          "updated_at",
        ],
      },
    ],
    featureFlags: {
      lifecycle: false,
      approvals: false,
      documents: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;

  try {
    // 1. Check hardcoded registry first (backward compatible)
    const registryEntry = ENTITY_REGISTRY[entity];
    if (registryEntry) {
      const descriptor: EntityPageStaticDescriptor = {
        entityName: entity,
        entityClass: registryEntry.entityClass,
        featureFlags: registryEntry.featureFlags,
        compiledModelHash: `registry-${entity}-v1`,
        tabs: registryEntry.tabs,
        sections: registryEntry.sections,
      };
      return NextResponse.json({ data: descriptor });
    }

    // 2-3. Try DB-driven resolution
    const db = getDb();
    if (db) {
      let redis: { quit: () => Promise<void> } | null = null;
      try {
        const apiCtx = await getApiContext();
        redis = apiCtx.redis;
        const { context } = apiCtx;

        if (context) {
          const tenantUuid = await resolveTenantUuid(db, context.tenantId);
          const meta = await resolveEntityMeta(db, entity, tenantUuid);

          if (meta) {
            // 2. Check for DB-stored descriptor override
            const uiFlags = (meta.featureFlags as any)?.ui as
              | Record<string, unknown>
              | undefined;
            const descriptorOverride = uiFlags?.descriptorOverride as
              | EntityDefinition
              | undefined;

            if (descriptorOverride?.sections?.length) {
              const descriptor: EntityPageStaticDescriptor = {
                entityName: entity,
                entityClass:
                  descriptorOverride.entityClass ??
                  deriveEntityClass(meta.kind),
                featureFlags:
                  descriptorOverride.featureFlags ?? buildFeatureFlags(meta),
                compiledModelHash: `override-${entity}-v1`,
                tabs: descriptorOverride.tabs ?? buildTabs(meta),
                sections: descriptorOverride.sections,
              };
              return NextResponse.json({ data: descriptor });
            }

            // 3. Auto-generate from meta.field + section grouping
            const fields = await resolveFieldsWithFKs(
              db,
              meta.entityName,
              tenantUuid,
              meta.tableSchema,
              meta.tableName,
            );

            if (fields.length > 0) {
              const sectionOverrides = uiFlags?.sectionOverrides as
                | Record<string, string>
                | undefined;
              const sectionLabels = uiFlags?.sectionLabels as
                | Record<string, string>
                | undefined;

              const sections = groupFieldsIntoSections(fields, {
                sectionOverrides,
                sectionLabels,
              });

              const descriptor: EntityPageStaticDescriptor = {
                entityName: entity,
                entityClass: deriveEntityClass(meta.kind),
                featureFlags: buildFeatureFlags(meta),
                compiledModelHash: `auto-${entity}-v1`,
                tabs: buildTabs(meta),
                sections,
              };
              return NextResponse.json({ data: descriptor });
            }
          }
        }
      } catch (dbErr) {
        console.warn(
          `[GET /api/entity-page/${entity}] DB resolution failed, using default:`,
          dbErr,
        );
      } finally {
        await redis?.quit();
      }
    }

    // 4. Ultimate fallback — log for observability
    console.warn(
      `[entity-page] FALLBACK: entity="${entity}" resolved via DEFAULT_DEFINITION. ` +
        `No registry entry, no DB meta, no field metadata found. ` +
        `This indicates missing entity seed data or DB connectivity issue.`,
    );
    const descriptor: EntityPageStaticDescriptor = {
      entityName: entity,
      entityClass: DEFAULT_DEFINITION.entityClass,
      featureFlags: DEFAULT_DEFINITION.featureFlags,
      compiledModelHash: `default-${entity}-v1`,
      tabs: DEFAULT_DEFINITION.tabs,
      sections: DEFAULT_DEFINITION.sections,
    };
    return NextResponse.json({ data: descriptor });
  } catch (error) {
    console.error(`[GET /api/entity-page/${entity}] Error:`, error);
    return NextResponse.json(
      { error: { message: "Failed to load entity descriptor" } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveEntityClass(kind: string): string {
  switch (kind) {
    case "doc":
      return "document";
    case "ref":
      return "reference";
    default:
      return "master";
  }
}

function buildFeatureFlags(meta: {
  kind: string;
  featureFlags: Record<string, unknown> | null;
}): Record<string, boolean> {
  const isDocument = meta.kind === "doc";
  return {
    lifecycle: isDocument,
    approvals: isDocument,
    documents: true,
  };
}

function buildTabs(meta: {
  kind: string;
  tableSchema: string;
  featureFlags: Record<string, unknown> | null;
}): TabDescriptor[] {
  const isDocument = meta.kind === "doc";
  const isFinance = meta.tableSchema === "fin";
  const tabs: TabDescriptor[] = [
    { code: "details", label: "Details", enabled: true },
  ];

  if (isFinance && isDocument) {
    tabs.push({ code: "accounting-details", label: "Accounting", enabled: true });
    tabs.push({ code: "related-documents", label: "Related Documents", enabled: true });
  }

  if (isDocument) {
    tabs.push({ code: "lifecycle", label: "Lifecycle", enabled: true });
    tabs.push({ code: "approvals", label: "Approvals", enabled: true });
  }

  tabs.push({ code: "documents", label: "Documents", enabled: true });
  return tabs;
}
