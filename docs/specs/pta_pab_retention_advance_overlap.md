# Retention / Advance — PTA + PAB Architecture (Authoritative)

**Version:** 1.0 (P2 v1.2) · **Date:** 2026-06-14
**Status:** Architectural reference. Supersedes the v1.0-v1.1 proposal of parallel `retention_schedule` and `advance_application` tables.

This doc is the authoritative reference for retention + advance modeling in Athyper AP.

---

## TL;DR

> Athyper already has comprehensive retention + advance infrastructure across PTA (per-invoice evaluation), PAB (per-party balance rollup), PTC (term definition), and the commitment-side ledger tables. **Do not build parallel tables.** Add only what's missing: a link from PC to PTA, and a submit-time seeder that creates PTA rows from PC.

---

## The Three Layers

```
   ┌───────────────────────────────────────────────────────┐
   │  master.payment_term_clause (PTC)                     │
   │  DEFINITION                                           │
   │  "30% advance, retention 10% with milestone release"  │
   │  clause_type: ADVANCE / ADVANCE_RECOVERY /            │
   │               RETENTION / RETENTION_RELEASE           │
   └───────────────────────┬───────────────────────────────┘
                           │ at invoice submit
                           ▼
   ┌───────────────────────────────────────────────────────┐
   │  document.payment_term_application (PTA)              │
   │  EVALUATION                                           │
   │  "Invoice INV-001 applied $3,000 advance recovery"    │
   │  one row per (invoice × clause [× line] × seq)        │
   │  clause_type, applied_amount, resolved_due_date,      │
   │  running_total, remaining_balance,                    │
   │  reversed_by / superseded_by                          │
   └───────────────────────┬───────────────────────────────┘
                           │ at financial event posting
                           ▼
   ┌───────────────────────────────────────────────────────┐
   │  document.party_advance_balance (PAB)                 │
   │  ROLLUP                                               │
   │  "Supplier ABC has $12,000 advance, $4,500 retention" │
   │  per (tenant, company, supplier, currency)            │
   │  advance_balance, retention_balance, counts           │
   └───────────────────────────────────────────────────────┘
```

For commitment-based (PO/contract) workflows, the commitment-side mirror:

```
   ledger.commitment_schedule    — RETENTION schedule lines per commitment
   ledger.commitment_fulfillment — RETENTION_RELEASE / ADVANCE_RECOVERY events
```

---

## Where Pricing Component Fits

PC defines pricing terms at the invoice (the "what"). For retention and withholding term_types, PC needs to flow into PTA so the existing PTA evaluation, override, reversal, and PAB-rollup machinery runs on PC-originated terms exactly like clause-originated terms.

```
   document.pricing_component  (PC)  — invoice-line clause
   term_type IN ('retention','withholding')
                          │ at submit, retention-advance-seeder
                          ▼
   document.payment_term_application  (PTA)
   clause_type = 'RETENTION' / 'WITHHOLDING' (etc.)
   pricing_component_id  ← NEW FK back to PC
                          │ at posting
                          ▼
   document.party_advance_balance (PAB) updated
```

### Two Origins, One Evaluation Stream

| Origin | clause_id | payment_term_id | pricing_component_id (new) | When |
|---|---|---|---|---|
| Payment-term-clause-driven | NOT NULL | NOT NULL | NULL | Existing — supplier's term applies a clause |
| PC-driven (ad-hoc) | NULL | NULL | NOT NULL | New — invoice carries an ad-hoc retention/withholding via PC |

The CHECK `pta_nonpo_snapshot_chk` (already present) handles the snapshot side; we add a small CHECK so PC-origin rows are well-formed.

---

## Decision: No New Tables

The P2 v1.0/1.1 plan proposed `document.retention_schedule` and `document.advance_application`. **Both are superseded by the existing PTA + PAB stack.** Rationale:

| Capability | v1.0/1.1 proposed | Already provided by |
|---|---|---|
| Per-invoice retention deduction event | retention_schedule | PTA clause_type='RETENTION' |
| Per-invoice retention release event | retention_schedule release_event | PTA clause_type='RETENTION_RELEASE' |
| Multi-milestone retention timeline | retention_schedule milestone_no | Multiple PTA RETENTION_RELEASE rows (one per milestone) + PTC release_event |
| Currency triple on retention | retention_schedule currency_code, base, exchange_rate | PTA has applied_amount; currency inherited from invoice |
| Per-invoice advance application event | advance_application | PTA clause_type='ADVANCE_RECOVERY' |
| Polymorphic advance source link | advance_application advance_document_id | PTA via commitment_id (PO) + term_snapshot (non-PO); see "Future Extension" |
| Running per-party balance | (rolls up from advance_application) | PAB |

The cost of parallel tables would be: dual writes, drift risk, double the field rules, double the RLS, double the invariants. The benefit was: nothing new — PTA covers the territory.

---

## What P2 Actually Lands

| Item | Detail |
|---|---|
| **1. PTA extension** | Add `pricing_component_id uuid` column on `document.payment_term_application`. Nullable. FK to `document.pricing_component(id)`. Indexed `WHERE pricing_component_id IS NOT NULL`. |
| **2. PTA invariants** | New CHECK: PC-origin rows have non-null `pricing_component_id` and consistent `clause_type` (must align with PC.term_type). |
| **3. Seeder service** | `retention-advance-seeder.service.ts` — submit-time. Reads PC rows of `term_type IN ('retention','withholding')`; INSERTs PTA rows with `pricing_component_id`, `clause_type`, `applied_amount` from PC.computed_amount. |
| **4. Release schedule view** | `document.v_invoice_retention_release_schedule` — joins PTA (clause_type=RETENTION_RELEASE) + PTC for the milestone-calendar question. |
| **5. Spec update** | Replace §17.1, §17.2 in `purchase_invoice_field_design.md`: drop parallel tables, point at PTA+PAB. |

---

## Future Extensions (Out of Scope for P2)

| Item | Why deferred |
|---|---|
| Polymorphic FK from PTA to advance source document | Today's commitment_id + term_snapshot is workable but indirect. A dedicated `advance_source_doc_type` + `advance_source_doc_id` pair would clean this up. Defer until a real reporting need surfaces. |
| Milestone-driven retention release tied to project milestones | `master.payment_term_clause.release_event` is text today. A first-class link to a project milestone table would help complex contracts. Defer until tenant requests. |
| PTA-PC sync trigger | Today the seeder is service-managed. A trigger that auto-creates/supersedes PTA when PC changes would tighten the link but adds complexity. Defer. |

---

## Operator Notes

- Existing PTA writers (`invoice-payment-term.service.ts`) are unchanged. They continue to use clause_id + payment_term_id origin.
- The new seeder runs alongside (after) the existing payment-term evaluator at submit. Both produce PTA rows; the discriminator is which origin field is populated.
- `evaluation_sequence_no` is allocated per-invoice and unique. The seeder must respect this — see service for allocation logic.
- PAB updates remain triggered by financial events (posting, payment), not by PTA insertion. PC → PTA at submit does NOT touch PAB; PAB updates happen at posting.

---

## References

- v1.2 canonical spec: [docs/specs/purchase_invoice_field_design.md](docs/specs/purchase_invoice_field_design.md)
- PTA DDL: [server/db/ddl/document/01e_tables_invoice.sql:615](server/db/ddl/document/01e_tables_invoice.sql#L615)
- PAB DDL: [server/db/ddl/document/01m_tables_party_advance.sql:25](server/db/ddl/document/01m_tables_party_advance.sql#L25)
- PTC DDL: [server/db/ddl/master/01d_tables_payment_terms.sql:240](server/db/ddl/master/01d_tables_payment_terms.sql#L240)
- Commitment ledger: [server/db/ddl/ledger/01_tables.sql:410](server/db/ddl/ledger/01_tables.sql#L410)
- PC DDL (P1): [server/db/ddl/document/01u_tables_pricing_component.sql](server/db/ddl/document/01u_tables_pricing_component.sql)
