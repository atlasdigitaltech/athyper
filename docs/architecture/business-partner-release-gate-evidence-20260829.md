# Business Partner P1–P8 DEV release-gate evidence — 2026-08-29

Scope: local DEV remediation and qualification only. This record contains no passwords, tokens, private keys, browser sessions, invitation secrets, or personal data. It is not production approval.

## Recovery point

- Backup ID: `20260829T084754Z`
- Backup manifest: `/home/chandravel_natarajan/.athyper/backups/dev/20260829T084754Z/backup.json`
- Controller receipt: `/home/chandravel_natarajan/.athyper/instances/dev/receipts/20260829T084754Z-backup.json`

## Canonical seed and IAM

- Three-plane manifest version: `2.0.1`
- Manifest SHA-256: `b3f2b6262ba4efb94f4d0a1fbd63d9e3c7fedbcebb96425efac6ccdc0a56adeb`
- Context verification: STUDIO `28/28`, NEON `151/151`, MESH `54/54`
- Active application projections: `3` on each plane
- Keycloak reconciliation: applied no-op; no conflicts, deletes, or user mutations; `233` managed memberships

## Database and authorization

- Forward-migration ledgers: STUDIO `31 applied / 0 failed / 0 applying`; NEON `55/0/0`; MESH `34/0/0`
- RLS catalog: STUDIO `236`, NEON `474`, MESH `210` tenant-scoped table parents; every parent has ENABLE/FORCE RLS and at least one policy
- Runtime tenant-isolation probe: three tenants × six authorization relations × three planes; `54` checks and `0` cross-tenant rows
- SECURITY DEFINER catalog: STUDIO `75`, NEON `74`, MESH `71`; `0` owner/PUBLIC/search-path failures
- STUDIO field authority: `37` current fields, `0` broken coordinates. DEV has no active field-policy bindings and no published PII fields; both are recorded readiness warnings.

The ownership audit recognizes two explicit classes: six mutation routines owned by the NOLOGIN/NOBYPASSRLS projection owner, and deployment-owner routines. Routines declaring `row_security=off` must remain owned by an RLS-bypass deployment boundary or PostgreSQL fails closed. PUBLIC execution remains revoked for every SECURITY DEFINER routine.

## Governed DEV fixtures

- Fixture pack: `development.business-partner-two-tenant.v2`
- Applied: `71` partners and `70` commercial-scope assignments
- Visibility checks: CATL operations `30`; Athyper APAC `20`; Athyper EMEA `20`; people and finance scopes `0`
- Runtime publication: `metadata.entity.business_partner`
- Source release: `95a56e3f-d1e7-535e-a5cc-514b75e3ced6`
- Artifact SHA-256: `99cb0eb7ae2f23d5c54654c8dc0bda89f760b2219fd4cbbdfb44513aff27d933`
- Compiled SHA-256: `7794e41558a6fa11606628fb6f30f94672830a927e5592d06f29eb060a661387`

## Verification and package

- Database contract tests: `143/143`
- Database TypeScript typecheck: pass
- Three-plane DDL model: pass (`227` STUDIO, `211` NEON, `203` MESH ordered entries)
- Runtime container: `athyper/runtime-server:p1-p8-release-gates-20260829`
- Immutable image digest: `sha256:e2a71df814bf01bee2d73367cfb66a1a730c5de3e6ec3cd52907aac68572734f`
- Container user: UID `1000` (`node`)
- Packaged forward runner and new migration files: pass

## Environment-gated release work

The following are deliberately not marked complete:

- Authenticated browser qualification needs a reachable ingress plus production/staging stored sessions or credentials. Customer/workforce lifecycle IDs need a supported governed fixture provisioner; no such provisioner is currently present, so no ad hoc lifecycle rows were inserted.
- Signed STUDIO outage/canary/rollback qualification needs staging secret-store access, signing keys, publication process flags, bearer token, release ID, publication key, tenant ID, and an API endpoint. Local DEV publication flags remain disabled.
- Release-owner approval must be recorded by the authorized human owner after reviewing this evidence and the staging results.
- The legacy `db:verify:identity-header` check still targets removed `control.entity`/`control.entity_version` tables. It was not part of the three requested security-verifier replacements and remains a separate modernization item.

One local DEV database-admin credential was rendered by a failed URL-encoding rehearsal before output sanitization was corrected. It is not included in this evidence file; rotate that local credential before sharing raw terminal/session traces outside the trusted development environment.
