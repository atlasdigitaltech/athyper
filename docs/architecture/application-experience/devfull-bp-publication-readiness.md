# DEVFULL BP publication preflight — 2026-09-21

**Current native publication result:** the scoped DEVFULL workload now reaches
runtime signing, Neon activation and Studio acknowledgement without repeated human
MFA approvals. [Exact evidence](../../reports/bp-integration-20260921/devfull-runtime-activation.json)
records the signed artifact and matching activation hashes. Workload approval is
separate from human review and business-request maker/checker approval; those paths
remain unchanged. The 113-artifact compiled package still requires its separate
provider qualification and publication. The preflight below is historical.

**Later integration checkpoint:** the Studio capability and Neon collaboration
schema prerequisites below have now been rehearsed on restored backups and
applied to DEV. Build/test results and remaining publication blockers are in
[the integration record](../../reports/bp-integration-20260921/README.md).
The original read-only preflight below is retained as historical evidence.

Status: **activation blocked by integration prerequisites**. No release, schema,
runtime restart, database reset, Git commit or merge was performed in this preflight.
The source-folder reorganization exists in the working tree, not as a merged commit.

## Verified current state

| Check | Result |
| --- | --- |
| Metadata layout | Pass: 132 mapped files, 108 entity JSON files |
| Source compiler and BP2 admission | 8 tests pass, including deterministic source compilation |
| `dev:publish --dry-run` | Authenticates; rejects with `DEV_PUBLICATION_INTAKE_SURFACES_NOT_PUBLISHED` |
| Studio native BP release | Release 2, `c2cc6900-26c1-47ca-8dfc-1d488000950c`, published; one surface |
| Neon compiled BP active release | Source release 9, `7f3bec9f-6505-546f-867b-fe7ac1dc1d18`; applied release `01a0beaf-9018-7c88-b46c-8655150b62d9` |
| Neon native BP activation coordinate | Source release 2, `24cbd708-8445-5981-9643-b221849a923c`; separate publication key from the compiled BP artifact |
| Studio `metadata.entity_capability` | Absent from the live database catalog |
| Neon `document.comment_revision` | Absent from the live database catalog |
| Generic BP intake provider | Factory exists in source; no platform-host caller found |
| DEVFULL application containers | API, worker, scheduler, Studio, Neon and Mesh healthy at inspection |

The native and compiled publication keys are distinct. Neither numeric release
number establishes that the other publication path has received the new graph.
An activation receipt must match the actual artifact consumed by the route.

## Validation distinction

`python3 tooling/scripts/metadata/validate.py` now materializes compiler-owned
hashes in memory for source validation. It accepts hash-free authoring input and
does not write placeholder hashes. Legacy source hashes are treated as non-authoritative
input; a hash becomes authoritative only in a frozen release receipt. The normal
source validator passes 107 artifacts and the 35-case mutation suite passes.

`python3 tooling/scripts/metadata/validate.py --release-ready` remains deliberately
blocked: the existing envelope is unsigned and incomplete for the current compiled
set, and provider evidence is source-only. This is the intended release boundary,
not a BP2-01 feature defect.

## Required integration work before shared activation

1. Select the completed intake/BP2/CA release scope and freeze its source/dependency
   inventory. Do not silently publish outstanding packages or someone else's draft.
2. Build and sign a complete compiled release envelope. Passing source validation
   alone is not activation evidence.
3. Compare the required canonical DDL with the existing DEV databases. Prepare and
   test a data-preserving application plan before applying it. Fresh-install DDL is
   not automatically an upgrade script; no existing database reset is authorized.
4. Finish generic intake provider composition and native graph prerequisites using
   the governed authoring service. Keep draft/submit/version/protected-value behavior.
5. Build the selected runtime, publish through the existing signer/dispatcher, then
   verify exact per-plane activation receipts and create/draft/edit/comment/attachment
   journeys for the selected scope. Only then identify it as the shared baseline.

Other workstreams can use the reorganized repository source paths now, but must not
assume the corresponding metadata or DDL has been activated in DEVFULL. QA/STG/PROD
were not touched. The remaining implementation needs an explicit scope choice:
completed slices only, or completion of outstanding packages before an all-changes release.

## Handoff operating rule and intake baseline — 2026-09-21

All feature work uses `metadata/products/mdg/entities/`, review evidence uses
`metadata/products/mdg/review/`, schemas use
`metadata/schemas/entity-artifacts-v2/`, and checks use
`tooling/scripts/metadata/`. `New_Entity` is only the compatibility bridge for
the historical hashed review-envelope command; it contains no editable entity
definitions and must neither be restored nor deleted casually.

The integration baseline has started with a generic provider-neutral intake
operation route in `server/packages/platform/experience`. It authenticates the
request, requires an idempotency key, binds the URL coordinate to the body,
preserves server-only provider selection, and fails closed when no provider is
registered. It is intentionally not registered in platform-host yet: a BP
provider must inject the established server-side mapper for protected values,
relationship extensions, create-versus-extend selection, optimistic patching
and edit-policy preview. No browser answer mapping is authorized to replace it.

### Release gates for the first intake slice

1. Complete the native Studio BP intake graph (`intake_partner`,
   `intake_details`, `intake_review`) and its published-operation bindings.
2. Compose the generic route with the BP server provider and its trusted mapper;
   retain the governed request service as the only mutation authority.
3. Run source and release-ready validation. The current hash-free
   shared-reference sources are not a reason to add placeholder hashes.
4. Prepare and qualify data-preserving DEV DDL plans for
   `metadata.entity_capability` and collaboration storage before applying either.
5. Freeze one scope, validate/test that exact revision, obtain governed review,
   sign/publish through Studio, and verify the Neon activation receipt.
6. Run create, saved-draft, edit/reapproval, protected-value, comment,
   attachment and mobile-layout journeys against the activated release.

### BP2-01 review

BP2-01 is complete as a shared-reference foundation: its fixed source registry,
bounded lookup API, historical-value resolution, Core inputs and focused tests
are implemented. It has no required BP2-01 DDL or reference-maintenance
workflow. Its remaining work is release integration: qualify the compiled
reference artifacts within the selected release and verify their Neon receipt.
BP2-02 through BP2-17 remain planned and must not be implied by BP2-01 source
completion. The detailed integrated release order and schema preflight command
are recorded in `business-partner-integrated-release-readiness.md`.
