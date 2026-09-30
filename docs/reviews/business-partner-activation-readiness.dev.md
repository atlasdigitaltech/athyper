# Business Partner activation readiness — DEV

The readiness package is complete as a **review artifact**, but activation is
blocked. No grant, metadata publication, business command or enforcement mutation
was executed while preparing it.

- [Readiness package and evidence hashes](../../governance/policy/reports/business-partner-activation-readiness.dev.json)
- [Exact 79-row grant comparison/proposal](../../governance/policy/reports/business-partner-activation-grant-diff.dev.json)
- [Fresh publication head and binding dry run](../../governance/policy/reports/business-partner-activation-publication.dev.json)
- [Fresh database-adapter checks](../../governance/policy/reports/business-partner-activation-adapters.dev.json)
- [Reassessed historical policy differences](../../governance/policy/reports/business-partner-activation-differences.dev.json)

## Grant proposal

The durable server packet matches the exported approved packet and its two
MFA-authenticated receipts. All 79 mappings remain approved. Fresh read-only DEV
capture finds the same 79 candidate memberships and identical fingerprints for all
13 authorization tables. This establishes persisted-row parity, not effective
access parity or a guarantee that an unexpired grant remains usable later.

| Approved disposition | Rows | Proposed persisted grant delta |
| --- | ---: | --- |
| Assign defined responsibilities | 21 | No additions, removals or updates |
| Retain legacy access | 56 | No additions, removals or updates |
| Exclude from target mapping | 2 | No revocation of existing access |

Every row records principal, group, role, tenant, scope registry ID and actual
scope target, propagation, current permission codes, proposed responsibilities,
retained capabilities, conditions and reviewer references. Assignment conditions
include MFA, separation of duties and the September 11–December 10 UTC pilot
window. Legacy grant validity dates are not changed to match that window.

This is an exact **zero-change persisted-grant proposal**, not an executable
migration into new runtime roles. The reviewed responsibility labels still need
explicit runtime storage/binding design and qualification. Do not invent role IDs,
provision whole groups from named-principal approval, promote organization scopes
to tenant scopes, or interpret retained legacy access as a union of policy allows.
Any discovered need for additional global read/steward capabilities requires a
new explicit grant proposal and review. Missing/revoked memberships stay missing.

## Selected release and engineering gates

The refreshed effective BP head is CirrusAtlantic NEON release 17, publication key
`metadata.entity.business_partner.local-master-data.cirrusatlantic`. The report pins
its release IDs, head version, descriptor/contract hashes and eligible-head hash.
This release selection covers one tenant; approval of the 79 mappings across three
tenants does not qualify publication or activation for the other two tenants.
API, worker and scheduler remain healthy in BP shadow mode. The report records
actual container image IDs separately from the dirty local source revision.

| Gate | Refreshed finding | Required completion evidence |
| --- | --- | --- |
| Assignment window | Pilot begins September 11, 2026 UTC | Activation within approved window; new review after expiry |
| Publication | 51 operations; 39 descriptor additions, 41 binding additions, nine scope/mode replacements; zero unexplained gaps, **36 review-gated operations** | Resolve each catalog/scope/semantic disposition; native signed envelope and actual callable handler/resolver/workflow registrations |
| Policy differences | **29 unresolved groups**: two synthetic and 27 live groups from historical observations | Explicit accepted dispositions and regression evidence; fresh representative live comparisons against the selected release |
| Command materialization | New internal/intercompany supplier journey applied successfully with fresh MFA; original approved case preserved | Ownership milestone complete; broader target-policy command coverage remains under whole-release qualification |
| Database adapters | All **11 read-only checks pass** using deployed database role | Retain as adapter evidence; separately qualify authenticated independent-child and company-owned service journeys |
| Whole-release coverage | Current source and service images are separately identified; no full release qualification receipt | Authenticated record/provider/nested-field/reveal/command/export/AI journeys, revocation and forbidden-context checks using identical release artifacts |
| Activation/rollback | No enforcement authorization or qualified rollback receipt | Reviewed exact release/grant proposal, compatible versions and rollback preserving current revocations |
| Compatibility retirement | Still blocked | Accepted parity and monitored behavior after activation |

The command failure is not treated as an MFA blocker: prior MFA and both approval
stages succeeded. The recorded apply failure is
`BUSINESS_PARTNER_CASE_COMMAND_CONFLICT`. Intake defaults manual requests without
`ownershipClass` to `internal`; the SQL materializer defaults omitted supplier
subtype to `general`. The commercial-role invariant rejects that combination.
Source anchors remain in
`server/packages/services/master-data/src/kysely-business-partner-case-repository.ts`
and `server/db/ddl/planes/neon/master/07_functions.sql`. The readiness refresh read
only the case status; it did not replay application, rewrite its approved snapshot,
or weaken the trigger. The failed command evidence remains explicitly historical.

## Refresh and release handoff

Run from the repository root with the DEV database/services available:

```sh
node tooling/scripts/verification/prepare-business-partner-activation-readiness.mjs
node --test tooling/scripts/verification/entity-authorization/activation-readiness.test.mjs
```

The refresh compares the original signed-off inventory without rebasing approvals,
checks durable review state, recaptures grants, reruns the publication/adapter
checks, reassesses the existing difference ledger, inspects deployed image IDs and
reads the prior test case status. It does not replay commands, collect new live
shadow observations, activate, or apply grants. Successful script execution means
the package was generated; inspect `activationReady` and each gate for readiness.

Before release approval, refresh again and reject changed heads, sources,
principal/membership state, denials, revocations, expired assignments or stale
qualification evidence. Present actual compiled artifacts and the precise grant
proposal for explicit approval. Keep the current compatible artifacts and image
IDs for rollback planning; never restore an old grant database snapshot. A rollback
that cannot honor current revocations must remain closed.


## Ownership command milestone update

The [authenticated ownership qualification](../../governance/policy/reports/business-partner-ownership-qualified.dev.json)
now passes: case `f8ec949e-bed6-44d5-a104-f70d6241896d` materialized with the correct
internal/intercompany pairing and complete primary relationships. Incompatible
ownership is rejected before approval; missing primary relationships are also
validated. The original failed case remains unchanged. The command-failure
paragraph above is retained as historical cause evidence, not a current failure
of the new qualified journey. Dynamic owner-purpose catalog validation and full
target-policy coverage remain separate gaps. The readiness report consumes this
new qualification and retains all other activation gates.
