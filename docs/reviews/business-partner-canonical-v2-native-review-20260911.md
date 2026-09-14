# Business Partner canonical v2 — native review

Status: **native publication signed; separate runtime artifact signing remains open**.

The user explicitly authorized independent review and subsequent native publication/signing of this exact revision. The authorization is recorded in [the acceptance record](../../governance/policy/reviews/business-partner-canonical-v2-native.acceptance.dev.json). This conversational authorization is separate from the native approval receipt: `catl.owner` must still complete normal Studio authentication and the native review endpoint. No native approval is asserted by that acceptance record.

The native graph implements the approved 17-read transition design: each selected read requires an explicit target allow and retains applicable source denials, catalog requirements, MFA, separation of duties and domain conditions. The second legacy allow requirement is removed only for those versioned read transitions. Writes and reveals retain their existing checks. The proposal preserves 42 included operations, nine deferred operations and Atlas configuration.

| Review coordinate            | Exact value                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| Author and submitter         | `catl.admin`                                                       |
| Independent reviewer         | `catl.owner`                                                       |
| Native change set            | `f533b3ec-934b-4bc0-8448-ee933847ddf2`                             |
| Change-set revision          | `2`                                                                |
| Proposal revision            | `0e44f59861fa5c2d7290909d2b41d366f39e3a856e7336fd0e9cf9b5ba4149f8` |
| Native contract hash         | `3e860539e3892846d5fca4d24db1334a234ccd4820d6707f188a97423bebdd3a` |
| Snapshot revision            | `01a08ef3-f32c-7b49-bf4a-c8a308b920ae`                             |
| Materialization payload hash | `9b0e6d66eaa844c48ebd0ec433fc3532675396329cf8c6235bfa0c6597568bcc` |
| Predecessor                  | Shared DEV release 18                                              |

Authenticated native validation returned no issues; native contract tests passed. A read-only check of the stored snapshot confirms the same canonical graph, compiler contract, authorization runtime and Atlas configuration. Native canonicalization sorts declared order-independent row collections; PostgreSQL separately maintains its storage hash. Both were checked using their respective canonicalization functions.

Evidence: [authoring receipt](../../governance/policy/reports/business-partner-canonical-v2-authoring.dev.json), [persisted review](../../governance/policy/reports/business-partner-canonical-v2-persisted-review.dev.json), [proposal](../../governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json).

The requested decision is independent approval of this exact native revision for subsequent native publication/signing. It does not authorize BP grant changes, activation, policy-difference acceptance or compatibility retirement. The temporary Studio author/reviewer grants were separately approved and remain bounded by their existing window. Exact signed-release qualification, ownership journeys and compatible recovery remain required after signing.

## Authenticated native approval

At 05:50 UTC, `catl.owner` completed normal elevated Studio review. The native endpoint returned HTTP 200, status `approved`, revision 3, with the expected independent reviewer. A read-only persisted-state check confirmed the original canonical contract hash and independent author/submitter/reviewer identities. Evidence: [approval receipt](../../governance/policy/reports/business-partner-canonical-v2-approval.dev.json) and [persisted approval](../../governance/policy/reports/business-partner-canonical-v2-persisted-approval.dev.json). This supersedes the pending native-review status above. Signing requires refreshed publisher authentication; no release or BP grant/activation change occurred in these attempts.

## Native publication completed

Publisher step-up succeeded. The initial publication transaction failed with `SUCCESSOR_PREDECESSOR_STALE` and created no native release. The materializer incorrectly coupled the reviewed active baseline to the highest publication number, then tried to reserve predecessor + 1. Shared DEV still used release 18 while publication 19 already existed.

Migration `20260911_successor_active_baseline_sequence.sql` retains the exact active-head checks, predecessor hashes, independent review, payload immutability and runtime precondition. Under the existing release-key advisory lock, it reserves the next unused publication number instead. A rollback-only database rehearsal verified materialization, retained publication 19, the reviewed predecessor, and rejection of missing head evidence, altered payloads and the wrong publisher. The deployed function's prior definition is saved in the deployment receipt for rollback.

Authenticated publication then returned HTTP 202. Native release ID is `21bec59b-86fb-441c-93b2-5027f2999d0b`, native sequence 3, publication sequence **20**. The native contract signature is persisted. Exact capture shows zero runtime artifacts and zero deployments, so this does not claim runtime signing or execution qualification. See [native publication](../../governance/policy/reports/business-partner-canonical-v2-native-publication.dev.json), [exact release](../../governance/policy/reports/business-partner-v2-exact-release.dev.json), and [SQL rehearsal](../../governance/policy/reports/business-partner-v2-successor-sql.dev.json).

A new [release-20 operation review packet](../../governance/policy/reviews/business-partner-release-20-workflow.dev.json) binds the exact runtime, canonical read admission, catalog and 42 included/nine deferred operations. It has no authenticated runtime-review receipts yet. Historical release-19 receipts are not relabelled. Runtime artifact signing, exact-release service qualification, ownership journeys, compatible recovery and renewed difference acceptance remain open. Shared DEV remains release 18; BP grants and activation are unchanged.

## Runtime review and signing completed

Both `catl.owner` and `catl.admin` recorded elevated NEON review receipts for packet `4804e67680582faa99c18f9869ec0ce20a01b13047c6cb73f22ee275994d02ab`: all 42 included operations and nine deferrals are resolved. The sealed adapter passed current-reviewer, current-source, changed-head, changed-evidence, path-escape and changed-reviewer-epoch checks. This supersedes the pending runtime-review status above.

An isolated one-off process on image `3fbbbaa376286770d3d8f0563cc72015f67aabfcc4fe4223531fd8005317143c` invoked the native compile and sign handlers. It used the registered publication worker principal and real signing/storage adapters. Compilation and signing each completed. Downstream dispatch was captured and held, with no queue consumers or activation execution. The first attempt lacked the application network and timed out; the successful runner uses the worker's application and data networks.

Evidence: `business-partner-release-20-review-seal.dev.json`, `business-partner-release-20-adapter-qualification.dev.json`, `business-partner-v2-worker-image-qualification.dev.json`, `business-partner-v2-runtime-signing.dev.json`, and `business-partner-v2-exact-release.after-signing.dev.json` in the policy reports directory. The original reviewed source capture remains byte-for-byte pinned by the review packet.

The runtime artifact is signed, but independent signature/load verification, isolated execution deployment and all remaining business-journey gates are still open. A deployment ledger row exists from signing; this is not an executed deployment. See `business-partner-release-20-phase-closure.dev.json` for the current gate accounting.

### Release-20 isolated transfer qualification — 11 September, 14:39 MYT

The user explicitly approved proposal `9036305ffb91b11c7f71f8ea2bcef8263283986a0e84dc6bcabfc1ab2de5d83f`. Its two tenant-exact import/export permissions were applied only to the release-20 clone, within the approved 14:30–18:30 MYT window. The new assignment and membership were revoked at the end of the qualification. Shared DEV BP grants and activation were unchanged; earlier revoked test grants were not restored.

The production loader verified runtime artifact `81d8d9737fd50aecdcbb164ec958cd3a41b6e6d7515f79531340a04a8ea1be50`; isolated API and worker executed it on image `sha256:3fbbbaa376286770d3d8f0563cc72015f67aabfcc4fe4223531fd8005317143c`. Authenticated command application, governed import and idempotent replay passed. Direct create/update were denied. Export completed, downloaded fields were checked, sensitive-field export was rejected, and worker execution carried the exact artifact receipt. Bounded AI retrieval passed positive and negative checks.

Revocation qualification denied new exports, imports and download requests, and rejected a previously queued export before any artifact was produced. Existing record and AI read grants continued to work. This qualifies local clone revocation only; existing presigned URLs retain their bounded TTL and cross-instance synchronization is not claimed.

The command report retains the earlier HTTP 409 from a stale descriptor hash in the qualification helper. Correcting the helper to the release-20 descriptor allowed the governed import and replay to pass. The original failure is preserved, not erased or reclassified as a successful request.

Evidence: `governance/policy/reports/business-partner-release-20-commands.dev.json`, `business-partner-release-20-export-ai.dev.json`, `business-partner-release-20-revocation.dev.json`, and `business-partner-release20-test-grants-cleanup.applied.dev.json` (same reports directory).

Phase closure remains open: ownership pilot and independent-child journeys, complete provider/field and UI context qualification, compatible recovery, renewed policy-evidence acceptance, full Atlas conversations where in scope, and remaining temporary Studio/test-data cleanup. These execution results do not authorize enforcement activation.
