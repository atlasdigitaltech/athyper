# Internal supplier onboarding — P4 documents and gates

Date: 2026-09-14  
Status: P4 accepted in local DEV. All three document purposes are generated, scanned, stored and downloaded for Simple/Basic, Standard and Enhanced. Activation qualification uses an explicitly controlled upstream readiness fixture; P6 remains separate.

## Owning sources and publication pins

The [process document owner](../../../server/apps/platform-host/src/composition/supplier-process-documents.ts) uses the accepted selection, attempt, manifest and document binding. The browser can request a purpose or retry a job; it cannot supply document facts, template overrides, readiness proofs or completion callbacks. Generic render routes reject internal trusted-job fields.

Each source is checked against the current owning case snapshot and its identity/version/hash. Review packs project an explicit allowlist from the submitted snapshot. Decision documents require the decision snapshot and canonical case-decision command evidence, with task outcome identifiers. Activation confirmations require the result snapshot, an active supplier and scoped supplier-activation evidence; the evidence ID and readiness fingerprint are pinned into the job. Approval alone cannot produce an activation confirmation.

Projection and recipient-policy catalogs are resolved by exact revision and content hash. Protected attachment contents, bank credentials and unrelated snapshot fields are omitted. Published templates are resolved by exact binding, template ID, immutable version ID/number, checksum, locale and variant. The renderer recomputes the template content checksum. Current-version or effective-date changes cannot retarget an accepted job; absent, revoked or tampered configuration fails closed. Pilot templates embed their styles and reject mutable print-profile/letterhead dependencies.

The shared document service retains its ordinary permission path. Internal process jobs derive render authority from scoped case read/submit authority and the source owner. Downloads additionally resolve the pinned recipient policy: review packs require assigned, currently eligible reviewers; decision and activation documents admit the requester or authorized business owner. Generic document download grants cannot bypass this check. Returned links reference the exact artifact version and expire.

## Durable execution and isolated gates

`governance.process_document_job` retains one job per tenant/attempt/purpose. Its database command owns claims, ten-minute leases, result proof, bounded retries and gate status. Application code has no direct job-update permission. Callback coordinates must match the job and live attempt/source. Ready results require an actual active, scanned artifact with matching checksum, source/intent/template provenance and a pinned case attachment link.

The existing renderer, malware scanner and object-storage adapters generate PDFs. Rendering and network I/O occur outside the business transaction. Storage registration, artifact audit and generated events commit together; failed registration removes the staged object. The generated event has a separate key from dispatch, and failure/retry result events use the claim token so resetting retry counts cannot cause an event-key collision.

A document can remain ready while its gate callback fails. Retrying that callback reuses the stored artifact. Review readiness starts the P3 task owner; it does not decide the case. A decision document releases only the materialization prerequisite. Activation confirmation releases only the cycle-completion prerequisite. SQL guards enforce those downstream boundaries; document failures do not undo approval, materialization or activation.

The worker polls committed jobs through a content-free candidate function. It resolves current IAM permissions for the committed case requester using baseline assurance. The scheduler registers independently of the worker runtime and polls every 30 seconds. Missing downstream source outcomes do not create speculative documents. Automatic retries stop after five attempts; the authorized retry command restarts processing.

Live connection also exposed two P3 integration gaps. Reviewer lookup now uses a tenant/case-scoped database directory because ordinary IAM row filtering hides other principals. It retains active membership, scoped role, decision permission, deny-rule and maker exclusions. Task-case association is written by a guarded database trigger, preserving the restriction on direct application writes to cycle subjects. The real case submitter is supplied to the existing decision authorizer.

## APIs

NEON relays these authenticated owning endpoints:

- `GET /api/governance/process-documents/cases/:id/view`
- `POST /api/governance/process-documents/cases/:id/request` with `purpose`
- `POST /api/governance/process-documents/jobs/:id/process`
- `POST /api/governance/process-documents/jobs/:id/retry`
- `POST /api/governance/process-documents/jobs/:id/download`

Purpose values are `submitted_review_pack`, `decision_document` and `activation_confirmation`. Process/retry/download accept no caller overrides. Views expose status, exact source/template pins, result and safe failure codes, without signed URLs. P8 owns the full document/task presentation in existing screens.

## Qualification

Passed:

- 69 document-service/repository/route tests, including malicious caller facts, missing exact templates, content checksum tampering, authorized-operator replay, recipient denial, malware failure and storage rollback.
- Three purpose-specific projection tests using controlled owner rows and the real published template definitions; unsafe fields and stale/unauthorized sources are rejected. One P4 HTTP route test checks authentication and forbidden overrides.
- Twelve PostgreSQL fault checks running commands as `athyperapp`, with all fixture mutations rolled back: concurrent claims, stale leases, forged artifacts, wrong snapshots, repeated failure after retry, gate-only retry, cross-tenant rejection and unchanged business state.
- Four real submitted review packs (three P2 profile fixtures and one earlier exploratory Basic fixture) rendered by Gotenberg, scanned by ClamAV and stored in S3. Every stored PDF's bytes, length and SHA-256 match its artifact result. All four review gates succeeded and created real task work.
- Authenticated activation requests before activation evidence return 409 for all three profiles, preserving case status/version.
- The scheduler processed three pending jobs, then reported zero duplicate work. Authenticated NEON browser checks verified the three profile document views against their owning APIs.

The refreshed `catl.owner` session completed authenticated reviewer downloads and all 13 task votes (Simple 1, Standard 2, Enhanced 10). Intermediate outcomes retained an unapproved case; only the final task produced the decision snapshot. Requester review-pack downloads returned 403 while the assigned reviewer received and downloaded the exact artifact version. All three decision documents were generated from committed final decisions, scanned, stored and downloaded. The owning materialization API then materialized all three suppliers.

Materialization qualification exposed two compatibility defects, now fixed in canonical definitions: the role materializer admits and validates P1's requirement/reason fields, and the relationship materializer reuses an active canonical address by tenant/hash. The three synthetic suppliers retain distinct address links and lineage to one shared address. Seven PostgreSQL guard tests cover valid optional reasons, Basic's required reason, invalid enum/type and excessive length.

For the P4 activation boundary, controlled upstream risk assessments and purchasing company profiles are explicitly labelled fixtures. Qualification creation/decision and supplier activation use the existing database repositories, with independent synthetic maker/checker identities. The current readiness resolver must return no blocking reason other than the pre-activation role state; no fabricated ready document result is installed. Activation records the actual lifecycle transition and immutable evidence. This qualifies P4's consumption of activation evidence; it does not claim authenticated risk/company approvals, payment readiness, an independent activation-case UI or the separate P6 workflow.

All three activation confirmations were generated from the materialized snapshot and exact activation evidence ID/fingerprint, scanned, stored and downloaded through authenticated APIs. Replay returned the same artifact. Final read-only checks verify three ready documents per profile, 13 non-maker votes, materialized cases, active suppliers and still-running cycles. Thus document delivery does not close the cycle or repeat a business transition. Ten stored PDFs were byte/hash-verified in total: nine across the three qualification profiles plus one earlier exploratory Basic review pack. NEON browser checks verify all three purpose views against their owning APIs.

P4 acceptance is complete within this declared fixture boundary. P5–P9 and B/C are not acceptance gates for P4.

Reproduce against configured local DEV:

```sh
node tooling/scripts/verification/install-supplier-process-document-storage.mjs
pnpm --filter @athyper/server-service-documents test
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/supplier-process-document-projection.test.ts src/composition/supplier-process-document-routes.test.ts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-document-jobs-db.mts
# Requires valid DEV catl.owner authentication; executes real review votes and materialization.
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-documents-live.mts
# After those synthetic cases are materialized: controlled upstream boundary fixture.
pnpm exec tsx tooling/scripts/verification/prepare-supplier-process-document-activation-fixtures.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-activation-documents-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-document-outcomes-db.mts
node tooling/scripts/verification/qualify-supplier-process-materializer-contract-db.mjs
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-document-storage-live.mts
```

The installer applies canonical definitions directly for the local build; there is no migration package. [P4 evidence](internal-supplier-onboarding-p4-evidence.json) records all three purpose journeys and the controlled upstream activation-fixture boundary. P5–P9 and follow-ups B/C retain their separate scopes.
