# Internal bank verification implementation — 2026-09-13

**Current reversal outcome — 2026-09-13:** Following the user's later explicit rollback instruction, the session Bank code and the four new Neon tables/dependencies were removed; the previous company-use CHECK, readiness function and account-identity guard were restored. All four successor access records were revoked. Corrected draft `495762e9-f94b-4d61-8997-b7788b013c41` was abandoned through the native database lifecycle with guards enabled. Original approved draft `83261589-4f8e-4046-a128-fe02a33a2dbc` is retained unchanged: Studio has no approved-to-abandoned/withdrawn transition. Its retirement remains blocked. Prior receipts and the narrative below are historical, not current deployment instructions. See `governance/policy/reports/internal-bank-session-reversal.dev.json` for the backup and reversal manifest.


**Design withdrawn — 2026-09-13.** The user rejected the Bank-specific design and requested a documentation-only reversion. This file preserves the implementation and deployment history; it is not a current rollout instruction. Do not resume the publication steps below under the withdrawn plan. No source code, database objects, roles or publication records were reverted by this documentation change.


The canonical SQL, protected-bank commands and review UI now use retained internal review attempts. The canonical Bank DDL is now installed in local NEON. The original approved Bank draft hit a duplicate restoration publication key. A corrected proposal is now resubmitted in Studio and awaits fresh independent review. No Bank metadata release is active. The implementation proofs below used rollback-only transactions.

## Implemented

- Company-use source completeness uses `num_nonnulls(... ) IN (0,5)` with explicit version/hash checks. The additive canonical file checks historical rows before replacing the old CHECK and stops if any require review. The read-only local preflight found zero malformed rows.
- `document.business_partner_internal_bank_verification` retains attempts, maker/persistence attribution, policy definition and rule hashes, account subject hash, exact attachment/link/version/hash manifests, decisions, predecessor links and concurrency versions. Terminal rows cannot be updated or deleted. Evidence must be active, scanned, current, unexpired, linked to the same partner and allowed by the pinned bank policy.
- Database triggers validate tenant/owner/account/link/company/role associations, human maker attribution, independent approval/rejection and actor context. Deferred guards cover verification-state mutations, verified inserts followed by Business Partner ownership, and atomic review/scalar verification. Unlinked non-Business-Partner verification and real MESH review coordinates remain supported.
- The existing scoped service opens reviews, performs versioned/idempotent decisions, updates the scalar projection in the same transaction, and records audit callbacks only for new commands. Review history itself does not depend on an optional external audit sink. Unknown or stale evidence fails closed.
- Company usage is reused. Internal acceptance pins a specific review ID and decision fingerprint; re-verification never silently changes that acceptance. Readiness rechecks pinned subject, policy and evidence validity. MESH keeps its disclosure-coordinate path.
- Customer refund registration resolves a customer/company source profile on the server. Its acceptance uses `customer_refund`, never the supplier remittance field. Supplier payments still require a supplier/company profile. Customer registration/verification does not advance supplier onboarding cycles.
- The bank review UI selects existing bank documents, loads retained attempts, supports approval/rejection/supersession and explicitly accepts completed reviews. It no longer sends freeform JSON as internal decision evidence. Restricted document originals remain in the existing attachment service.

- Draft cases now capture protected bank proposals with stable item keys, exact supporting-document versions and immutable hashes. Case snapshots contain proposal references only. Replacement retains the item key; approval and handoff require the exact approved receipt. Handoff waits for native partner materialization and eligible role/company setup, then creates the pending review atomically with the original human maker.
- Draft Bank controls use published intake fields. Upload uses the existing attachment stage/finalize/scan lifecycle, then a scoped command assigns the bank document kind. Bank evidence is linked to `document.entity_case`; approved versions are linked to the materialized partner during handoff.
- Native metadata authoring adds the `bank_draft` surface and supplier/customer policy specification to one graph. A release-head trigger projects both immutable policy definitions and rules in the verified activation transaction. Applicability follows the active release head, including rollback; policy history is never rewritten. Invalid policy configuration rolls back activation.

## API contract

1. Register with the existing protected-bank endpoint, optionally setting `purpose: "customer_refund"`; omitted purpose is supplier `default`.
2. `GET /api/neon/protected-bank-registrations/:bankAccountLinkId/reviews` returns the scoped registration, retained reviews and eligible supporting-document versions.
3. `POST` to that path opens an attempt with `idempotencyKey`, `evidence: [{attachmentId, attachmentLinkId, version, sha256}]`, and `supersedesVerificationId` for a successor. The server resolves policy and pins the canonical subject. The maker remains the authenticated principal recorded by protected registration, even if another principal persists the review.
4. The existing `/decisions` endpoint now requires `reviewId`, `expectedRowVersion`, `idempotencyKey` and `decision` (`verify`, `reject`, or `superseded`). Verification needs an allowed `verificationMethod`; rejection/supersession needs a reason. Evidence cannot be replaced during decision.
5. `/applications` explicitly accepts the reviewed account for its stored company/purpose. Existing remittance replacement still uses its governed change command.

6. `GET /api/neon/entity-cases/:caseId/bank-proposals` returns masked captured items and eligible case documents. `POST` captures the protected identifier with `expectedVersion`, `clientItemKey`, `idempotencyKey` and exact document coordinates. Retries reuse the receipt and do not write another secret.
7. `POST /api/neon/entity-cases/:caseId/bank-proposals/documents` classifies a newly uploaded, scanned, actor-owned case attachment as `bank_ownership` or `bank_confirmation`.
8. `POST /api/neon/entity-cases/:caseId/bank-proposals/:proposalId/handoff` transfers only the approved proposal after case materialization. It is idempotent and does not imply verification or company acceptance.

## Validation

Run from the repository root:

```sh
node server/db/scripts/tests/integration/run-internal-bank-verification.mjs
pnpm --filter @athyper/server-db exec tsx scripts/tests/integration/draft-bank-proposal.mts
pnpm --filter @athyper/server-db exec tsx --test scripts/__tests__/provisioning/internal-bank-review-authoring.test.ts
pnpm --filter @athyper/server-plane-neon test
pnpm --filter @athyper/server-plane-neon exec tsc -p tsconfig.json --noEmit
pnpm --filter @athyper/product-neon-business-partner typecheck
pnpm --filter @athyper/product-neon-business-partner exec vitest run src/draft-bank-controls.test.tsx src/bank-verification-controls.test.tsx src/banking-workspace.test.tsx
```

The native PostgreSQL proof uses synthetic R4 partner/company/disclosure fixtures and rolls back DDL and all fixture changes. It exercises all 32 source-coordinate combinations, invalid hashes/versions, independent decisions, forged actors, missing reasons, stale versions, evidence expiry, immutable history, scalar bypass, verified account linking, rejection/retry, re-review without implicit reacceptance, customer refund isolation, MESH FKs/disclosure pinning, and actual `athyperapp` tenant isolation.

Tests establish stale-version rejection; a separate multi-connection race/load test is still needed for deployment qualification. Repository-wide test TypeScript checking also reports existing failures in the old bank integration harness (`pg` resolution and import path) and profile-match fixtures. Production server and product package typechecks pass separately. The broader DB tooling typecheck still reports existing rootDir/import-boundary and fixture typing errors outside the bank implementation.

## Historical prepared publication and rollout

- The former native graph was `metadata/authoring/business-partner/internal-bank-review.candidate.graph.json`, with hashes and release gates in its `.review.json` companion. Both were removed during the recorded session reversal; these paths are historical archive coordinates, not available checkout inputs. It was prepared from the local Studio Business Partner release 2 change set (`3d68c639-df7e-4683-8c26-93b87bab21eb`), then validated and compiled with the native compiler. This is a prepared candidate, **not a live publication**. Stage it into a fresh native change set based on the current release; native validation/testing, independent approval and signing remain required. Do not reuse candidate row IDs across change sets without the normal native rekey operation.
- `prepare-internal-bank-review.ts` accepts a current exported native graph, the policy JSON and a new output prefix. It refuses invalid graphs, differing existing Bank policies and overwrite of an existing candidate artifact. Activation requires an actual active local persistence principal in the existing publication transaction context; it never supplies an invented actor.
- The native draft/publication proof covers actual `athyperapp` capture and handoff, native validation/approval/materialization, stable-key replacement, stale versions, deterministic retries, obsolete proposal rejection, company eligibility, stale-document rollback and original-maker attribution. Publication fixtures are explicitly synthetic and rollback-only; they test native activation/signature-evidence gating, replay, invalid-successor rollback and release rollback. They are not evidence of a production signature or independent approval.
- No historical reviewer or acceptance proof is synthesized. Legacy internal accounts without retained review evidence fail new acceptance/readiness checks. The legacy disposition/re-verification process must be agreed and qualified before activation. Existing MESH candidate creation must retain its real MESH review evidence within the guarded transaction.
- The authorization inventory source declares the ledger command-owned and excludes generic writes. Compiled authorization/publication artifacts need regeneration as part of that governed release.
- At the initial implementation proof stage, no persistent DDL application, deployment or publication had been performed. The later authorized installation and submission outcomes are recorded below.

## Live publication attempt

The live run is retained in `governance/policy/reports/internal-bank-live-publication.dev.json`. After the author session was refreshed, native draft `83261589-4f8e-4046-a128-fe02a33a2dbc` was created on the separate `internal-bank-review-v1` branch, staged at revision 1, and passed Studio validation and contract tests. The live schema requires `sensitive_pii` for the Bank fields; the candidate and authoring adapter now use that supported classification. The normalized review graph is retained in `governance/policy/reviews/internal-bank-native-review.graph.dev.json` (hash `8a3b3335062b81acce7298e22f755c887a9ca43e1796b3f736bff61bb03057c8`).

Submission returned HTTP 403. The authenticated author has `metadata.entity.author`, `metadata.entity.test`, and `metadata.entity.validate`, but lacks `metadata.entity.submit`. An authorized submitter is required next, followed by an independent reviewer and an authorized publisher. No approval, signed release, NEON DDL application or activation has occurred. Existing working drafts remain untouched.

Resume with an elevated session authorized for `metadata.entity.submit` in Cirrus Atlantic:

```sh
pnpm exec tsx tooling/scripts/verification/publish-internal-bank-review.mts submit <refreshed-Studio-session-file>
```

The runner checks candidate hashes and native contract tests, compares the live source, forks native identities, stages the exact graph, validates/tests, and submits. It records the persisted graph hash for independent review. It does not approve as another person. Studio's `AuthoringService.reviewTransition` rejects the author/submitter as reviewer (`REVIEWER_SEPARATION_REQUIRED`). After independent native approval, coordinated canonical DDL/runtime installation and authenticated publisher access, its `publish` action calls Studio's existing signer/publication service. Signing is not inferred from approval, and activation must still be verified against NEON's local release head.

The follow-up read-only authorization audit confirmed that the two accounts were previously valid: the retained September 11 approval used `catl.owner`, with `catl.admin` as author/submitter. Their existing `bp.v2.studio.catl.admin` and `bp.v2.studio.catl.owner` memberships and role assignments expired on September 11 at 13:00 UTC (21:00 Malaysia time). The existing role split is admin submission/publication and owner independent review. Renewal of those established assignments is required; the permission definitions themselves remain published. No access grants were changed.

## Authorized role renewal and live outcome

The user explicitly approved renewal of the two existing Studio roles. Two successor memberships and two successor role assignments now retain the same existing role capabilities and exact Cirrus Atlantic tenant scope; expired records were preserved. The assignments expire at **2026-09-20 11:52:28 UTC (19:52:28 Malaysia time)**. The receipt includes before/after coordinates in `governance/policy/reports/internal-bank-studio-role-renewal.applied.dev.json`. `catl.admin` submitted the Bank draft, and authenticated `catl.owner` approved its exact persisted graph; revision 3 is approved.

Canonical Bank DDL 15–18 and the account identity guard were installed atomically after approval. The verified-account preflight found zero legacy verified accounts. The source API was restarted and became healthy. The installation receipt is `governance/policy/reports/internal-bank-canonical-install.dev.json`.

The subsequent native publication failed with `RESTORATION_PUBLICATION_ALREADY_EXISTS`: the candidate inherited the source graph's one-time `runtimeRestoration` carrier while an approved restoration publication already exists. The native release transaction rolled back (no release row for the Bank change set); the approved graph was left intact. Resolving the source/runtime restoration lineage and preparing an appropriately reviewed successor is required before signing/publication can complete. No Bank release was activated, and no publication guard was relaxed.


## Restoration correction resubmitted

The target has zero active contracts and release heads. Consequently the active-predecessor successor path is not applicable. The existing reviewed empty-target restoration workflow supports a fresh proposal at an unused publication key; its duplicate, empty-target, approval and signing guards are unchanged. The corrected proposal uses `metadata.entity.business_partner.local-master-data.cirrusatlantic.internal-bank-review-v1`. Prior publications and the original approved Bank draft remain intact.

The correction also explicitly projects the native intake surfaces into the full reviewed runtime payload. The restoration materializer copies that payload; carrying Bank fields only in the native graph would omit them from this runtime path. Storage, operations, authorization, Atlas configuration and source-artifact provenance remain equal to the source payload. Both supplier/customer policy definitions remain in the authored Bank surface.

Authenticated `catl.admin` created and submitted **495762e9-f94b-4d61-8997-b7788b013c41**, branch `internal-bank-review-correction-v1`, revision **2**, status **in_review**, on 2026-09-13 at 12:06 UTC. The persisted graph hash is `fb8f09d87998d198dc44956b6bc83cff35f49380269f01c55e95427696f0cac5`. Read-only reconciliation confirms the original draft remains approved, the correction has no approver, and the new key has no publication row.

Four focused regression tests passed, including full-runtime preservation, intake projection after native ID cloning, rejection of inherited publication coordinates, and rejection of unpinned payload edits. Live Studio validation and contract tests succeeded before submission. The runner now checks unused restoration coordinates and the empty-target guard before submission or publication, so this conflict is detected before signing. These checks do not replace transactional publication and activation guards.

Evidence:

- Former `metadata/authoring/business-partner/internal-bank-review-correction.candidate.review.json` (removed during the session reversal; consult its backup manifest).
- `governance/policy/reviews/internal-bank-native-review-correction.graph.dev.json`
- `governance/policy/reports/internal-bank-live-publication-correction.dev.json`

The corrected proposal needs fresh independent review by `catl.owner`, followed by authorized signing/publication and verified activation. The earlier approval does not apply to the corrected graph. No publication or activation was attempted in this resubmission.

To resume this exact run, pass `correction` as the final argument to `publish-internal-bank-review.mts`; omitting it selects the original retained run.
