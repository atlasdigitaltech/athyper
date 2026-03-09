/**
 * GET /api/entity-page/:entity/:id
 *
 * Dynamic entity page descriptor endpoint.
 * Returns per-record metadata: badges, actions, current lifecycle state, and permissions.
 *
 * Resolution order:
 *   1. DB-driven builder for entities backed by real tables
 *   2. Mock-data builder for legacy/demo entities
 *   3. Generic fallback for unknown entities
 */

import { sql } from "kysely";
import { NextResponse } from "next/server";

import type {
  ActionDescriptor,
  BadgeDescriptor,
  EntityPageDynamicDescriptor,
  ViewMode,
} from "@/lib/entity-page/types";
import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";
import {
  ACCOUNTS_BY_ID,
  PURCHASE_INVOICES_BY_ID,
} from "@/lib/mock-data/entities";

// ---------------------------------------------------------------------------
// Descriptor builders
// ---------------------------------------------------------------------------

/**
 * Build dynamic descriptor for an Account (Master entity).
 * Master entities have simple Active/Inactive status and always-available Edit action.
 * No lifecycle or approval workflow.
 */
function buildAccountDescriptor(
  entityId: string,
  viewMode: ViewMode,
): EntityPageDynamicDescriptor {
  // Derive status from shared mock data — single source of truth
  const record = ACCOUNTS_BY_ID[entityId];
  const status = (record?.status as string) ?? "Active";
  const isActive = status === "Active";

  const badges: BadgeDescriptor[] = [
    { code: "class", label: "Master", variant: "outline" },
    {
      code: "status",
      label: status,
      variant: isActive ? "success" : "secondary",
    },
  ];

  const actions: ActionDescriptor[] = [
    {
      code: "edit",
      label: "Edit",
      handler: "entity.edit",
      variant: "default",
      enabled: true,
      requiresConfirmation: false,
    },
  ];

  return {
    entityName: "account",
    entityId,
    resolvedViewMode: viewMode,
    badges,
    actions,
    permissions: { canEdit: true, canDelete: false },
  };
}

/**
 * Build dynamic descriptor for a Purchase Invoice (Document entity).
 * Document entities have a lifecycle state machine that determines:
 *  - Which badge variant to show (color-coded by state)
 *  - Which actions are available (state-dependent transitions)
 *  - Whether the record is editable (only in Draft state)
 *  - View mode overrides (read-only when past Draft or in terminal state)
 *
 * Lifecycle: Draft → Submitted → Approved → Paid
 *            Draft → Cancelled (from any pre-terminal state)
 */
function buildInvoiceDescriptor(
  entityId: string,
  viewMode: ViewMode,
): EntityPageDynamicDescriptor {
  // Derive status from shared mock data — single source of truth
  const record = PURCHASE_INVOICES_BY_ID[entityId];
  const status = (record?.status as string) ?? "Draft";

  // Badge variant per lifecycle state
  const stateVariant: Record<string, BadgeDescriptor["variant"]> = {
    Draft: "secondary",
    Submitted: "default",
    Approved: "success",
    Paid: "success",
    Cancelled: "destructive",
  };

  const badges: BadgeDescriptor[] = [
    { code: "class", label: "Document", variant: "outline" },
    {
      code: "state",
      label: status,
      variant: stateVariant[status] ?? "secondary",
    },
  ];

  // Lifecycle-dependent actions — only the valid next transition is offered
  const actions: ActionDescriptor[] = [];

  if (status === "Draft") {
    actions.push({
      code: "submit",
      label: "Submit",
      handler: "lifecycle.submit",
      variant: "default",
      enabled: true,
      requiresConfirmation: true,
      confirmationMessage: "Submit this invoice for approval?",
    });
  }

  if (status === "Submitted") {
    actions.push({
      code: "approve",
      label: "Approve",
      handler: "lifecycle.approve",
      variant: "default",
      enabled: true,
      requiresConfirmation: true,
      confirmationMessage: "Approve this invoice for payment?",
    });
  }

  if (status === "Approved") {
    actions.push({
      code: "pay",
      label: "Mark as Paid",
      handler: "lifecycle.pay",
      variant: "default",
      enabled: true,
      requiresConfirmation: true,
      confirmationMessage: "Mark this invoice as paid?",
    });
  }

  // Edit is only available in Draft — document is locked once submitted
  if (status === "Draft") {
    actions.push({
      code: "edit",
      label: "Edit",
      handler: "entity.edit",
      variant: "outline",
      enabled: true,
      requiresConfirmation: false,
    });
  }

  const isTerminal = status === "Paid" || status === "Cancelled";

  // Force read-only for non-Draft states; set reason for the UI notice
  const resolvedViewMode =
    isTerminal || status !== "Draft" ? ("view" as ViewMode) : viewMode;
  const viewModeReason = isTerminal
    ? "terminal_state"
    : status !== "Draft"
      ? "approval_pending"
      : undefined;

  return {
    entityName: "purchase-invoice",
    entityId,
    resolvedViewMode,
    viewModeReason,
    currentState: {
      stateId: `state-${status.toLowerCase()}`,
      stateCode: status.toLowerCase(),
      stateName: status,
      isTerminal,
    },
    badges,
    actions,
    permissions: {
      canEdit: status === "Draft",
      canDelete: status === "Draft",
    },
  };
}

/**
 * Generic descriptor for entities without a dedicated builder.
 * Provides basic edit action and class badge so the page shell renders.
 */
function buildGenericDescriptor(
  entitySlug: string,
  entityId: string,
  viewMode: ViewMode,
): EntityPageDynamicDescriptor {
  return {
    entityName: entitySlug,
    entityId,
    resolvedViewMode: viewMode,
    badges: [{ code: "class", label: "Master", variant: "outline" }],
    actions: [
      {
        code: "edit",
        label: "Edit",
        handler: "entity.edit",
        variant: "default",
        enabled: true,
        requiresConfirmation: false,
      },
    ],
    permissions: { canEdit: true, canDelete: false },
  };
}

// ---------------------------------------------------------------------------
// DB-driven document descriptor builder
// ---------------------------------------------------------------------------

/** Entities whose status is resolved from the database */
const DB_DOCUMENT_ENTITIES: Record<string, { qualifiedTable: string }> = {
  "purchase-non-po-invoice": { qualifiedTable: "fin.purchase_invoice" },
  "credit-note": { qualifiedTable: "fin.credit_note" },
  "debit-note": { qualifiedTable: "fin.debit_note" },
};

function buildDocumentDescriptorFromStatus(
  entitySlug: string,
  entityId: string,
  status: string,
  viewMode: ViewMode,
): EntityPageDynamicDescriptor {
  const stateVariant: Record<string, BadgeDescriptor["variant"]> = {
    DRAFT: "secondary",
    SUBMITTED: "default",
    APPROVED: "success",
    POSTED: "success",
    PAID: "success",
    CANCELLED: "destructive",
    REVERSED: "destructive",
  };

  const badges: BadgeDescriptor[] = [
    { code: "class", label: "Document", variant: "outline" },
    {
      code: "state",
      label: status,
      variant: stateVariant[status] ?? "secondary",
    },
  ];

  const actions: ActionDescriptor[] = [];

  if (status === "DRAFT") {
    actions.push({
      code: "submit",
      label: "Submit",
      handler: "lifecycle.submit",
      variant: "default",
      enabled: true,
      requiresConfirmation: true,
      confirmationMessage: "Submit this document for approval?",
    });
    actions.push({
      code: "edit",
      label: "Edit",
      handler: "entity.edit",
      variant: "outline",
      enabled: true,
      requiresConfirmation: false,
    });
  }

  if (status === "SUBMITTED") {
    actions.push({
      code: "approve",
      label: "Approve",
      handler: "lifecycle.approve",
      variant: "default",
      enabled: true,
      requiresConfirmation: true,
      confirmationMessage: "Approve this document?",
    });
  }

  if (status === "APPROVED") {
    actions.push({
      code: "post",
      label: "Post",
      handler: "posting.post",
      variant: "default",
      enabled: true,
      requiresConfirmation: true,
      confirmationMessage: "Post this document to the ledger?",
    });
  }

  const isTerminal = ["PAID", "CANCELLED", "REVERSED", "POSTED"].includes(status);
  const resolvedViewMode =
    isTerminal || status !== "DRAFT" ? ("view" as ViewMode) : viewMode;
  const viewModeReason = isTerminal
    ? ("terminal_state" as const)
    : status !== "DRAFT"
      ? ("approval_pending" as const)
      : undefined;

  return {
    entityName: entitySlug,
    entityId,
    resolvedViewMode,
    viewModeReason,
    currentState: {
      stateId: `state-${status.toLowerCase()}`,
      stateCode: status.toLowerCase(),
      stateName: status,
      isTerminal,
    },
    badges,
    actions,
    permissions: {
      canEdit: status === "DRAFT",
      canDelete: status === "DRAFT",
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const MOCK_BUILDERS: Record<
  string,
  (id: string, vm: ViewMode) => EntityPageDynamicDescriptor
> = {
  account: buildAccountDescriptor,
  "chart-of-accounts": buildAccountDescriptor,
  "purchase-invoice": buildInvoiceDescriptor,
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;

  try {
    const viewMode =
      (req.nextUrl.searchParams.get("viewMode") as ViewMode) ?? "view";

    // 1. Mock-data builders (legacy/demo)
    const mockBuilder = MOCK_BUILDERS[entity];
    if (mockBuilder) {
      return NextResponse.json({ data: mockBuilder(id, viewMode) });
    }

    // 2. DB-driven document entities
    const dbEntity = DB_DOCUMENT_ENTITIES[entity];
    if (dbEntity) {
      const db = getDb();
      if (db) {
        let redis: { quit: () => Promise<void> } | null = null;
        try {
          const apiCtx = await getApiContext();
          redis = apiCtx.redis;
          if (apiCtx.context) {
            const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
            const result = await sql<{ status: string; approval_instance_id: string | null }>`
              select status, approval_instance_id from ${sql.table(dbEntity.qualifiedTable)}
              where tenant_id = ${tenantUuid}::uuid and id = ${id}::uuid
            `.execute(db);

            if (result.rows.length > 0) {
              const descriptor = buildDocumentDescriptorFromStatus(
                entity, id, result.rows[0].status, viewMode,
              );

              // Hydrate approval data if linked
              const approvalInstanceId = result.rows[0].approval_instance_id;
              if (approvalInstanceId) {
                const approvalResult = await sql<{ id: string; status: string }>`
                  select id, status from wf.approval_instance
                  where id = ${approvalInstanceId}::uuid and tenant_id = ${tenantUuid}::uuid
                `.execute(db);

                if (approvalResult.rows.length > 0) {
                  const ai = approvalResult.rows[0];
                  const taskResult = await sql<{ id: string; status: string }>`
                    select id, status from wf.approval_task
                    where approval_instance_id = ${approvalInstanceId}::uuid
                      and tenant_id = ${tenantUuid}::uuid
                      and status IN ('pending', 'assigned', 'in_progress')
                  `.execute(db);

                  descriptor.approval = {
                    instanceId: ai.id,
                    status: ai.status === "approved" ? "completed"
                          : ai.status === "rejected" ? "rejected"
                          : ai.status === "canceled" ? "canceled"
                          : "open",
                    myTasks: taskResult.rows.map((t) => ({ id: t.id, status: t.status })),
                  };
                }
              }

              return NextResponse.json({ data: descriptor });
            }
          }
        } finally {
          await redis?.quit();
        }
      }
      // DB unavailable or record not found — fall through to generic
    }

    // 3. Generic fallback
    return NextResponse.json({
      data: buildGenericDescriptor(entity, id, viewMode),
    });
  } catch (error) {
    console.error(`[GET /api/entity-page/${entity}/${id}] Error:`, error);
    return NextResponse.json(
      { error: { message: "Failed to load entity descriptor" } },
      { status: 500 },
    );
  }
}
