# Finance Setup Phase 2 — Stage D Payments and Settlement

## Contract

- Payment Terms use the existing version chain. Approved versions are immutable; changes create an effective successor with copied/re-authored ordered clauses and discount tiers.
- Company payment policies define eligibility, currency/amount scope, defaults, channels, approval, cutoff, and the preferred House Bank.
- Interface routing resolves by Company, House Bank, currency, country, network, and exact direction specificity before priority. Equal-specificity/equal-priority matches are rejected and never selected arbitrarily.
- Settlement rules remain posting-role based and must reference an active Book assigned to the Company.
- House Bank readiness requires a current Company-owned link, active configuration/account, verification, compatible currency and direction, and supported execution channel.

## Interfaces

- Tenant Payment Term aggregate editor: due-date behavior, holiday calendar, clause ordering, discount tiers, draft and successor activation.
- Company Payments page: policy matrix, conflict diagnostics, House Bank eligibility, interface binding/trace, settlement accounting, and Posting Role Coverage.

## Verification

Run `pnpm --filter @athyper/svc-finance test --run __tests__/finance-payments-stage-d.contract.test.ts`.
Database catalog checks are opt-in with `RUN_FINANCE_INTEGRATION=1` and `FINANCE_INTEGRATION_DATABASE_URL`.
