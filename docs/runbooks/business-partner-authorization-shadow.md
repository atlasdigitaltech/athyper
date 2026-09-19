# Business Partner shadow rollout

This milestone selects `neon / business_partner / shadow`. Existing authorization,
UI projections, commands, scope retries and grants remain authoritative. This is
not enforcement activation or a completed migration.

The DEV shadow integration milestone is complete for the qualified BP fixture and
existing authenticated principal. API, worker and scheduler are healthy with the
pinned image/profile pair. The [shadow attestation](../../governance/policy/reports/business-partner-shadow-attestation.dev.json)
records 40 authenticated UI/API checks, 1,204 request-correlated shadow decisions,
zero mapping gaps/unavailable correlated previews, and unchanged fingerprints for
all 13 authorization tables. No role was promoted or grant changed.

The [browser evidence](../../governance/policy/reports/business-partner-shadow-browser.dev.json)
covers application/list/record APIs, granted sections, actual in-page tabs,
scoped and unscoped action visibility matched to legacy responses, authorized
organization/company providers, missing context, denied comments/attachments,
invalid company, missing record, and signed-out access. It checks exposed JSON
for protected tokens and raw audit payload fields without retaining business values.

This qualifies one existing authenticated DEV principal across these contexts.
Distinct steward/requester/approver personas, same-phase command execution,
independently owned resources and platform-wide generality remain migration gates.
Observed target/legacy differences are recorded; they do not enable enforcement.

## Configuration and evidence

The host accepts only `BP_AUTHORIZATION_MODE=off|shadow`. Shadow requires
`BP_AUTHORIZATION_PROFILE_PATH` and an exact `BP_AUTHORIZATION_PROFILE_SHA256`.
A wrong hash, plane, entity or schema stops startup. There is no enforce switch
or grant migration writer in this adapter. The generic enforce release gate
remains separate and closed.

The same observer wraps generic record services and BP's domain policy authorizer.
Trusted service annotations preserve action/record identity through compatibility
retries without adding authorization coordinates. BP HTTP journeys collect a
transport outcome alongside the individual authorization comparisons. Browser
responses contain only their existing legacy projections; target decisions are
never used to expose a field, enable a button or authorize a command.

Each comparison distinguishes:

- `legacy`: the selected effective authorization result.
- `installedTarget`: the target contract evaluated with installed bindings.
- `candidateTarget`: proposed bindings projected into an isolated snapshot, with
  the authenticated grants, denials, ACLs, assurance and entitlements unchanged.
- `mapping_gap`: an absent/ambiguous profile operation; never treated as parity.
- `command_discovery_preview`: no workflow command, preflight, reveal or materialize
  is executed by shadow. It cannot qualify execution parity.

JSON log events use `event=bp_authorization_shadow`. They contain permission and
operation codes, safe decision states, hashed request/principal/grant snapshot
references and the pinned profile hash. They do not contain business values,
raw record identifiers, cookies, tokens or URLs. Transport outcomes contain only
a fixed route family, HTTP method/status and comparison count. An HTTP response
with zero comparisons is coverage evidence, not authorization parity.

The observer has a 250ms deadline and suppresses late comparison results after
cancellation. Scope reads have a 150ms database statement deadline and at most
four concurrent transactions. All scope transactions are read-only and explicitly
bind tenant/principal/plane. Existing records are checked in storage; organization,
company and their relationship are checked against active catalogs. Failures are
advisory and cannot alter the selected result. No historical grant is restored.

## Coverage and remaining qualification

| Surface | Integration | Evidence needed to close the milestone |
| --- | --- | --- |
| App/workspace/list | Qualified via real BFF and browser; action links match legacy responses | Broader governance personas before enforcement |
| Record and 360 tabs/sections | Qualified granted, scoped, missing-context and denied paths | Additional fixtures/providers before platform-wide generality |
| Fields and sensitive providers | Real authenticated projections checked for protected-token/raw-audit leakage; sensitive capability gates observed | Full reveal/independent provider qualification before enforcement |
| Header actions and requests | Scoped/unscoped UI action links match legacy API decisions; mappings qualified | Same-phase workflow execution before enforcement |
| Commands and reveal | Existing command gates observed; read-only candidate previews | Authenticated command tests and domain execution parity in later enforcement qualification |
| Transfer and AI/provider paths | Shared authorization observed where BP identity is supplied | Exercise adapters and record any paths that bypass the selected authorizers |

The observed create/update/qualification gaps now have explicit shadow mappings.
Both inventoried BP descriptors have zero unmapped installed operations/fields and
zero permission mismatches. Unknown or unpublished operations still produce
mapping gaps rather than acquiring authority. Candidate global master operations
require preflight; qualification retains organization/company coverage and its
maker/checker facts. These previews assign no stewardship.
The request gateway previews do not qualify independent case ownership. Company
and independently owned child qualification remain required for generality.

## Reproduce checks

```sh
pnpm --filter @athyper/server-service-records --filter @athyper/server-service-master-data --filter @athyper/server-platform-host test
pnpm --filter @athyper/server-platform-iam exec vitest run src/__tests__/shadow-authorizer.test.ts
node tooling/scripts/verification/review-business-partner-roles.mjs dev governance/policy/reports/business-partner-role-review.dev.json
pnpm exec tsx tooling/scripts/verification/check-business-partner-shadow-storage.mts dev f7688c3d-8c92-5651-a469-da3f4f786375 governance/policy/reports/business-partner-shadow-storage.dev.json
```

The storage check uses the actual `athyper_runtime` database role and inventoried
coordinates. It proves the real adapter rejects missing/cross-tenant parents; it
is explicitly not an authenticated persona or browser test. The existing synthetic
comparison report still contains two unresolved differences.

## Named-role review

[business-partner-role-review.dev.json](../../governance/policy/reports/business-partner-role-review.dev.json)
contains actual principal/group/role/scope combinations, whether each principal
has a current plane membership, and one pending review row per combination.
`namedAssignments` and `grantChanges` are empty. These are candidate holders,
not approved stewards. No person is automatically promoted by this inventory.

Review these responsibility decisions separately:

| Existing role category | Review proposal | Boundary |
| --- | --- | --- |
| Tenant administrator | Consider named candidates for global reader/requester/steward duties separately | Administrator membership does not establish stewardship |
| Organization administrator | Identify organization requesters and approvers | Preserve each organization scope and propagation |
| Legal-entity administrator | Identify company configurators within reviewed company memberships | Do not translate legal-entity grants into tenant grants |
| BP reader | Review intended global directory visibility | Do not add write, sensitive read or reveal |
| BP case approver | Review named approval responsibility and maker/checker separation | No automatic global master approval or materialization |
| Sensitive master-data roles | Review the specific sensitive capability and owner scope | No implied access to other field groups |

For every proposed assignment, reviewers must fill in responsibility, target
scope, exact capabilities, approval/apply separation, effective dates and decision.
Role codes, group/principal identifiers and current scope targets are supplied in
the artifact so reviewers can make concrete assignments without guessing names.
The review does not need to finish before collecting shadow evidence.

## Rollback and audit

DEV rollout files are stored under
`~/.athyper/instances/dev/deployments/bp-authenticated-shadow-20260909/`.
`audit.json` pins previous images, selected shadow image, profile and service
configuration paths. Each service has a `.shadow.json` and `.rollback.json`.
The authorization before/after fingerprints cover all persisted rows in 13 NEON
authorization tables, including denials, ACLs, overrides and revoked/expired grants.
They prove row equality across this deployment, not equivalence of effective
access across time or external identity changes.

To revert an affected service, use its captured compatible image/configuration:

```sh
docker compose -p athyper-dev -f ~/.athyper/instances/dev/deployments/bp-authenticated-shadow-20260909/api.rollback.json up -d --no-deps api
```

Use the corresponding files for worker/scheduler. Rollback never restores grant
tables, removes denials or revives revoked access. Since this deployment installs
no binding/metadata/grant changes, the captured previous runtime configuration
remains compatible with those unchanged artifacts. Retain compatibility retries
until authenticated parity and approved grant review support their retirement.

## Reproduce authenticated qualification

The browser runner attempts normal renewal using the saved test session. With
configured `PLAYWRIGHT_NEON_USER` / `PLAYWRIGHT_NEON_PASSWORD`, it uses the existing
issuer/BFF login helper. It never fabricates a session, resets a password or
bypasses MFA. See [test login setup](neon-authenticated-review-setup.md).

```sh
LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu pnpm exec tsx tooling/scripts/verification/qualify-business-partner-shadow-browser.mts f7688c3d-8c92-5651-a469-da3f4f786375 governance/policy/reports/business-partner-shadow-browser.dev.json
```

Use the library path only where the local extracted Playwright dependencies are
needed. The runner records only statuses, safe surface identifiers and hashed
principal/record references; no credentials or record values. It checks the real
BFF application/list/record APIs, granted sections, sensitive-token exclusion and
record/section rendering. A missing session exits with code 2 and an explicit
blocker. A passing read journey does not automatically close representative-persona,
command or independent-provider qualification.


Attest the complete shadow milestone only after the browser run succeeds:

```sh
node tooling/scripts/verification/attest-business-partner-shadow.mjs ~/.athyper/instances/dev/deployments/bp-authenticated-shadow-20260909 governance/policy/reports/business-partner-shadow-browser.dev.json governance/policy/reports/business-partner-shadow-attestation.dev.json
```

The attester verifies the healthy image/profile selection, before/after grant-row
fingerprints, installed mapping inventory, required browser checks and matching
server-side request/principal/profile hashes. It rejects mapping gaps or unavailable
correlated previews. This unsigned artifact cannot activate target enforcement.
