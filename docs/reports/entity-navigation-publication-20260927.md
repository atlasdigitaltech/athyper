# Navigation successor publication — preparation

## Completed: release 3 activated

The refreshed platform.owner MFA session independently activated the exact
policy hash. Dedicated author/publisher workloads executed it successfully,
returning HTTP 200 with release `934dae8a-0ded-459c-a9ea-349beaccf155`, number 3.
All three target heads independently report release 3 active at 12:14:55–56 UTC.
The authoring release uses `athyper-publication-dev-signing-v1`.

Read-only inspection of each active installed payload confirms the exact
Overview navigation in scroll mode with sections overview, phone, address and
audit. Each target retains 247 Country rows and two published operation bindings.
Evidence is recorded in `entity-navigation-policy-activation-20260927.json`
and `entity-navigation-activation-20260927.json`. No historical release or
signed artifact was modified; no direct runtime projection writes were used.

This verifies activation and installed metadata, not a new authenticated browser
acceptance run. Refresh the record in each plane to check Overview, manual
section selection and scroll tracking. Advanced collaboration parity remains
outside this navigation release. No implementation changed or package tests
were rerun during this activation turn. Earlier checkpoints below are historical.

## Follow-up: authenticated proposal

The refreshed platform.admin session successfully proposed the pinned navigation
policy: `1f0bdaf3-e78c-4fe4-87d5-a8bf5efb5d97`, version 1, hash
`65989bd9208961e6e4eb56f6c1f3c688444359108860bbe83b56b2ee9bb48ade`.
It is pending independent owner activation. The initial HTTP 409 source-pin
conflict cleared after restarting the DEV control API, API and worker to load
the updated code; the candidate pins were not changed. No release was created.

### Recorded development-workflow requirement

The user explicitly reports that per-change human maker/checker enrollment is
not workable for a local development queue of 1,000+ entities. Design a reusable,
independently reviewed DEV-only automation policy for narrowly allowlisted,
structurally classified low-risk changes, instead of reenrolling every source
hash manually. Each execution must still bind actual source/build/predecessor
and target pins, preserve signing, qualification, audit and target isolation,
and reject unknown or security-sensitive changes for explicit review. Policy,
trust, grants, storage authority and capability expansion are not automatically
low risk. This requirement does not itself change authority or waive the current
owner activation gate, and must not confer QA/staging/production authority.

The preparation checkpoint below is historical; its statement that no proposal
exists is superseded by this follow-up.

## Live state

The 12:05 UTC read-only baseline confirms release 2 remains active in Studio,
Neon and Mesh, with two published operation bindings per target. Historical
snapshots, signatures and activation heads were not edited.

The navigation-only successor draft is persisted as
`c1fbecc3-93da-4771-9755-39332ce8b483`, revision 2. It declares one Overview tab
with overview, phone, address and audit sections in scroll mode. Preparation
forks the predecessor with fresh graph identities and changes only navigation;
it does not reimport permissions, capabilities, storage or other product fields.

## Verification

- Rollback-only preparation passed graph validation, contract tests and compilation
  for all three targets before committed preparation.
- Preparation verified draft replay and stale-predecessor rejection.
- Live rollback-only source enrollment probe passed runtime/control RLS access,
  changed source/predecessor pin rejection and wrong-tenant denial.
- Local, control API and worker compiler measurements agree:
  `a19d555dee60de97f92aa392836a2a270d46c2ba0ff19e4a9ed83b1d685abb5a`.

## Remaining authenticated gate

Both previously retained operator sessions have expired. A new platform.admin
browser PKCE/MFA verification was started for policy proposal; platform.owner
must separately authenticate to activate the resulting exact policy hash.
No proposal, approval, successor release or activation has been created yet.
After enrollment, use the dedicated publication workloads and verify signed
navigation on each target, then authenticated browser behavior.

Evidence: `entity-navigation-baseline-20260927.json`,
`entity-navigation-draft-20260927.json`, and
`entity-navigation-policy-candidate-20260927.json`. The candidate has no authority
until independently enrolled. Local files are diagnostic records, not immutable
audit storage. No QA, staging or production changes were made.
