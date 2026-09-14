# Business Partner deployment adapter — 11 September 2026

## Implemented

API and worker now load the same optional, operator-selected `BP_AUTHORIZATION_DEPLOYMENT_CONFIG_PATH`. The versioned configuration pins a tenant, publication, signed artifact, profile/binding/descriptor hashes and image. Files must be absolute, regular, bounded and not group/world writable. Native publication verification checks signatures and real handler/resolver/preflight registrations before readiness.

Shadow staging does not activate the target. Enforcement requires a separately signed `entity_authorization_enforcement_approval` payload, pinned by file hash, matching the exact tenant/release/artifact/image, effective window and qualification reference. It must include complete coverage, accepted differences, grant review, compatible rollback, company/child qualification and the current authority watermark. Requests reload qualification and current authority; incompatible or unavailable evidence closes execution. No receipt is fabricated by startup.

The selected tenant is explicit. Other tenants keep their existing selection. Case commands use their reviewed `case_*` operation names while preserving actual case IDs and domain facts. Stored ownership and workflow preflight resolve the independent case, not the parent BP. Source-domain denial and target denial both remain effective. Direct BP writes are not converted into case commands.

## Deployment evidence

Image `718ca6008c0b33d253c61d28182b336e967f477b5d671e5e733375996f2751a4` was staged in both shared processes. Native release-19 startup receipts passed. Both named users passed shared-release-18 reads. The prior process images/configuration were restored and verified, then the adapter was redeployed. All 13 authorization fingerprints remained unchanged. This is process rollback evidence while release 18 stays active, not rollback of activated target enforcement.

The new successor sandbox uses independent databases, queues and object storage. The earlier isolated instance and its revoked grants remain untouched. The approved two-permission import/export delta was applied only to the successor clone; source and clone authority must otherwise match before and after each test request. Its four-hour effective window and exact scope remain mandatory.

The initial successor harness supplied hooks removed from current production composition. That first command attempt returned 403 and remains recorded. The harness now consumes the real deployment adapter dependencies through the pre-existing trusted isolated-execution port, rather than claiming that those ignored hooks installed target authorization.

## Build recovery and pending image review

The case-corrected image `6363b7a3b67d8120989c9de65640954fc77d0525a01e7b41a8213adc6fa5fb8e` failed startup because an AI contract subpath pointed to TypeScript under node_modules. Shared processes were restored to healthy image `718ca600…`; authenticated reads and unchanged authority fingerprints were verified afterward. The proposed `6363b7a3…` execution amendment is explicitly withdrawn and must not be accepted or executed.

Production packaging now builds and prepares the platform AI contract, and smoke-imports both emitted API and worker startup modules. NEON production TypeScript compilation excludes test helpers while Vitest continues to own tests. The corrected image must pass those checks and startup before a replacement image amendment is presented.

The adapter/case regression suite passes 19 tests; host production typechecking passes. Enforcement remains unapproved. Full same-image target journeys and release rollback must be qualified before preparing that approval.

## Approved image qualification and import-policy finding

The user explicitly accepted amendment `b893dafc735cc1db22becfe920df04837bff8da7e520ecfcac9a3c2b8508f3d4` for image `sha256:c377e1dc9dde65cd727d4fadef8eeea936ed3ec26c12ab1b20d2e6741e606906`. The successor API and worker run that image with the signed release-19 artifact and isolated qualification host. Both accounts completed normal issuer MFA; no assurance state was fabricated.

Authenticated create, validate, submit, two independent owner approval steps, administrator application and persisted applied-case read passed. Requester self-approval and premature application were rejected. Export request, worker execution, authorized download and sensitive-field rejection passed; AI record retrieval of the newly applied partner passed with descriptor, field and missing-record rejection checks. These are scoped retrieval checks, not full Atlas conversations or production activation. See `business-partner-successor-approved-image-execution.dev.json` and `business-partner-release-19-successor-export-ai.dev.json` under governance/policy/reports for exact evidence. Shared DEV remains release 18.

Governed import is still blocked on that image. The target import operation allows the approved tenant capability, but the business-domain policy gate in `register-services.ts` falls through to `business_partner_hard_policy_not_configured` for that permission. Adding grants or bypassing refresh is not the fix.

The local successor adds an explicit governed-import policy requiring owning-service `proposalOnly` and `makerCheckerEnforced` facts on the canonical import operation. The import owner supplies these facts because it creates governed drafts only; case submission, independent approval and application remain separate boundaries. Each row retains compatibility checks, current case-create authorization and owning-service validation. Six import runtime/binding tests and host TypeScript passed. The successor is not qualified by the existing image's receipts and is not authorized for enforcement activation.

Successor packaging did not complete: two Docker build attempts compiled the runtime but failed during production dependency deployment with `ERR_PNPM_META_FETCH_FAIL` against the npm registry. Logs are local at `/tmp/bp-governed-import-policy-build.log` and `/tmp/bp-governed-import-policy-build-retry.log`. No successor image was deployed and no image approval is requested before one is built and checked. The successful command/export/AI-retrieval receipts remain bound to `c377e1dc…`; the governed-import fix remains local.

## Successor image build completed

The build blocker is resolved. The canonical Dockerfile now persists `/root/.cache/pnpm` in addition to the package store during legacy production deployment, uses four concurrent network requests, a 120-second fetch timeout and cached metadata when available. Host-network and offline-only experiments were insufficient; the successful image was built from `server/Dockerfile.prod` with normal build networking. Offline packaging correctly rejected absent registry metadata rather than silently choosing dependencies.

Image `sha256:6d367240cc4c0252f599e45355331dcb00a40d6c50860a9f4e3a314e00c7bfe9` built successfully, including API and worker module-import smoke checks repeated with networking disabled. Its 466 external dependency/peer-resolution entries are identical to `c377e1dc…`. Of 896 compiled first-party JavaScript files, exactly three changed: the import runtime, service registration and Atlas business-context resolver. The image includes the local Atlas context fixes described in the context-cleanup review.

Build evidence: `governance/policy/reports/business-partner-import-policy-successor-build.dev.json`. The separate image-only amendment is `governance/policy/reviews/business-partner-successor-import-policy-image.amendment.dev.json`. Prior approvals are preserved. This successor has not been deployed or authentically qualified, and the existing image approval has not been transferred to it. The amendment retains the same two isolated transfer permissions and original 10:15–14:15 MYT window, with zero grant mutations and no enforcement activation.

## Successor isolated execution qualification

The user approved image amendment `09c286bf20e9389437f4cb4f55feaeec03040c6a7975e5d5acc48c580dff2913`. Both successor processes now execute image `6d367240…` with the signed release-19 artifact. The previous `c377e1dc…` proposal, approval and journey reports were archived rather than promoted to the successor. The expired public JWKS transport snapshot was refreshed from the actual issuer within the original test window; authenticated identities and MFA assurance still come from the normal issuer/session flow.

Fresh authenticated qualification passed for create → validate → submit → independent owner approvals → administrator apply → persisted application. Governed import now creates drafts and passes replay, changed-retry, incompatible-data and release-mismatch checks. Deferred direct writes remain denied. Export request, worker execution and download, plus AI record retrieval and negative descriptor/field/record checks, passed on the same image.

The approved cleanup revoked exactly one new isolated membership and one assignment covering the two transfer permissions. New imports/exports and downloads are denied after revocation. A queued export carrying stale authority failed without an artifact. Existing record/AI read permissions remain effective. All other compared authority remains identical to shared DEV, which still uses BP release 18. Revoked transfer grants were not restored.

The [bounded qualification receipt](../../governance/policy/reports/business-partner-successor-bounded-qualification.dev.json) binds the four evidence reports to the exact image, process IDs, signed artifact and qualification-host hash. This closes this command/import/export/AI-retrieval/local-transfer-revocation scope only. Full provider/field and company-owned journeys, compatible release rollback, generic context/resolver work and explicit enforcement approval remain separate. No activation occurred.
