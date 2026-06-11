/**
 * Invoice Hold / Release Service — Model A.
 *
 * `status = 'on_hold'` is the single source of truth for hold state.
 * Restoration state is stored in purchase_invoice.metadata.hold:
 *
 *   {
 *     "hold": {
 *       "previous_status": "approved",  // status before hold
 *       "held_at":         "...",       // ISO timestamp
 *       "held_by":         "<uuid>",    // principal that held
 *       "released_at":     "...",       // set on release
 *       "released_by":     "<uuid>"     // set on release
 *     }
 *   }
 *
 * Hold and release are NOT allowed from terminal statuses (posted, fully_paid,
 * reversed, cancelled) — terminal documents need amend/reverse flows instead.
 * Release falls back to 'draft' when metadata.hold.previous_status is missing
 * (defensive — should not happen for invoices placed via this service).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export class HoldNotAllowedError extends Error {
  public readonly code = "HOLD_NOT_ALLOWED" as const;
  constructor(message = "Invoice cannot be placed on hold from its current status.") {
    super(message);
    this.name = "HoldNotAllowedError";
  }
}

export class ReleaseNotAllowedError extends Error {
  public readonly code = "RELEASE_NOT_ALLOWED" as const;
  constructor(message = "Invoice is not on hold or release is not allowed.") {
    super(message);
    this.name = "ReleaseNotAllowedError";
  }
}

/**
 * Places an invoice on hold (status='on_hold'), capturing the previous status
 * into metadata.hold.previous_status for later restoration.
 */
export async function placeInvoiceOnHold(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string,
  reason:      string,
): Promise<{ status: string; previous_status: string }> {
  const result = await sql<{ status: string; previous_status: string }>`
    WITH current_row AS (
      SELECT id, status
        FROM document.purchase_invoice
       WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid
         AND status NOT IN ('on_hold','posted','fully_paid','reversed','cancelled')
       FOR UPDATE
    )
    UPDATE document.purchase_invoice pi
       SET metadata          = jsonb_set(
             COALESCE(pi.metadata, '{}'::jsonb),
             '{hold}',
             jsonb_build_object(
               'previous_status', current_row.status,
               'held_at',         now(),
               'held_by',         ${principalId}::uuid
             ),
             true),
           hold_reason       = ${reason},
           status            = 'on_hold',
           status_changed_at = now(),
           status_changed_by = ${principalId}::uuid,
           updated_at        = now(),
           updated_by        = ${principalId}::uuid
      FROM current_row
     WHERE pi.id = current_row.id
   RETURNING pi.status, current_row.status AS previous_status
  `.execute(db);

  if (!result.rows[0]) {
    throw new HoldNotAllowedError(
      "Invoice is already on hold, posted, fully_paid, reversed, or cancelled — hold not allowed.",
    );
  }
  return result.rows[0];
}

/**
 * Releases a held invoice, restoring metadata.hold.previous_status. Falls back
 * to 'draft' when previous_status is missing.
 */
export async function releaseInvoiceHold(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string,
): Promise<{ status: string }> {
  const result = await sql<{ status: string }>`
    UPDATE document.purchase_invoice pi
       SET status            = COALESCE(pi.metadata->'hold'->>'previous_status', 'draft'),
           metadata          = jsonb_set(
                                 COALESCE(pi.metadata, '{}'::jsonb),
                                 '{hold}',
                                 COALESCE(pi.metadata->'hold', '{}'::jsonb)
                                   || jsonb_build_object(
                                        'released_at', to_jsonb(now()),
                                        'released_by', to_jsonb(${principalId}::uuid)
                                      ),
                                 true),
           status_changed_at = now(),
           status_changed_by = ${principalId}::uuid,
           updated_at        = now(),
           updated_by        = ${principalId}::uuid
     WHERE pi.id        = ${invoiceId}::uuid
       AND pi.tenant_id = ${tenantId}::uuid
       AND pi.status    = 'on_hold'
   RETURNING pi.status
  `.execute(db);

  if (!result.rows[0]) {
    throw new ReleaseNotAllowedError("Invoice is not on hold — release not allowed.");
  }
  return result.rows[0];
}
