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
- `excluded_until_explicitly_authorized`: catalogue-only; never automatically query/serialize.
- `masked_only`: only approved masked projection; ordinary queries exclude plaintext.
- `handler_only`: no client-directed generic update.
- `server_numbering`: value assigned by the authorized materializer/numbering service.

`nullable` describes storage, not whether incomplete drafts or final commands can omit
it. `validation.requiredOn` describes explicit client field requirements; an empty
list does not waive handler validation. `dynamicFacets` cannot override fixed security,
write-once or database constraints. Engine errors fail closed for writes.

`businessContext` defines scope and coordinate resolution. Ownership comes from the
record, owner link or validated create coordinates. Server authorization validates the
entire coordinate tuple; shared organizations never manufacture LE ownership.
`querySafetyLimits` is an upper bound. Readiness declarations do not execute eagerly.

## Operation

Every operation requires a unique key, permission, registered execution binding and
scope resolver. There is no default public operation. Handler names are symbolic
allowlisted registry keys, never arbitrary module imports, routes or SQL supplied by
clients. Read operations use this same boundary.

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

A Flow is either a selector or one governed request variant. Each variant has a draft
entity, source mapping, required-path contract, step refs, persistence and validation
stages. Required paths are not complete JSON Schema. The registered schema must define
all accepted properties/types and unknown-field rejection before runtime implementation.
Request payload paths use their own namespace, not root storage column names.

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

The server derives safe browser projections; private storage fields and policy details
are not automatically exposed because the artifact is hashed. Browser cache entries
are invalidated on tenant/principal/context changes and never include protected values.
