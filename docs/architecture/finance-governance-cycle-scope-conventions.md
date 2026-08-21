# Finance Governance Cycle Scope Conventions

## Purpose

Finance uses the generic `governance.cycle_*` model for multi-step control,
exception, evidence, and certification workflows. It does not create a new
workflow schema or finance-specific cycle tables.

This contract applies to finance setup readiness, opening-balance migration,
monthly close, quarterly tax close, annual close, bank reconciliation close,
asset period runs, and similar governed processes.

## Scope identity

Every governance row remains tenant-owned through `tenant_id`. Tenant RLS is
mandatory even before legal-entity and company permissions are introduced.

For finance cycle definitions and runs:

- `cycle_type.tenant_id` owns the tenant-specific process definition.
- `cycle_run.entity_code` is the stable `master.company_code.code`.
- `cycle_run.fiscal_year` and `period_number` identify the accounting period.
- `cycle_run.run_number` identifies a retry, reopening, or replacement run.
- The legal entity is derived through `master.company_code.legal_entity_id`; its
  code is never accepted from a client as an independent authority source.
- Book scope is stored in validated `cycle_run.domain_data.book_ids`. A run may
  govern one book or a coordinated set of books.
- A book-specific attestation uses a distinct `cycle_certification.cert_code`
  and includes `book_id` in the immutable certification snapshot.

The natural finance run identity is therefore:

```text
tenant + company code + cycle type + fiscal year + period + run number
```

## Validated domain data

Each finance `cycle_type` must define a `run_data_schema`. A typical scope is:

```json
{
  "company_code_id": "uuid",
  "legal_entity_id": "uuid",
  "book_ids": ["uuid"],
  "fiscal_period_id": "uuid",
  "source_document_ids": ["uuid"],
  "cutoff_date": "YYYY-MM-DD",
  "scope_version": 1
}
```

Handlers must resolve and verify every identifier against the row tenant and
the company relationship. JSON scope supplements relational ownership; it does
not replace tenant filtering or company authorization.

## URL and request contract

Finance Workbench routes carry an explicit scope:

```text
/workbench/finance/{process}?company={companyCode}&fy={year}&period={period}&book={bookId}
```

Mutation payloads repeat `companyCodeId`, `fiscalYear`, `periodNumber`, and the
selected book IDs. The API compares payload scope with the resolved route and
session context. It rejects mismatches rather than silently changing scope.

Phase 3 authorization will apply grants to the same resolved company and legal
entity. No governance table or URL redesign should be required.

## Definition versus execution ownership

```text
cycle_type / phase / category / template / dependency
    reusable process definition

cycle_run / task
    company-period execution

cycle_deviation
    exception, override, or waiver with evidence

cycle_certification / report_pack
    immutable sign-off snapshot and generated evidence

book_period_status
    company-book-period posting gate
```

Ordinary journal approval remains in the journal/document lifecycle. Governance
cycles orchestrate collections of activities and may reference journal IDs in
task evidence; they do not become an alternative ledger.

## Period gate contract

Posting requires both gates to permit it:

```text
master.fiscal_period.status
AND
governance.book_period_status.status
```

Effective behavior is the most restrictive state:

| Fiscal period | Book period | Effective result |
|---|---|---|
| `open` | `open` | Postable |
| `soft_close` | `open` | Adjustment only |
| `open` | `soft_close` | Adjustment only |
| `hard_close` | any | Locked |
| any | `hard_close` | Locked |
| `future` | any | Locked |
| any | `future` | Locked |
| any | missing | Locked |

The service, database trigger, readiness UI, and posting preview must use the
same vocabulary: `future`, `open`, `soft_close`, and `hard_close`.

## Reuse rules by workflow

Opening balances use `document.import_request` and chunks for source ingestion,
draft journal entries for normalized accounting, cycle tasks/deviations for
validation control, and cycle certification/report packs for sign-off. Invalid
raw rows are corrected and re-uploaded; no editable opening-balance staging
master is introduced.

Monthly and annual cycles orchestrate existing finance documents such as
depreciation runs, FX revaluation runs, tax calculations, reconciliation cases,
and journals. The document IDs and result hashes are stored as evidence.

`cycle_carryforward_rule` carries governance deviations; it never carries GL
balances. Accounting carry-forward creates period-0 journal entries.

`cycle_cross_dependency` gates phases across process types, such as requiring
AP, AR, tax, bank, and asset completion before monthly or annual certification.

`legal_hold` and `legal_hold_manifest` are applied only when evidence must be
preserved for litigation, investigation, or statutory retention. Comment
moderation is not part of finance process orchestration.

## Idempotency and replacement

- System tasks use a deterministic key derived from tenant, run, task, scope,
  and source document.
- Repeated execution returns the existing result or safely resumes it.
- Certified runs are not edited in place.
- Corrections create a replacement run, reversal/replacement journals where
  applicable, and a superseding certification.
- Report packs and certification snapshots include content hashes and source
  record identifiers.

## Authorization boundary

Until Phase 3, authenticated Finance Setup users may execute configured CRUD and
cycle actions, but tenant RLS, scope validation, CSRF controls, audit logging,
and lifecycle gates remain enforced. Phase 3 separates configure, approve,
post, reopen, waive, certify, and attest permissions by legal entity and company.
