# Opening-balance governed import design

## Decision

Opening balances are a governed period-0 workflow, not a new CRUD aggregate. No
`opening_balance_*` table is introduced and there is no editable raw-row staging
grid. A bad source row is corrected in the source file and re-uploaded. Once
validation succeeds, `document.journal_entry` and `document.journal_line` are
the editable normalized accounting representation.

## Existing-record ownership

| Need | Record of authority |
| --- | --- |
| Upload, file hash, mapping, source metadata | `document.import_request` |
| Retryable work and row errors | `document.import_request_chunk.errors_json` |
| Batch/run, phases and validation evidence | `governance.cycle_run`, `governance.cycle_task.evidence_payload` |
| Exceptions and waivers | `governance.cycle_deviation` |
| Draft and posted opening journals | `document.journal_entry`, `document.journal_line` |
| Journal approval | Journal lifecycle or `document.workflow_request` |
| Trial balance | `ledger.gl_balance` (read-only) |
| Formal sign-off | `governance.cycle_certification` |
| Evidence package | `governance.report_pack` |
| Posting and hard-close gate | `master.fiscal_period`, `governance.book_period_status` |

## Cycle contract

`OPENING_BALANCE_MIGRATION` is an ad-hoc Finance cycle that can start only in fiscal
period `0`. Its run payload must contain `company_code`, `migration_strategy`,
`source_system`, `source_cutoff_date`, the selected `book_ids`, and eventually
the `import_request_ids`. The API starts it through the existing
`POST /finance/period-close/runs` endpoint with `cycleTypeCode: "OPENING_BALANCE_MIGRATION"`.

The phases are Preparation, Validation, Review and Approval, Posting,
Reconciliation, Certification and Attestation, and Period-0 Hard Close. Every
phase has hard finish-to-start dependencies. Deviations are recorded as
`cycle_deviation`; failed import rows are never silently waived.

## Posting invariants

- Each journal uses `source_doc_type = 'opening_balance'`,
  `source_doc_id = import_request.id`, and `period_number = 0`.
- Creation/posting uses a stable `book_idempotency_key`, so retrying cannot
  create another book-specific opening journal.
- Posting is allowed only after both the fiscal period and relevant book period
  are open, and after journal approval.
- Journal IDs, imported/posted debit-credit totals, trial-balance totals, and
  reconciliation totals are written to the applicable task evidence.

## Validation minimum

The validation task must record results for file structure and mandatory
columns; account existence, activation, chart and book assignment, and
postability; debit-credit equality; currencies/exchange rates; required
dimensions; duplicate import/journal detection; control-account policy;
AP/AR/subledger dependencies; and period-0 availability. Chunk errors are
stored in `errors_json`; a corrected file creates a new import request.

## Certifications and final evidence

Create separate versioned `cycle_certification` records with codes
`OPEN_BAL_GL`, `OPEN_BAL_AP`, `OPEN_BAL_AR`, `OPEN_BAL_ASSET`,
`OPEN_BAL_INVENTORY`, `OPEN_BAL_BANK`, and `OPEN_BAL_FINAL` as applicable.
The final snapshot references import request IDs, source-file hashes, journal
IDs, trial-balance and subledger reconciliation totals, deviations, approvers,
report pack ID, and its content hash. Only final attestation permits the
period-0 hard close.
