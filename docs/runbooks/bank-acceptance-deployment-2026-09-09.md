# Bank acceptance deployment — 9 September 2026

Deployed to **DEV**. QA and other environments were not changed.

Applied transaction-wrapped copies of:

- `server/db/ddl/planes/neon/master/15_bank_account_company_usage.sql`
- `server/db/ddl/planes/mesh/mesh/15_bank_disclosure_source.sql`

Both transactions committed. NEON retained all 650 existing company assignments. The migration added no company acceptances and no universal usage scopes. Assertions verified that account facts and preferred remittance destinations were unchanged.

Built the complete production API image using `server/Dockerfile.prod`, including its emitted dependency import check, and the NEON production web image using `apps/Dockerfile`.

Deployed `athyper-runtime-server:bank-acceptance-20260909` to API, worker and scheduler, and `athyper-neon-web:bank-acceptance-20260909` to NEON web. Existing runtime configuration and secret mounts were preserved. All four containers report healthy. API `/livez` and `/readyz`, the NEON HTTP probe, runtime bank identifier validation, unscoped Banking metadata, and NEON/MESH package imports passed.

Private database backups, SQL checksums, build/migration logs, previous image references, rollback Compose configuration and the verified deployment receipt are retained under:

`/home/chandravel_natarajan/.athyper/instances/dev/receipts/bank-acceptance-20260909/`

The rollback command preserves database data and restores the previous application images. Database backups are available separately; restoring them is a distinct operator action.
