# Shared DEV preview and QA candidate progress — 12 September 2026

QA setup has since progressed: see [the fresh isolated QA report](fresh-local-qa-20260912.md). The findings below describe the earlier retained-database attempt.

The broader local preview and an immutable candidate build are implemented. **The
candidate has not passed QA qualification.** Native QA startup failed on retained
database prerequisites; an all-plane rollback rehearsal now reports the remaining
migration failures without changing the migration ledger. DEV remains in source
mode at its existing URLs. Staging is not ready and no promotion occurred.

## Implemented and verified

- Preview accepts existing descriptor text, supported layout changes and reordering,
  validated workflow stages/SLA settings, and narrowing existing request input
  sources. It still uses the native compiler and isolated development signing.
  Ownership, field-policy changes, new bindings and arbitrary new fields are not
  supported by this preview. It is not a general cross-plane metadata coordinator.
- Request/workflow consumers receive the relevant operational preview contract.
  Cosmetic edits do not churn operational contract hashes. Independent approval
  remains required; unsupported changes fail and retain the last working preview.
- The live DEV service exercise verified save/compile/activation, layout and workflow
  consumer behavior, cross-tenant denial, failed compilation recovery and restoration
  of the original definition. This is service evidence, not an authenticated browser
  or human-approval journey.
- A regression runner records exact source identity and per-suite results. The
  detached candidate source passed **248 tests** across publication, authorization,
  BP commands/providers/import/Atlas contracts, host bindings, Studio and NEON.
  These tests do not establish an authenticated QA journey or live revocation proof.
- Candidate snapshotting preserves the developer branch and index. All five
  production candidate images built from detached commit
  `7ffe38dfd986f08309d4e994511c7e9af99fbbb6`; immutable digests were stored in a
  loopback-only local registry. The frozen candidate passed integrity verification.
- The production Dockerfile now generates all three planes' database types from
  committed schemas, fixing the clean-checkout Studio build failure.
- The candidate artifact probe is implemented but has not run against a healthy
  QA worker. It cannot substitute for existing-user qualification.

## QA findings

Native Stack v2 startup rejected `20260906_identity_replay_approval.sql` because
`trustiam.identity_saga_attempt` was absent. Startup rolled back; retained volumes
and the failed migration ledger entry remain intact. Only the QA database was
subsequently started for rollback rehearsals.

Forward prerequisite migrations for Studio identity saga tables and common control
administration have been added to the working tree. With these additions:

| Plane  | Rollback rehearsal result                                                                     |
| ------ | --------------------------------------------------------------------------------------------- |
| Studio | All 25 pending migrations passed; rolled back                                                 |
| NEON   | Fails in supplier-preference normalization: missing `control.business_partner_decision_scope` |
| Mesh   | Fails in exchange readiness: missing `mesh.network_relationship_identity`                     |

NEON also lacks `control.customer_account_designation`, a referenced authority in
the normalized scope model. This is a baseline upgrade issue, not a permission or
MFA issue. A schema-name inventory found further missing baseline tables; passing
one prerequisite must not be mistaken for complete database compatibility.

`pnpm qa:migrations:preflight` rehearses all three planes, records migration content
hashes and private diagnostic logs, checks that each migration ledger is unchanged,
and exits nonzero on any failure. Latest evidence at this checkpoint:
`~/.athyper/qualification/migrations/1789162470478/receipt.json`.

The frozen candidate is under `~/.athyper/candidates/20260912-bp/frozen`.
Its exact-source regression receipt is
`~/.athyper/qualification/bp/1789161160118/receipt.json`.
New prerequisite/session/preflight changes postdate that candidate and require a
successor snapshot and build; its existing evidence must not be rewritten.

## Existing QA identities

The user selected existing Cirrus accounts: `catl.admin` for author/requester and
`catl.owner` for independent reviewer/approver. Both exist under tenant code
`cirrusatlantic`. Qualification must verify their actual permissions; selecting a
role here does not grant one or establish an approval.

Once QA is healthy, run these in a graphical terminal on the local desktop:

```sh
pnpm qa:session --plane studio --actor catl.admin
pnpm qa:session --plane studio --actor catl.owner
pnpm qa:session --plane neon --actor catl.admin
pnpm qa:session --plane neon --actor catl.owner
```

Each command opens an isolated browser for ordinary login/MFA and verifies the
session's exact plane, tenant and principal before saving it privately under
`~/.athyper/qualification/sessions/qa/<plane>/<actor>.json`. No password or MFA code
is supplied to the agent. Add `--check` to validate a saved session without opening
a browser. DEV session files are not reused. Two session-validator tests pass,
including wrong-account, wrong-tenant, wrong-plane and expired-session rejection.

## Remaining sequence

1. Resolve the retained QA baseline: either a tested data-preserving upgrade, or
   fresh isolated product databases retaining existing QA IAM users and keeping
   old volumes intact. The required data-retention choice has been requested.
2. Rehearse the complete migration path and recover any failed ledger entry through
   an auditable native retry; never mark an unexecuted migration applied.
3. Freeze a successor containing the final fixes, build matching images and start
   QA through Stack v2. Verify runtime digests and migration receipts.
4. Run the artifact probe, existing-user Studio import/review/activation and NEON
   requester/approver journey, including rejection boundaries and failure recovery.
   Capture evidence bound to that exact candidate. `candidate:qualify` currently
   remains metadata-handoff scoped and reports `releaseQualified: false`.
5. Prepare staging handoff only after qualification; actual deployment remains
   pending the user's staging infrastructure.

DEV image-mode parity for the newly extended preview has not been exercised; DEV
source mode is the tested running mode for this increment. The earlier text-only
report remains historical evidence, not the current completion claim.

## Final DEV health check and recovery

The final check detected API/worker/scheduler boot failure after the runtime search
configuration began requiring a scoped key. The existing source containers still
had legacy master-key mounts. The workspace generator now replaces those runtime
mounts with the read-only, explicitly named DEV scoped-key volume and rejects a
foreign key volume. Its three focused tests pass.

The normal key-init container failed downloading Alpine packages. A local Node
one-shot provisioned the same scoped key actions/indexes without printing key
material or using an external registry. The workspace controller then recreated
source applications; all six reported healthy. No DEV database reset occurred.
The package-download dependency in the normal key-init bootstrap remains a separate
operational limitation. A bank-directory maintenance job reported
`BANK_DIRECTORY_AUTHORITY_REQUIRED`; container health does not establish that
unrelated authority's readiness.

For the pending QA data-retention choice, the recommendation is a fresh isolated
product baseline with existing QA IAM accounts and preserved old volumes. The user
has asked for the recommendation but has not yet selected that replacement path.
