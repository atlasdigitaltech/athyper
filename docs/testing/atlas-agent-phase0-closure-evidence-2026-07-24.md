# Atlas Phase 0 closure evidence

**Recorded:** 2026-07-24  
**Repository HEAD:** `379883edd5d3123c5edb8392172eaad90b11fad4`  
**Working tree:** contains the Atlas and unrelated product changes listed by
`git status`; no reset or unrelated cleanup was performed.

## Database prerequisite

The local disposable PostgreSQL target is the `athyper_neon` database behind
the local PgBouncer endpoint. The verification role was provisioned by the
explicit command:

```text
pnpm --dir server/db run db:verify:provision-atlas-rls-role
```

The command requires
`ATLAS_RLS_ROLE_PROVISION_CONFIRM=I_UNDERSTAND_LOCAL_DISPOSABLE_DB` and creates
only `athyperapp_test` as `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, and
`NOCREATEROLE`, inheriting the ordinary `athyperapp` grants. The provisioning
implementation is [provision-atlas-rls-role.ts](../../server/db/scripts/verify/provision-atlas-rls-role.ts).

## Verification results

| Check | Result |
|---|---|
| Atlas conversation static contract | Passed, 37 checks |
| Governed-tool static contract | Passed, 40 checks |
| Atlas upgraded-environment verification | Passed, 22 checks |
| General PostgreSQL RLS suite | Passed: 6, failed: 0, skipped: 1 documented complex workflow fixture |
| Atlas conversation behavioral RLS | Passed: owner/participant/tenant/plane isolation, purge, lifecycle |
| Governed-tool behavioral RLS | Passed: lifecycle, confirmation replay, idempotency, isolation, purge |
| Atlas runtime tests/typecheck | Passed, 42 tests |
| Atlas UI tests/typecheck | Passed, 39 tests |
| `@athyper/svc-ai` tests/typecheck | Passed, 390 tests |
| Anthropic local validator/conformance set | Passed, 47 tests |
| OpenAI immutable evaluation-set validator | Passed, 3 tests |
| Gemini lifecycle/evaluation validators | Passed, 8 tests |
| Neon/Mesh/Admin relay suites | Passed, 16 / 1 / 1 tests |
| Prisma validation | Passed; existing `SetNull` relation warnings remain |
| Neon production build | Passed; 55 routes generated |
| IAM and AI service typechecks | Passed |

The broad Neon application typecheck remains blocked by unrelated existing
document/list test-fixture errors (`NextRequest` typing, list descriptor
fixtures, and document-edit mocks). Next production build typechecking passes;
these fixture errors must be repaired separately before claiming a completely
green repository-wide typecheck.

The database package-wide TypeScript check also reports existing strictness
errors in unrelated verification helpers (`extract.ts`, `verify-archetypes.ts`,
`verify-field-security.ts`, and `verify-rls.ts`). The new role-provisioning
script executed successfully and the database verification commands passed.

## Provider promotion status

No live provider promotion was attempted. The repository contains no approved
provider account/project approval artifacts or live evaluation credentials in
the local environment. This is an intentional safety boundary.

### Anthropic

Implementation, readiness probe, immutable baseline, conformance tests, and
pilot harness are ready. Still required:

- approved account, region, retention, data-classification, Security, Privacy,
  and Operations evidence;
- `ANTHROPIC_API_KEY` from the approved secret injector;
- approved synthetic evaluation tenant and ledger database access;
- live 200-case pilot and usage reconciliation;
- credential rotation evidence and internal allowlist/soak.

### OpenAI

The adapter, `store: false` assertions, fixtures, and evaluation harness are
ready. Still required:

- approved project/account/region/privacy decision and `OPENAI_API_KEY`;
- live immutable evaluation and pilot ledger access;
- exact-model, reliability, reconciliation, quality-regression, and soak gates.

### Gemini

The native adapter and evaluation harness are default-off. No live call is
permitted until a paid-tier Google project, restricted credential, account/data
policy, region, quota, and Security/Privacy approval are recorded. Routing
remains disabled.

## Phase 0 closure decision

The local technical Phase 0 baseline is complete, including the previously
blocked RLS evidence. The release is not a hosted-provider promotion: provider
pilots and approvals remain external release gates and must be attached to a
separate signed evidence package before enabling any non-default provider.
