# Monthly and annual finance workflow design

`MONTHLY_CLOSE` and `YEAR_END_CLOSE` govern orchestration, evidence, review,
and certification. They do not become accounting stores: journals remain in
`document.journal_entry`/`journal_line`; subledger and other financial outputs
remain in their existing document and ledger domains.

## Monthly close

The seeded monthly flow covers preparation, subledger close, recurring
postings, reconciliation, review, soft close, certification, and post-close
evidence. Recurring-posting tasks orchestrate accrual and reversal journals,
depreciation, FX revaluation, tax calculations, intercompany activity,
inventory valuation, revenue recognition, and expense deferral. Evidence must
reference the resulting existing document, run, and journal IDs.

## Annual close

The annual flow covers final monthly/subledger close, audit and tax
adjustments, asset impairment/revaluation, intercompany elimination,
retained-earnings transfer, final trial balance, next-year opening
carry-forward, financial-statement evidence, controller certification, final
attestation, and hard close.

## Cross-cycle gate

The governance seed creates a hard `cycle_cross_dependency` from
`MONTHLY_CLOSE.CERTIFICATION` to `YEAR_END_CLOSE.YEAR_END_CERTIFICATION`.
When installed, `TAX_CLOSE.CERTIFICATION` and
`SUBLEDGER_CLOSE.CERTIFICATION` are added as equivalent prerequisites. The
period-close sign-off route now evaluates `governance.check_cross_cycle_gate`
before advancing into a target phase and returns `CROSS_CYCLE_GATE_BLOCKED`
with the blocking cycles when it cannot advance.
