# Governance

Repository-wide governed assets live here:

- `catalog/` contains canonical platform catalogs.
- `config/` contains deployment, authorization, and governance contracts.
- `policy/` contains policy inputs and durable policy reports.

Executable validators and generators belong in `tooling/scripts/`; this directory
contains their governed inputs and outputs.

Generated governance artifacts must be refreshed with their owning command:

- `pnpm ddl:coverage:generate` refreshes `docs/architecture/generated/ddl-service-coverage.json`.
- `pnpm exec tsx tooling/scripts/policy/authorization-inventory.ts` refreshes the authorization inventory and its source-inventory report.
- `pnpm test:reachability:update` refreshes `policy/reports/test-reachability-retirement.json`.
- `pnpm package:ownership:inventory` refreshes the package-ownership matrix consumed by deployment-profile validation.

Run the corresponding `*:check` or policy command after regeneration. Generated
artifacts should not be edited by hand.

`pnpm policy:release-gate` performs repository readiness checks when qualification
artifacts are unavailable locally. Use `pnpm policy:release-gate --require-evidence`
for an explicit blocking evidence check; supplying `--qualification=...` also
selects blocking mode, as used by the performance-qualification workflow.
