# Publication signing trust separation

## Status

The strict signing adapter, host configuration path and deployment-overlay inputs
are implemented. **DEV key and scoped publisher/verifier credentials were provisioned
and qualified on 2026-09-26.** The reviewed cross-domain manifest, production trust
inventory and running-host cutover remain pending. No production keys were accessed.
Unit-test keys are generated in memory and never deployed; the separate live DEV
private key was generated in memory and stored only in the DEV secret manager.

The inspected DEV API has `ATHYPER_ENV=local` and publication API/authoring enabled.
To avoid breaking its existing startup before provisioning, local operation without
explicit trust settings retains the legacy resolver. That transitional path is NOT
trust-separated and must not authorize automated DEV releases. No activation path
was connected to the assessment-only policy.

STG/PROD publication now requires explicit trust configuration in config loading
and adapter construction. An explicitly supplied invalid configuration always
fails closed; it never falls back to the legacy resolver. These are source changes,
not a claim that production has deployed this version.
Enabled publication also requires a recognized explicit `ATHYPER_ENV`; absent or
misspelled values do not silently become local. Two existing config test fixtures
now explicitly select their intended transitional local profile.

## Ownership

- `server/packages/adapters/publication-signing/src/trust/signing-domain.ts`:
  strict public manifest parser, domain-scoped key resolver, fingerprint and expiry
  verification; no product or publication-approval logic.
- `server/packages/adapters/publication-signing/src/ed25519.ts`: existing signature
  primitives now accept narrow key-resolution ports, preserving legacy consumers.
- `server/apps/platform-host/src/config/publication-policy.ts`: environment/domain
  configuration only, no private key material.
- `server/apps/platform-host/src/composition/register-adapters.ts`: constructs the
  selected resolver and existing signer/verifier; no crypto implementation.
- Publication and authoring compose overlays: require explicit trust-domain and
  public-manifest inputs when next applied. Neither overlay was applied here.

## Manifest and trust rules

### Canonical naming

| Artifact | DEV name | Rotation rule |
| --- | --- | --- |
| Secret project | `athyper-publication-dev` | Stable across key rotations |
| Publisher identity | `athyper-publication-dev-publisher` | Stable across key rotations |
| Verifier identity | `athyper-publication-dev-verifier` | Stable across key rotations |
| Signing key ID | `athyper-publication-dev-signing-v1` | New version for new key material |
| Private reference | `PUBLICATION_DEV_SIGNING_PRIVATE_V1` | Versioned with key |
| Public reference | `PUBLICATION_DEV_SIGNING_PUBLIC_V1` | Versioned with key |

Production uses the equivalent `production` / `PRODUCTION` names, provisioned only
through authorized production operations. Names communicate ownership; UUIDs, ACLs,
pinned fingerprints and verifier policy enforce isolation. Manifest schema versions
are independent of key versions. Environment variable names retain
`PUBLICATION_TRUST_<ATTRIBUTE>`.

Do not rename IDs in historical signed artifacts or install old/new ID aliases for
the same fingerprint: manifest validation intentionally rejects material reuse.
Inspect installed-provider support before choosing the migration method. Supported
in-place display-name/slug updates preserve UUID-bound access. If unsupported,
replacement project/identity provisioning and controlled key transfer require their
own verified migration, followed by retirement only after consumers have moved.
Never regenerate a key just to correct its name.

`PUBLICATION_TRUST_MANIFEST_JSON` contains a reviewed public manifest:

```text
schema: athyper.publication-trust/1
keys[]:
  keyId
  domain: dev | production
  publicKeyFingerprint: sha256:<64 lowercase hex characters>
```

Fingerprints hash canonical DER SPKI Ed25519 public keys. The manifest requires
both domains so the declared inventories can be compared. Key IDs and fingerprints
must be unique, including across domains. Same-material aliases are rejected.
Manifest integrity and completeness must be controlled by deployment configuration
authority; the manifest cannot approve itself or prove that unlisted keys do not exist.

`PUBLICATION_TRUST_DOMAIN=dev` requires `ATHYPER_ENV=local` (the repository's current
DEV setting). `production` requires `staging` or `production`. `common` is not a
trust domain or deployment environment.

Local key references must match the selected domain's manifest entries. The strict
resolver rejects an excluded key ID before secret access. Every public-key resolution
must match its pinned canonical fingerprint. Every private-key resolution derives
the public key and checks the same pin before returning signing material. Malformed,
non-Ed25519, expired or mismatched material fails closed. There is no key cache in
the strict resolver, so a cleared/revoked provider reference is not retained by it.
This does not promise instantaneous revocation across provider caches or operations
that already resolved material.

Verification-only processes reject private-key configuration and signing calls.
Authoring/compile/dispatch roles select signing access; the existing operation-level
authorization remains required. No signer or verifier grants approval authority.

This protects against relabelling a DEV signature with a production key ID: the
signature must verify under the independently pinned production public key. An
evidence `kind` field is not the sole separation control.

## Required secret-provider ACLs — DEV provisioned, cross-domain verification open

Provision independent DEV and production Ed25519 keys through the approved secret
management process. Do not copy the current DEV key into a production slot.

| Identity | Allowed secret access |
| --- | --- |
| DEV publisher | DEV private/public references only |
| DEV verifier | DEV public references only |
| Production publisher | Approved production private/public references only |
| Production verifier | Approved production public references only |

Use separate provider identities and scoped paths/projects as supported by the
existing Infisical deployment. The application resolver restricts which references
it requests, but cannot establish provider-side isolation if its token is broad.
Verify negative provider access independently: DEV credentials cannot resolve
production private material, and verifiers cannot resolve private material.
Never log private values or paste tokens into a handover.

Before enabling strict mode on DEV:

1. Inventory current and historical signing IDs and rollback dependencies.
2. Provision or identify distinct approved keys; obtain public fingerprints through
   the authorized key-management process. Public fingerprints are not secret values.
3. Establish and verify scoped publisher/verifier credentials.
4. Supply the reviewed manifest, domain and local opaque key references.
5. Verify key health, real signing/verifying, foreign-domain rejection and historical
   release verification before enabling automated publication.

Current host wiring still exposes one local key ID/public reference. Do not remove
historical keys or pretend key rotation/rollback is covered by that slot. Where
multiple historical IDs must remain trusted, extend the host's explicit local-key
configuration and test that migration before cutover. The adapter already accepts
multiple local IDs, each with a distinct manifest pin; reference replicas for one
ID must all resolve to that same key, not unrelated overlap keys.

No production deployment or production secret-policy change is authorized by this
DEV implementation checkpoint. The production emergency procedure remains a
separate pre-PROD requirement; it must not bypass signature integrity.

## Verification scope

Tests use two independently generated Ed25519 pairs. They verify valid same-domain
signatures, DEV-signature rejection under both DEV and forged production IDs,
rejection of reused fingerprints, wrong secret aliases, verification-only restrictions,
expiry and configuration failures. An AST test enforces adapter dependency ownership.

Host tests cover required production trust, environment mismatch, transitional local
startup, and no fallback after invalid explicit configuration. Provider IAM/ACLs,
real key provisioning and deployed cross-environment replay are not established by
these unit tests. A manifest fixture containing dummy fingerprints is never a live
trust configuration.

### Source verification — 2026-09-26 (before operational provisioning)

| Package | Typecheck | Tests |
| --- | --- | --- |
| Publication signing adapter | Pass (source and tests) | 15 passed / 4 files |
| Publication service | Pass (source and tests) | 301 passed / 35 files |
| Platform host | Unchanged single preflight repository import error | 536 passed, 25 skipped / 74 files passed, 3 skipped |

DEV API container health remained healthy. Its configured environment has neither
`PUBLICATION_TRUST_DOMAIN` nor `PUBLICATION_TRUST_MANIFEST_JSON`, so live DEV remains
on the explicit local legacy path. No key rotation, provider ACL deployment, compose
overlay application, database change or release activation was performed at that checkpoint. Container
health is not authenticated login or publication acceptance evidence.

### Live DEV provisioning — 2026-09-26 (original receipt, before name migration)

Operational entry point:
`server/db/scripts/operations/publication/provision-dev-trust.mjs`
with explicit `--confirm=DEV-SEPARATE-PUBLICATION-TRUST`.
It adds an independent DEV project and identities; it does not alter existing
publication credentials, production projects or running deployment configuration.

| Coordinate/check | Observed result |
| --- | --- |
| Key ID | `athyper-dev-separated-publication-v1` |
| Public SPKI fingerprint | `sha256:17d9e7f7a4941edd93c9f5259395938f75004c8cce8e33a5e28d986c169c8646` |
| Secret project | `athyper-dev-publication-separated-v1` |
| Publisher | Read access to the exact DEV private/public references only |
| Verifier | Read access to the exact DEV public reference only |
| Live sign/verify | Passed |
| Verifier reading DEV private key | HTTP 403 |
| Publisher reading existing old-project DEV public key | HTTP 403 |
| Verifier reading existing old-project DEV public key | HTTP 403 |
| Production secret access | Not tested; not authorized by this DEV task |
| Host cutover / release approval / activation | Not performed |

The identities have no-access organization/project base roles and narrowly scoped
additional read privileges. Tokens expire after seven days; renewal is an operational
requirement, not automatic permanent authority. Runtime credentials are stored in
mode-0600 files beneath the operator's `.athyper/instances/dev/secrets/publication-trust-v1/`.
Do not commit or display `state.json` or token files. `qualification.json` contains
the sanitized observed-result receipt. Negative probes checked reads, not writes.

These observations establish DEV private/public separation and a DEV cross-project
denial, **not live production isolation**. Complete the reviewed manifest with an
authorized production key ID and canonical public fingerprint. Do not fabricate a
production pin, generate a production private key in DEV, or weaken manifest
validation to bypass this prerequisite. Existing deployment trust remains unchanged.

Country is not ready for manual acceptance: persisted authoring/compilation-source
integration, runtime qualification, reviewed authorization assignments, applicable
publication authorization and signed per-target activation remain to be completed.
Assessment-only policy evidence cannot substitute for approval or activation authority.

### DEV name migration and fresh qualification — 2026-09-26

The installed Infisical source exposes `PATCH /api/v1/projects/:projectId` with
`name`/`slug`, and `PATCH /api/v1/identities/:identityId` with `name`. Both updates
were exercised successfully. **No replacement project, private-key copy, key
regeneration, credential rotation or object deletion was needed.** UUIDs and
existing grants remain attached to the same objects.

`server/db/scripts/operations/publication/normalize-dev-trust-names.mjs`
requires `--confirm=DEV-UNUSED-TRUST-NAMES`. Before mutation it checks live object
coordinates, rejects references in all publication/runtime table JSON payloads and
inspects DEV container environment, command, entrypoint and mounts. It checkpoints
each update and retains the original qualification receipt. The initial inventory
SQL attempt failed closed before any writes; after correcting SQL formatting,
the full inventory and migration succeeded.

Observed reference inventory: 26 Studio + 12 Neon + 12 Mesh tables, zero matches;
33 DEV containers, zero matches. Repository search found the provisional names only
in the provisioning script and this historical documentation. This is not an
exhaustive inventory of external consumers, mounted-file contents or object storage.
No active publisher was configured with these new identities. The unused local
key designation was changed to `athyper-publication-dev-signing-v1`; no persisted
release/signature or historical receipt was rewritten.

| Migrated object | Current name |
| --- | --- |
| Project `e8bd7797-3024-416d-baa4-a5f8e44e2c30` | `athyper-publication-dev` |
| Publisher `12570608-cb05-4085-8cc5-97da1103e18a` | `athyper-publication-dev-publisher` |
| Verifier `feea79d7-bf5e-49f4-9ad4-f81d5d2a9471` | `athyper-publication-dev-verifier` |

At `2026-09-26T11:13:45.654Z`, the updated provisioning/qualification script verified
live object names/base identity roles and the unchanged pinned fingerprint, performed
real signing/verification, and observed HTTP 403 for verifier-private access and
both cross-project reads. Scoped privileges and token credentials were not changed.
The tokens still have their original seven-day lifetime; renaming does not renew it.

Runtime-only receipts (beneath `publication-trust-v1/`, never commit credentials):

- `qualification-before-name-migration.json`: preserved original observation.
- `name-migration.json`: migration coordinates and reference-inventory results;
  deliberately records that qualification is a separate subsequent gate.
- `qualification.json`: fresh post-migration signing/ACL qualification.

The canonical provisioning script now uses the corrected names and rejects live
name/base-role drift. The migration script remains explicitly DEV-only. Neither
script authorizes release approval, host cutover or Country activation. Production
pin/manifest review and production access verification remain pending.

Fresh post-migration checks: signing-adapter source/test typechecking passed;
15/15 tests across four files passed; both operational scripts passed `node --check`.
DEV API remained running/healthy without restart. Publication-service and host
suites were not rerun for this operational-only name migration; their earlier
counts are historical, not fresh acceptance measurements.
