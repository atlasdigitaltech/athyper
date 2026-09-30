# DEV platform publication workload checkpoint

This follows [the live baseline and draft disposition](country-publication-baseline-20260927.md).
Fresh sanitized live inventory: [JSON receipt](country-publication-workload-20260927.json).
Local/repository receipts are editable evidence, not immutable audit storage.

## Implemented and deployed

- Added a dedicated `PUBLICATION_WORKLOAD_CONFIG`, independent of the legacy
  `ATHYPER_DEV_PUBLICATION_CONFIG`. It accepts authority coordinates and credential
  hashes only, not an entity, target list, approval or source graph. It validates
  the authority tenant against `PLATFORM_AUTHORITY_TENANT_ID` and rejects QA,
  staging and production environments.
- Generic workload execution uses this dedicated configuration; ordinary request
  IAM and the legacy publication configuration are unchanged.
- Added a worker split-artifact adapter in
  `composition/shared/publication/compiled-runtime.ts`, supplied at the existing
  `registerServices` → `registerPublication` dependency boundary. Concrete target
  qualification providers are resolved lazily after service registration.
- The adapter reloads the existing scoped, approval-enforcing
  `publication.fn_compiled_entity_compilation_source` at compile/sign/dispatch,
  verifies exact immutable source correspondence, reruns target qualification,
  and compares regenerated split projections against the supplied projection.
  No mutable draft, entity-name branch, fake signature, direct activation or
  source-pin substitution is used.
- This adapter currently supports the existing read-only system-product graph
  profile. It does not claim arbitrary graph-shape support. Its closed registry
  vocabulary is checked alongside actual callable/capability qualification;
  a registered identifier alone is not a healthy dependency.
- The qualification digest is deterministic evidence of the performed checks,
  **not** a human approval or durable audit receipt. The existing SQL source
  function is the persisted approval boundary. Artifact signatures remain the
  responsibility of the existing signer/verifier pipeline.

## Live operations

Provisioned only the two platform workload roles under authority tenant
`11111111-1111-4111-8111-111111111111` using the existing audited provisioning
script's new `--workloads-only` option. Dry run rolled back successfully before
commit. No human grant groups were changed.

| Workload | Principal | Role | Exact permissions |
| --- | --- | --- | --- |
| Author | `cc0812fb-0873-456c-8236-9d31fb539ea5` | `dev.publication.author` | `studio.metadata.contract.edit`, `studio.metadata.contract.submit` |
| Publisher | `c0febdd1-491c-46b8-8113-160be767b88d` | `dev.publication.publisher` | `studio.metadata.contract.review`, `studio.metadata.contract.publish_automated` |

Existing private workload credentials were retained; the new mounted configuration
contains only their hashes. Both live containers mount it read-only at
`/run/publication-workload/server.json`. The source is the DEV instance's
`secrets/dev-publication-athyper/workload.json`.

The opt-in Compose overlay is `deploy/compose/instance/compose.publication-workload.yaml`.
It requires `PLATFORM_AUTHORITY_TENANT_ID` and `PUBLICATION_WORKLOAD_CONFIG_FILE`.
It was appended to the existing source Compose configuration and preview overlay;
only API and worker were recreated with `up -d --no-deps api worker`.
Both restarted healthy. Scheduler, customer assignments, signing keys and schemas
were not changed.

Observed live checks:

- Scoped compilation-source function exists; runtime and worker DB roles are
  members of the existing publication-service DB role.
- Mounted authority tenant and author/publisher IDs match the intended accounts.
- Workload endpoint without credentials: **401**.
- Both genuine platform credentials plus a deliberately nonexistent policy:
  **403 `PUBLICATION_WORKLOAD_POLICY_DENIED`**. No publication action occurred.
- Current admin and owner retained bearer tokens: expired, control session **401**.

## Fresh verification gates

| Gate | Result |
| --- | --- |
| Host full suite | 667 passed, 25 skipped; 87 files passed, 3 skipped |
| Host source typecheck | Only the existing `entity-case-preflight.ts` missing repository import remains |
| Studio authoring source/test typechecks | Passed |
| Studio authoring suite | 185 passed |
| Publication source/test typechecks | Passed |
| Publication suite | 309 passed |
| Workload provisioning script tests | 5 passed |

New host coverage includes independent configuration admission, wrong-environment
and tenant denial, source/target tampering, missing runtime/capability dependencies,
repeated qualification, projection/source mismatch, revoked persisted source, and
an AST import boundary. Adapter database tests use a mocked PostgreSQL driver;
they are not a live successful release or RLS acceptance test.

## Enrollment and remaining gates

Canonical draft remains `bded3c66-95b6-43b9-b8fd-df8e003e54e9`. Product, contract
and descriptor hashes were refreshed and match the baseline exactly. The older
draft remains preserved. No provenance was rewritten.

A policy candidate is prepared privately at
`~/.athyper/instances/dev/secrets/dev-publication-athyper/policy-candidate.json`,
binding those pins, all three targets and the platform workload IDs. It is **not
enrolled or approved**. At this checkpoint there are zero publication-policy
definitions and no Country release/activation.

Fresh browser password + OTP is required for `platform.admin` to propose and
`platform.owner` to independently activate through the restricted control API.
Do not use maintenance SQL to insert approval, manufacture MFA, reuse expired
tokens or call the service with a fabricated verified context.

After enrollment, execute the real workflow and inspect qualification, signing,
deployment and per-plane activation results. Healthy startup and passing mocked
adapter tests do not prove those live steps will pass. Country is not ready for
manual application testing yet.
