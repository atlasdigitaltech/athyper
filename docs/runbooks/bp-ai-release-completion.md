# BP AI release completion

Status: implementation and evidence collection in progress. The closed F6 pilot
remains a separate historical deployment qualification. This release is not qualified.

## Candidate scope

The authorized completion work targets BP-AI-00 through 08 in DEV CirrusAtlantic
NEON. BP-AI-09 evaluates that candidate. BP-AI-10 duplicate candidates, document
expiry and optional draft preview are explicitly deferred to a separate extension
release, using the deferral option in the user's completion request. No extension
is enabled by this decision. Their owner contracts and four per-capability gates
remain in [the extension backlog](../contracts/atlas-business-partner-extensions.md).

Run `node tooling/scripts/verification/prepare-bp-ai-release.mjs` to capture an
inventory and pending manifest in a new immutable run directory. Preparation
hashes selected source files and deployed modules, records published BP AI
definitions and deployed tool manifests, and leaves unproven bindings empty.
Manifest presence is not authenticated capability admission. The initial
candidate is [here](../examples/bp-ai-release/cfb11453-ef34-415f-8942-0b43578f5238/manifest.json)
and requires 90 gates. Rebind after implementation is frozen; do not qualify a
changed tree against this initial snapshot.

## Evidence already collected in this build

- Deployed API composition includes the BP insight owner, insight tools and case
  tools. Thirteen BP tool manifests were inspected; two effective/global BP
  publication records were captured separately.
- Focused owner tools, list, case, prompt-budget and cache checks: 62 passed,
  one existing skip. Proactive/controller and history checks: 13 passed.
- R9: 61 Atlas tests, 47 case-service tests and three publication tests passed.
- The new optional Redis evidence-cache primitive has 14 focused tests. A live
  probe with independent Redis clients passed shared entry/byte limits, expiry,
  and invalidation fencing. Metrics and limitations are recorded in
  [the cache receipt](../examples/bp-ai-release/redis-cache-qualification.json).
  It does not establish session continuity, rollout or accepted performance.
- Initial cache harness and rejected-write return-shape failures are retained in
  [build progress](../examples/bp-ai-release/build-progress.json); the latter was
  corrected and the real Redis probe rerun.

## Owner evidence-cache integration contract

`AtlasRedisInsightCache` is exported from platform AI but is not wired or deployed.
An owner integration must supply a fresh, complete dependency snapshot covering
record and related-row revisions, requirement definitions, business rules,
descriptor versions, canonical requested scope, locale and intent. It must also
supply the complete transitive disclosure claims and live authorizer. Cache keys
add tenant, principal, plane, profile and authorization epoch.

Current BP owner outputs contain projected-content hashes computed during an
assessment. Those hashes alone are not a cheap, complete pre-read revision vector.
Do not substitute the parent row version, observation time or a constant. A null
snapshot bypasses caching through the authorized owner loader. Establish and
qualify the owner resolver before enabling a cache hit in the runtime.

The cache validates typed evidence, rechecks owner versions and authorization
after reads and storage, and withholds a result after revocation, cancellation or
revision changes. Redis failures become cache misses. Default limits are 128
entries, 2 MiB serialized key/value bytes, 16 KiB per entry, 15-second TTL and
one-second Redis command waits. These are application storage limits, not Redis
RSS limits. A separate hash and epoch fence late writes after invalidation;
neither session keys nor shared inference ownership are modified.

Remaining BP-AI-08 work includes owner integration, automatic-request coordination,
deployment wiring and rollback, session continuity, revocation and measured
evidence/first-text/completion performance at the agreed pilot dataset size.

## Persona and fixture prerequisites

Use existing authorized accounts. Current available named files cover Cirrus
admin and owner; those identities do not demonstrate an other-tenant persona.
Map all eight persona roles from the BP-AI-09 runbook to actual accounts and
permission bindings. The user supplied `athyper.admin` and `athyper.owner` for
the Athyper tenant; both identities were confirmed in DEV Neon. Their expected
named session files are `tests/e2e/.auth/dev/neon/{actor}.json`. The legacy
`neon-athyper.json` is anonymous. The capture helper now checks these actors
against Athyper Group Holdings, preserving exact tenant/principal validation.
Restricted-field persona suitability remains subject to live permission checks. No login failure counts as
a successful access-denial test.

Both NEON admin and owner sessions were subsequently verified elevated. Admin
was admitted; owner remained denied by the existing Atlas permission policy.
The cited record-summary/replay probe passed. Readiness and eligibility failed
the structured scope-clarification fixtures, and selected Manage was denied.
These failures are retained in `live-reads-8a2be62d-9cd7-4a0a-bd0d-eea9b8588f0a.json`.
A source fix now clarifies missing scope for admitted assessment tools without
inference; 34 focused tests and typechecks passed. It is not deployed, and the
Manage denial remains under investigation. Keep credentials and raw state private.

Before case submission tests, select or create an isolated synthetic saved case
through the owner workflow and bind its actual version. Never reuse a real case
solely because its code resembles a fixture. Retain owner outcomes for stale,
retry and concurrent confirmation assertions. Human fixture and useful-next-step
review is a final independent gate; automation cannot invent its reviewer receipt.

## Completion

Run the applicable service, browser and at least 20 distinct owner-verified live
trials per required live-model gate. Preserve failed attempts, including the
retained F6 wrong arithmetic answer; do not select only successful trials.
Gather receipts against one frozen candidate binding and an actual run window.

Finish with `pnpm qualify:business-partner-ai <manifest.json>`. Close the parent
implementation plan only after `qualified: true` and the independent review.
Missing receipts remain pending; F6 passes cannot be copied into these gates.
