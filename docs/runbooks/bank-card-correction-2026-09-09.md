# Bank card correction — DEV, 9 September 2026

The received MESH account card now reads effective company assignments and review records. It shows actual authorized company names and each company's acceptance, purpose, preference, and assignment dates. Applied legacy reviews without a pinned disclosure version are explicitly labelled “Previously applied · review required”; no acceptance is manufactured during display. Company authorization is evaluated for each candidate company when reading an unscoped card.

The card uses the real receipt timestamp under “Disclosure received on.” It no longer substitutes the current reporting date for an effective date. Omitted owner verification and account identifier type display “Not provided.” Explicit negative owner verification remains distinct from omitted evidence.

Both previously unresolved links now have dedicated pages:

- `/mdg/business-partner/[recordId]/banking`: view accounts, explicitly select a permitted company, edit company assignments, and register a protected account.
- `/mdg/business-partner/[recordId]/bank-verification`: select company/account, load its existing review, start a review of the current disclosure, and use the existing independent verification/application controls.

Navigation preserves an explicitly selected company. Management opens unscoped otherwise, regardless of shell context. Successful application refreshes displayed banking data. Neither navigation nor rendering initiates a payment or changes acceptance.

Validation: 25 focused server/UI tests passed; server contract/service type checks and both complete production image builds passed. Live database-backed reader checks on the reported partner confirmed the actual company, legacy acceptance, receipt timestamp, unknown owner evidence, denied-company redaction, and selected-company verification profile. Both dedicated routes appear in the production Next route manifest.

The authenticated browser check could not run because the available saved sessions were anonymous/expired. Browser evidence is not claimed. Runtime health and live data checks were performed separately.

No SQL migration was needed. Private image rollback references, build logs, verification results and deployment receipts are retained at:

`/home/chandravel_natarajan/.athyper/instances/dev/receipts/bank-card-correction-20260909/`

Concurrent DEV deployments replaced the first API rollout during verification. A banking overlay preserved the latest API changes, and the subsequent contact/address deployment also includes all three corrected banking modules. Runtime hashes for all three modules match the tested build. The running API and NEON web containers are healthy; both dedicated web routes are present. Final verification is recorded in `final-verification.json` in the receipt directory.
