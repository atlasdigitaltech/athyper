# Compiled Meta Entity Runtime — Business Partner review contract

Location note: entity paths below are logical references under `entities/`.
Review evidence is in `review/`; schemas are in `../../schemas/entity-artifacts-v2/`.
See [source ownership and relocation rules](../../README.md). Moving these files
did not publish them or complete the in-progress Phase 2 definitions.

Status: **draft for review, unsigned, not deployable by the current runtime**.
This package replaces the previous prototype samples in this folder. It does
not modify the active Neon descriptor, database, compiler, handlers or UI.
`schemaVersion: 2` is a proposed contract revision, not an existing supported
runtime version. Handler and permission names marked proposed require registry
verification before publication. Hashes are real hashes of these draft files;
they are not evidence of a signed or activated release.

The Phase 1 contract implementation now parses these five artifact shapes and the
release envelope at the publication boundary. It validates closed normative
top-level shapes, release membership, dependency references, registered handlers /
renderers / resolvers / evaluators, and child Core field bindings. It also defines
the browser-safe bootstrap/resource wire shapes. It does **not** publish these draft
files, register an entity-runtime API, or replace an active Neon reader.

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
   `flow.base.json` and the 19 small `flow.<request-kind>.json` variants.
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
are retained separately from public data types. Runtime Core includes projectable
fields and compact `serverDependencies` needed for ownership/concurrency checks.
Unused column catalogues live in `review/field-catalogue.json`, outside the release.
`projectionPolicy.unknownField: deny` prevents automatic exposure. Server-only
dependencies are never serialized into browser responses.

`fieldDefaults` supplies handler-only writes, locked customization and static UI
facets once per entity. Fields emit only exceptions. Identity and status fields
are system-managed; BP name explicitly permits presentation facet customization.
`tenantConfig` controls authoring/configuration visibility; it grants no record
permission. UI `visibility` and `editability` remain distinct from authorization.

The identical defaults now live once in `platform/core-field-defaults.v1.json`.
Core artifacts reference that pinned profile. Effective precedence is field,
entity overrides, then platform; validation runs on resolved values. Request forms
own draft `defaultValue` declarations, and materialization owns persisted defaults;
their absence from BP Core is intentional.

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
| Completeness packs | Lazy Overview, role-scope, supplier-company, credit and workforce sections |
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

Run from the repository root:

```sh
python3 tooling/scripts/metadata/validate.py
```

For the mandatory live schema release gate (requires PostgreSQL client):

```sh
# Provide NEON_SCHEMA_DATABASE_URL through the environment/CI secret.
python3 tooling/scripts/metadata/verify_live_schema.py
```

`.github/workflows/bp-artifact-schema-gate.yml` runs both checks; the release build
depends on that workflow. Missing database access blocks the gate. The known local
absence of the request table is expected to fail live validation until the target
schema and reviewed contract agree; offline PASS does not mean releasable.

Completeness items now have validated fact references. Items that gate commands also
reference their exact Operation binding. Informational checks need no command gate.
Manifest indexing and separately authorized export/report execution are specified
in CONTRACT.md; UI query limits remain unchanged.

The validator checks JSON parsing, required common properties, discriminator values,
real hashes, dependency/reference closure, operation bindings, storage and public
types, section field references, translation-key collisions, all 19 source flows
and lossless source coverage. Four negative checks cover phantom columns, corrupt
storage types, inconsistent public types and conflicting translation keys.

`review/storage-catalog.json` records independent read-only PostgreSQL catalog
evidence. The local database lacks `document.business_partner_request`; that table
uses a separately identified source-DDL fallback, bounded before the first table
constraint, with a source-file digest. Recapture evidence after schema changes and
validate the active local Neon development database. These are design checks, not
integration or performance tests.

## Audit correction decisions

- Removed phantom `NOT`/`ELSE` columns and repaired storage/public types from catalog
  evidence. The original unconstrained SQL regex is no longer a validator input.
- Moved catalogue-only fields out of runtime Core and deduplicated field defaults.
- Restored explicit UI facets, tenant configuration and locked identity fields.
  `editRuntimeTier` permits only generic/full override; slot adapters remain deferred.
- Snapshot capability points to the request materialization snapshot binding.
  Additional lifecycle-triggered snapshots require a separately approved mapping;
  they are not silently inferred from `hasLifecycle`.
- Initial unsigned release is numbered 1 with no predecessor. Later releases must
  identify their actual predecessor.
- Shared invariant flow configuration lives in one base Flow. Variants carry request
  requirements, journey/source selection and capture presentation. Resolve once into
  a prepared flow keyed by base and variant hashes, never merge per record request.
- Completeness packs load with their relevant sections, leaving the detail shell lean.
- Translation keys include semantic ancestry; conflicting fallbacks are rejected.

## Explicitly deferred

Production signing/canonicalization, registered execution handlers, complete payload
JSON Schemas, runtime benchmarks and actual
activation remain implementation work. Tenant custom-field storage remains disabled.
Cross-entity field-policy authoring is not implemented: request categorical policies
are retained, and each child continues to require its own server authorization.

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
# Organization business profile additions

The approved initial profile scope is represented in:

- `business_partner/core.json`: controlled Legal Form lookup reference.
- `business_partner/core.json`: primary Business Type, Legal Form, Founded Year,
  Employee Count, reporting date and organization/group scope.
- `business_partner/presentation.section.overview.json`: the same fields on the
  existing lazy overview section.

DDL is in `server/db/ddl/planes/neon/master/18_business_partner_business_profile.sql`.
It includes tenant constraints, lookup validation, organization-only guards, RLS
and role grants. The DDL was checked in a rolled-back local PostgreSQL transaction;
it has not been deployed. Read the organization-profile contract in `CONTRACT.md`
for compatibility rules and outstanding runtime handler/materializer wiring.
The release envelope remains an unsigned review artifact.

## Review gates

`validate.py` checks hashes, storage types, translation structure, query allow-lists,
index evidence, protection/reveal bindings, relation-default compaction and local
permission evidence. `verify_live_schema.py` and `verify_permission_catalog.py` are
target-Neon release gates. The GitHub workflow runs both using the target database
secret; it must pass before activation, including publication of every permission
referenced by the release.

`test_validate.py` runs a mutation suite against a temporary copy of this package.
It proves that invalid policies, missing tenant identity, ineffective indexes,
unmasked protected values, editable server-managed fields, permission mismatches,
unsafe shared request targets, invalid child bindings and translation collisions fail
validation. The validator uses explicit `AssertionError` raises, so these checks also
remain active under `python -O`.

Query/index evidence is expression-aware. The Business Partner name and code query paths use `lower(...)`; their DDL indexes use `text_pattern_ops` for reliable case-insensitive prefix search and their descriptor sorts explicitly use `casefold`. The live gate compares key expressions, operator classes, uniqueness and predicates rather than whole `pg_indexes.indexdef` strings, which avoids PostgreSQL-version formatting differences.

The Business Partner aggregate excludes banking and workforce relations until their persisted ownership paths are published in reviewed storage evidence. Their existing sections stay server-owned; they do not gain aggregate relation authority from a handler name.

The schema gate creates its libpq environment only from `NEON_SCHEMA_DATABASE_URL`: inherited `PG*` variables are stripped and unsupported URL parameters are rejected. It verifies the connected database name, reports the URL host/database on success, and rejects missing, invalid, or not-ready reviewed indexes.

Validate the active local Neon development database with `verify_live_schema.py`
after changing reviewed storage bindings. It compares the reviewed catalog’s columns
and indexes with that local target and does not require a separate baseline database.
