# Business Partner 360 P0 security, privacy and data-integrity evidence

**Status:** Database/service technical evidence passed; authenticated browser capture and independent security/privacy approval pending  
**Captured:** 2026-08-30  
**Environment:** Disposable `athyper-bs360-baseline-db`, database `athyper_neon`  
**Fixture pack:** `business-partner-360.acceptance.v1`

## Decision

The executable database, service and static client gate passed. Canary remains blocked until an authenticated release-browser run captures rendered HTML, analytics and browser-storage evidence, and a named independent security/privacy approver reviews the completed package and records an approval reference.

## Executable evidence

The local-only runner requires the exact `athyper_neon` database and explicit confirmation token. It operates against the seven-family acceptance pack, uses `SET LOCAL ROLE athyperapp` for RLS observations, rolls every mutation probe back, and emits no restricted sentinel values.

| Artifact | SHA-256 |
| --- | --- |
| `run-business-partner-360-security-evidence.ts` | `8666337dc8a0d1fc90351bc7cd78e04c7462b9ac218e321fb81dbf43b016a8d8` |
| `business-partner-360-service.ts` | `af262d4ebe58df96e17507e738a84ce99af9db7ac331bd2c4cc2c921fd90de88` |
| `kysely-business-partner-360-repository.ts` | `014b916943a1404e77aab4ec299bc3cd9b9923845264686b966b61d05820c4ac` |
| Tax reveal contract | `3589bb18bd1c9e9854f4bd312bfb9ee20582dd2dd95bd31f778cb10bde14c153` |
| Bank reveal contract | `1036ff9fd94cdf6808f00c983e489c2e2d477a734cf50d90a9bd061bd301bd10` |

Reproduction:

```bash
ATHYPER_NEON_DATABASE_ADMIN_URL='postgresql://postgres@127.0.0.1:55432/athyper_neon' \
pnpm --filter @athyper/server-db db:verify:neon:business-partner-360-security -- \
  --confirm=RUN-BS360-SECURITY-EVIDENCE
```

## Isolation and scope matrices

| Case | Expected | Observed | Result |
| --- | ---: | ---: | --- |
| Forced RLS on selected BP360 master, request, workforce, snapshot, audit and outbox tables | 18 | 18 | Pass |
| Athyper acceptance fixtures visible under Athyper application context | 7 | 7 | Pass |
| CirrusAtlantic BP read from Athyper context | 0 | 0 | Pass |
| Athyper BP read from CirrusAtlantic context | 0 | 0 | Pass |
| Valid supplier organization/company/legal-entity coordinate | 1 | 1 | Pass |
| Wrong company under selected organization | 0 | 0 | Pass |
| Cross-tenant organization coordinate | 0 | 0 | Pass |
| Wrong legal entity for selected company | 0 | 0 | Pass |
| Same owner UUID with the `business_partner` discriminator | 1 | 1 | Pass |

The application service separately returns the same non-enumerating `BP_360_NOT_FOUND` response for an invisible and a nonexistent BP. Direct applicable-but-denied sections remain `403` only after record visibility.

## Production-repository materialization evidence

The rollback-only [materialization evidence](./evidence/business-partner-360-materialization-evidence.json)
now exercises the production `KyselyBusinessPartnerRequestRepository` through
create, validation, workflow submission, independent approval and application.
All seven typed identity-extension families produce authoritative rows and
seven immutable materialization links. Exact replay retains the original BP and
snapshot coordinates; a changed fingerprint is rejected. A separately staged
`legacy_untyped` request produces no typed extension rows, proving the declared
legacy policy without reinterpreting JSON. Cleanup counts are zero after the
transaction rollback.

## Transaction and concurrency evidence

Faults were injected after writes to each of these actual database surfaces: master BP, typed request child, immutable entity snapshot, audit log, transactional outbox, and request state. Each probe used one PostgreSQL transaction and deliberately failed only after reaching its named stage. After rollback, request, master, typed child, snapshot, audit and outbox counts were all zero for all six probes.

| Case | Observed | Result |
| --- | ---: | --- |
| First durable command claim | 1 | Pass |
| Exact duplicate claim | 0 | Pass — no second execution |
| Same key with different fingerprint | 0 | Pass — conflict retained |
| Stale request-version write | 0 | Pass |
| Approved request application replay | Stable original coordinates, `replayed=true` | Pass |

The materialization service continues to run repository writes, snapshot capture, outbox append, audit append and request finalization through the same NEON transaction coordinator. The disposable probe independently demonstrates rollback behavior for every persisted surface.

## Restricted reveal hardening

Tax and bank reveal commands now require a UUID `revealId` and an ISO `purposeExpiresAt`. The service:

- permits at most 60 seconds of purpose lifetime;
- rejects an expired grant as `BP_360_REVEAL_PURPOSE_EXPIRED`;
- binds authorization to resource, purpose, purpose expiry and current permission epoch;
- claims the nonce in tenant-scoped `event.command_execution` before resolving the value;
- rejects every repeated nonce as `BP_360_REVEAL_REPLAYED`;
- keeps the revealed value and protected token out of the durable command and audit evidence.

The client creates a fresh one-time nonce and a 30-second purpose grant. Permission-epoch changes remain part of every BP360 query key and clear/refetch the shell state.

## Leakage evidence

The database runner used distinct bank, tax, national identifier, birth, compensation, evidence and risk sentinels and scanned:

- audit old/new/context/reason fields;
- outbox payload, headers and errors;
- request payload, validation, duplicate, impact and failure fields;
- MESH inbox envelopes and received snapshots.

Observed sentinel matches: **0**. A raw tax identifier insertion into unrestricted `proposed_payload` was rejected by the database boundary. Person/workforce key scans over received MESH snapshots returned **0**.

Repository and client suites additionally verify that:

- safe API errors and route telemetry contain no restricted value or subject dimension;
- normal banking/tax readers select masked/protected coordinates only;
- snapshots and public activity omit raw evidence payloads;
- BP360 components do not use local storage, session storage or IndexedDB;
- sensitive drawers clear on close, query/scope change, abort, expiry and unmount;
- person-sensitive data is absent from summary/bootstrap and normal workforce responses;
- Phase 1 contracts, fixtures, telemetry and completeness remain risk-negative.

These are deterministic source, contract and component-state checks. They do not replace the pending authenticated browser capture from a running release candidate.

## Person and workforce matrix

| Persona | Record | Workforce section | Restricted evidence |
| --- | --- | --- | --- |
| HR with sensitive permission and elevated assurance | Visible | Allowed | Purpose-bound, audited, expiring |
| Manager with person/workforce permission | Visible | Allowed | Redacted; reveal capability false |
| Ordinary BP reader | Visible | Denied section | Not available |
| Unauthorized caller | Non-enumerating 404 | Hidden | Not available |

Boundary tests pass for half-open employment/assignment/engagement dates, step-up before restricted access, generic Business Partner export rejection, person/workforce publication exclusion, and the organization/commercial-role gate before a person-linked MESH adapter call.

## Verification summary

| Suite | Result |
| --- | --- |
| Disposable live security runner | Pass |
| Database/static suite | 189 passed |
| Master-data contracts | Typecheck; 10 passed |
| Master-data services | Typecheck; 79 passed |
| Records/export privacy | Typecheck; 57 passed, 1 environment-dependent test skipped |
| NEON BP360 client | Typecheck; 30 passed |

## Independent approval gate

| Approval | Status | Evidence reference |
| --- | --- | --- |
| Security owner | Pending | `business-partner-360-p0-approvals.json` |
| Privacy/data-protection owner | Pending | `business-partner-360-p0-approvals.json` |

No canary flag may be raised above zero until the authenticated browser capture passes and both independent approvals are recorded with distinct accountable approvers in the [P0 approval packet](./evidence/business-partner-360-p0-approvals.json).
