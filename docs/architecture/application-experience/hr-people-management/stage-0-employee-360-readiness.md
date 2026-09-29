# Stage 0 — Employee 360 readiness baseline

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Status: **in progress**, reassessed 2026-09-22. The migration and initial fixtures are locally applied. The [comprehensive Stage 0 review](stage-0-comprehensive-review.md) supersedes the earlier completion claim: temporal correctness, company scope and authenticated read/write proof still need closure. Stage 1 UI work can proceed alongside these focused corrections.

## Delivered baseline

- Added a forward-only Neon migration, `20260922_workforce_as_of_projection.sql`, and applied it to the existing local `athyper_neon` database without resetting or deleting workspace data.
- `master.person.person_number` now permits multiple unallocated (`NULL`) values per tenant while keeping allocated person numbers unique.
- `master.v_employee` and the Workforce repository now filter employment and assignments by the database current date. Review found remaining lifecycle fallback and scheduled-change defects; this is not yet a complete temporal contract.
- Admitted these tenant-bound, authenticated Employee read operations through the Neon browser relay:
  - `GET /api/relay/neon/workforce`
  - `GET /api/relay/neon/workforce/{employeeId}`
- The browser lifecycle write path uses `POST /api/neon/workforce-requests` and validation, submission, decision and application actions. Separate backend offboarding/checklist commands also exist; their correctness and authorization must be qualified independently.
- Added an idempotent local synthetic fixture pack with three employees: `HRD-0001` and `HRD-0002` are current workers; `HRD-0003` is a future starter. The future fixture demonstrates the as-of rule without using real employee data.

## Canonical contract

| Need | Authority | Contract |
|---|---|---|
| Employee directory / detail read | Workforce service over `master.employee`, `person`, effective `employment`, effective `work_assignment` | Relay GET endpoints above; tenant authentication and service authorization remain required. |
| Employment or identity change | People workflow | `workforce_request` create → validate → submit → decide → apply. |
| Schema/fixture changes | Data/platform tooling | Canonical DDL, explicit forward migration and synthetic provisioning. Application repositories also perform transactional table writes behind their governed request or operational command boundaries. |

The Stage 0 read model is explicitly **as of the database current date**. Stage 1 must add an explicit historical/future selection contract before exposing an as-of date selector; it must not overload the current directory query.

## Run locally

Set `ATHYPER_NEON_DATABASE_ADMIN_URL` to the local `athyper_neon` administrator connection, then run:

```bash
pnpm --dir server/db db:provision:neon:hr-stage0-fixtures --confirm=LOCAL-NEON-HR-STAGE0-FIXTURES
DATABASE_URL="$ATHYPER_NEON_DATABASE_ADMIN_URL" pnpm --dir server/db test:integration:workforce-as-of-read
```

The provisioner checks database name and loopback/private-network address, uses a transaction and advisory lock, and replay succeeded on the initial pack. Ownership/drift validation and explicit company targeting remain incomplete; a private address alone does not establish a local target. `--plan` shows the intended fixture identifiers without connecting or writing.

## Local evidence recorded

- Migration layout and three-plane DDL verification passed.
- The applied migration is present in the local migration ledger.
- The fixture pack applied twice successfully; the current projection reports the two current workers as `employed` and the future starter as `future`.
- The rollback-only as-of SQL test passed, including the unallocated-person-number case.
- Master-data type checks and focused workforce service tests passed.
- The relay response for `/api/relay/neon/workforce` changed from `404 RELAY_OPERATION_NOT_ALLOWED` to `401`, confirming operation admission before authentication. A signed-in user is still required for a data response.

## Remaining for Stage 1

First close the selected baseline corrections in the [review work packages](stage-0-comprehensive-review.md#6-small-work-packages-to-close-the-baseline). Authenticated read/write proof belongs to Stage 0's completion check, even if developed alongside Stage 1.

- Build the directory and Employee 360 screen over the admitted read contract.
- Add explicit selected employment and historical/future assignment reads, then their fixtures and authorization cases.
- Connect the workforce request write journey to the Employee 360 UI and verify it against an authenticated local browser session.
