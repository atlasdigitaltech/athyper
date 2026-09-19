# Shared DEV workspace implementation — 2026-09-11

The preferred personal DEV source workspace is running on the established Studio,
NEON, Mesh, API and IAM URLs. All six source application containers report healthy;
original DEV application image containers are stopped. The user confirmed that
all three planes work with the source development mode.

## Delivered and verified

- Shared network/URL/IAM/data source/image-mode switch, original image-container recovery,
  four updated development images, three database backups and schema/identity guards. Initial startup failures
  exercised restoration of original containers. Infrastructure startup now waits
  for health before source application startup.
- `devfull`/`devsimple` select the shared workspace. The isolated runner is explicit
  and cannot start another application workspace while shared source mode is selected.
- BP form/view text preview using native compilation and signed artifact verification;
  saved/active revision feedback; automatic development version suffixes; rejection
  of authorization/workflow/structural changes; preservation of the previous active
  artifact; stale-result rejection and local preview reset.
- Explicit signed development baseline from the existing Studio onboarding draft,
  separate from release publication and approval records.
- Real runtime-privilege database/service save → compile → activate → NEON-read test
  passed. Cross-tenant revision reads were denied; a policy mutation failed without
  replacing the working artifact. The actual NEON presentation consumer read the
  preview. Text edits retain baseline request-schema/workflow coordinates, so
  existing requests do not acquire new operational contracts from a label change.
  Original labels were restored afterward.
- Portable authoring export was exercised against the restored revision. Candidate
  manifest validation, exact-source freeze guards, native QA authoring import,
  metadata handoff checks and non-deploying staging plan commands are implemented.

## Validation

- 18 local runner/model/candidate tests passed.
- 26 focused publication/compiler/preview/route tests passed, including superseded
  compilation and last-working-revision checks.
- 3 Studio definition-client tests passed.
- Host, publication service, Studio BP and BFF relay type checks passed. All four
  production-Dockerfile development image builds completed successfully.
- 14 Stack v2 execution tests passed. The live source/image round-trip verifies the
  exact preview revision/hash and unchanged infrastructure identities/mounts.
  The final round-trip receipt is `lifecycle-1789133896721.json` under
  `~/.athyper/instances/dev/workspace`; all six applications were healthy in
  source mode afterward. Recovery correctly refused when no owned abandoned
  lock existed; stale-lock recovery itself has not received a live integration test.
- Real service evidence is under the private workspace preview directory and
  explicitly identifies itself as development evidence, not an authenticated
  browser journey. The stored automated browser session was expired. User sign-in
  and three-plane usability confirmation are separate evidence.
- Repository-wide whitespace checking reports existing trailing whitespace in
  `docs/architecture/business-partner/development-url-catalogue.md`; this unrelated
  file was not changed for this workflow.

## Outstanding requirements — do not mark the whole plan complete

1. This preview accepts existing form/view text only. General metadata, ownership,
   field policy, provider, command, import, revocation and coordinated cross-plane
   changes still need the broader coordinator and complete BP scenario suite.
2. Candidate tooling is not an actual QA qualification. The checkout contains
   substantial pre-existing uncommitted work and no matching newly built candidate
   ImageSet. No freeze, QA import/activation or authenticated QA journey is claimed.
   The current qualification command deliberately reports metadata-handoff scope
   and `releaseQualified: false`.
3. Staging is not ready, as confirmed by the user. Only a handoff-plan command was
   added; no server promotion occurred.
4. Dependency-build supervision, fully tuned simple infrastructure and representative
   16 GB validation remain outstanding. The controller now has conservative
   abandoned-lock recovery using ownership tokens and process start identities.

See [the runbook](../runbooks/shared-dev-workspace.md) for commands and limitations.
