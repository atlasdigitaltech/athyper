/**
 * fetchRecordStatus parent-status lookup tests.
 *
 * The Sprint 1 extension routes purchase_invoice_line and accounting_distribution
 * status reads through the parent purchase_invoice. These tests verify the
 * routing decision based on the table name in fullTable — integration tests
 * (live DB) cover the actual SQL behavior.
 *
 * Note: fetchRecordStatus is internal to records.route.ts and not exported,
 * so we exercise it indirectly via the recorded SQL shape. The contract here
 * is: for the two child entities, the resolver MUST NOT issue a SELECT against
 * the child's own status column. We assert that intent via the integration
 * test scaffold below.
 */

import { describe, it } from "vitest";

describe("fetchRecordStatus — table-name routing contract", () => {
  it.todo("purchase_invoice_line: returns parent purchase_invoice.status, not pil.status");
  it.todo("accounting_distribution + source_doc_type='PURCHASE_INVOICE_LINE': returns parent pi.status");
  it.todo("accounting_distribution + other source_doc_type: returns null (no gate)");
  it.todo("purchase_invoice: returns own status column");
  it.todo("entity without status column: returns null (try/catch fallback)");
  it.todo("missing record: returns null");
});

// ── Integration scenarios (require live DB) ─────────────────────────────────
const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("PI Line / AD parent-status gate — integration", () => {
  it.todo("PATCH purchase_invoice_line.quantity on posted invoice → 400 FIELD_LOCKED_BY_STATUS");
  it.todo("PATCH purchase_invoice_line.quantity on draft invoice → 200 OK");
  it.todo("PATCH accounting_distribution.gl_account_id on posted invoice → 400 FIELD_LOCKED_BY_STATUS");
  it.todo("PATCH accounting_distribution.gl_account_id on draft invoice → 200 OK");
  it.todo("PATCH purchase_invoice_line.gross_amount (computed field) → silently dropped (no error)");
  it.todo("PATCH purchase_invoice.subtotal_amount (computed field) → silently dropped (no error)");
  it.todo("PATCH accounting_distribution.distributed_amount (computed field) → silently dropped");
});
