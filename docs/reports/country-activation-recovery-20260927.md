# Country activation recovery — 2026-09-27

## Live result

Release `1efcf86a-75e3-4a79-9154-ea62f5abdc7d`, number 1, is activated in
DEV Studio, Neon and Mesh. The adjacent JSON records each database's active
head, applied release, signature-verification evidence and deployment.
All targets use the same approved source revision
`01a0de4c-fb22-753e-8f4e-1d5cdf97d45b`, with independently hashed target artifacts.
Each existing `shared.country` table still has 247 records. No table or UUID was
replaced. No direct activation writes, altered approvals or duplicate releases
were used: the existing failed compilation job was retried through BullMQ and
the normal compile/sign/dispatch/apply pipeline completed.

| Plane | Deployment | Applied release | Acknowledgement |
| --- | --- | --- | --- |
| Studio | `01a0e14b-c32d-70ad-99c1-b0737ed6ad85` | `01a0e14b-c3b6-7dec-8926-881234ffc023` | `01a0e14b-c3c3-7e32-95ac-c28ce3e00449` |
| Neon | `01a0e14b-c2b5-7759-97f0-9ffc15934f6d` | `01a0e14b-c387-73b0-90f5-17fa09561d41` | `01a0e14b-c39f-7ea4-a944-efd04fdab91d` |
| Mesh | `01a0e14b-c2b5-78eb-a829-8d5eee60c247` | `01a0e14b-c351-78ad-b73a-0e3db00eaef7` | `01a0e14b-c36a-7c12-908b-333f10eab112` |

All acknowledgement hashes match their target activation heads. Authority
deployment coordinates are `local` / `*`, as in the existing pipeline; this is
not proof of rollout to QA or any other instance. Only the DEV containers and
DEV databases were changed/inspected here.

## Projection cause and regression

Host qualification used Studio authoring graph canonicalization, while worker
compilation used publication-signing canonicalization. The former sorts
selected top-level arrays (`fields`, `operations`, etc.); the latter preserves
array order. Runtime artifact hashes therefore differed on real content.

Qualification now imports the same signing canonicalizer used by authority
compilation. Source graph pin validation still uses its original authoring
contract; no historical source hashes were rewritten. Mismatch checks remain.
The regression fixture has differently typed fields deliberately ordered to
distinguish the canonicalizers, accepts the actual signed-format projection
through compile/sign/dispatch, and rejects the graph-normalized alternative.
The explicit AST import allowlist was updated; no product-name branches added.

The initial diagnostic suggestion of double JSON hashing was incorrect:
Studio's `sha256` handles string inputs directly. Changing just the byte hash
did not fix the live failure. The verified fix is canonicalization alignment.

## Signing reconciliation

The historical authoring signature under
`athyper-dev-publication-ed25519-20260905` was independently verified against
its original public key before cutover. Its canonical SPKI fingerprint is
`sha256:991a13cab4e7c9b916d1ac55d58a28ea6abc6612f61c0607c82a775ef6b583c9`.
Its persisted key ID, signature and release hashes were preserved.

API and worker now use the dedicated DEV Infisical publication project and
`athyper-publication-dev-signing-v1`, pinned to
`sha256:17d9e7f7a4941edd93c9f5259395938f75004c8cce8e33a5e28d986c169c8646`.
Live sign/verify succeeded; resolving the legacy ID with the new resolver was
rejected. All three newly signed runtime envelopes and target verification
receipts name the separated key. The legacy key was not added to that manifest.

Publication-only secret configuration leaves ordinary Infisical consumers
unchanged. Partial dedicated configuration fails closed, token files require
owner-only permissions, and both secret stores have lifecycle cleanup.

## Recreating the DEV workload

Include `deploy/compose/instance/compose.publication-trust.yaml` alongside the
existing source, preview and publication-workload Compose overlays. Do not
recreate API/worker with only the old base configuration: that does not carry
this dedicated trust cutover. Supply these non-secret coordinates and protected
file paths (never inline token/key contents):

```text
ATHYPER_INSTANCE=dev
PUBLICATION_SIGNING_KEY_ID=athyper-publication-dev-signing-v1
PUBLICATION_PRIVATE_KEY_REFERENCE=PUBLICATION_DEV_SIGNING_PRIVATE_V1
PUBLICATION_PUBLIC_KEY_REFERENCE=PUBLICATION_DEV_SIGNING_PUBLIC_V1
PUBLICATION_TRUST_DOMAIN=dev
PUBLICATION_INFISICAL_URL=https://secrets.dev.athyper.test:8443
PUBLICATION_INFISICAL_PROJECT_ID=e8bd7797-3024-416d-baa4-a5f8e44e2c30
PUBLICATION_TRUST_MANIFEST_FILE=/home/chandravel_natarajan/.athyper/instances/dev/secrets/control-api/trust.json
PUBLICATION_INFISICAL_TOKEN_FILE=/home/chandravel_natarajan/.athyper/instances/dev/secrets/publication-trust-v1/publisher-token
```

The mounted manifest/token paths are `/run/publication-trust/manifest.json` and
`/run/publication-trust/token`, read-only. Existing credential expiry still
applies; recreating a container does not renew credentials. Production custody
and trust provisioning remain outside this DEV change.

## Verification and manual handover

- Signing adapter: typecheck clean; 16 tests passed.
- Publication service: typecheck clean; 309 tests passed.
- Host: 673 passed, 25 skipped (88 files passed, 3 skipped). Typecheck retains
  only the pre-existing `entity-case-preflight.ts` missing
  `KyselyBusinessPartnerCaseRepository`, deliberately untouched.
- Live API and worker healthy; each web route responds HTTP 200. That is a
  reachability check, not authenticated list/detail or collaboration acceptance.

Manual routes, using an explicitly assigned ordinary tenant test account:

- https://studio.dev.athyper.test/app/entity/country
- https://neon.dev.athyper.test/app/entity/country
- https://mesh.dev.athyper.test/app/entity/country

Check list/detail, search/sort/paging, denied Country edits, comments and
attachments, ownership controls and cross-tenant isolation. Platform-control
governance accounts do not automatically receive these tenant application roles.
Browser acceptance and rollback were not exercised in this checkpoint. Release
1 has no preceding Country release to restore. Activation success is not a claim
that every manual acceptance scenario has passed. This local report is evidence
for DEV bookkeeping, not tamper-evident audit storage.
