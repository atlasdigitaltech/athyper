# Restricted system-entity publication commands — 2026-09-27

Historical checkpoint. The subsequent worker/trust fix and successful three-plane
DEV activation are recorded in [activation recovery](country-activation-recovery-20260927.md).
The observations below describe the earlier 05:00 UTC state, not current status.

## Result

The global draft RLS blocker is fixed and the real enrolled workflow returned
HTTP 200 with `status: dispatched` for authoring release
`1efcf86a-75e3-4a79-9154-ea62f5abdc7d`, release number 1, targeting Studio, Neon
and Mesh. This is not an activation-success claim.

Fresh inventory at 05:00:06 UTC (adjacent JSON):

- Canonical change set is `published`, lock version 4; original maker retained,
  enrolled author submitted and distinct enrolled publisher reviewed.
- One signed authoring release, one authority-owned publication release
  (`approved`), and three persisted target compilation sources.
- Worker received compilation work but failed qualification with
  `COMPILED_PUBLICATION_PROJECTION_SOURCE_MISMATCH`.
- Zero deployment rows, applied releases or activation heads for all targets.
- All three existing reference tables still contain 247 records; no data or IDs
  were changed. Historical alternate draft and source hashes remain intact.

## Implemented boundary

`server/db/ddl/planes/studio/publication/15_system_entity_commands.sql` adds:

- A private enrollment checker, not executable by runtime callers. It locks the
  exact source and active policy, checks independent activation, active internal
  workloads and reviewer, exact DEV rule predicate, authority tenant, source pin,
  lifecycle and maker/submitter/reviewer separation. Superseding enrollment denies.
- Explicit validation, transition, first-release and target-artifact commands.
  No arbitrary graph edit or direct activation command exists. Publisher-side
  revalidation of approved content can reuse identical validation evidence but
  cannot replace it. Unsupported transitions and successor releases fail closed.
- A restricted global-content/authority-tenant link command. The existing
  tenant-authored link path retains exact same-tenant/hash/number/kind checks.
  Global linking additionally checks enrolled authority, publisher, release key
  and source/product hashes; it is not a permissive NULL-tenant exception.

Only `athyper_runtime` receives command EXECUTE. Existing table grants and RLS
are unchanged. Ordinary `SELECT FOR UPDATE` on the global source is still denied.
The application retains independent scoped IAM checks, source compilation,
signing, release preparation and queued worker qualification. Database commands
do not replace cryptographic verification at publication/runtime boundaries.

Repository global-source operations now call these commands; tenant operations
retain their existing SQL path. Target snapshot preparation uses the command
instead of requesting broader snapshot INSERT privileges. No Country name or
business-partner branch was introduced in implementation code.

## Verification

- Studio typecheck clean; **185 tests passed**.
- Publication service: **309 tests passed**.
- Host: **671 passed, 25 skipped**; typecheck still has only the deliberately
  held `entity-case-preflight.ts` missing repository export.
- Command test file: **2 passed**, including opt-in real PostgreSQL execution.
  The live test uses synthetic, transaction-local fixtures derived from a real
  valid source and rolls back everything. It does not rewind live history or
  create persistent synthetic approvals. It covers validation idempotency,
  submit/review separation, publisher revalidation, ordinary-lock denial and
  eleven command denials: private helper execution, caller/actor mismatch,
  stale revision, wrong source, changed graph, premature publisher validation,
  wrong tenant, unknown actor, superseded enrollment, author self-review and
  invalid signed release input.
- Initial fixture-only attempts exposed immutable-policy and generated-column
  guards; tests were corrected without disabling those guards.
- The real workflow subsequently exercised release creation and all three
  target-source writes through the new commands. It did not bypass the worker.

Reproduce:

```sh
SYSTEM_PUBLICATION_POSTGRES_TEST=1 \
SYSTEM_PUBLICATION_POLICY_ID=a048d0e2-dcdd-4827-8d1f-d53684209c84 \
pnpm --filter @athyper/server-db exec tsx --test scripts/operations/publication/system-entity-commands.test.ts
```

## Remaining, separate from the RLS fix

Investigate the worker's projection mismatch and retry the existing release
through the supported retry path; do not invoke first-publication again or create
duplicate releases. Inspect canonical byte/hash correspondence before changing
any qualification check. Keep mismatch detection fail-closed.

The persisted authoring signature reports key ID
`athyper-dev-publication-ed25519-20260905`, not the separated DEV key
`athyper-publication-dev-signing-v1`. This is a live observation, not proof that
the intended strict-trust signer/verifier wiring is complete. Reconcile the
authoring-signature and target-envelope trust requirements before activation.
Do not rewrite the stored signature or historical key ID.

Target signing, deployment receipts, activation, browser acceptance and rollback
remain unverified. No QA, staging or production changes were made. Local receipt
files are diagnostic evidence, not immutable audit storage.
