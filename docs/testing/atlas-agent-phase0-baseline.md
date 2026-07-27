# Atlas Agent Phase 0 baseline

**Recorded:** 2026-07-24  
**Base Git commit:** `379883edd5d3123c5edb8392172eaad90b11fad4`  
**Working tree:** Existing uncommitted Atlas and product work was present. The
commit above is the immutable base reference; the verification results below
were captured from that base plus the pre-Phase-0 working tree. No baseline
commit was created or existing work rewritten.

## Pre-change verification

| Verification | Result |
|---|---|
| `@athyper/atlas-agent-runtime` tests | 9 files, 39 tests passed |
| `@athyper/atlas-agent-runtime` typecheck | Passed |
| `@athyper/atlas-agent-ui` tests | 6 files, 20 tests passed |
| `@athyper/atlas-agent-ui` typecheck | Passed |
| `@athyper/svc-ai` full test suite | 31 files, 342 tests passed |
| `@athyper/svc-ai` typecheck | Passed |
| Neon relay suites | 3 files, 15 tests passed |
| Mesh relay suite | 1 file, 1 test passed |
| Admin relay suite | 1 file, 1 test passed |
| Neon production build | Passed |

The Neon build compiled, typechecked, generated all static pages, and completed
route generation successfully.

## Stable Phase 0 contracts

The following are treated as compatibility contracts:

- public model IDs `atlas-fast`, `atlas-balanced`, and `atlas-best`;
- versioned Atlas SSE envelope and terminal-event rules;
- exact requested-versus-actual model accounting;
- server-owned `policy_revision` stale-catalog protection;
- existing aggregate tenant and principal rate-limit semantics.

Internal policy classes and resolver composition are not frozen.

## Database verification

Post-change verification on 2026-07-24 recorded:

| Verification | Result |
|---|---|
| `@athyper/svc-ai` full suite | 32 files, 355 tests passed |
| Focused plane/catalog/route/tool regressions | 6 files, 113 tests passed |
| Runtime tests and typecheck | 9 files, 39 tests passed; typecheck passed |
| UI tests and typecheck | 6 files, 20 tests passed; typecheck passed |
| Server typecheck | Passed |
| Neon/Mesh/Admin trusted-plane relay regressions | Passed in all three applications |
| Neon production build | Passed; 55 static pages generated |
| Prisma validation | Passed, with pre-existing `SetNull` relation warnings |
| Atlas conversation static contract | 33 checks passed |
| Atlas governed-tool static contract | 40 checks passed |
| Atlas conversation PostgreSQL RLS fixture | Blocked: local database is reachable, but the required NOBYPASSRLS `athyperapp_test` role does not exist |
| Atlas governed-tool PostgreSQL RLS fixture | Blocked by the same missing safe application role |

Database-backed checks require the configured disposable verification database.
If it is unavailable, the exact failed prerequisite is recorded rather than
weakening or simulating RLS.

An accidental broad Neon test invocation also exposed six failures in existing
document/list rollout tests. Those files are outside Atlas Phase 0 and were not
modified. The targeted relay regressions and the Neon production build pass.
