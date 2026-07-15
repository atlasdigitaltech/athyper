"use client";

/**
 * @athyper/runtime-canvas — accounting-distribution write helpers.
 *
 * Thin wrappers around the runtime API's
 * `/entities/:entity/:id/lines/:lineId/distributions[/:distId]` routes.
 * Used by polymorphic-pc-lines-surface to back the AccountingDistributionDrawer's
 * Save/Apply action.
 *
 * The runtime route at records.route.ts owns:
 *   - distribution_no sequencing (max + 1)
 *   - distributed_amount derivation from the line's distributable cost
 *   - account_source stamping (OVERRIDE when gl_account_id provided, else PENDING)
 *   - audit log writes
 *
 * Callers only supply the draft fields; everything else is server-derived.
 */

import { csrfFetch } from "@athyper/runtime-shared/client";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { AccountingDistributionDraft, AccountingDistributionSplitDraft } from "@athyper/content-ui";

export interface CreateDistributionInput {
  entityCode: string;
  parentId: string;
  lineId: string;
  draft: AccountingDistributionDraft;
}

export async function createAccountingDistribution(input: CreateDistributionInput): Promise<void> {
  const { entityCode, parentId, lineId, draft } = input;
  const res = await csrfFetch(runtimePath.lineDistributions(entityCode, parentId, lineId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toRequestBody(draft)),
  });
  if (!res.ok) {
    throw await toFetchError(res, "Distribution save failed");
  }
}

export interface UpdateDistributionInput {
  entityCode: string;
  parentId: string;
  lineId: string;
  distributionId: string;
  draft: AccountingDistributionDraft;
}

export async function updateAccountingDistribution(input: UpdateDistributionInput): Promise<void> {
  const { entityCode, parentId, lineId, distributionId, draft } = input;
  const res = await csrfFetch(
    runtimePath.lineDistribution(entityCode, parentId, lineId, distributionId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toRequestBody(draft)),
    },
  );
  if (!res.ok) {
    throw await toFetchError(res, "Distribution update failed");
  }
}

export interface DeleteDistributionInput {
  entityCode: string;
  parentId: string;
  lineId: string;
  distributionId: string;
}

export async function deleteAccountingDistribution(input: DeleteDistributionInput): Promise<void> {
  const { entityCode, parentId, lineId, distributionId } = input;
  const res = await csrfFetch(
    runtimePath.lineDistribution(entityCode, parentId, lineId, distributionId),
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw await toFetchError(res, "Distribution delete failed");
  }
}

export interface ReplaceDistributionsInput {
  entityCode: string;
  parentId: string;
  lineId: string;
  drafts: AccountingDistributionSplitDraft[];
}

export async function replaceAccountingDistributions(input: ReplaceDistributionsInput): Promise<void> {
  const { entityCode, parentId, lineId, drafts } = input;
  const res = await csrfFetch(runtimePath.lineDistributions(entityCode, parentId, lineId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      distributions: drafts.map(toSplitRequestBody),
    }),
  });
  if (!res.ok) {
    throw await toFetchError(res, "Distribution split save failed");
  }
}

// ── internals ─────────────────────────────────────────────────────

function toRequestBody(draft: AccountingDistributionDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    distribution_basis: draft.distribution_basis,
    split_pct:          draft.split_pct,
    cost_center_id:     draft.cost_center_id,
    profit_center_id:   draft.profit_center_id,
    project_id:         draft.project_id,
    asset_id:           draft.asset_id,
    description:        draft.description,
  };
  // Only include gl_account_id when the drawer signals an explicit change
  // (set or clear). Omitting the key keeps dimension-only edits out of the
  // server's reason-code enforcement path. The drawer pairs gl_account_id
  // with reason_code, so they're carried together.
  if (draft.gl_account_id !== undefined) {
    body["gl_account_id"] = draft.gl_account_id;
  }
  if (draft.reason_code !== undefined) {
    body["reason_code"] = draft.reason_code;
  }
  return body;
}

function toSplitRequestBody(draft: AccountingDistributionSplitDraft): Record<string, unknown> {
  return {
    distribution_basis: draft.distribution_basis,
    split_pct:          draft.split_pct ?? null,
    split_amount:       draft.split_amount ?? null,
    split_quantity:     draft.split_quantity ?? null,
    cost_center_id:     draft.cost_center_id,
    profit_center_id:   draft.profit_center_id,
    project_id:         draft.project_id,
    asset_id:           draft.asset_id,
    description:        draft.description,
    gl_account_id:      draft.gl_account_id,
    reason_code:        draft.reason_code,
  };
}

async function toFetchError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return new Error(body?.message ?? body?.error ?? `${fallback} (${res.status}).`);
}
