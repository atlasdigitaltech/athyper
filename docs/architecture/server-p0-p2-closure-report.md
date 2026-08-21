# Server package P0-P2 closure report

**Recorded:** 2026-08-11  
**Revision inspected:** `951299c22c366c153055d8f3515da2c54211c614` (`refactor/three-plane-packages`)  
**Toolchain:** Node `v24.15.0`; pnpm `10.33.0`

## Outcome

The package workspace passes aggregate server typecheck, tests, and build across 93 scoped projects. Static route, OpenAPI classification, capability, PII, UTF-8, and P1 inventory gates pass. The candidate is not clean: 4,811 changed or untracked paths were present when this evidence was recorded, so attribution and clean-checkout reproducibility remain open.

P0 code and policy controls are implemented. P1 is not complete: its manifest truthfully contains nine partial or missing areas, primarily because public IAM administration/MFA/session/discovery APIs and audit governance runtime composition do not exist in the rebuilt host. P2 package safeguards are materially stronger, while live dependency qualification remains an environment gate.

## P0

| Finding | Status | Evidence |
| --- | --- | --- |
| Clean verification baseline | Partial | Typecheck, tests, and build pass. Exact revision/toolchain/profile health endpoints are recorded. Clean-worktree proof is blocked by 4,811 existing changes. |
| HTTP contract/OpenAPI | Closed for classification | `openapi:check` reports 13 contract operations, 42 exact legacy raw-route entries, and 8 reason-bearing source exclusions. Four newly discovered record-snapshot routes were converted to contract routes. Normalized route manifest verifies at 957 identities. Exclusions remain migration debt, not schema parity. |
| High-risk notification planner | Closed for targeted module | Planning validation, recipient expansion, conditions, rendering, hashing, retries, and attachment validation are separated and characterized. Broader compact source debt remains; no claim is made that every long source line was removed. |
| Conditional availability | Closed | `config/deployment/server-capabilities.json` records registration state, requirements, and profile enablement; policy validation passes. |
| Encoding | Closed for rebuilt server scope | UTF-8 policy covers rebuilt server packages and current server architecture artifacts and runs in CI. |

## P1

| Area | Current verified state | Remaining closure condition |
| --- | --- | --- |
| IAM | Foundation/authentication tests pass; current `/api/iam/me` and conditional provisioning are contract routes. | Implement and dual-server qualify MFA, session lifecycle, JWKS/discovery, permissions, delegation, groups/roles, principal search, and verification response semantics. |
| Audit | Governance service, export worker, DDL evidence, and tests exist. Layer inventory distinguishes HTTP, job, worker, schedule, storage, integrity, legal hold, retention, and PII. | Compose a durable store/artifact writer, register governed HTTP routes, job definition and worker, add schedules where required, then run them. |
| Content | Links, content-scoped attachments, attachment-version listing, and ACL routes are registered behind authentication and covered by compatibility surface tests. | Decide/implement attachment-version upload and prove ACL-to-legacy-grants authorization and response semantics. |
| Saved views | Service tests cover versions, default, pin/star, share, clone and archive; route tests cover canonical and `me`/`user` aliases. | Compare legacy response/error schemas and approve any omitted-operation retirement. |
| Records/policy/workflow/metadata | Aggregate package tests pass. | Client-driven dual-server schema, authorization, side-effect, concurrency and failure-semantic qualification remains. |

`config/governance/server-p1-parity-manifest.json` is the release-enforced source of truth. A partial or missing item cannot be promoted merely because its implementation symbol is exported.

## P2

| Area | Implemented safeguard | Remaining live evidence |
| --- | --- | --- |
| Derivatives | Source/spec-aware job identity, ready-result idempotency, poison/unsupported discard behavior, upload cleanup after persistence failure, retry limits, progress stages, and abort checks. | Exercise real object storage, malware state, BullMQ and renderer, including dependency outages. |
| PII | Pluggable detector; no matched-value persistence; governed policy declares baseline types/jurisdiction, heuristic confidence, false-positive handling, no automatic redaction, and escalation requirements. | Configure and qualify a governed detector before enforcement or jurisdiction-specific claims. |
| Rate limiting | Atomic Redis store with hashed keys, shared counters, operational error capture, and local fallback. | Add verified tenant/principal quotas at the authenticated gateway boundary and load-test multi-instance behavior. |
| Request deadlines | HTTP deadline produces an `AbortSignal`; derivatives/extraction check cancellation around external side effects; AI and SSE already react to disconnect. | Propagate the signal through every database/storage/provider port and qualify disconnect/graceful-drain behavior live. |
| Schedulers/workers | Tests cover transient Redis recovery, ownership conflicts, schedule deletion, delay mapping, IANA timezone preservation, cancellation/retry, lifecycle evidence, dead-letter and replay controls. | Run Redis process-loss, stalled-job, DST transition, multi-scheduler and operator workflow tests against real BullMQ. |

## Verification results

| Command | Result |
| --- | --- |
| `pnpm --dir server run typecheck` | Pass, 93-project scope; late-changing integration, collaboration, and host packages also passed focused rechecks |
| `pnpm --dir server run test` | Pass, 93-project scope; late-changing integration, collaboration, and host packages also passed focused rechecks |
| `pnpm --dir server run build` | Pass, current synchronized 93-project scope |
| `pnpm openapi:check` | Pass, 13 contract operations; no unclassified public routes |
| `pnpm test:server-route-manifest` | Pass, 4 tests |
| `pnpm routes:server-manifest:check` | Pass, 957 identities |
| `pnpm policy:server-capabilities` | Pass |
| `pnpm policy:server-p1-parity` | Pass; nine items explicitly not migrated |
| `pnpm policy:document-pii` | Pass |
| `pnpm policy:utf8` | Pass |

## Release decision

The current workspace is suitable for continued development and package-level qualification, but it is not a trustworthy clean release candidate and it does not have full P1 parity or live P2 infrastructure evidence. Promotion requires a clean revision plus the remaining manifest items and live-environment gates; this report deliberately does not convert those external or missing-capability blockers into passes.
