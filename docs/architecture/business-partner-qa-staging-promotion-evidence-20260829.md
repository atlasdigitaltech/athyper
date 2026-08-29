# Business Partner P1–P8 QA qualification and staging promotion — 2026-08-29

Scope: local QA qualification and immutable-digest promotion into the staging release manifest. This record contains no passwords, tokens, private keys, browser sessions, invitation secrets, or personal data. It is not human release approval.

## Qualified image set

- Source revision recorded by the controller: `37008726bd85bb67cb9bf583b00e03cedbfa2851`
- Runtime server: `sha256:64a5b8e767ed59bd5091ea16d0f3d8b06e4e04448836ca7e6f80e8155fd83196` (UID `1000`, `node`)
- Neon Web: `sha256:b02759aaf9dd379660a27f509f783197d62377282b0b65624805b0355262d29f`
- Mesh Web: `sha256:a436f882d52a8f176faa220a3936142cb48271015eea3f79e994931934aef850`
- Studio Web: `sha256:63c069d231f1490248832b38c7ad0c57ce0520c9123f018ac128dd7ef07a8885`
- Keycloak: `sha256:22ab45da7d792f1726b2e84fe7d9fca26bd72d610c068a21b7da711511614cbe`
- QA deployment receipt: `20260829T093435Z-up`
- Post-qualification QA backup: `20260829T100545Z`

The QA and staging image manifests have exact digest and source-revision parity. The staging rehearsal controller reports all five required image comparisons as matching and rebuild is forbidden.

## Migration compatibility repair

The first QA pass found two older-foundation compatibility defects and stopped before application promotion:

1. Older plane databases lacked the `business_partner_request_event` audit reference row. The additive `20260829_business_partner_audit_contract_baseline.sql` migration now installs v2 only when absent, before the checksum-preserved v3–v5 upgrade chain.
2. The historical NEON request guard used compact SQL formatting while the existing immutable transition migration expected spaced SQL. `20260829_neon_business_partner_request_guard_compatibility.sql` normalizes only that verified pre-transition body before the existing migration runs.

Both failed transactions were proven rolled back before their exact failed ledger rows were removed. The rebuilt image then completed all manifests. Final ledgers are STUDIO `32 applied / 0 failed / 0 applying`, NEON `57/0/0`, and MESH `35/0/0`.

## QA database and identity qualification

- Database contract tests: `144/144`; database TypeScript typecheck: pass.
- Canonical three-plane manifest: version `2.0.1`, SHA-256 `b3f2b6262ba4efb94f4d0a1fbd63d9e3c7fedbcebb96425efac6ccdc0a56adeb`.
- Context verification: STUDIO `28/28`, NEON `151/151`, MESH `54/54`; three application projections per plane.
- Keycloak: 161 governed demo users and 24 fixture organizations present. Authorization-v2 reconciliation converged to `233` managed memberships with zero remaining operations, conflicts, deletes, user mutations, or unmanaged-user changes.
- Local qualification authority overlay: NEON `150 users / 816 scope assignments`, MESH `47/192`, STUDIO `4/4`; `member_companies` propagation remains disabled.
- Runtime tenant-isolation probe: three tenants × six relations × three planes = `54` checks and zero cross-tenant rows.
- RLS catalogs: STUDIO `235`, NEON `473`, MESH `209` tenant-scoped table parents; every parent has ENABLE/FORCE RLS and policy coverage.
- SECURITY DEFINER catalogs: STUDIO `75`, NEON `74`, MESH `71`; zero ownership, PUBLIC grant, search-path, or projection-role failures.
- Governed local fixture pack: `development.business-partner-two-tenant.v2`, `71` partners and `70` assignments. Visibility is CATL operations `30`, Athyper APAC `20`, Athyper EMEA `20`, people `0`, finance `0`.
- Active QA runtime descriptor: `business_partner/entity_runtime`, exactly one required and visible identity field (`code`).

STUDIO has no active generic field-policy bindings or published PII fields in this local QA catalog; the modernized verifier records this as readiness warnings and reports no invalid field coordinates. Studio and Mesh have no active generic entity descriptors, so their identity checks skip by contract.

## Staging gate status

The exact qualified digests are recorded in `deploy/image-sets/releases/stg-local.yaml`, but staging was not started. The controller and rehearsal remain fail-closed because the environment-owned `provider.env` is absent and these SES values have not been supplied by the staging operator:

- `ATHYPER_ENV`
- `EMAIL_PROVIDER`
- `SES_REGION`
- `SES_CONFIGURATION_SET`
- `SES_FROM`
- `SES_EVENT_QUEUE_URL`
- `SES_EVENT_REGION`

The staging qualification root also lacks the governed sanitized-data manifest, pre-migration backup/restore evidence, provider readiness, email/web-push canaries, and provider-failure exercise. Publication canary inputs are absent (`PUBLICATION_CANARY_API_URL`, bearer token, release ID, publication key, tenant ID), and no signing-key/secret-store material is present in the staging instance secret inventory.

Authenticated browser execution remains gated by stored sessions or a governed test password and by customer/workforce lifecycle fixture IDs; the repository has no supported provisioner for those lifecycle rows. No ad hoc principals, requests, passwords, provider settings, evidence, or human approval were fabricated.

## Remaining release-owner actions

1. Supply the staging provider contract and secret-store/signing inputs through the environment owner.
2. Create the required sanitized staging evidence and start STG through the controller, which captures the pre-migration backup before applying this exact image set.
3. Provide governed browser sessions plus customer/workforce lifecycle fixture IDs.
4. Run outage, notification, signed publication canary, exact rollback, and isolated restore qualification.
5. Have the authorized release owner review retained evidence and record approval.
