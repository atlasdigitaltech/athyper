# Capability profiles and runtime controls — final design

Date: 2026-09-28

Status: implementation-ready specification following design/audit review; not shipped. This document
does not claim the proposed profile resolver, artifact type, or effective-limit
resolver is implemented. No database or publication changes accompany this design.

## 1. Decision and scope

Standardize Comments and Attachments defaults through versioned source-file
profiles, resolved during entity compilation. Preserve the current shared services,
runtime bindings, tenant isolation, and record admission. Do not create a profile
registry database, a new approval workflow, or independent profile publication now.

Use the same validated profile contract behind a replaceable source resolver so
Studio-managed profiles can be introduced later without rewriting entity declarations.
Country is the initial consumer; a generic test entity proves reuse. No Business
Partner metadata is introduced or restored by this work.

An entity has collaboration capabilities; it does not inherit from a Comment or
Attachment entity. Collaboration records stay in their existing document tables.

## 2. Audit disposition and verified implementation boundaries

| Review point | Disposition |
| --- | --- |
| Preserve the existing parameter resolution contract | Accepted. `parameter-runtime.ts` selects the exact request plane, reads the effective tenant configuration, validates it, and fails closed for invalid contracts. |
| Catalog and tenant feature overrides are already separate | Accepted. However, the catalog itself also carries operational fields such as rollout percentage and effective dates. Table separation alone does not establish an end-to-end Studio publication workflow or an emergency-disable precedence guarantee. |
| Reuse hash-pinned capability dependencies | Accepted with an explicit extension. `CapabilityPolicyReference` has `artifactKey`, `hash`, and `plane`; existing retention/audience references are checked against same-plane artifacts and Operation dependencies. Generic profile references are not currently admitted. |
| Compute restrictive effective controls in one place | Accepted. A server-owned resolver returns the browser projection and the limits used by command enforcement. The UI does not recompute security policy. |
| Explicit multi-plane targets and receipts | Accepted. Shared DDL is not a shared database. Every intended plane needs a target, successful application, activation and verification. |
| Use nullable tenant identity as the migration criterion | Insufficient by itself. Ownership, mutability, security meaning, consumer semantics, and existing lifecycle determine placement. |
| Existing policy engine remains authoritative | Accepted. Its tests, versioning and activation are not replaced by entity publication. |

Existing evidence:

- `server/packages/platform/control-admin/src/parameter-runtime.ts`
- `server/packages/platform/control-admin/src/kysely-parameter-repository.ts`
- `server/packages/platform/control-admin/src/kysely-feature-flag-repository.ts`
- `server/db/ddl/common/control/03_tables.sql`
- `server/db/ddl/common/control/12_parameter_runtime_seed.sql`
- `server/packages/contracts/publication/src/entity-capabilities.ts`
- `server/packages/contracts/publication/src/artifact.ts`
- `server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.ts`

The current artifact parser admits core, runtime contract, operation, presentation
surface/section and flow artifacts. A generic capability-profile artifact therefore
requires contract/parser/compiler changes; it cannot be added as unchecked JSON.
The existing local Country publication targets must be read from its manifest;
examples such as `targetPlanes: ["neon"]` are not evidence of its actual targets.

## 3. Configuration ownership

| Setting | Authority | Effective time |
| --- | --- | --- |
| Comment audience vocabulary/default, rich-text limits and supported features | Profile plus permitted entity overrides | Entity publication activation |
| Attachment size, batch count, comment attachment count and permitted MIME types | Profile plus permitted entity overrides | Entity publication activation |
| Mandatory scanning and admission | Security/service contract; profile may express requirements, never bypass them | Enforced on relevant commands |
| Operational upload ceiling and service availability | Existing operational configuration/provider | Defined operational reload boundary |
| Density and similar runtime preferences | Parameter definition plus authorized tenant value | Existing declared reload behavior |
| Rollout, emergency disable, experiments | Feature-flag machinery | Audited operational change |
| Conditional business decisions | Existing policy engine | Its own activation lifecycle |

Never maintain the same default independently in a profile and a parameter.
Published product limits and operational ceilings are separate named concepts.
Feature enablement never grants permissions, entitlements, record access or partner
sharing. External Mesh audiences remain deferred.

## 4. Source profile and entity authoring contracts

Proposed source location:

```text
metadata/profiles/collaboration/comments/standard.v1.json
metadata/profiles/collaboration/attachments/standard.v1.json
```

Paths and fields below are proposed, not existing accepted authoring syntax.

```json
{
  "schema": "athyper.capability-profile/1",
  "profileCode": "platform.collaboration.comments.standard",
  "profileVersion": 1,
  "capabilityKey": "comments",
  "defaults": {
    "defaultAudience": "public",
    "allowedAudiences": ["public", "private"],
    "maxTextLength": 5000,
    "maxDepth": 5,
    "features": { "replies": true, "mentions": true }
  },
  "permittedOverrides": {
    "defaultAudience": { "allowedValues": ["public", "private"] },
    "maxTextLength": { "minimum": 1, "maximum": 5000 }
  }
}
```

The example is abbreviated; the actual schema supplies or requires every property
needed for a valid final binding. Entity-owned service/admission/operation wiring
stays compiler-controlled or explicitly validated, not arbitrarily overridable.

An entity authoring member adds a profile selection to the existing declaration:

```json
{
  "capabilityKey": "comments",
  "declaration": {
    "enabled": true,
    "serviceKey": "platform.comments.v1",
    "ownerEntityCode": "country",
    "load": "lazy",
    "includeInAggregateData": false
  },
  "profile": {
    "code": "platform.collaboration.comments.standard",
    "version": 1
  },
  "overrides": { "defaultAudience": "public" }
}
```

Rules:

- Selection is exact code/version; no `latest`, implicit environment fallback or
  network fetching during compilation.
- Profiles have no inheritance chain in the first implementation.
- Published profile versions are immutable. A checked-in version/content lock or
  equivalent release comparison rejects changed bytes under an existing version.
  This source integrity check is not a second runtime dependency reference.
- Disabled capabilities cannot retain executable bindings or overrides.
- Source schema version, profile version and entity release number are independent.
- The compiler binds ownerEntityCode and the owner-specific attachment bindingRef;
  a generic profile must not contain a hardcoded Country identity.
- Existing explicit bindings remain supported during onboarding. Authoring modes
  are mutually exclusive and rejected at parse time when combined; neither mode
  takes precedence. Migrate Country deliberately, not through a hidden fallback.

### 4.1 Authoring modes and validation boundary

| Source mode | Accepted member shape |
| --- | --- |
| Disabled | Disabled declaration (optional reasonCode); no binding, profile or overrides. |
| Explicit | Enabled declaration and complete binding; no profile or overrides. |
| Profile-based | Enabled declaration and exact profile code/version; optional overrides; no explicit binding. |

Reject binding plus profile even if the resolved values would be identical. Reject
standalone overrides without a profile, enabled members with neither binding nor
profile, and disabled members carrying any binding/profile/overrides. Presence is
not truthiness: null or empty values do not make conflicting properties disappear.
An empty overrides object is allowed only in profile-based mode. Invalid declarations,
incomplete bindings and invalid profile references still fail their field validators.

This rule applies to source authoring members only. Compiled output legitimately
contains a resolved binding and its profilePolicy reference; do not apply source
mode exclusivity to compiled artifacts or reject that required dependency pin.

Implementation seam:

1. Validate the source envelope sufficiently to inspect its own properties, then
   run an authoring-mode guard before field-level declaration/binding validation,
   profile resolution or compilation. Reject ambiguous or missing mode combinations
   with PublicationContractError code CAPABILITY_AUTHORING_MODE_CONFLICT and a
   member path plus the expected forms. Do not perform partial profile resolution.
2. Pass the unambiguous declaration and explicit/resolved binding to the existing
   field validators. Keep their ENTITY_CAPABILITY_INVALID error behavior unchanged;
   extend their admitted dependency fields only as required by section 5.
3. Retain existing disabled-declaration/member checks instead of introducing a
   second interpretation of disabled semantics. parseCapabilityDeclaration already
   permits only enabled/reasonCode for a disabled declaration; sibling binding
   validation is handled at the member boundary, not by that declaration parser.
   The source boundary must additionally cover the new profile/overrides properties.

The existing fail() helper always emits ENTITY_CAPABILITY_INVALID. Do not broaden
it merely to introduce the authoring-mode error: use the dedicated guard for that
distinct failure class. The new profilePolicy field parsing and compiled dependency
validation remain necessary additions, not existing shipped behavior.

### 4.2 Parser-first tests

Before changing compiler integration, write the three accepted-form tests (disabled,
explicit, profile-based) and the binding-plus-profile rejection test. These four
cases are the minimum, not the complete suite. Add negative cases for standalone
overrides, binding plus overrides without profile, enabled with neither mode,
disabled with each forbidden sibling, null/empty conflicting properties and invalid
profile identity/version. Assert the mode error occurs before the resolver is called.
Preserve existing field-error tests and verify malformed fields in an unambiguous
mode still report ENTITY_CAPABILITY_INVALID. Include a compiled-output regression
proving a resolved binding with profilePolicy remains valid when its dependency pin
is valid. Tests are planned acceptance requirements until implemented and executed.

Override resolution is deterministic and schema-directed: absent means inherit;
scalars replace; arrays replace as a whole and must satisfy subset constraints;
only allowlisted nested paths may change. Unknown keys, null-as-delete, excessive
limits and incompatible audiences fail compilation. Enforce default audience
membership, comment/attachment capability consistency, schema support, and immutable
admission/security properties on the final resolved binding.

## 5. One enforced dependency-pinning mechanism

Implementation checkpoint (2026-09-28): source members persist `profile`,
`profileDefinition` and `overrides` on the existing Studio
`metadata.entity_capability` row. `profileDefinition` is the reviewed, validated
source snapshot, included in the authoring contract hash. File-backed ingestion
hydrates it only after checking the source lock; publication compiles that stored
snapshot, not whatever a mutable source file contains later. A snapshot is invalid
outside profile-based source mode. No independent profile registry is introduced.
The additive Studio migration must precede profile-based authoring writes.

The compiler emits a same-plane `capability_profile` artifact and injects its
`profilePolicy` pin into the resolved Operation binding. Runtime operation reads
resolve the referenced artifact from the pinned release manifest and reuse the
capability graph validator, including on cached artifact reads. These implemented
paths are not evidence of signed deployment acceptance; see the progress report.

Reuse the existing `CapabilityPolicyReference` structure and checks. Add a
semantically named `profilePolicy` reference to the common capability binding,
typed with that existing shape; do not repurpose `retentionPolicy` or
`audiencePolicy` to mean a defaults profile.

Proposed compiler steps:

1. Resolve exact source profile and validate source/override schemas.
2. Materialize a typed `capability_profile` artifact for each target plane in the
   consuming entity's release. Extend the closed artifact schema explicitly.
3. Include profile identity/version, defaults and override rules in its hashed
   content; compute hashes using the existing canonicalization pipeline.
4. Resolve the entity binding and attach `profilePolicy: {artifactKey, hash, plane}`.
5. Add the artifact key to the Operation artifact's dependencies.
6. Extend graph dependency extraction and `validateEntityCapabilities` to validate
   the new reference with the existing same-plane/hash/membership checks, plus the
   expected artifact type and capability/profile identity.
7. Include all referenced artifacts in the signed release manifest. Validate before
   preview, publication and runtime admission; never silently ignore an unknown type.

Per-plane artifact hashes may differ because plane is part of the artifact.
Cross-plane agreement means matching intended profile semantics and source version,
not necessarily byte-identical compiled artifacts.

No independent capability-profile publication, registry lookup or advisory
`profileHash` field is introduced now. A profile artifact is a dependency, not an
entity owner. Artifact membership must not influence entity publication ownership.

The existing capability binding values remain the runtime behavioral contract.
Adding the typed reference/artifact is an additive contract change requiring
coordinated parser/compiler deployment before activating consuming releases.

## 6. Single effective-controls resolver

Introduce one server-owned function, conceptually:

```text
resolveEffectiveCollaborationControls(
  validatedPublishedBindings,
  validatedOperationalSnapshot
) -> effectiveControls + release/configuration revisions + restriction reasons
```

The operational provider must select the exact tenant/plane and enforce its own
configuration validity. Reuse existing parameter infrastructure where appropriate;
do not assume the current density consumer already supplies collaboration controls.

Composition rules:

- Numeric upper bounds: minimum of published limit and applicable operational ceiling.
- Allowed MIME types/audiences, when an operational restriction exists: intersection.
- Feature availability: published enablement AND operational availability.
- Scanning: any mandatory requirement remains mandatory; a false setting cannot
  disable required scanning.
- Authorization, entitlement and record admission remain separate mandatory checks.
- Missing optional ceiling means no extra restriction only if its contract says so.
  Missing/invalid required safety configuration fails closed; zero is never treated
  as unlimited. Do not silently rewrite an audience if its default becomes invalid;
  return an explicit restriction/error and require a permitted choice.

The API exposes the resolved controls for UI labels, file validation and composer
choices. The UI may check a selected file against those supplied values but does
not merge profile, parameter and flag sources itself. Command handlers call the
same resolver against current trusted state; never trust limits echoed by a client.

All relevant entry points must use it: prepare/initiate uploads, batch admission,
finalization, comment submission with attachments, versions, paste and picker flows.
Presigned upload admission alone is insufficient. Enforce object size/content and
scan requirements server-side at finalization. Revalidate attachment count on
comment submission, independent of batch count.

Attach release/configuration revisions to the response for troubleshooting and
stale-view detection. Operational changes during an upload may cause finalization
to fail with an actionable error; preserve the draft and offer refresh/retry.
Never silently widen an audience or discard a draft. Lower upload limits do not
retroactively delete files or revoke read access; read/download still follows its
own authorization, quarantine and retention rules.

For future feature operational controls, explicitly test that emergency deny wins
over ordinary enablement overrides. Do not assume current generic flag precedence
already implements that security rule.

## 7. Storage and publication boundaries

Immediate profile DDL: none. Profiles are source files and same-release compiled
dependencies stored through existing applied release/payload machinery.

The separately discussed nullable `applied_release_payload.entity_code` optimization
is not a prerequisite for profiles and is not implemented by this document. If
implemented, it identifies a single-entity publication owner, never a profile
dependency. A future standalone profile publication would leave it null and use
typed profile coordinates. Multi-entity publication ownership needs a separate
explicit mapping rather than artifact-membership inference.

Do not restore or duplicate Country into entity_contract/entity_descriptor. Their
eventual retirement is a separate consumer migration, not part of collaboration
profile rollout. Existing signed payloads are not edited.

## 8. Multi-plane application and verification

Every publication declares explicit targetPlanes. A shared feature intended for
all planes uses studio, neon and mesh; entity applicability may legitimately be
narrower. The source profile must validate against every declared target.

For each target independently verify:

1. Correct publication identity, intended source revision and target plane.
2. Signature/hash/dependency admission and successful payload application.
3. Correct activation head and profile dependency pin.
4. Effective published controls and operational restrictions through that plane's API.
5. Tenant boundaries and authorization using the plane's own runtime data.

Capture a receipt per plane. Three-plane completion requires all intended targets
to pass. A partial failure is reported as partial, not globally successful; retry
idempotently or reactivate a previously admitted release through the supported
lifecycle. There is no claimed distributed atomic activation across databases.
Common schemas and seed scripts do not imply automatic data replication.

## 9. Future Studio configuration management without rework

Keep the source resolver interface narrow: exact profile identity/version and
target plane in; validated profile definition out. A future published-registry
adapter must provide the same immutable contract and feed the same dependency
validation/compiler path, not a parallel runtime hash mechanism.

Studio may later author parameter definitions and populate the existing
parameter_definition projection. Preserve stable codes/IDs, foreign-key relationships,
tenant overrides, exact-plane reads and reload semantics. Validate existing tenant
values against proposed definition changes before activation; do not silently
coerce or discard incompatible values. Explicitly target and verify each plane.

Feature catalog authoring may move to Studio while operational rollout/disablement
retains its own authorized, audited path. UI location does not determine lifecycle.
The policy engine remains unchanged. Profile registry tables, bulk adoption UI,
tenant-authored profiles and partner/external audiences are deferred.

## 10. Implementation sequence

1. Lock the source schema, override semantics and dependency artifact/reference
   extension. Add the section 4.2 authoring-mode tests and dedicated parse-time
   guard first; preserve existing disabled and field validators. No profile source
   or compiler integration proceeds with undefined mode precedence.
2. Introduce the two source profiles and file resolver. Reject unknown versions,
   content drift and ambiguous explicit/profile authoring.
3. Extend graph extraction, artifact parsing, dependency validation and target
   compilation together. Qualify the changed compiler under the existing publication
   workflow; do not bypass compiler fingerprints, signatures or required approval.
4. Add the server effective-controls resolver and response projection; wire every
   enforcement entry point and remove duplicate limit-merging logic.
5. Compile Country and a generic test entity. Assert that the compiled behavior
   matches the baseline except explicitly approved changes. Public default adoption
   is an explicit successor change, not a side effect of introducing profiles.
6. Deploy compatible readers, publish/activate the approved Country successor to its
   explicit targets, and collect all target receipts and signed-in checks.
7. Begin wider entity onboarding only after the acceptance matrix passes.

This is narrower than a database profile registry, but not a file-only refactor:
the artifact/reference extension and comprehensive enforcement wiring are required.

## 11. Acceptance matrix

| Area | Required proof |
| --- | --- |
| Reuse | Country and a generic test entity resolve the same profile without owner leakage. |
| Authoring modes | Three accepted forms; conflicting/missing forms fail before resolution with CAPABILITY_AUTHORING_MODE_CONFLICT. Existing field errors remain ENTITY_CAPABILITY_INVALID; compiled binding plus profilePolicy is not a source-mode conflict. |
| Overrides | Valid per-entity changes are isolated; invalid paths, increased forbidden bounds, bad defaults and malformed arrays fail. |
| Pinning | Missing artifact, wrong hash/plane/type, absent Operation dependency and unknown profile version fail before activation. |
| Determinism | Same source inputs yield identical artifacts for the same target; changed published version content is rejected. |
| Disabled capability | No executable binding, UI affordance or authorized command appears merely because a profile exists. |
| Effective limits | Numeric minimum, set intersection, required scan and feature restriction semantics are covered, including missing/invalid inputs. |
| UI/API agreement | UI receives backend-computed controls; direct API, paste, batch, version and comment-submit bypass attempts are rejected. |
| Concurrent changes | A ceiling reduction after initiation is handled safely at finalization; stale UI gets an actionable response with draft retained. |
| Isolation | Tenant overrides never cross tenants/planes; public remains record-authorized, not external; private replies/drafts remain private. |
| Publication | Prior releases remain immutable; profile v2 does not silently alter entities pinned to v1. |
| Multi-plane | Explicit intended targets have matching source semantics and separate successful application/activation/API receipts. |
| Existing consumers | Density parameter resolution/reload behavior and policy lifecycle remain unchanged. |

## 12. Non-goals and completion evidence

No profile database registry, standalone profile publication, catalog editing UI,
general policy-engine rewrite, external Mesh sharing, BP restoration, or deletion
of legacy runtime tables. No automatic cross-plane sharing of comments/files.

Completion requires reviewed contract changes, focused unit/integration tests,
server/UI effective-control tests, preserved existing collaboration regressions,
approved successor receipts and signed-in plane acceptance. A design document or
successful local compile alone is not evidence of live activation.
