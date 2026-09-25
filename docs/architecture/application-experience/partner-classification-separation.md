# Partner classifications and commercial decisions

Latest increment: [role-free registration and direct UNSPSC](./partner-core-registration-and-unspsc.md), release **23**. The category-based model described below is preserved historical implementation evidence; new native declarations now select UNSPSC directly. CATL core registration submit/independent approval/materialization and replay passed. The dedicated registration screen is implemented; UNSPSC picker/category-administration UI remains pending.

Requested 2026-09-23. **Status: implemented and activated in DEV. Release 20 introduced the split; release 21 adds readable category names/codes. CATL live command, MFA, audit and compiled-browser acceptance pass. Athyper/Technostat signed-in acceptance is not yet recorded (see limitations).**

## Authority boundaries

| Resource | Scope / meaning |
| --- | --- |
| `master.business_partner_industry_classification` | Existing partner-owned industry fact; no new role dependency |
| `master.business_partner_commodity_classification` | New partner-owned commodity fact, tenant/category/provenance/effective period/lifecycle |
| `master.commodity_category` → `master.commodity_code_assignment` → `shared.commodity_code` → crosswalk | Existing reference classification and mapping evidence, not qualification approval |
| `control.business_partner_qualification_classification` | References from separately scoped commercial qualifications to one or more facts |
| Existing qualification, decision scopes, customer/supplier roles and company usage | Retain their current commercial authority; a classification does not authorize a transaction |

## Implemented

- Canonical additive DDL and fresh-build manifest entry. No role/company/organization columns on the commodity fact.
- Same-tenant/same-partner composite foreign keys for facts and qualification references; forced tenant RLS. Provenance and identity immutable; updates require version/actor evidence. No physical deletion of fact history. Verification requires a checker distinct from the creator; declaration/import does not imply verification.
- Dedicated tenant-scoped permission catalog: `neon.business_partner_classification.read`, `.declare`, `.verify`, `.archive`. Verify requires MFA/SoD; archive requires MFA. User-approved DEV grants give read/declare/archive to athyper.admin, tksa.admin and catl.admin; read/verify to catl.owner. No equivalence with commercial approval permissions, company grants or MFA bypass.
- Additive backfill with one retained source snapshot per legacy capability. Identical partner/category/effective-period/status coordinates merge; differing evidence stays in the origin table. Conflicting periods or lifecycle states are not silently collapsed.
- Existing qualification references are reconstructed from explicit legacy capability IDs and included commodity-category scopes, preserving role matching. These are evidence references, not new approvals. Existing qualification rows/scopes are never rewritten.
- Migration retries are idempotent; changed legacy source snapshots or conflicting target coordinates fail closed for explicit reconciliation.
- Authorized native reader and compiled Commodities provider retrieve active effective facts, mapped commodity codes and crosswalk evidence without querying roles, companies, operating organizations or qualification decisions. The reader has bounded, actor/tenant/partner-bound pagination.
- Native `declare`, `verify` and `archive` commands enforce permission, active parent/category, source/date validation, expected version, independent checker, atomic audit and immutable idempotency receipts. Unknown role/company fields are rejected. Receipts identify the record/sections to invalidate.
- New governed case materialization writes classification facts and lineage; `commodity_classification` is supported by child activation. Legacy captured `commodity_capability` drafts remain activatable through retained origins; new legacy writes fail closed. The development fixture writer selects the independent resource after upgrade.
- Qualification creation accepts `commodityClassificationId` instead of a legacy capability ID, validates the same partner/category/effective period, and records its fact reference. Role, organization, company, review and eligibility restrictions remain on the qualification. Decision rejection or permitted approval expiry leaves the fact unchanged.
- Compiled UI separates Identity, Commodities, Qualifications and Certificates. Certificate DTO mapping uses only previously authorized fields and does not reconstruct withheld attachments. Empty Qualifications no longer hides commodities/certificates.
- The reusable core seed now detects installed classification storage and adds the same three category/assignment/fact rows per tenant. Existing shared crosswalks retain their stored mapping type, confidence, provenance and verification state.

## Verification

`pnpm exec tsx tooling/scripts/verification/verify-partner-classification.disposable.mts`

Label-gated disposable test, all changes rolled back:

- Existing baseline: 73 capability origins → 73 facts and 59 qualification references.
- Duplicate fixture: 75 origins → 74 facts and 60 references; two-pass replay unchanged; every original snapshot retained.
- Legacy capability and qualification rows compare identically before and after backfill.
- Each of Athyper, Technostat and CirrusAtlantic can own/read a declared commodity fact without a customer/supplier role or company assignment.
- Application-role RLS isolation, wrong-tenant partner FK rejection and physical-delete rejection pass.
- Master-data source typecheck passes.

Additional disposable checks now pass: declaration, independent verification/archive, stale-version denial, atomic rollback on audit failure, safe replay, idempotency conflict, denied scope input, permission denial, cursor isolation, legacy-writer rejection, commercial qualification creation/rejection/approval/expiry without fact mutation, and repeatable crosswalk-populated demos for all three tenants.

## DEV activation and live evidence

- The current DEV upgrade was first rehearsed with rollback, then committed explicitly. DEV had **zero** historical capability rows; the disposable baseline provided the populated migration test. DEV now has one active declared demo classification in each tenant, with zero demo customer/supplier roles or company assignments.
- Signed publication `metadata.compiled_entity.business_partner`, release **21**, 108 artifacts, Ed25519; active artifact hash `403c08d2c0e7aa26127bed0e06ab52df28b5a136b811705cc1dd495199365f62`. Only the classification/split-surface artifacts changed; other release-19 artifacts were carried forward.
- CATL admin declared synthetic acceptance fact `01a0ce75-d75f-7b6c-b038-0b5c7a060dd5`; CATL owner independently verified it with normal MFA; admin archived it with normal MFA. Three exact audit-contract events exist, with different maker/checker actors and no duplicate events on replay. The reusable demo declaration remains active and unchanged.
- Owner declaration and admin verification are denied. CATL reading Athyper's partner returns 404 without data. Compiled Commodities, Certificates and Qualifications endpoints return 200 without company/organization inputs.
- Signed-in CATL browser displays the category name, UNSPSC `41100000` and its reference mapping; Certificates displays the independent demo evidence; Qualifications is empty. No browser page errors. The map remains **PARTIAL / confidence 35 / AI_GENERATED / unverified**, not an approved or verified assertion.
- Existing BP2-05 hierarchy/domain/category/certificate rejection SQL passes against DEV with rollback. Master-data tests and master-data/host/relay typechecks pass.

## Reusable commands

```sh
# Explicit installer: dry-run default; refuses a second historical backfill after cutover.
node tooling/scripts/local-dev/install-partner-classification.mjs --dry-run
# Existing core seed automatically includes commodities when the new storage exists.
node tooling/fixtures/business-partner-core/seed.mjs --dry-run
pnpm exec tsx tooling/scripts/verification/verify-partner-classification.disposable.mts
node tooling/scripts/verification/verify-partner-classification.live.mjs --run
```

Native API: `GET /api/neon/business-partners/:businessPartnerId/commodity-classifications`; `POST` the same path plus `/declare`, `/verify`, or `/archive`. Commands require an idempotency key; verify/archive require a classification ID and expected version. These are native commands, not generic table-update endpoints. The published section is a read surface; no new standalone classification-edit form is claimed.

## Acceptance limitations

- Athyper's refreshed admin session is authenticated. Native and compiled commodity/crosswalk reads pass, as do cross-tenant denial (CATL and Technostat), declare → MFA archive, safe replay, idempotency conflict and ungranted verification denial. Synthetic fact `01a0cea2-6822-7ed7-88b3-1ad557354907` is archived with exactly one declared and one archived audit event; the original demo fact remains active. Repeat with `node tooling/scripts/verification/verify-partner-classification-athyper.live.mjs --run`. No permissions, roles or company assignments changed.
- Athyper browser acceptance remains blocked: the shell asks for a legal entity and company before opening the partner workspace. No company was selected to conceal this role-free navigation gap. Compiled Certificates and Qualifications also return 404; commodity sections return 200 with release 21's hash. Technostat's last checked `tksa.admin.json` was absent; its signed-in journey is still unclaimed.
- The existing qualification state machine permits approved → expired, not approved → suspended/revoked. This change preserves that restriction; it does not add a new revocation transition. Rejection and approval-expiry non-interference are tested.
- The new governed case materializer/activation functions are installed and checked in disposable PostgreSQL. The fresh role-free child-activation attempt is blocked before case creation: CATL admin has `neon.relationship.business_partner.read` only at operating-organization scope. The user approved a tenant read grant for **admin only**, but its transaction rehearsal rejected the incompatible scope and rolled back; no permissions changed. The remaining wiring problem is that commodity-only activation still requests the relationship read permission instead of dedicated classification authority. Do not widen the relationship permission catalog to bypass this. `verify-partner-classification-case.live.mjs --run` seeds one synthetic draft (`bf8aeb62-97e1-4cd2-b4e9-fc34aee11c68`) and resumes the API journey with stable idempotency keys. Draft seeding is test setup, not governed capture evidence; no case, approval or activation is claimed yet. The reusable active demo fact is unchanged.
- Banking readiness repaired: the stale exact-six wildcard permission count rejected the seventh, legitimate registration permission. Readiness now checks the explicit `meshAccountBankPermissions` catalog, including registration, without rejecting unrelated additional permissions. DEV `/readyz` returned HTTP 200 with all checks healthy; platform-host typecheck passed. This is readiness evidence, not broader Banking functional acceptance.

Use the explicit installer for existing databases; never run a historical backfill after the writer cutover. Fresh-build order is storage → backfill → permission catalog → legacy cutover. No production or automatic human permission grants are introduced.
