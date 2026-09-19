# Entity and record authorization contract

Status: proposed target contract; not an implemented runtime schema.
Contract identifier: `entity-record-authorization/v1`.

Implementation progress and exact remaining gates are recorded in the
[adoption runbook](../runbooks/entity-authorization-adoption.md). The executable
profile/parser and shared evaluation foundation are available; this target
contract is not yet fully enforced by the existing applications.

This document defines the generic boundary from application entry to individual
record fields and commands. MUST, MUST NOT, and SHOULD describe requirements for
adopters of this target contract. Existing implementations remain governed by
their active contracts until explicitly migrated. Publishing this document does
not change grants, metadata, runtime behavior, or rollout mode.

The [authorization ownership ADR](../architecture/authorization-v2-ownership-evaluation-and-plane-boundary-adr.md)
remains authoritative for evaluator precedence, plane-local authority, and rollout.
[Business Partner](business-partner-authorization-profile.md) is the first worked
profile, not an exception embedded in the generic evaluator.

## 1. Architectural decision

An entity defines a kind of resource. A record is one instance with a validated
ownership boundary. Related records may have different ownership boundaries.
Applications, pages, tabs, and sections present capabilities over these resources;
their visual nesting does not create authority or establish resource ownership.

The generic model MUST support tenant-owned, organization-owned, company-owned,
workspace-owned, network-relationship-owned, and other registered resource types.
It MUST NOT assume that every entity is a tenant-wide directory or needs a company.

```text
Experience hierarchy                 Resource hierarchy
Application                          Plane + tenant boundary
  Workspace                            Entity record
    Collection / record surface          Owned child
      Tab / section                      Independently owned related record
        Field / action                   Scoped assignment or configuration

Experience bindings reference resource policies; they do not grant access.
```

## 2. Vocabulary and boundaries

| Concept | Meaning | Authority |
| --- | --- | --- |
| Identity context | Verified actor, tenant, plane, assurance and authorization revision | IAM |
| Resource ownership | Boundary owning the existing record or proposed new resource | Owning service |
| Grant scope | Resources within which a capability may be exercised | Plane-local authorization |
| Directory population | Records discoverable under a published policy | Entity policy + registered query resolver |
| View context | Validated selection used to display scoped information | Server context resolver |
| Query filter | Predicate narrowing an already authorized population | Query executor |
| Command target | Existing or proposed resource affected by an operation | Command handler |
| Business applicability | Whether a role, relationship, lifecycle or effective date makes a feature relevant | Domain service |
| Business eligibility | Whether domain rules permit a particular business use | Domain eligibility service |

A filter MUST NOT widen authority. A selected context MUST NOT create a grant.
A domain role such as supplier MUST NOT be interpreted as an IAM role. Visibility,
authorization, applicability, and eligibility MUST remain distinct decisions.

## 3. Policy ownership and publication

Studio authors definitions and bindings through the existing metadata graph.
Published releases carry immutable runtime contracts to their owning planes.
Each runtime plane evaluates its own grants and policies. Cross-plane references
do not transfer grants; disclosure requires the receiving/sending authorities'
existing relationship contracts.

Use the existing entity operation, permission, rule, scope-binding, presentation,
and field metadata as foundations. Introduce extensions only for semantics those
structures cannot represent. Do not create a second editable permission catalog
inside React components, Business Partner adapters, or presentation JSON.

Each entity profile MUST declare the following logical contract. These names are
design vocabulary, not accepted JSON properties until a parser is implemented.

| Contract area | Required declaration |
| --- | --- |
| Identity | Entity code, owning plane, contract version |
| Ownership | Registered ownership resolver and supported owner boundary |
| Directory | Discovery operation, population resolver, safe projection, supported filters |
| Record | Read operation and record-admission policy |
| Relationships | Target entity/provider, cardinality, ownership and authorized traversal rule |
| Scope profiles | Typed coordinates, trusted sources, resolver and compatibility checks |
| Operations | Stable operation key, plane permission binding, target, scope profile, handler and discovery policy |
| Field policies | Field/group references, read/mask/reveal/change policy and allowed query uses |
| Surfaces | Application/workspace/section capability references and presentation bindings |
| Versioning | Descriptor and binding compatibility requirements |

Presentation controls labels, grouping, placement and registered renderers.
It MUST NOT contain executable authorization expressions, arbitrary SQL, or
browser-authored authority. Runtime providers remain registered, reviewed code.

## 4. Evaluation by experience level

| Level | Required evaluation | Must not imply |
| --- | --- | --- |
| Application | Plane/tenant admission, entitlement, application-entry capability | Entity or record access |
| Workspace | Published entry capability for that workspace | All child operations |
| Collection | Discovery/read capability plus authorized population constraints | Full record or unrestricted field access |
| Record | Specific record admission, ownership, applicable grants and denials | Access to every child record |
| Tab | Availability of referenced discoverable sections/capabilities | A new security scope |
| Section | Resource/read policy, applicability, required context and provider availability | Reveal or change permission |
| Field | Permitted representation and operation-specific change policy | Authorization inferred from a visible label |
| Action | Discovery decision over the existing/proposed target | Permission to execute later |
| Command | Fresh authorization, target validation, lifecycle and concurrency checks | Authority from a previous UI response |

Application/workspace entry capabilities MUST be published references. Capability
composition uses explicit registered rules; clients MUST NOT guess access from
entity names, route prefixes, or the presence of child buttons.

The same admission logic MUST cover direct URLs and APIs. Owning services may
resolve minimal internal coordinates to authorize a resource, but MUST NOT return
its protected payload before admission.

## 5. Scope resolution

A scope profile defines typed dimensions and whether they are required for a
specific operation. Examples include `tenant`, `organization`, `company`,
`workspace`, and `network_relationship`; exact identifiers and semantics belong
to the registered resolver. The platform does not force a company/legal-entity
pair on entities whose ownership model does not require it.

Coordinate sources MUST be explicit:

1. Verified identity supplies tenant and plane; client values cannot override them.
2. Stored ownership supplies the scope of an existing target.
3. A registered relationship resolver supplies validated derived coordinates.
4. Command input supplies proposed target coordinates, validated against catalogs
   and applicable grants before any mutation.
5. An explicit view selection supplies read context only after validation.

Conflicting coordinates MUST be rejected, not silently preferred or merged.
Changing ownership or moving a resource requires an explicit operation with both
source and destination checks. It is not an ordinary editable owner field.

The shell may suggest a default. The application MUST explicitly validate and
adopt it before use and display the adopted context. Local section filters MUST
be identified as local. Multi-company directory filtering MUST NOT be interpreted
as one command scope. Bulk operations require defined per-target authorization
and atomicity/partial-result semantics.

Missing required coordinates produce `context_required` during discovery when
the caller has authority to discover the operation. Invalid, incompatible, or
unauthorized coordinates do not become permission-only retries.

## 6. Directory and record admission

Every profile explicitly chooses its discovery population: tenant directory,
authorized ownership scopes, relationship-derived population, or another
registered policy. Tenant-directory semantics MUST have explicit published
admission rules and reviewed grants. No generic retry may broaden a scoped grant
because a caller omitted coordinates.

An entity may expose a limited discovery projection while restricting full record
read. Such a profile declares separate discovery/read operations and projections.
Clients MUST handle a discoverable record whose details cannot be opened.

Row constraints MUST execute before pagination, counts, grouping and aggregates.
Search, direct reads, exports, saved views, related-record pickers and AI tools
MUST enforce the applicable policy. A direct read uses record admission and the
published population rule, not an unrelated user's transient list filter.

Empty authorized scope sets produce no accessible rows. A partially unauthorized
filter selection is rejected rather than silently truncated. Opaque cursor and
cache authority includes principal, tenant, plane, authorization revision,
descriptor revision, normalized filters and resolved scope.

## 7. Related records, tabs and sections

Relationship traversal MUST authorize the parent link and target according to the
published relationship rule. Parent read alone MUST NOT authorize an independently
owned child. Owned-child inheritance is allowed only when explicitly declared;
field restrictions and explicit denials remain effective.

Each section binds a provider, resource target, read operation, scope profile,
applicability rule and field projection. Sections containing data with different
ownership boundaries MUST use independently authorized subresources. A banking
tab, for example, can contain account master data and company usage without
pretending that both share one scope.

Authorized cross-scope summaries MUST aggregate only authorized contributing rows.
Counts of protected children require explicit count-disclosure policy. Unknown,
restricted, empty and provider-unavailable MUST NOT all appear as zero or blank.

## 8. Field policy and write enforcement

Use reusable semantic field-policy groups with explicit field overrides. A field
without an override inherits its declared group; it does not acquire public access.
Each published field MUST resolve to a policy or an explicit safe default during
compilation. Sensitivity classification describes data; a policy maps that
classification to capabilities and conditions.

| Dimension | Contract |
| --- | --- |
| Read | Omit, mask, or return the authorized value |
| Reveal | Separate operation for a specific resource/value, with required purpose/assurance/audit |
| Change | Permission for the target command, field group, target scope and workflow state |
| Query use | Explicit permission for search/filter/sort/group/aggregate/export of protected fields |
| Derived value | Disclosure policy accounting for restricted source fields |

The server MUST enforce these rules on summary and detail DTOs, nested values,
exports, AI retrieval, search projections, copy/download sources and error payloads.
Masking a displayed value does not authorize filtering on its raw value.

Writes MUST validate an allowlist of command fields after target authorization;
hidden or read-only fields submitted manually are rejected. Explicit clearing,
omission, defaults and system-maintained values need defined patch semantics.
Mixed-field writes fail atomically unless the operation explicitly defines safe
partial processing. Field visibility does not establish editability.

## 9. Shared access decision and presentation state

The logical result below is a target DTO specification, not a current exported type.

| Member | Requirement |
| --- | --- |
| `state` | `allowed`, `context_required`, `verification_required`, `preflight_required`, `workflow_blocked`, `denied`, `not_applicable`, or `unavailable` |
| `reasonCode` | Stable registered reason; no parsing of human messages |
| `operationKey` / `resourceRef` | Applicable operation and safely disclosable target reference |
| `missingCoordinates` | Only for discoverable operations; typed required selections |
| `nextStep` | Optional registered selection/verification/preflight flow; never an executable mutation URL |
| `decisionRef` | Correlation reference for protected server diagnostics |
| `authorityRevision` | Opaque descriptor/authorization revision binding for stale-state detection |

This result describes access readiness. Section data freshness/emptiness remains a
separate data state. No client can convert readiness into authorization.

The server evaluates all mandatory identity, boundary, policy, denial and scope
checks under the accepted ADR. A contextual state may be exposed only after safe
discovery admission; it MUST NOT mask an explicit deny or reveal an inaccessible
resource. Without safe admission, return a generic denied/not-found response.

Denied actions are hidden by default. A published safe-discovery policy may expose
a generic explanation. Context-required actions can open a selector but cannot
execute. The browser receives neither raw grant evidence nor protected target
names. An unavailable policy/provider never becomes an allow.

## 10. Commands, workflows and temporal context

For existing resources, command scope resolves from stored ownership. For create,
assign, link or extend operations, resolve the proposed target. Authorization MUST
NOT require an assignment to already exist when that command creates it. Existing
parent admission and proposed-target authorization are separate checks.

Initiate, submit, approve and apply are distinct capabilities where governance
requires them. Proposal authority may permit submitting a change to a steward
without permitting direct mutation. Domain eligibility remains a separate gate.

Commands revalidate authority and lifecycle at execution, use expected versions
and appropriate idempotency, and preserve existing audit/outbox guarantees.
Background jobs use explicit actor/service authority and recheck access at work
and result-delivery boundaries; queued payloads are not permission evidence.

Historical views use current authorization over historical data. They MUST NOT
revive expired grants. Mutation actions are suppressed; creating a new proposal
from historical information, if supported, is a separately declared operation.

## 11. Publication and implementation ownership

| Component | Responsibility |
| --- | --- |
| Metadata authoring/compiler | Validate references and emit deterministic contracts |
| IAM/authorization | Evaluate verified grants, explicit denials and policy gates |
| Plane/domain resolver | Resolve ownership, scope compatibility and applicability |
| Query service/provider | Apply authorized rows and field projections |
| Command/workflow service | Execute with fresh target authority and state checks |
| Shared UI runtime | Render safe decisions and context without local permission inference |
| Audit/observability | Protected decision reasons, revisions and correlation |

Publication MUST reject unknown resolvers, unresolved field policies, incompatible
scope sources, missing operation/permission/handler references and ambiguous
bindings. Metadata and authorization bindings activate as a compatible release.
Runtime version mismatch fails closed for affected capabilities with a diagnostic
reference; old responses must not synthesize new actions.

Existing `directoryScope`, `recordPresentation`, related presentations, and list
action contracts remain presentation/query integration points. The new contract
unifies their policy references; it does not replace them with another layout DSL.

## 12. Migration and acceptance gates

1. Inventory entities, ownership, operations, field groups and current grants.
2. Author profiles and resolve ownership/capability decisions before coding.
3. Implement strict versioned types/parsers, compiler checks and contract fixtures.
4. Implement shared scope/access adapters and safe decision DTOs.
5. Compare existing and target decisions in shadow for representative personas.
   Record differences; never union the two allow results.
6. Migrate Business Partner reads, sections, fields, actions and commands together
   under an explicit entity/plane rollout selection. Review each grant change;
   do not automatically widen organization grants into tenant grants.
7. Qualify a company-owned transactional entity and an independently owned child
   relationship before claiming platform-wide generality.
8. Activate compatible metadata/bindings/runtime versions with an audited rollback
   plan. Rollback restores compatible artifacts and grants without restoring
   revoked access; incompatible combinations remain closed.
9. Retire compatibility retries and duplicate permission mappings only after parity.

Required acceptance scenarios:

- App access without directory authority; discovery without full-record access.
- Same record via list, direct URL, section API, export and AI retrieval.
- Empty, single and multiple authorized scopes; conflicting/unauthorized selection.
- Parent allowed with independently owned child denied; safe aggregate counts.
- Masked field queried, exported, revealed and manually submitted in a write.
- First assignment/create; source-to-destination ownership change.
- Role held in one company but not another; explicit deny against another allow.
- Context-required action versus truly denied action; no unsafe reason disclosure.
- Revocation between discovery and execution, cached response, queued job and reveal.
- Historical read under current grants; stale record/contract/authorization revision.
- Publication mismatch, missing resolver, policy outage and unavailable provider.

Completion requires executable contracts, service tests, realistic authorization
fixtures, browser journeys, and migration evidence. Documentation alone does not
establish that an entity conforms.
