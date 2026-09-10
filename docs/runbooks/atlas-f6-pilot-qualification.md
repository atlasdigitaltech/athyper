# Atlas F6 — pilot qualification

**F6 is closed for the current DEV CirrusAtlantic BP/Mesh pilot deployment.**
All ten gates passed against the same six healthy deployment image bindings.
The current [closure record](../architecture/business-partner/evidence/atlas-f6-phase-closure-distributed-20260910.json)
binds the receipts by hash; the [archived status](../examples/atlas-f6/pilot-status-closed-distributed-20260910.json)
records the qualifying gates. The earlier closure remains preserved separately.
A changed deployment requires requalification.

The [distributed inference reliability qualification](atlas-distributed-inference.md)
also passed. The [current pilot status](../examples/atlas-f6/pilot-status.json)
contains no blockers. Closure remains limited to the recorded pilot and fixtures.

### Current requalification — 2026-09-10

On the distributed inference API/worker image `aa9cff97b6a3cdda67dcc3481ae1b61cd8a343e84b57740758be331ada4b75db`,
Neon live-model/replay, document-grounded browser answers, deployed database
transaction probes and fresh disposable database suites for all three planes
passed. The six qualification-gate tests also passed. Previous receipts were
archived in `docs/examples/atlas-f6/archive-before-refresh-20260910T091357Z/`.

The first Neon arithmetic request completed with an incorrect answer, 42 instead
of 63. It is retained as `model-neon-refresh-first-attempt.json`. A separate new
request answered correctly and passed replay/provider-ledger checks. This is a
retained answer-quality failure, not a transient infrastructure failure or an
error-free assessment. Its cause has not been established.

All six personas authenticated. Elevated Neon and Mesh admin captures satisfied
live MFA policies, and the final persona gate passed. Studio model/replay and
accessibility checks passed; Mesh model/replay, second-entity execution,
foreign-account denial and cross-persona history denial passed. The feature
rollback rehearsal restored hybrid configuration with the API healthy and the
canonical data fingerprint unchanged. Positive Neon retrieval passed afterward.
Overall F6 is closed on the recorded distributed inference deployment.

## Delivered checks

| Area | Evidence and current result |
| --- | --- |
| Authenticated personas | `catl.admin` and `catl.owner` authenticated in Neon and Studio. Anonymous, baseline-MFA and same-tenant other-actor denials tested. Elevated Neon admin retrieval and persona checks passed. |
| Live model | Authenticated Studio, Mesh and elevated Neon questions returned 63 for 7 × 9 using pinned `qwen3:8b`; replay returned the same result with exactly one provider usage entry. |
| Database | Fresh canonical installs and retrieval/attachment-owner tests passed on disposable Neon, Mesh and Studio databases. Deployed Neon owner-write, permission-substitution and tenant-isolation checks passed inside a rolled-back transaction. |
| Rollback | Hybrid configuration was disabled and restored on the MFA-corrected API image. Authenticated Studio history remained available and the canonical document/revision/publication fingerprint was unchanged. This is a feature rollback, not an old-image or database downgrade. Grounded chat passed on this image; positive Neon retrieval was rechecked after restoration with elevated MFA. |
| Accessibility | Deployed Studio Atlas workspace passed scoped axe WCAG A/AA checks at 1440px and 390px, with keyboard focus entering the workspace. This is not a full application accessibility audit. |
| Second entity | Cirrus Mesh release 1 is AI-enabled. Live admin record summary selected `entity_read_record`, cited the authorized relationship and made zero provider calls. Foreign-account access and cross-persona history were denied. Global release 5 remains unchanged. |
| Release binding | Receipts include immutable API, worker, Neon web, Mesh web, Studio web and inference image digests. Mixed, missing or stale successful receipts cannot close the pilot. Deployment changes were observed during collection and earlier receipts were requalified or retained as historical evidence. |

## Issues found and fixed

1. Local chat and conversation admission consulted the permission list without
   applying the live authorizer's MFA and other policy requirements. The local
   host now supplies that authorizer to admission, generation policy and
   conversation access. Existing permissions were not relaxed. The admission
   revision advanced to `atlas-local-v4`; baseline Neon sessions now fail chat,
   document retrieval and conversation creation consistently. Studio's separate
   published permission policy still permits the qualified baseline Studio test.
2. The Neon foundation manifest referred to `ai/12_attachment_knowledge.sql`
   instead of the DDL-root-relative `planes/neon/ai/12_attachment_knowledge.sql`.
   The entry was corrected and placed before final security hardening. All three
   disposable clean-install suites then passed. No deployed schema change was
   needed for this path correction.

3. Live Mesh context admission used an unscoped single-record read before the
   account-scoped Records owner. The resolver now delegates Mesh relationship
   admission to the scoped owner, including account membership and row visibility.
   A regression test verifies that unscoped reads are not called and owner denial
   remains authoritative.
4. The deployed local registry/coordinator still had BP-only registration. The
   existing generic entity-record tool, discovery coordinator and record gateway
   are now deployed, with plane-specific tool admission and published AI opt-in.
5. The deployed run repository and all three live planes lacked the F3 static
   guidance persistence support. The existing additive intent/feedback migration
   and current repository implementation are deployed; foreign-account denial now
   completes as guidance without a provider call or source disclosure.

Validation for the persona fixes: 364 AI tests passed, one skipped; AI package
implementation and test typechecks passed. Deployment module import passed. The
pilot gate's six tests verify missing evidence, failed persona proof, stale
bindings/timestamps, restoration, second-entity prerequisites and policy mismatch.
The tests are included by the existing `test:operations` glob.

## Running qualification

Read-only qualification and synthetic conversation tests:

```sh
node tooling/scripts/verification/qualify-atlas-f6-personas.mjs
node tooling/scripts/verification/qualify-atlas-f6-model.mjs studio
node tooling/scripts/verification/qualify-atlas-f6-model.mjs neon
node tooling/scripts/verification/qualify-atlas-f6-grounded.mjs
node tooling/scripts/verification/qualify-atlas-f6-accessibility.mjs
node tooling/scripts/verification/qualify-atlas-f6-second-entity.mjs
```

The persona and model helpers refresh normal saved sessions and preserve rotated
storage state with mode 0600. They validate the expected principal and tenant.
They do not manufacture elevated assurance. Neon positive tests require
`tests/e2e/.auth/dev/neon/catl.admin.json` to report `assurance: elevated` after a
normal interactive MFA/step-up flow. A routine authenticated baseline login does
not satisfy that requirement.

Database checks:

```sh
pnpm --filter @athyper/server-db test:integration:atlas-f5
node tooling/scripts/verification/qualify-atlas-f6-database.mjs
```

The first command creates and removes disposable databases. The second performs
owner/RLS probes against DEV inside a transaction ending in `ROLLBACK`, then reads
current release bindings. `disposable-database.json` records the successful F6 run
and its source hashes; fresh reruns must capture their actual result, not copy a
previous success onto a changed source tree.

An authorized DEV feature-rollback rehearsal uses:

```sh
node tooling/scripts/verification/prepare-atlas-f6-rollback.mjs
node tooling/scripts/verification/qualify-atlas-f6-rollback.mjs
```

Preparation resolves the active Compose configuration, including other owners'
overrides, and pins the current API digest. The rehearsal changes only API
configuration, uses `--no-deps`, and restores the captured configuration in
`finally`. It refuses an image changed since preparation. Its private files are
under `~/.athyper/instances/dev/deployments/atlas-f6-pilot-20260910/`; they can
contain secrets and must not be printed or committed. Review the current target
before a new rehearsal; the historical rollback receipt is not authorization to
overwrite a different deployment.

Finally:

```sh
node --test tooling/scripts/verification/atlas-f6-pilot.test.mjs
node tooling/scripts/verification/verify-atlas-f6-pilot.mjs
```

The final command exits nonzero while evidence is missing, failed, older than 24
hours, unhealthy, or bound to different deployed images/policies. A prior success
is not silently reused after a deployment change.

## Session capture for future requalification

The successful capture verified elevated Neon admin assurance. Normal login and token refresh do not
perform the issuer step-up. The interactive capture helper below posts the
existing CSRF-protected step-up form, lets the user complete issuer MFA, and
only replaces the saved file after checking the expected principal, tenant and
`elevated` assurance. It does not publish metadata or approve permissions.
The interactive success path was executed by the operator and the saved elevated session was verified against the live session endpoint.

Run in Windows PowerShell (requires Node/npm):

```powershell
$atlasRepo = "\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper"
$atlasCapture = Join-Path $env:USERPROFILE ".athyper-auth"
New-Item -ItemType Directory -Force -Path $atlasCapture | Out-Null
npm.cmd install --prefix $atlasCapture --no-audit --no-fund playwright@1.60.0
if ($LASTEXITCODE -ne 0) { throw "Playwright installation failed" }
& (Join-Path $atlasCapture "node_modules\.bin\playwright.cmd") install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium installation failed" }
$env:ATLAS_CAPTURE_PACKAGE_ROOT = $atlasCapture
$atlasHelper = Join-Path $atlasRepo "tooling\scripts\verification\capture-atlas-elevated-session.cjs"
foreach ($atlasTarget in @(
  @{ Plane = "studio"; Actor = "catl.owner" },
  @{ Plane = "studio"; Actor = "catl.admin" },
  @{ Plane = "neon"; Actor = "catl.admin" }
)) {
  $atlasOutput = Join-Path $atlasRepo "tests\e2e\.auth\dev\$($atlasTarget.Plane)\$($atlasTarget.Actor).json"
  node.exe $atlasHelper --plane $atlasTarget.Plane --actor $atlasTarget.Actor --output $atlasOutput
  if ($LASTEXITCODE -ne 0) { throw "Session capture failed; stop and resolve the sign-in/MFA issue" }
}
```

Complete each browser's sign-in and MFA. The helper saves and closes the browser
after verification; do not close it manually. Capture Neon last because its
elevation is short-lived. Do not share the saved files or authentication codes.

Mesh reconciliation is recorded in
`docs/examples/atlas-f6/mesh-baseline-reconciliation.verified.json`. Global Mesh
release 5 was imported into the Studio observation ledger for Cirrus as
`75674873-1b92-4100-b489-b5676ef7d1dc`. The source tenant remains null; the ledger
owner is Cirrus. The original runtime entity ID differs from Studio's global
entity ID, and neither was rewritten. No native release history was fabricated.

The migration `20260910_mesh_global_baseline_import.sql` adds an explicitly
versioned global-source observation with immutable provenance and existing tenant
RLS. Fresh DDL contains the same extension. The import preserves the complete
contract, descriptor, activation head and applied release, including source
signatures labelled unverified. It locks the source through the Studio commit,
rejects drift against release 5/hash, and is idempotent. Import rollback is an
append-only revocation; its dry run passed and the retained import is not revoked.

```sh
node --test tooling/scripts/verification/atlas-mesh-baseline.test.mjs tooling/scripts/verification/atlas-baseline-adoption.test.mjs
node tooling/scripts/verification/adopt-atlas-mesh-baseline.mjs # dry run
node tooling/scripts/verification/adopt-atlas-mesh-baseline.mjs --apply
node tooling/scripts/verification/adopt-atlas-mesh-baseline.mjs --rollback 75674873-1b92-4100-b489-b5676ef7d1dc # dry run
```

The tenant-fork bridge is now deployed and the authenticated publication is
complete. See `docs/examples/atlas-f6/mesh-publication.verified.json`:

- Cirrus native/runtime release 1: `0c4fcf5f-6ea4-491f-81fe-672c1b921afd`.
- Publication key: `metadata.entity.network_relationship.tenant.44444444-4444-4444-8444-444444444444`.
- New tenant identity: `253c9d44-311d-49ec-8f60-9d61527ceacc`; the operator scaffold
  created only a draft identity. Authenticated authoring created the change set.
- `catl.admin` authored and published; `catl.owner` independently approved.
  The signed Ed25519 artifact activated in Mesh and emitted its generation event.
- Original global release 5, contract, descriptor and source hashes are unchanged.
  The tenant runtime contract is preserved; `ai` is the sole descriptor delta.
- Activation locks and checks the source head before inserting the tenant head.
  SQL transaction probes passed for the current source, stale-source denial,
  global-key substitution denial and existing-head overwrite denial.
- Mesh also needed the existing operation-projection release-identity migration.
  The failed apply job was replayed with the same signed artifact after that fix.

Relevant commands (publication steps require current named Studio sessions):

```sh
node tooling/scripts/verification/deploy-atlas-mesh-fork-schema.mjs # dry run
node tooling/scripts/verification/deploy-atlas-mesh-fork-api.cjs # build/import check
pnpm exec tsx tooling/scripts/verification/prepare-atlas-mesh-native-graph.mts
node tooling/scripts/verification/verify-atlas-mesh-publication.mjs
node tooling/scripts/verification/qualify-atlas-mesh-fork-activation.mjs
```

Use `--apply` on the deployment tools only for an intended deployment. The API
layer preserves the live image and active Compose overrides, records a private
rollback configuration, and refuses deployment if the container changes during
build. Do not rerun publication as a new release to retry an existing signed job.
Import revocation is unavailable after publication; rollback of published content
requires a separately reviewed release. Live publication rollback is not claimed
by the transaction-based activation tests.

- Future positive model and document-grounded checks require a current elevated
  Neon `catl.admin` session; historical evidence does not grant ongoing access.
- The second entity is published. For live persona qualification, provide a
  normal Mesh session and
  `docs/examples/atlas-f6/mesh-pilot-scope.json` containing the Cirrus `tenantId`,
  expected Mesh `principalId`, permitted `recordId`, and applied
  `networkAccountId`. The second-entity probe binds that account through the
  existing Records/Atlas runtime; it cannot infer or grant membership.
- Collect the remaining evidence against stable deployment bindings. The
  temporary synthetic attachment grant still expires **2026-09-11 01:15 UTC**
  (**09:15 Kuala Lumpur**); F6 does not extend it.

Production load qualification, a larger independent relevance benchmark and live
multi-document coverage remain beyond the currently qualified synthetic fixture.

## Qualification limits

The first elevated Neon model attempt recorded `model_unavailable` while checks
were running concurrently. The original attempt is retained in
`docs/examples/atlas-f6/model-neon-first-elevated-attempt.json`; a serial retry
passed, including exact replay without another provider call. This pilot closure
does not establish concurrent-load reliability. The rollback evidence covers
retrieval feature configuration restoration, not a database downgrade or a live
rollback of the published Mesh release.
