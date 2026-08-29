# Business Partner P9 threat and privacy model

## Scope and trust boundaries

The protected assets are tenant-scoped requests, applications, principals, invitations, definition projections, evidence, commercial and workforce attributes, bank metadata, immutable MESH events, IAM memberships, and audit history. Trust boundaries exist at external applicant sessions, NEON APIs, worker queues, MESH transport, STUDIO publication, IAM administration, PostgreSQL RLS, secret stores, telemetry, export/delete jobs, and operator evidence storage.

## Principal threats and required controls

| Threat | Required prevention and detection | Release evidence |
| --- | --- | --- |
| Cross-tenant or cross-journey access | Tenant-bound principals and tokens, deny-by-default RLS, journey allowlists, negative authorization matrix | RLS probes and authenticated negative E2E |
| Invitation theft, replay, or abuse | Persist hashes only, tenant/purpose binding, expiry, single-use atomic transition, rate limiting, abuse alerting | Secret/log scan and resend/cancel/accept race suite |
| Duplicate principal or request after retry | Idempotency keys, unique constraints, one transaction or recoverable saga, reconciliation | Concurrent retry and recovery evidence |
| Definition tampering or downgrade | Signature and hash verification, compatibility floor, monotonic revision, last-known-good local projection | Rejection, outage, canary, and rollback evidence |
| SoD or approval bypass | Versioned workflow policy, distinct approvers, fenced IAM authority, immutable audit | Negative workflow and IAM tests |
| PII or bank leakage | Typed field allowlists, masked projections, encrypted transport/storage, no sensitive metric labels, redacted structured logs | Payload, export, telemetry, and log scan |
| Queue injection or poison message | Schema/signature validation, bounded retries, quarantine, governed replay with immutable event identity | Poison-message and replay evidence |
| Stale or forged evidence | Digest-bound evidence, SHA-256 artifacts, timestamps, named approvals, fail-closed verifier | P9 certification output |
| Destructive rollback or deletion | Forward-only migrations, exact prior image retention, backup/restore drill, retention/legal-hold policy | Database and operations gates |

## Privacy lifecycle

Collection is limited to the active journey definition and purpose. Internal, portal, MESH, import, and API projections must each apply their own field allowlist. Workforce data cannot inherit supplier or customer authority; bank fields cannot enter generic invitation, telemetry, or applicant-session surfaces.

Access is tenant-scoped and auditable. Export produces only approved subject data with authorization and audit records. Deletion follows retention and legal-hold rules, removes or irreversibly anonymizes eligible projections, and preserves the minimum immutable compliance record. Backups expire under the same governed schedule; restore drills do not become a shadow retention path.

Release is blocked by any unexplained access, raw secret/token, unmasked bank value, over-broad export, failed deletion, unaudited privileged access, or missing privacy-owner approval.
