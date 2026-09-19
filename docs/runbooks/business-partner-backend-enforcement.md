# Business Partner backend enforcement integration

Status: second backend enforcement slice implemented; qualification remains open on
2026-09-10. **The complete backend workstream is not qualified or activated.**
DEV remains on its previously deployed shadow runtime. This change performs no
grant writes, metadata publication, container rollout or compatibility retirement.

## Implemented path

`createEntityBackendAuthorizer` adds the shared target evaluator to the authorizers
used by Records and Business Partner services. Host composition supplies it through
`businessPartnerBackendAuthorization`; the default is absent. Its legacy and
shadow modes return the existing authorizer unchanged; the existing bounded BP
shadow observer remains responsible for advisory comparisons.

Enforcement requires the existing release/qualification gate, compatible profile
hashes, reviewed grants/differences, current revocation watermark and rollback
reference. Each selected authorization reloads IAM context through a trusted
`refreshContext` port and rejects identity/realm/plane substitution or an older
authorization epoch. No binding or grant snapshot is synthesized. Existing domain
and legacy denials remain effective; target allow and legacy allow are never unioned.

The BP mapping reads owning-service resources, not HTTP routes, request JSON or
advisory observations. Unknown/ambiguous operations, wrong permission mappings,
missing ownership coordinates and authority outages close the selected path.
Denial reasons cannot activate legacy `scope_not_contained` retries. Global
operations exclude shell organization/company coordinates. Company providers keep
their explicit coordinates and the evaluator separately admits their parent.

An `enforcedEntityProfile` marker identifies the server-selected entity/plane.
A descriptor containing an authorization profile does **not** activate enforcement.
The selected marker and descriptor profile must match. Advisory IAM wrappers
preserve this marker. Legacy BP shadow and enforced target composition cannot be
selected simultaneously under the legacy-shadow deployment configuration.

## Service coverage added

| Entry point | Added guard | Limitation |
| --- | --- | --- |
| Records list/query/get | Field-use admission before SQL; row reauthorization before returning a profiled page; scalar-only root projection | Selected aggregates constrain SQL to independently authorized IDs, capped at 2,000 candidates and five seconds, with a revocation recheck; scalable ownership predicates remain unqualified |
| Root fields | Profile read capability applies even without a legacy field permission; unknown fields cannot pass | Masked or nested root values require a dedicated owning-provider projection and are closed in the generic scalar path |
| Generic create/update | Target write-field allowlist and another authorization check inside the transaction | BP profile currently declares no direct root-field writes; stewardship/command field policy still requires review |
| BP360 providers, requests, eligibility and Atlas | Host wraps both generic and BP domain authorizers; explicit mapping retains provider/command scope and domain separation facts | This is authorization-boundary integration, not proof of complete nested DTO or independently owned child coverage |
| Export worker | Field/export admission before generation and reauthorization before completion; pages use guarded Records queries | Publication and provider projection qualification remain required |
| Import worker | Current transfer/mutation authority checked before each profiled row application | Governed import adapters and independent child mutation ownership need end-to-end qualification |
| Export download | Reauthorize current entity/scope/fields before minting a URL; missing retained scope/fields close access | Previously issued storage URLs remain bounded by their existing expiry; immediate storage-URL revocation is not established |
| Import error report download | Reauthorize import and underlying mutation mode before URL issuance | Error-report field projection still needs separate qualification |

Legacy descriptors retain their existing transfer authorization resources. New
field and projection guards activate only through explicit target selection, not
through metadata publication alone.

## Second slice: implementation and deployment evidence

The local implementation now includes closed scalar-path policies for all 18 BP
section codes, explicit masking, sensitive summary projection, and fresh-authority
checks around selected projections. These policies intentionally omit undeclared
nested data; they are not yet published provider contracts. Summary completeness
and other protected counts, activity child visibility, and legacy aggregate access
still need coverage and qualification.

Case reads and commands carry the independently stored case identity. Reparenting
checks existing ownership before the proposed destination, and case lists authorize
each child. The candidate `entity_case` profile remains unpublished. Request-provider
SQL rows and counts use the authorized child set and recheck before returning;
document child routes and all embedded payload policies remain outstanding.

Real adapters reload current IAM permissions, resolve stored BP/case ownership and
organization/company compatibility, and consult the owning case service for command
preflight. Release receipts and deployment selections remain separate gates.

The repeatable read-only qualification script
`tooling/scripts/verification/qualify-business-partner-database-adapters.mts` passed
11 checks using the deployed runtime database role. Evidence is recorded in
`governance/policy/reports/business-partner-database-adapters.dev.json`. Its SQL
allow-ID fixtures prove filtering behavior, not authenticated persona entitlement.

Authenticated DEV commands created, validated and submitted an isolated case.
The assigned reviewer completed normal MFA step-up and both approval stages
returned HTTP 200. The requester also completed MFA. Application then returned
HTTP 409: manual intake defaults missing ownership to `internal`, while the SQL
materializer defaults missing supplier type to `general`. The commercial-role
trigger correctly rejects that combination. Validation failed to detect it before
approval. The approved snapshot remains unchanged and the case is unapplied.
Align intake/validation with the role invariant and requalify a coherent request
through normal approval; do not weaken the trigger or rewrite approved evidence. The command report preserves the earlier task-selection harness
error and its correction. This journey exercises the existing deployed shadow image;
it does not qualify the new local backend implementation or authorize activation.

No grants, publication heads, rollout selections or compatibility paths changed.

## First-slice validation

Local verification completed:

- Records: 240 tests passed; 3 skipped.
- Host BP mapping, shadow and Records composition: 27 tests passed.
- IAM shadow wrapper: 6 tests passed.
- Records and host TypeScript checks passed.

New regression cases cover unreviewed activation, unchanged legacy/shadow behavior,
revocation after admission, identity substitution, unknown mappings, query/write
field denial, direct Records access before repository calls, export download after
revocation, denied rows, closed aggregates and metadata-alone non-activation.
Tests use synthetic identities and qualification callbacks. They are not signed
activation receipts or authenticated deployment/workflow qualification.

```sh
pnpm --filter @athyper/server-service-records exec vitest run
pnpm --filter @athyper/server-platform-host exec vitest run \
  src/composition/__tests__/business-partner-backend-mapping.test.ts \
  src/composition/__tests__/business-partner-authorization-shadow.test.ts \
  src/composition/__tests__/metadata-records-vertical.test.ts
pnpm --filter @athyper/server-platform-iam exec vitest run src/__tests__/shadow-authorizer.test.ts
pnpm --filter @athyper/server-service-records typecheck
pnpm --filter @athyper/server-platform-host typecheck
```

## Remaining engineering and completion gate

The full criterion—every entry point using the intended ownership/authorization
contract, including direct APIs—**is not yet satisfied**. The following work is
not blocked by named-role review:

1. Bind and qualify real fresh-IAM, release/receipt, stored ownership and command
   preflight adapters in deployment composition. Do not reuse the advisory shadow
   resolver as an execution preflight implementation.
2. Publish and integrate explicit nested provider field policies, masked projection
   and reveal policies. Generic scalar admission does not authorize entire JSON
   objects, protected counts, or nested provider fields automatically.
3. Give independently owned case/document/attachment records their own profiles and
   stored coordinates. A BP request gateway mapping is not independent-child
   authorization; audit direct child routes that carry only a child ID.
4. Compile authorized row predicates for list aggregation, grouping and export
   counts. Post-query row checks cannot establish complete aggregate authorization.
5. Qualify actual submission, approval, application, import/export delivery and AI
   journeys with representative authenticated users, including revocation during
   execution and direct child APIs.

Named-role decisions continue to gate grant changes and activation. Native
metadata/binding publication and signed compatible rollout evidence remain
separate prerequisites. Keep current grants and legacy enforcement until those
prerequisites and this workstream's engineering coverage are complete.
