# Authenticated BP qualification — 12 September 2026

Status: **partial execution evidence; full business journeys remain open.**

## Executed configuration

- API and worker image: `671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47`.
- Artifact: `45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc`.
- Source release: `c2cc6900-26c1-47ca-8dfc-1d488000950c`.
- Isolated NEON UI image: `2f7028f473f8d1be9dc576ee4578c5817f484637c65b631e47fcbf2ac3673921`.
- UI container: `athyper-bp-enter-neon-ui`, bound only to `127.0.0.1:13319`.

A loopback CONNECT proxy preserves the normal NEON origin across OIDC redirects. It routes only NEON to the isolated UI, and IAM to the normal issuer. The local TLS certificate is used only for this development browser transport. Both users completed normal login and tenant/principal checks; no tokens, cookies or passwords are stored in repository evidence.

The UI relay uses `http://athyper-bp-enter-api:4000`. The dedicated UI session client uses the same BFF configuration and saved isolated UI sessions. API and worker remain on the dedicated isolated network. Session clients and UI additionally reach existing IAM/session infrastructure; no shared product-data API is used by the isolated UI relay. Public issuer keys were captured into a read-only isolated JWKS endpoint, expiring at **06:25:46 MYT**. API issuer, audience and signature verification were not disabled.

## Completed authenticated checks

| Check                                                        | Result                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Both users: isolated UI login and tenant/principal selection | Authenticated, baseline assurance                                                  |
| Both users: UI relay BP list descriptor                      | 200, descriptor `1e1f4dd20f900b220b644eb936baf0474c01357be4f3b18290340efea6ad9cda` |
| Both users: direct isolated BP list                          | 200, zero rows                                                                     |
| Both users: nonexistent record direct API                    | 403; no record returned                                                            |
| Both users: baseline Atlas retrieval                         | 403 `AI_ADMISSION_DENIED`                                                          |
| Admin: governed create attempt                               | 503 `BUSINESS_PARTNER_REQUEST_SCHEMA_UNAVAILABLE`                                  |
| Both users: Review & Approval descriptor                     | 404 `ENTITY_DESCRIPTOR_NOT_FOUND`                                                  |

The Atlas baseline result alone does not prove admission after MFA or permitted record retrieval. Admin subsequently completed normal isolated UI MFA. Four fresh authenticated checks passed: elevated admin reached the release check and received 409 for a mismatched descriptor; a nonexistent record returned 403 `AI_RETRIEVAL_DENIED`/`TOOL_DENIED`; an unsupported field argument returned 403 `AI_RETRIEVAL_DENIED`/`TOOL_INVALID`; owner remained denied with 403 `AI_ADMISSION_DENIED`. Every response identified the exact artifact and release. Authorization fingerprints were unchanged. This proves elevated admission and these rejection paths, not positive record retrieval or full conversations.

Owner has no Atlas admission grant. Existing approved grants still expire at **09:15 MYT**; nothing was renewed or widened.

## Concrete deployment dependencies

The create failure contains `BUSINESS_PARTNER_DEFINITION_LOCAL_ACTIVE_REQUIRED`. `LocalBusinessPartnerDefinitionConsumer` obtains schemas and workflow definitions from a separately active onboarding-definition projection. The clone has only the BP entity-runtime projection; it has no active onboarding-definition projection. The shared reset database also has no active publication projection that can simply be exported as a verified replacement.

Consequently, no coherent governed BP record has been created, and positive record/section/field, approval/application and Atlas retrieval journeys cannot be asserted. A compatible onboarding definition must be authored/reviewed/published and loaded through the native path. The unsigned child candidate also still needs its runtime/materialization path and independent publication. Neither may be installed by fabricating an activation row or reusing unrelated historical approvals.

Follow-up local implementation is recorded in the [dependency implementation review](business-partner-dependency-implementation-20260912.md): onboarding candidate preparation, native child-to-runtime conversion, worker integration and constrained direct child reads now have local validation. They remain unpublished. Inspection also found the missing `master.business_partner` case contract; its first-publication path must be implemented before the whole create journey can succeed.

## Failures retained and corrected

The first browser interception approach did not consistently intercept the cross-origin login redirect chain; it reached the shared shell and remained anonymous. It was discarded as qualification evidence. The loopback CONNECT proxy now routes the complete browser connection, and both isolated logins pass.

During testing the shared source API stopped listening following changes to search configuration (`Search requires both SEARCHCORE_URL and SEARCHCORE_API_KEY`). This affected the older shared-session qualification client. Isolated UI sessions use the isolated API for identity resolution and are qualified separately; the shared source API failure was not changed as part of this work.

## Evidence

- [UI deployment](../../governance/policy/reports/business-partner-enter-ui-deployment-20260912.dev.json).
- [Admin UI login](../../governance/policy/reports/business-partner-enter-ui-login-20260912.catl.admin.dev.json).
- [Owner UI login](../../governance/policy/reports/business-partner-enter-ui-login-20260912.catl.owner.dev.json).
- [Isolated UI session API checks](../../governance/policy/reports/business-partner-enter-ui-session-api-baseline-20260912.dev.json).
- [Authenticated list and child checks](../../governance/policy/reports/business-partner-enter-authenticated-list-20260912.dev.json).
- [Command attempt](../../governance/policy/reports/business-partner-enter-commands-20260912.dev.json).
- [Atlas MFA admission and denial checks](../../governance/policy/reports/business-partner-enter-atlas-admission-20260912.dev.json).

No successful creation, approval, application, import, positive record retrieval or phase closure is claimed by this evidence. Shared grants and enforcement activation were not changed.
