# Purchase Invoice Proof System

This is the pilot reset contract for purchase invoice, invoice line, account
assignment split, and posted journal lines. Because the local pilot can be
reset, the model should be cleaned as source-of-truth DDL and metadata rather
than treated as a compatibility migration.

## Four-Layer Contract

| Layer | Table | Owns | Does not own |
| --- | --- | --- | --- |
| Header | `document.purchase_invoice` | Supplier invoice identity, supplier, company, dates, currency, payment terms, workflow, posting reference, derived header totals | Item detail, GL account assignment, posted debits/credits |
| Commercial line | `document.purchase_invoice_line` | What was bought or charged: item/service, quantity, price, line tax groups, line tax amounts, line matching, line classification | Header identity, split accounting, immutable GL posting |
| Account assignment split | `document.accounting_distribution` | How a commercial line is split for accounting: split basis, assigned amount, account derivation, resolved GL account, split dimensions, budget result | Supplier invoice identity, item economics, posted ledger truth |
| Posted journal line | `document.journal_line` | Immutable FI/GL result: debit/credit, fiscal period, GL account, subledger, source trace | Commercial editing, account assignment editing |

## Ownership Rules

1. Header totals are derived caches.
   `line_count`, `subtotal_amount`, `tax_amount`,
   `withholding_tax_amount`, `retention_amount`, and `total_amount` are
   recalculated from `purchase_invoice_line` by trigger/service logic. Users do
   not own these values directly.

2. Header dimensions are defaults only.
   If a line has its own dimensions, the line wins. If a split has dimensions,
   the split wins. The chain is:
   `header default -> line override -> split override -> journal snapshot`.

3. Account assignment split is pre-posting proof.
   `document.accounting_distribution` is not the ledger. It proves how a line
   will be assigned before posting. Posting should consume it and then produce
   immutable `document.journal_line` rows.

4. Journal lines are immutable accounting evidence.
   Posted journal rows are snapshots. They repeat selected company, period,
   account, dimension, party, and amount values because the ledger must remain
   explainable even if upstream master data changes.

5. Repeated fields must have a declared reason.
   Allowed reasons are: `system_identity`, `derived_cache`, `default`,
   `override`, `posting_snapshot`, and `audit`. Anything else is model drift.

## Mass Cleanup Direction

Use `Account Assignment Split` as the user-facing term for
`document.accounting_distribution`. Avoid the phrase `Accounting Line` for this
layer because it collides with posted `document.journal_line`.

For purchase invoice posting readiness, the hard checks are:

| Proof | Rule |
| --- | --- |
| Header totals | Header cached totals equal recomputed line totals |
| Line account assignment | Every commercial line has at least one account assignment split |
| Split amount | Sum of split assigned amounts equals the line commercial amount after line discount |
| Journal source | Posted journal entry references the invoice header |
| Journal balance | Posted journal debit equals credit |
| Journal amount | Posted journal totals equal the invoice total |
| Source trace | Journal line source links point back to invoice lines |

The helper function `document.fn_purchase_invoice_proof(invoice_id)` returns
these checks as rows. A pilot reset can safely make this function the posting
gate once the runtime posting service consumes splits before creating journal
lines.
