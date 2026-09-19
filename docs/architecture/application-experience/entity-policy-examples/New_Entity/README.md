# Compiled Meta Entity Runtime — Business Partner review contract

Status: **draft for review, unsigned, not deployable by the current runtime**.
This package replaces the previous prototype samples in this folder. It does
not modify the active Neon descriptor, database, compiler, handlers or UI.
`schemaVersion: 2` is a proposed contract revision, not an existing supported
runtime version. Handler and permission names marked proposed require registry
verification before publication. Hashes are real hashes of these draft files;
they are not evidence of a signed or activated release.

## Artifact boundaries

| Type | Owns | Consumption |
| --- | --- | --- |
| Core | Physical field bindings, public field catalogue, relation references, capabilities, context requirements, readiness fact declarations, masking constraints | Server metadata resolution for reads/writes; browser receives a safe projection |
| Operation | Every read/command permission and scope, execution binding, typed policy bindings, numbering/print/disclosure bindings, lifecycle pointer | Server reads and writes; browser receives only action availability |
| Presentation surface | List layout or detail shell, ordered section references, action placement, reviewer layout | Surface open; cached by artifact hash |
| Presentation section | One section's fields, renderer, authorized data-provider binding and resource states | On visibility/open, with bounded prefetch |
| Flow | Request-kind selection, draft owner, steps, request validation contract, source mapping and resume rules | Selected intake journey only |
| Release envelope | Exact dependency set, hashes, compatibility, target plane, atomic activation and signing coordinates | Resolve by immutable release ID; never inline into every artifact |

These are five content types plus one release envelope. An owner presentation
profile is an **authoring input**, not another runtime type. Its resolved output
would be a normal Presentation section in an owner's release.

## Language translation contract

All runtime-facing copy uses this exact object shape:

```json
{
  "labelKey": "entity.business_partner.section.addresses.label",
  "defaultText": "Addresses"
}
```

This applies to labels, titles, descriptions, help text, placeholders, tooltips,
empty states, option captions and accessibility labels. A renderer resolves
`labelKey` from the active locale and uses `defaultText` only when that translation
is unavailable. Runtime artifacts never carry a bare user-facing English string.

Technical state uses stable codes, for example
`"reasonCode": "CUSTOM_ATTRIBUTES_STORAGE_NOT_APPROVED"`; it is not UI copy.
The source-bundle review fixture intentionally preserves its original strings and
is excluded from the runtime release. `validate.py` rejects any raw runtime-facing
copy so the rule cannot silently regress.

Artifacts are independently compiled and cached. A compatible dependency set
is activated atomically. Unchanged artifacts retain their hashes across new
releases. The browser never combines arbitrary latest versions of children.

Property definitions and evaluation rules are in [CONTRACT.md](CONTRACT.md).

Start review with:

- `business_partner/core.json`, `operation.json`, `presentation.detail.json`.
- `address/core.json`, `address_link/core.json`, `address/presentation.section.json`.
- `business_partner_request/operation.json`, `presentation.review.json`, and
  the 19 `flow.<request-kind>.json` files.
- `business_partner/release.json` for the complete artifact inventory.
- `review/source-coverage.json` for every property of the original bundle.

## End-to-end behavior

1. Resolve the authorized plane/tenant publication head once. Pin that release
   for the request. Verify compatibility and obtain prepared structures from
   process-local cache or the durable artifact store.
2. Authorize root read through Operation. Resolve persisted ownership and any
   explicitly selected workspace Company Code/Operating Organization scope.
3. Return an authorized detail shell and root data. Resolve section metadata
   and data only when requested; pagination applies independently per section.
4. A change action creates a governed `business_partner_request`. The selected
   Flow owns capture/resume; it never directly writes master records.
5. Save validates a partial draft. Submit validates the full registered payload
   schema, source provenance, scope, evidence and duplicate resolution; it starts
   the required workflow and pins the reviewed payload and policy revision.
6. Approve validates task assignment, SoD, elevated assurance and the exact
   reviewed payload. It does not start another approval workflow.
7. Materialize checks current authority, target record version, evidence,
   approved payload and context again. Domain writes and audit are atomic;
   external effects use a transactional outbox. Numbering allocates at this
   boundary with a durable idempotency receipt.
8. Invalidate affected record/readiness result caches. Immutable metadata caches
   remain reusable until their artifact content changes.

All business child mutations currently point to governed request handlers in
this design. This is an explicit policy for this prototype, not a claim that
all existing endpoints already follow that route.

## Business context

The canonical Business Partner and Supplier/Customer role identities remain
tenant-wide. Selecting a Legal Entity never rewrites their ownership.
Company-specific profiles and effective organization participation are separate
extensions. A company action validates the selected Company Code's Legal Entity,
current principal authority, organization/company assignment, effective capability
and partner role participation together. Procurement and sales capabilities are
required for the corresponding role extensions.

The system root “All operating organizations” is a browse coordinate only.
Hierarchy browsing expands to authorized descendants explicitly; ancestor
selection does not grant leaf command authority. One shared organization can
serve multiple companies without acquiring one inferred owning Legal Entity.

Workforce employer, company and org-unit coordinates have separate semantics;
an HR org unit must not be silently treated as an Operating Organization.
A persisted Type B owning-LE rule remains a separate domain decision. The draft
forbids inferring it from the active selector.

## Relations and physical bindings

Fields have explicit `binding.sourceObject` + `binding.column`. Storage SQL types
are retained separately from public data types. The catalogue is not permission
to SELECT every field: `fieldSelection.default: deny` and `readPolicy` constrain
normal reads; domain handlers must approve additional projections.

Verified corrections include:

| Public concern | Actual source |
| --- | --- |
| BP display name | `master.business_partner.name` |
| BP country | `registration_country_code` |
| BP optimistic version | `record_version` |
| Country reference value | `shared.country.code` (not `iso2`) |
| Address primary/purpose/effective period | `master.address_link` |
| Address postal fields | `master.address` |
| Tax registration type | `registration_type_code` |
| Bank identity/value | `master.bank_account`, linked through owner and company usage tables |

Reusable Address presentation accepts its owner binding from the parent. An
Address Link has its own entity contract: changing its primary flag does not
mutate the canonical address or another owner's link. Generic SQL generation
from client-supplied identifiers is prohibited. Handler-backed projections remain
necessary for complex joins, privacy and domain validation; the architecture
removes hardcoded **composition**, not legitimate server domain behavior.

Dedicated `custom_attributes` columns are not assumed to exist. Custom fields
are disabled until their storage migration and validation contract are approved.

## Operation and policy semantics

`policyBindings` is one discriminated list. Supported examples are
`approval_transition`, `evidence_requirement`, `duplicate_detection`,
`readiness_requirement` and `decision_authorization`. Each kind needs its own
schema and registered evaluator; no arbitrary action code executes from JSON.

| Condition | Required behavior |
| --- | --- |
| Required policy absent | Block |
| Policy unavailable, malformed or evaluator missing | Block |
| Explicitly optional workflow | May continue without workflow only when declared; never manufacture an approval |
| Policy denial | Block with safe reason code |
| Multiple applicable decisions | Deny overrides |
| Unrecognized operation/transition | Deny |

The shared context uses `record.current`, `record.proposed`,
`record.changedPaths`, `actor`, `businessContext`, `evidence`, and `asOf`.
Expressions are bounded, allowlisted and side-effect free. Preparation may be
cached; decisions depending on records or actors are evaluated at execution.

Readiness **declarations** live on the relevant role Core. Results are contextual
runtime facts with timestamps, dependency versions and reason codes. They may be
ready, not-ready, unknown or not-applicable. Operation decides which facts gate an
action; Presentation supplies checklist wording and remediation. Initial creation
must evaluate proposed post-materialization state when appropriate, avoiding a
requirement that a not-yet-created supplier already be active.

Duplicate detection runs on save (advisory), submit and materialize. Changing its
inputs invalidates prior resolution. Exact database uniqueness remains mandatory.
Evidence checks validate owner, content version/hash, malware status, evidence
class and effective validity. A previous approval never authorizes a changed draft.

Lifecycle and approval workflow bodies remain service-owned. Review fixtures
preserve serial/parallel stages, quorum, SLA, reminders, escalation, conditions and
SoD from the source. Runtime operations reference the service rather than embedding
those bodies. Workflow instances pin their policy/stage revision.

## Presentation, review and shared capabilities

The detail shell preserves all 16 source sections and adds lazy attachment and
comment sections. Risk remains excluded, matching the source bundle. Section
visibility is enforced before querying; hidden metadata is not authorization.
Each section supports loading, error, empty, restricted and ready.

The request reviewer includes reviewed payload, masked field differences,
validation, duplicate resolution, evidence, readiness and workflow context.
Missing baseline produces an explicit unavailable comparison, never invented
changes. Reviewer buttons use current server decisions and are reauthorized at
submit. Completeness remediation uses a registered domain-operation-to-flow map;
an unmapped action is hidden with a diagnostic, never guessed.

Attachment/audit/comment services are shared capabilities. No binary content is
embedded in metadata. Owner links, scan admission, evidence version retention,
legal hold and authorized download stay with the document service. Proposed upload
limits in Operation need product approval. Deleting a link is distinct from purging
content. Retained evidence may pin an older immutable version.

Masking constraints are structural Core declarations. Plaintext never enters the
normal masked projection. Reveal requires elevated assurance, a single-use
purpose-bound expiring claim, current authorization and same-transaction audit;
revealed values are not cached. Banking supports the real legacy/plaintext versus
protected-token-with-digest storage modes; this draft does not claim every account
already uses a vault token. Person and workforce fields require separate disclosure
checks even when present in the catalogue.

UI placement and interaction modes belong to Presentation. Backend handler keys
belong to Operation. The browser cannot execute raw handler names or access private
storage bindings; a server registry resolves allowlisted commands.

## Source bundle coverage

The original bundle remains untouched. `review/source-coverage.json` preserves
its exact decoded property values and file digest, including all source policy,
form, view and compatibility values. These review fixtures are excluded from the
runtime envelope and must never be sent as one giant runtime response.

| Source block | Destination |
| --- | --- |
| 19 request schemas | 19 request Flow required-path contracts; actual complete schema stays with the registered validator |
| Five form descriptors | Five independently loaded request Presentation sections |
| Five view descriptors | Root/request surfaces, lazy sections, plus legacy-retirement review input |
| Field policies | Request Core, deny-overrides composition, portal allowlist |
| Evidence, duplicate rules | Request Operation typed policy bindings |
| Readiness gates | Supplier, Customer and Workforce Core declarations |
| Completeness packs | BP detail Presentation; evaluate only requested facts |
| Four workflow definitions | `review/workflow-policy-fixtures.json`; service configuration input |
| API/import/internal/Mesh/portal mappings | Selected request Flow only; no direct master write |
| Mesh safe schemas | BP share operation: explicit fields, prohibited paths, recipient relationship and selective acceptance |
| Validation declarations and reasons | Request Operation |
| Compatibility/source hashes | Review traceability plus explicit draft envelope compatibility |

Source required arrays contain dotted paths, not full JSON Schema properties.
The draft labels them `required_path_contract` so `additionalProperties: false`
without a properties catalogue is not misrepresented as executable JSON Schema.
Workforce Mesh intake is excluded because the source Mesh mapping allows only
supplier/customer, despite the broader legacy request `supportedSources` arrays.
Governance journeys currently permit internal/API capture explicitly.

## Release, hashing and caching

`release.json` inventories every runtime artifact, including child/lookup artifacts.
Artifacts carry dependency keys; the immutable envelope maps each to an exact hash.
File paths are local review locators, never uncontrolled network fetch instructions.
Changing a section updates its hash and the release hash; unrelated hashes stay
unchanged. Transitive dependency availability and compatible schemas must be checked
before activation; cyclic eager initialization is rejected.

The review hash algorithm is explicitly `python-json-sort-keys-compact-utf8-v1`.
It excludes the root `artifactHash` property. The release digest excludes the root
`releaseHash` and `signature`. Arrays preserve semantic order. Before cross-language
production signing, select one standard canonicalization and add cross-language test
vectors. A null signature is intentional: activation must reject this package.

Use a process-local prepared-model cache backed by a durable artifact store and,
optionally, Redis for serialized IR. Key structures by plane, effective tenant/overlay
scope, artifact key/hash and runtime/compiler version. Resolve overrides once at
compile time. A release-head cache is separate from the artifact cache.

Record/result keys additionally include record version, owner, Company Code,
Operating Organization, effective date, authorization epoch and principal where
needed. No shared cache stores reveal values or personalized authorization results.
Reads pin a release; commands verify submitted release/version against current
security authority. Retain pinned artifacts for in-flight requests and governed
cases. On Studio outage use the last verified local release; Redis is not the sole
source of availability.

## Validation and implementation boundary

Run from this directory:

```sh
python3 validate.py
```

The validator checks JSON parsing, required common properties, discriminator values,
real hashes, dependency/reference closure, operation bindings, fields against current
DDL, section field references, all 19 source flows and lossless source coverage.
These are design consistency checks, not runtime integration or performance tests.

Before production adoption:

1. Approve this schema and typed policy/result contracts; add production JSON Schema
   and compiler validation including all nested structures and expression budgets.
2. Register/verify handlers, permissions, renderers, lifecycle transitions, evidence
   classes and full request schemas. The symbolic registry entries in this package
   are proposals, not implementations.
3. Generate safe browser projections; implement authorization, section boundaries,
   prepared-model caching and atomic dependency-set publication.
4. Run the real BP/Address owner-link slice, then supplier/customer/workforce flows,
   with privacy, tenant isolation, stale-approval, concurrency and rollback tests.
5. Benchmark cold/warm shell, section latency, transferred bytes and bounded SQL
   counts against current BP360. Retire legacy paths only after the consumer-zero
   signal and equivalent behavior are demonstrated.

`entity_contract_test_case` and `entity_baseline_import*` remain CI/authoring-only.
No runtime source fixture, SQL migration, publication or activation is performed by
this documentation package.
