# Reviewed reset runtime restoration

Status: implementation and migrations deployed; exact runtime draft independently approved by catl.owner at revision 4. Publication signing and enforcement activation remain pending.

The fresh reset path carries the complete runtime payload inside an explicit `runtimeRestoration` v1 marker in the native graph. The marker pins the payload hash, tenant, publication key and historical source artifact hash. Historical hashes provide provenance only; the new graph needs its own independent native review.

The compiler rejects mixed reset/baseline/successor markers, changed hashes or identities, native policy/runtime-binding mismatches, missing field/operation coverage, and missing runtime storage/presentation branches. Native worker catalog, handler/resolver and authenticated runtime-review checks still run when compiling the executable artifact.

The transactional Studio materializer accepts only a signed native release from an independently approved change set and its current validated snapshot. It creates a fresh publication sequence at an unused publication key, retains the full runtime descriptor, and records an immutable tenant-scoped restoration link. It does not restore predecessor rows, old approvals or grants. The worker now discovers this compilation source through its registered database function.

The signed activation precondition permits insertion into an empty target only. It checks the exact tenant, entity, publication key and initial sequence; it rejects updates and a competing contract for the same tenant/entity, including a competing publication key. Existing runtimes without the new guard reject the new initial activation rather than treating it as an ordinary successor. The API also checks target guard capability before native materialization. Publication preparation and activation remain separate.

## Verification and deployment

- Twelve targeted native registration/restoration/successor tests passed.
- Seven rollback-only SQL activation-guard checks passed, covering valid initial insertion, update rejection, wrong sequence/key/tenant, competing publication rejection, and the existing successor path.
- Studio and NEON migrations passed rollback rehearsals and were installed. Authorization-table and activation-head fingerprints remained unchanged.
- Authoring, Studio, platform-host and production publication builds passed. A pre-existing publication integration helper had incorrect relative imports; these were corrected and integration test sources were excluded from the production build. No full authenticated integration-suite pass is claimed.
- API/worker image `sha256:c3e0b59210d3624d394f42ee5b597536d4e7f1039ff20cb9bbf3a9fd107abe92` deployed healthy with unchanged authorization/activation fingerprints.

Receipts:

- `governance/policy/reports/business-partner-reset-runtime-deployment.dev.json`
- `governance/policy/reports/business-partner-reset-runtime-migrations.installed.dev.json`
- `governance/policy/reports/business-partner-reset-activation-precondition.dev.json`

## Exact draft proposal

Proposal: `governance/policy/reviews/business-partner-reset-runtime.proposal.dev.json`.

Revision: `8c09c5f30249a382d43349e6cd06465c332c2c5c05e21a34f95bbda26a42e72b`.

It preserves 42 included operations and identifies all nine existing deferrals. Storage, list/record presentation, fields, authorization and Atlas data come from the preserved release-20 artifact. Generated operation-scope projections are cleared for native recompilation using current operation identities. The native graph passes validation and three contract assertions; the restored descriptor also passes the runtime descriptor parser.

Target change set: `c617270b-cbc3-44ed-867e-31e55e819c3c`, revision **3**, status **in_review**. At 2026-09-11 09:39:11 UTC, catl.admin completed authenticated staging, validation (zero issues), all three native contract assertions, and submission. The reviewed graph hash is `9587c84ccaacb5909eb258e68b8db6996710b69b1ad2cbfba5c30ca6a7bdb70a`; validated contract hash is `9cc841028e1a5a9de9252d7021d687aa8e5f8d94cbb315cc5838c0721117d52d`.

The successful receipt is `governance/policy/reports/business-partner-reset-runtime-submission.dev.json`. The earlier zero-mutation authentication failure is preserved separately as `business-partner-reset-runtime-submission.auth-required.dev.json`. No approval, publication, grant mutation or activation occurred during this submission.

Next: obtain catl.owner's independent review of this exact proposal and submitted revision, then qualify the native materializer and executable runtime compilation. Target catalog dependencies and exact runtime-review receipts remain signing gates. This change does not close the company pilot journeys, compatible recovery execution, or acceptance of the 66 policy dispositions.

## Independent native review

Following explicit user authorization of proposal `8c09c5f30249a382d43349e6cd06465c332c2c5c05e21a34f95bbda26a42e72b`, catl.owner completed normal Studio authentication and review step-up. The native approval endpoint accepted revision 3 and returned approved revision 4. Read-only database checks before and after confirmed the exact validated contract, independent author/submitter and reviewer, and unchanged proposal content. Studio canonicalizes graph ordering; comparison uses the native canonical representation while also pinning the original source graph hash. The initial raw-order check stopped before any approval request.

Receipt: `governance/policy/reports/business-partner-reset-runtime-approval.dev.json`. This review did not publish, sign a runtime artifact, change grants or activate enforcement. Native materialization/signing, current catalog and runtime review requirements, ownership qualification, compatible recovery and 66 disposition acceptance remain outstanding.

## Native publication and current executable compilation gate

Authenticated catl.admin publication returned HTTP 202 for release `1b1c3f09-ea2b-4c38-82ac-14fff1d7e3e0`. This is fresh reset sequence **1**, not historical release 20. The native signature is present, the change set is published, and the restored publication row is approved. Read-only capture confirms zero executable artifacts and zero deployments.

The first publication transaction failed because `publication.fn_successor_canonical_json(jsonb)` was absent after reset. Installed the isolated hashing dependency after a rollback rehearsal verifying canonical object ordering and preserved array ordering; authorization and activation fingerprints stayed identical. The same approved revision then published successfully. No graph, review or historical release was rewritten. The first dependency rehearsal itself encountered a JavaScript replacement-string dollar escaping error; it rolled back, was corrected to a replacement callback, and its failed receipt is retained.

Current worker error: `Canonical read source catalog unresolved: enter:neon.relationship.business_partner.enter`. A complete read-only dependency inventory found **48 distinct codes, 30 missing in shared NEON**. Twenty-nine have definitions in the isolated reference (27 target definitions and the two separately defined comment/attachment sources). The remaining `enter` source is absent in both catalogs, and the original reviewed operation packet explicitly records no existing permission ID or scopes. Its presence as a canonical source transition therefore requires explicit semantic correction, not an invented legacy definition or a compiler bypass.

Prepared a 29-definition catalog proposal with exact reference scopes and conditions, no grants, and this one unresolved semantic issue. It is a proposal only. Recommendation: review a successor correction for the nonexistent `enter` source, retaining explicit target authorization; preserve this published native release and its independent approval. Runtime review must then bind the selected release and installed catalog. Executable signing, isolated qualification, ownership journeys, compatible recovery and policy-difference acceptance remain open.

Evidence:

- `governance/policy/reports/business-partner-reset-native-publication.dev.json`
- `governance/policy/reports/business-partner-reset-exact-release.dev.json`
- `governance/policy/reports/business-partner-reset-runtime-hash-dependency.installed.dev.json`
- `governance/policy/reports/business-partner-reset-catalog-dependencies.dev.json`
- `governance/policy/reviews/business-partner-reset-runtime-catalog.proposal.dev.json`
