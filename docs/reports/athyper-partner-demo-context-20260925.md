# Athyper BP multi-company DEV preparation

## Applied

- Existing tenant-owned Aster (`a9d3f90c-27d5-5e02-8214-c648752def4d`) and Maya (`7c304ec6-ef69-54ca-8238-3a8b46157f75`) retained.
- Six supplier and six customer profiles, all Draft: both partners across `amre`, `amre.ops`, and `acfb` (two legal entities).
- One tenant-owned draft demo payment term.
- Six Pending qualifications and six restriction examples (current, scheduled, ended for each partner), using the existing decision-view fixture contract. Restrictions prohibit payment within their stored coverage; they are not approvals or payment setup.
- No capability flags, grants, existing authoring definitions, or CATL data changed.

## Verification

- Three decision seed tests passed (CATL compatibility, Athyper isolation, unsupported tenant rejection).
- Both fixture scripts passed transactional rollback before application and rollback replay after application.
- Profile script requires local DEV Docker identity, expected database, fixture-owned parents and three named active companies.

## Remaining blockers — not ready for signed-in verification

- The active native descriptor is named `master.business_partner`; the current page requests `business_partner`. These must not be treated as interchangeable without validating the contract. CATL also has a separately aligned local graph preview. Copying its signed tenant-specific artifact is not an Athyper publication path.
- The shared compiled release 22 exists; that alone does not establish the native descriptor needed by Manage. Do not republish it blindly to fix this error.
- Existing local scoped publication credentials explicitly allow CirrusAtlantic, not Athyper. No credential scope was broadened.
- After the requested refresh, the saved Athyper admin session authenticated successfully. IAM reports BP, qualification, certificate, and masked banking read permissions. This is not proof of every section-specific scoped authorization.
- Signed-in browser QA confirmed the company chooser exposes 17 legal entities / 34 companies. Selecting `AMRE` updates the header to Athyper Malaysia Real Estate, then Manage reproduces the record/descriptor error. The login/context picker is therefore not the immediate blocker.
- Each sampled company has procurement, finance and people operating-organization assignments. Selecting one arbitrarily would hide a real ambiguity. Verify authorized options and operation-specific organization resolution before claiming seamless context selection.

## Commands

```sh
node --test tooling/fixtures/business-partner-core/decision-view-seed.test.mjs
node tooling/fixtures/business-partner-core/decision-view-seed.mjs --dry-run --tenant=athyper
node tooling/scripts/verification/seed-athyper-partner-profiles.dev.mjs --rollback-dev
```

Next: use an authorized Athyper metadata author/reviewer path to establish the current native contract, then verify section read access and company switching with the refreshed actor. No permissions should be inferred from the user's admin name or home company.
