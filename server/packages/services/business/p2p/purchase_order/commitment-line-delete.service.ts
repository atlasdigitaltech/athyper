/**
 * Delete a commitment_line and its polymorphic children in a single transaction.
 * Called from records.route.ts after route-level guards. Cleanup order satisfies
 * the BLOCK-DELETE triggers in 06yzz_commitment_line_child_guards.sql
 * (SQLSTATEs CL010/CL011/CL012).
 *
 * Constraints respected:
 *   - PC cannot be UPDATE-superseded partially (pc_supersede_pair_chk requires
 *     all-3-or-none of superseded_by_id/at/user). For a draft-PO cleanup there
 *     are no downstream references, so PC rows are DELETEd outright.
 *   - schedule_line supports soft-retire via is_current_version=false +
 *     terminal_status='CANCELED' (satisfies schl_terminal_status_chk).
 *   - AD carries no downstream reference for a draft PO — physical DELETE.
 *
 * Lifecycle guard:
 *   - commitment.status MUST be 'draft'
 *   - received_quantity, invoiced_quantity, released_quantity MUST be 0
 */

import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import { refreshCommitmentHeaderAmounts } from "./commitment-line-defaults.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface DeleteCommitmentLineInput {
  tenantId:         string;
  commitmentId:     string;
  commitmentLineId: string;
  principalId:      string | null;
}

export interface DeleteCommitmentLineResult {
  scheduleRetired: number;
  adDeleted:       number;
  pcDeleted:       number;
}

export class MissingTenantError extends Error {
  code   = "MISSING_TENANT";
  status = 400;
  constructor() { super("tenant_id is required"); }
}

export class CommitmentLineNotFoundError extends Error {
  code   = "COMMITMENT_LINE_NOT_FOUND";
  status = 404;
  constructor(id: string) { super(`Commitment line ${id} not found`); }
}

export class CommitmentLineHasUsageError extends Error {
  code   = "COMMITMENT_LINE_HAS_USAGE";
  status = 409;
  constructor(public counters: { received: number; invoiced: number; released: number }) {
    super(`Commitment line has non-zero usage: ${JSON.stringify(counters)}`);
  }
}

export class CommitmentNotDeletableError extends Error {
  code   = "COMMITMENT_NOT_DELETABLE";
  status = 409;
  constructor(public commitmentStatus: string) {
    super(`Commitment status must be 'draft' to delete lines; got '${commitmentStatus}'`);
  }
}

export async function deleteCommitmentLine(
  db: AnyDb,
  input: DeleteCommitmentLineInput,
): Promise<DeleteCommitmentLineResult> {
  if (!input.tenantId || input.tenantId.trim() === "") {
    throw new MissingTenantError();
  }

  return db.transaction().execute(async (trx: Transaction<Record<string, unknown>>) => {
    const actor = input.principalId ?? SYSTEM_ACTOR;

    // 1. Read line + parent commitment status under FOR UPDATE
    const guard = await sql<{
      line_id:            string | null;
      commitment_status:  string | null;
      received_quantity:  string | number;
      invoiced_quantity:  string | number;
      released_quantity:  string | number;
    }>`
      SELECT cl.id AS line_id,
             c.status AS commitment_status,
             cl.received_quantity,
             cl.invoiced_quantity,
             cl.released_quantity
        FROM document.commitment_line cl
        JOIN document.commitment c ON c.id = cl.commitment_id
       WHERE cl.tenant_id     = ${input.tenantId}::uuid
         AND cl.id            = ${input.commitmentLineId}::uuid
         AND cl.commitment_id = ${input.commitmentId}::uuid
       FOR UPDATE OF cl
    `.execute(trx);

    const row = guard.rows[0];
    if (!row || !row.line_id) throw new CommitmentLineNotFoundError(input.commitmentLineId);

    if (row.commitment_status !== "draft") {
      throw new CommitmentNotDeletableError(row.commitment_status ?? "unknown");
    }

    const received = Number(row.received_quantity);
    const invoiced = Number(row.invoiced_quantity);
    const released = Number(row.released_quantity);
    if (received > 0 || invoiced > 0 || released > 0) {
      throw new CommitmentLineHasUsageError({ received, invoiced, released });
    }

    // 2. Retire schedule_line (soft — keeps audit trail)
    const scheduleResult = await sql`
      UPDATE document.schedule_line
         SET is_current_version = false,
             terminal_status    = 'CANCELED',
             status             = 'cancelled',
             updated_at         = now(),
             updated_by         = ${actor}::uuid
       WHERE tenant_id       = ${input.tenantId}::uuid
         AND source_doc_type = 'commitment_line'
         AND source_line_id  = ${input.commitmentLineId}::uuid
         AND is_current_version = true
    `.execute(trx);

    // 3. DELETE accounting_distribution
    const adResult = await sql`
      DELETE FROM document.accounting_distribution
       WHERE tenant_id       = ${input.tenantId}::uuid
         AND source_doc_type = 'commitment_line'
         AND source_line_id  = ${input.commitmentLineId}::uuid
    `.execute(trx);

    // 4. DELETE pricing_component
    //    (pc_supersede_pair_chk forbids partial supersede tuple;
    //     no downstream references exist for a draft PO cleanup)
    const pcResult = await sql`
      DELETE FROM document.pricing_component
       WHERE tenant_id        = ${input.tenantId}::uuid
         AND source_doc_type  = 'commitment_line'
         AND source_line_id   = ${input.commitmentLineId}::uuid
    `.execute(trx);

    // 5. DELETE commitment_line — block triggers CL010/11/12 pass because
    //    children are gone or retired.
    await sql`
      DELETE FROM document.commitment_line
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${input.commitmentLineId}::uuid
    `.execute(trx);

    await refreshCommitmentHeaderAmounts(trx, {
      tenantId: input.tenantId,
      commitmentId: input.commitmentId,
      principalId: input.principalId,
    });

    return {
      scheduleRetired: Number(scheduleResult.numAffectedRows ?? 0),
      adDeleted:       Number(adResult.numAffectedRows ?? 0),
      pcDeleted:       Number(pcResult.numAffectedRows ?? 0),
    };
  });
}
