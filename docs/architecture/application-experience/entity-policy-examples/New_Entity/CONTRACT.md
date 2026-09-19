# Draft property and evaluation contract

This is the normative review specification for this package. It describes proposed
version 2 semantics; it is not documentation of an already deployed parser.

## Common envelope for content

| Property | Type / constraints | Meaning |
| --- | --- | --- |
| `schema` | `athyper.compiled-entity-artifact/2.0-draft` | Explicit draft protocol |
| `schemaVersion` | integer `2` | Consumer parser version |
| `contractStatus` | `draft_for_review` | Must not pass production activation |
| `artifactType` | core, operation, presentation_surface, presentation_section, flow | Closed content discriminator |
| `artifactKey` | unique portable string | Exact immutable manifest lookup key |
| `entityCode` | portable string | Owning contract entity/projection |
| `plane` | neon in this package | Execution/disclosure boundary |
| `dependencies` | unique artifact keys | Resolve exclusively within pinned release |
| `artifactHash` | `sha256:` + 64 lowercase hex | Canonical content digest, excluding itself |

Runtime fields do not contain source fixtures, CI test cases or provenance imports.
Reject unsupported schema versions and required discriminator variants. The future
compiler must reject unknown normative fields; comments belong in review documents.
The validator in this folder checks consistency rather than exhaustive JSON Schema.

Every user-facing string is a translation object with exactly `labelKey` and
`defaultText`. This includes labels, headings, descriptions, help text, empty-state
copy, placeholders, tooltips, option captions and accessibility labels. `labelKey`
is the stable localization identifier; `defaultText` is the readable fallback. Raw
UI strings are invalid in runtime artifacts. Stable machine state uses a code such
as `reasonCode`, never a translated sentence in a `reason` field.

## Core

`storage.kind` is `table` or `handler_projection`. `sourceObjects` is server-only
traceability. `primaryObject` and identity/version columns must exist in the approved
physical schema. A projection may involve several sources without pretending all
columns belong to the primary table. `genericWriteEnabled: false` requires a registered
command/materialization handler; metadata cannot bypass it.

A field has a unique `key`, explicit source binding, public `dataType`, database
`storageType`, nullability, label, `valueOrigin`, `readPolicy`, `writePolicy`, validation
and authoring policy. Domain-typed values reference their existing domain code; do
not infer enum members from its name. SQL defaults, FK constraints and generated
columns remain authoritative even when not expanded in this review catalogue.

- `authorized_projection`: eligible only after entity, section, field and context checks.
- Catalogue-only fields live in review metadata, outside runtime Core and the release.
- `masked_only`: only approved masked projection; ordinary queries exclude plaintext.
- `handler_only`: no client-directed generic update.
- `server_numbering`: value assigned by the authorized materializer/numbering service.
- `system_managed`: client input cannot set the field, even through a generic form.

`fieldDefaults` defines inherited read/write policies, UI facets, authoring policy
and tenant configuration. Per-field overrides are explicit. Customization defaults
to `locked`; a `facet_only` exception never permits altering identity, storage or
authorization. UI `visibility` and `editability` describe presentation behavior,
not authority. `serverDependencies` carries compact unprojected identity/context/
concurrency bindings; it is not a browser field catalogue.

The shared defaults are published once as a Core profile:
`defaultsProfile: platform.core-field-defaults.v1`, pinned through
`defaultsProfileRef` and the release manifest. Resolution precedence is
**field override → entity fieldDefaults override → platform profile**. Merge only
known facet properties; arrays replace rather than concatenate. Resolve and validate
the effective field once during compilation/preparation, then cache it by all input
hashes. A field cannot relax a locked security constraint via this precedence rule.

`defaultValue` is intentionally absent from BP Core. BP is created by governed
materialization: request Presentation supplies draft capture defaults, while the
server/domain and database own authoritative persisted defaults. A UI default does
not authorize a write, satisfy evidence, or replace numbering. Server validation
checks the final resolved proposed payload on submit and materialization. Defaults
are applied only to absent values, never silently over explicit null or user input.

`editRuntimeTier` allows generic and full_override only in this prototype. Core
snapshot capability references the Operation snapshot binding. That binding captures
successful materialization once per receipt; further lifecycle triggers are deferred
until their transition mapping is approved.

`nullable` describes storage, not whether incomplete drafts or final commands can omit
it. `validation.requiredOn` describes explicit client field requirements; an empty
list does not waive handler validation. `dynamicFacets` cannot override fixed security,
write-once or database constraints. Engine errors fail closed for writes.

`businessContext` defines scope and coordinate resolution. Ownership comes from the
record, owner link or validated create coordinates. Server authorization validates the
entire coordinate tuple; shared organizations never manufacture LE ownership.
`querySafetyLimits` is an upper bound. Readiness declarations do not execute eagerly.

`query` is the exact Core allow-list for interactive search, filtering and sorting.
Each entry names a field, allowed matching mode/operator set and an `indexRef` in the
reviewed index catalogue. A field omitted from `query` cannot become queryable through
a list renderer, request parameter or presentation override. Protected values cannot
be query inputs. The prototype permits prefix-normalized search only; substring search
requires an approved dedicated index and contract. The index catalogue is evidence,
not a promise that every predicate combination has the same plan.

Sensitive data uses one `protection` shape: `classification`, mandatory masked
`normalProjection`, optional `reveal`, and optional `protectedSource`. A protected
source never appears in ordinary projections and may expose only a separate masked
field. A reveal names an existing owning operation and its exact permission, and is
no-store, purpose-bound and audited. Contact channels and identifiers are masked-only;
there is no approved Neon contact reveal capability. Tax and banking reveal flows are
explicit and separately authorized.

Aggregate Core may publish `relationDefaults` for repeated lazy relationship behavior.
Each relation inherits those values and states only a meaningful deviation. Consumers
resolve the effective relation before validation; handler identity and authorization
remain explicit on each relation.

## Operation

Every operation requires a unique key, permission, registered execution binding and
scope resolver. There is no default public operation. Handler names are symbolic
allowlisted registry keys, never arbitrary module imports, routes or SQL supplied by
clients. Read operations use this same boundary.

Every descriptor permission appears in `review/permission-catalog.json` with local
published evidence or `requires_catalog_publication` status. That review file grants
nothing. `verify_permission_catalog.py` queries target `authz.permission` and requires
every referenced code to be published before activation. `neon.relationship.*` is the
scoped Business Partner relationship namespace; `neon.business_partner.*` is the
aggregate-action namespace. A UI control cannot create a permission code.

Business Partner record access uses `neon.relationship.business_partner.*`, matching
the existing Neon authorization seed. Attachment lifecycle is shared platform service
authority under `neon.collaboration.attachment.*`; the parent Business Partner read
and attachment resource-admission checks both apply. Comments use the shared proposed
`neon.collaboration.comment.*` family. The draft does not create BP-specific
attachment/comment permissions. Export and import remain deferred until their
separately authorized batch operation profiles are implemented.

Policy bindings require unique `bindingKey`, `policyKind`, `operationKey`, evaluation
stage and kind-specific configuration:

| Kind | Required semantic payload | Outcome |
| --- | --- | --- |
| approval_transition | effective policy reference, journey, workflow binding | Start/resume approval at submit |
| evidence_requirement | evidence classes and conditional requirements, admission evaluator | Admissible or block |
| duplicate_detection | match strategy, resolution mode, input dependencies | Candidates, resolved/not-resolved; advisory only for draft |
| readiness_requirement | fact owner, fact codes, context, evaluation state | All required facts ready or block |
| decision_authorization | task assignment, maker/applicant restrictions, assurance and payload identity | Authorized decision or block |

Policy matching is scoped by plane/tenant/entity/operation and effective context/date.
An absent policy, evaluator failure and a policy denial are distinct typed results.
Required cases all block. Optional workflow absence may continue only through an
explicit optional binding; it does not generate an approval event. No failing policy
can be overridden by a Presentation facet.

Evaluation result contract: `decision` (allow/deny/pending/not_applicable),
`reasonCodes`, `evaluatedAt`, binding/policy revision, input hash and audit correlation.
Evidence and duplicate evaluators may additionally return opaque authorized result
references. The server redacts restricted details before projecting these to UI.
Commands repeat commit-sensitive checks and bind approval to the exact payload/version.

Numbering, print, workflow and disclosure bindings delegate to versioned platform
services. Their service-owned revisions are pinned in execution evidence; an artifact
must not duplicate a state graph or template body. Registry compatibility is a
publication precondition; semantic references alone do not authorize execution.

## Presentation and Flow

Surface section refs resolve only within the release. Section data handlers enforce
current authorization and bounded pagination independently of metadata retrieval.
An empty collection differs from restricted or unavailable data. `fieldBindings`
reference their `coreRef`; `targetFieldBindings` reference `targetCoreRef` on owner-link
surfaces. Additional child cores have their own authorization boundaries.

`actions[].operationKey` must exist on the owning Operation. Placement, ordering and
interaction are UI concerns. Availability returned to the UI is advisory; commands
reauthorize. Completeness remediation uses a reviewed domain-action-to-flow registry.

A Flow is a selector, a base or one governed request variant. The base owns the draft
entity, steps, source-mapping catalogue, persistence and validation stages. Variants
pin `baseFlowRef`, select mapping keys, provide capture presentation slots and declare
their request-specific requirements. The prepared effective flow is cached by both
hashes; per-request inheritance merging and security-relaxing overrides are forbidden.
Required paths are not complete JSON Schema. The registered schema must define
all accepted properties/types and unknown-field rejection before runtime implementation.
Request payload paths use their own namespace, not root storage column names.

Completeness requirements carry an explicit `factRef` (owner entity and code).
The validator resolves every code against the owner's Core `readinessFacts`.
An `operation_gate` requirement additionally identifies an existing Operation
`readiness_requirement` binding containing that exact owner/code. Informational
checklist items remain explicitly informational; they must not introduce command
gates merely to satisfy a validator. Empty root readiness lists do not imply that
Supplier, Customer or Workforce have no readiness declarations.

Interactive query ceilings remain maxPageSize 100 / maxSortFields 3. Presentation
can only narrow them. Exports/reports require a separately authorized server operation
with an approved execution profile (batch/stream limits, timeout, row budget and
audit); that profile is resolved by the export service, never by a presentation
override. No export operation or wider profile is enabled by this prototype.

Form renderers resolve field references/lookup configuration through the compiled
catalogue or registered request schema. Country choices come from the shared reference
service. Source form definitions remain readable in `review/source-coverage.json` for
parity review; they cannot automatically grant fields additional read/write authority.

## Release and implementation gates

A release manifest uniquely pins every content artifact and dependency hash. Internal
refs resolve locally. External service dependencies must resolve against trusted local
registries, with concrete compatibility and version evidence before activation.
An activation updates one aggregate head in a transaction after full validation.
Previous heads and artifact bytes remain available for pinned cases and rollback.

The review envelope intentionally has no signature. Production needs a real release
identifier, signing-key ID, verified signature, exact external version evidence and
an approved standardized cross-language canonicalization. Those are activation
requirements, not values this documentation task can truthfully fabricate.

Release 1 has no predecessor; subsequent releases require `supersedesReleaseId`.
The validator checks field types against independent catalog evidence rather than
the former generator regex. Request-table evidence is explicitly source-DDL-only
because that table is absent locally; it must be checked in the intended deployment
database before activation. Unsupported types and inconsistent public types fail.
Translation keys must not map to conflicting fallback strings across artifacts.

The release manifest is loaded, signature/hash-verified and indexed once per release
hash, into an immutable artifactKey → manifest-entry map. Reject duplicate keys.
Request pinning selects this prepared index, not a fresh linear scan or JSON parse.
Retain indexes for pinned cases; evict only when no supported pinned consumer needs
them. Index keys include the trusted publication/plane/tenant scope.

`verify_live_schema.py` is the blocking release gate. It compares catalogued column
sets, PostgreSQL types/domain bases and nullability against information_schema joined
to pg_catalog on a real Neon database. Missing credentials, inaccessible columns,
connection failure and mismatches all block. Offline validate.py cannot substitute
for this check. The reusable CI workflow runs both checks; release builds depend on
its success. Configure NEON_SCHEMA_DATABASE_URL to the intended qualification database
with catalog visibility. Successful checks on one database do not authorize another
deployment target; activation must repeat the check for that target and release.

The server derives safe browser projections; private storage fields and policy details
are not automatically exposed because the artifact is hashed. Browser cache entries
are invalidated on tenant/principal/context changes and never include protected values.
# Optional organization business profile

The initial scope includes one controlled primary Business Type, controlled Legal Form,
optional Founded Year, and optional Employee Count with reporting date and scope.
These describe the Business Partner organization shared by supplier/customer roles;
they do not establish Company Code or Operating Organization ownership. Person
partners cannot carry these attributes. Revenue remains outside this slice.

`master.business_partner.business_type_value_id` references one existing
`master.business_type` choice. The lookup catalog remains extensible; do not encode
labels as database enum values. A normalized multi-type child is deferred until a
demonstrated domain need.
`master.business_partner.legal_form_value_id` references `master.legal_form`.
Both references validate lookup domain, active status and tenant visibility.
Existing legal-form text is retained for compatibility and historical review;
controlled writes project the lookup code into it. Legacy code writes must resolve
to an active choice. Clearing the controlled ID clears its text projection.
Generic catalog entries do not yet express country-specific legal applicability;
jurisdiction mapping and normalization of historical free text remain follow-up work.

Founded year and headcount fields live directly on `master.business_partner`, because
they are optional attributes of its canonical organization identity. Founded year is
independent of incorporation date and cannot be in the future. Headcount is a
nonnegative integer (zero is known zero; null is unknown), paired with a nonfuture
reporting date and explicit `organization` or `consolidated_group` scope. All three
headcount values must be absent or present together. No employee records or internal
HR counts are inferred.

The Business Partner Core and existing overview section hold these fields directly. All UI labels use `labelKey`/`defaultText`. Changes follow the
governed BP request path; generic writes remain disabled. New handler keys are draft
contracts, not registered implementations. Materialization must validate the owner,
lock/compare its record version, persist children and audit atomically. Profile rows
also increment `row_version`; business-type changes use the owner's version.
The request payload schemas, materializer, lookup controls and Neon read projections
still require application wiring before these attributes appear in the live UI.
Existing view placeholders are not evidence of that wiring. Mesh sharing requires
separate explicit publication/visibility policy; no sharing is implied here.

DDL: `server/db/ddl/planes/neon/master/18_business_partner_business_profile.sql`,
registered in the Neon foundation manifest. The new columns' storage evidence was
captured from PostgreSQL after applying the DDL inside a rolled-back transaction.
This validates DDL shape without deploying it. The live-schema release gate must
pass against a migrated target before activation; the draft snapshot is not a
substitute for that gate.

# Business Partner 360 child-surface rule

Every relation declared by the Business Partner aggregate must be represented by a
published section or child collection in the same release. A section may contain
several child collections, each retaining its own Core and Operation artifact; the
section never copies child fields into the Business Partner Core. Identifiers and
tax registrations share one surface, as do qualifications and certifications.
Business activity contains industry classifications and commodity capabilities;
Network contains governance relations; Roles and Scope contains supplier, customer
and operating-organization assignment collections.

Sensitive identifier values remain masked under their read policy. No identifier
reveal operation is published because no such live capability exists. Tax reveal is
published only through the tax-registration operation and exposed from its child
collection. Contacts publish person rows plus a registered channel aggregate for
email, phone, role and effective-date information; scalar fields are not bound to
one-to-many channel tables. Activity is a distinct event timeline and must not reuse
Business Partner identity fields.

# Projection and operation profiles

`storage.sourceObjects` lists only tables which supply published Core fields. A
registered handler may have private joins, but they do not become descriptor source
objects or schema-gate dependencies until a published projection uses them. Banking
uses `protectedFields[]`: normal reads return `account_last4`; `account_id` is never
serialized in the normal projection and can be returned only by the purpose-bound,
single-use, audited `reveal` operation.

Comments and attachments are platform-owned services. Their sections declare view
permissions and the proposed service operations; those commands are not duplicated
in Business Partner's domain operation artifact. The 17 governed child operations
inherit evaluation, concurrency, transaction and browser-projection rules from
`platform.governed-child-operation.v1`; each child still declares its own operation
keys, permissions, execution handler, scope binding and exceptional behavior.

The structural validator checks every aggregate relation has a Business Partner 360
surface, every Core source table supplies a Core field, every reveal has a matching
protected field and operation, every section has a view permission or an explicitly
operation-authorized parent flow, and every child collection binding resolves to its
target Core. `validate.py --release-ready` is separate: it rejects unsigned
review-only releases and every unresolved `draft_*` registration or permission.

### Query index contract

Every query entry declares a mode. `prefix_casefold` search and `casefold` exact filters or sorts compile to `lower(field)`; `value` compiles to the stored field. A reviewed index records structured key parts, including expression and operator-class evidence. Casefold prefix search requires `text_pattern_ops`, so its indexability does not depend on the database default collation. Sorts also declare `mode` and `collation`; Business Partner’s default name sort is `lower(name)` under `database_default` collation.

A tenant-scoped filter must use an index whose leading key is `tenant_id` followed by the field expression. The registration-country index follows this rule. Export and reporting remain separately authorized surfaces and do not inherit list-query widening.

### Relation ownership contract

`responseMustBind` names handler response aliases, never an assumption that every alias is a field in the target Core. Each alias is backed by `ownerMapping`: a direct owner column, a polymorphic owner, or a reviewed foreign-key path. The validator checks every mapped table and column against storage evidence. A relation without a persisted, reviewed ownership path is excluded from the Business Partner aggregate runtime.

Banking and workforce remain available only through their existing server-owned sections while their ownership mappings are completed; they are deliberately absent from Core `relations` and cannot be treated as aggregate-loaded child collections.

### Permission collection fields

`fieldPermissions[]` is a list of canonical permission codes and is checked by both offline descriptor validation and the live permission-catalog gate. It has the same publication requirement as `permissionCode`, `viewPermission`, and `readPermissionCode`.

### Sorting and collation

Prefix search and ordering use separate indexes. `text_pattern_ops` indexes serve casefolded prefix search. Business Partner list sorting uses separate default-opclass indexes on `lower(name)` and `lower(code)`, with `mode: casefold` and `collation: database_default`. A descriptor cannot claim a pattern-opclass index for a database-default ordered sort. The live gate requires every reviewed index to be valid and ready before release.

### Business Partner organization profile applicability

Legal form, business type, founded year, employee count, employee-count reporting date, and employee-count scope apply only when `partner_category` is `organization`. Their `dynamicFacets` hide them for person records. The descriptor behavior matches the server and DDL rule; UI evaluation does not replace server validation.

### Release dependencies and protection vocabulary

Every `serviceKey` used by an artifact must be declared in the release envelope. If any artifact uses an `evaluatorKey`, the envelope must declare `neon.evaluator-registry.v1` and activation must validate that registry. Protection uses separate `sensitivity` (`internal` or `restricted`) and optional `dataCategory` (`personal_contact` or `bank_account`); the retired `classification` field is invalid.
