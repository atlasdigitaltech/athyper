# Role-free registration and direct UNSPSC — CATL DEV checkpoint

Latest UI increment: [Industries and Commodities collections](./partner-classification-collections.md), active release **25**. Release-23 registration evidence below remains historical and valid for the recorded journey.

2026-09-23. **Direct UNSPSC and optional CATL categories are active and verified. The CATL role-free registration journey has passed submit → independent approval → materialization and replay. A dedicated registration screen is implemented; UNSPSC picker/category-administration UI remains pending.**

## Implemented boundaries

- A direct declaration identifies `shared.commodity_code` (active UNSPSC at capture), not a tenant category. No role, company, organization or category mapping is required. Native declaration input now uses `commodityCodeId`.
- Existing category-based facts remain `legacy_category`; they are not expanded into invented UNSPSC declarations. Original command receipts remain replayable. New category-based native capture is rejected. Older case/fixture writers retain explicitly legacy category facts, not direct declarations.
- Additive DDL 31 permits exactly one classification subject: legacy category or direct code. Direct code identity is immutable; tenant isolation, version checks, audit, verification separation and archive protections remain.
- The reader returns the code/name/level, direct-versus-legacy basis and optional tenant `categoryMappings`/`mappingStatus`. Current mappings are exact code assignments; no implicit hierarchy expansion or commercial eligibility is inferred. Crosswalks remain reference evidence.
- New native `new_partner` requests may omit `requestedRole`, organization and company. This first capture contract accepts core organization identity only, from an internal/manual source. Commodities are declared after registration using their dedicated command. Existing supplier/customer onboarding remains separate.
- Role-free materialization creates only the BP and preserves governed case snapshots, lifecycle authority, idempotency and audit. Result kind is `partner_registered`, not `partner_role_created`. It requires independent approval; no registration result means supplier qualification or purchasing eligibility.
- Dedicated tenant permissions `neon.business_partner_registration.{create,read,validate,submit,decide,materialize}` avoid broadening generic case permissions. Submit/decide/materialize require MFA and their existing maker/checker or pinned-approval checks.
- User-approved CATL grants: admin create/read/validate/submit/materialize; owner read/decide. No new supplier qualification or company-setup grants. Approver discovery returns only `catl.owner` for the core registration test coordinate.

## CATL demo

Partner: `BP-DEMO-CORE-001`, `b4137225-4534-5469-8138-09d15a970271`.

| Fixture | Meaning |
| --- | --- |
| UNSPSC `41101502` — Stomachers | Direct commodity-level declaration mapped to `DEMO_SAMPLE_PREPARATION` |
| UNSPSC `41101503` — Laboratory sprayers | Direct commodity-level declaration with `not_mapped` status |
| `DEMO_SPECIALIST_SERVICES` | Active tenant category with no shared-code assignment |

Direct fact IDs: `01a0cec7-e42e-75c0-8536-96977624837a` and `01a0cec7-e504-7786-9bcf-bd35a8f57d85`. Both were captured through the native declaration command, with one declared audit event each despite replay. The two categories and one mapping are explicit local demo provisioning; shared reference records are unchanged. Existing demo facts are preserved. Zero supplier/customer roles, operating-organization assignments or qualifications exist for this partner.

## Publication and checks

- Release 22 introduced direct UNSPSC display fields. CATL compiled section and browser both display `41101503` without requiring that it map to a category.
- Release **23** adds `partner.new`, retaining the other release-22 artifacts. 109 artifacts, Ed25519.
- Release ID: `2bd00161-5c1a-584a-816f-05e6cca5237e`; applied ID: `01a0ced3-8be7-749d-89e6-eb40b1a7dc60`.
- Active artifact hash: `ff39e5c625a74594887349c50c811da45356fb52b738773dcf7edf1c55145e21`.
- Compiled hash: `sha256:d61fc6fefdaff28208ee5c577fbce6869849a31bfe277e70bf40264c8b25658b`.
- Disposable PostgreSQL: migration lineage retained, direct declaration/read, retired-category capture denial, RLS, audit rollback, verification/archive, retries and qualification non-interference passed; all rehearsal data rolled back.
- Native CATL mapped/unmapped declarations, retries, dual-subject rejection, cross-tenant denial and compiled/browser display passed.
- Source tests cover role-free identity validation and registration-only authority not authorizing supplier onboarding.
- Master-data tests: **480 passed, 25 skipped**. Master-data and platform-host typechecks passed. CATL admin and owner both read the role-free case successfully, with validation `passed`.

## Completed registration and remaining UI boundaries

- Core registration case `3c87132b-d941-44a5-a84b-305dfa6eb42c`, code `BP-DEMO-REG-001`, is **applied** after refreshed normal CATL MFA. Admin submitted; owner approved both native workflow stages; admin materialized partner `01a0cee0-b3c7-7bd4-bd66-6dcb3bae7fd6`. Materialization replay succeeded. Database evidence records exactly one successful `PARTNER_REGISTERED` materialization and zero supplier/customer, operating-organization-assignment or qualification rows for this partner; therefore no role-owned company profiles were created.
- Create replay now compares the immutable creation snapshot with canonical storage defaults, the original maker and pinned release, rather than the evolved case projection. Live replay of the completed registration succeeds. Supplied source coordinates still fail closed; parser-generated undefined source keys are not treated as supplied coordinates.
- Dedicated browser route: `/mdg/business-partner/register`. Supports core organization draft capture, loading a case by ID, validation, submission, assigned independent review, materialization, refresh and normal MFA step-up. Only this exact tenant-native route bypasses the shell/directory company-selection gate; API permissions and all other commercial route gates remain unchanged. Identity changes reset local state; uncertain command retries retain their key while the screen remains mounted.
- CATL signed-in browser loaded the applied case and displayed the registered partner with HTTP 200 and no page errors. Browser execution of a new complete journey remains to be exercised; native API journey is complete. Three UI tests cover role-free payload/retry, tenant-state reset/permission gating and commercial-case rejection. Focused service tests cover native creation replay and changed-payload denial.
- Remaining: UNSPSC picker/capture UI, tenant-category/mapping administration and navigation integration. This screen intentionally does not offer draft editing or turn registration into commercial approval. No hidden company assignment or extra grants were introduced.
- Direct declaration references the current shared catalog identity/level. A separately versioned UNSPSC catalog/import model and versioned category coverage are not introduced here.

## Reusable operations

```sh
# Already applied in DEV; installers deliberately fail on replayed grants/DDL.
node tooling/scripts/local-dev/install-partner-direct-commodity.mjs --dry-run
node tooling/scripts/local-dev/qualify-role-free-registration.mjs
# Safe acceptance replay of the existing demo and case:
node tooling/scripts/verification/verify-catl-direct-commodity.live.mjs --run
node tooling/scripts/verification/verify-catl-role-free-registration.live.mjs --run
pnpm exec tsx tooling/scripts/verification/verify-partner-classification.disposable.mts
```
