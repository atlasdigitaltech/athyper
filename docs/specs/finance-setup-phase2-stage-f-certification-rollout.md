# Finance Setup Phase 2 — Stage F Certification and Rollout

## Canonical readiness contract

`GET /finance/setup/certification-readiness?scopeType=company|legal_entity|tenant&scopeCode=...`
returns the same four domains for every Company:

- `currency_fx`: approved policy, required-pair coverage, and FX/revaluation posting roles.
- `tax`: effective registration, versioned groups with rounding, deterministic resolution, and posting roles.
- `payments_settlement`: eligible methods, House Bank eligibility, deterministic interface routing, Book settlement coverage, and posting roles.
- `banking_treasury`: effective House Banks, aggregate validation, and statement/reconciliation readiness.

Every domain reports `not_started`, `in_progress`, `blocked`, or `ready`, passed/total checks, blockers, warnings, and a primary action. Certification is permitted only when exactly four domains are present and all are ready. The immutable certification snapshot embeds the evaluated domains and summary.

## Freshness and invalidation

`FINANCE_POSTING_READY` is derived evidence. Material writes to FX, Tax, Payment Term, Company Payment Policy, interface-routing, settlement, Bank Party, Bank Account, House Bank, and Bank Interface contracts supersede current `CERTIFIED` or `ATTESTED` evidence. Company-owned policies invalidate their Company; reusable definitions conservatively invalidate all Companies in the tenant.

## Existing-tenant migration and rollout

Stage F enables the posting-gate capability globally but creates an `observe` rollout policy for every existing active tenant. Missing policy also resolves to `observe`. Observation never blocks posting.

`control.finance_posting_rollout_policy` supports a tenant default and an optional Company override:

- `observe`: readiness and certification are visible but posting remains non-blocking.
- `enforce`: production journal posting requires the latest attested `FINANCE_POSTING_READY` certification to contain a passing four-domain snapshot with no incomplete mandatory tasks or unresolved critical deviation.

Opening balances, reversals, Finance Setup tests, and already-posted journals retain their dedicated lifecycle behavior and are excluded from this production gate.

## Test matrix

Automated coverage includes:

1. One Company with all four domains ready.
2. Multiple Companies whose certification decisions remain independent.
3. Multi-currency required-pair failure.
4. Multi-Book settlement coverage failure.
5. Multi-House-Bank validation failure.
6. Multi-jurisdiction Tax Resolution ambiguity.
7. Rollout-policy RLS/defaulting and posting-trigger catalog checks.
8. A deployed-database Company snapshot exercising all four domain services.

Run contract tests with:

`pnpm --filter @athyper/svc-finance test --run __tests__/finance-certification-stage-f.contract.test.ts`

Run deployed catalog/service tests with `RUN_FINANCE_INTEGRATION=1` and `FINANCE_INTEGRATION_DATABASE_URL`.

