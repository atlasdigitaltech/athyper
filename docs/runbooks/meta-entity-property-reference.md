# Meta Entity table and property reference

Source review: 2026-09-28. Companion to the [onboarding procedure](meta-entity-onboarding.md).
This is a source-schema inventory, not a claim that the current live databases are
identical or that every modeled feature is supported by Country's publication path.

## Reading the properties

All 36 tables declared in the canonical
[authoring tables](../../server/db/ddl/planes/studio/metadata/03_tables.sql)
are covered below. Column names are extracted from that source; explanations are
reviewed guidance. The linked SQL remains authoritative for exact types, defaults,
nullability, checks and uniqueness. Read its sibling domains, constraints, triggers,
RLS and grants too; matching columns alone does not establish a valid graph.

Common columns, listed under each applicable table:

| Property | Meaning |
| --- | --- |
| `id` | UUID row identity; not a display code, contract hash or record-data ID. |
| `tenant_id` | Definition scope; NULL system/package metadata differs from a tenant-owned definition. Preserve null-safe scope relationships. |
| `entity_id` | Stable metadata entity owning this graph member. |
| `change_set_id` | Authoring workspace owning this exact editable version. |
| `created_at`, `created_by` | Creation timestamp and actual authenticated or trusted maintenance actor. |
| `updated_at`, `updated_by` | Paired update evidence where present; do not impersonate another actor. |

Repeated lifecycle fields are explicit compatibility decisions: `status` on graph
members is active/deprecated, `replacement_*` names a successor member,
`deprecated_since_release_no` records introduction of deprecation, and
`planned_removal_release_no` records intended removal. These differ from entity,
change-set and release status. Position columns order members in their parent;
use each table's checks rather than assuming one universal indexing convention.

JSON properties (`type_config`, specs, layout, policies, capability documents) have
typed application contracts beyond SQL's JSON-object check. Validate their nested
properties through the actual parser/compiler. This inventory does not bless
arbitrary JSON keys or imply a complete Studio UI for every table.

## 1. `metadata.entity`

Stable identity only. `module_id` identifies the owning module; `entity_code` is the canonical URL/contract identity. `entity_class` selects business, configuration, reference, process, projection or technical semantics. `ownership_model` is system/package (NULL tenant) or tenant/overlay (non-NULL tenant). Entity status is draft/active/deprecated/retired, distinct from draft review and target activation. Labels and editable runtime behavior belong to the change-set graph.

Properties: `module_id`, `entity_code`, `entity_class`, `ownership_model`, `status`, `status_changed_at`, `status_changed_by`.

Identity/scope/audit columns: `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 2. `metadata.entity_change_set`

Mutable workspace and workflow evidence. `change_set_code` identifies the change, `branch_code` groups its authoring branch, `base_release_id` pins its starting release and `parent_change_set_id` records ancestry. `lock_version` is the optimistic concurrency token. Title/summary/reason/ticket explain the change. Submitted/reviewed/approved/rejected/published actor-time pairs record actual transitions; `rejection_reason` explains rejection. Draft/rejected work is editable; approved/published work is sealed. Do not manufacture workflow stamps.

Properties: `change_set_code`, `branch_code`, `base_release_id`, `parent_change_set_id`, `status`, `lock_version`, `title`, `change_summary`, `change_reason_code`, `ticket_reference`, `submitted_at`, `submitted_by`, `reviewed_at`, `reviewed_by`, `approved_at`, `approved_by`, `rejected_at`, `rejected_by`, `rejection_reason`, `published_at`, `published_by`, `status_changed_at`, `status_changed_by`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 3. `metadata.entity_release`

Append-only publication identity. `revision_id` pins the immutable contract snapshot. `release_no` orders releases; `version_label` is an optional semantic version. `release_kind` distinguishes publish/rollback/retire; `supersedes_release_id` and `rollback_of_release_id` preserve history. Schema code/version describe the serialized contract. Contract, revision and release hashes have different inputs and must not be substituted. Compatibility is backward_compatible/conditional/breaking. Target planes and minimum runtime bound consumption. Signature algorithm/key/signature authenticate the release; the SQL signature fields being optional does not waive the governed pipeline signature requirement. Audit/correlation/reason/ticket identify evidence and intent.

Properties: `revision_id`, `release_no`, `version_label`, `release_kind`, `supersedes_release_id`, `rollback_of_release_id`, `contract_schema_code`, `contract_schema_version`, `contract_hash`, `revision_hash`, `release_hash`, `compatibility_level`, `target_planes`, `minimum_runtime_version`, `signature_algorithm`, `signing_key_id`, `contract_signature`, `audit_event_id`, `publication_reason`, `ticket_reference`, `correlation_id`, `published_at`, `published_by`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`.

## 4. `metadata.entity_class_profile`

Seeded immutable class defaults. `profile_version` versions the default set; fallback name/description describe the class. Default backing/API/read/write/concurrency/change-policy values are copied into explicit authoring settings. They are not live inheritance: changing defaults must not silently modify an already authored or signed entity.

Properties: `entity_class`, `profile_version`, `fallback_name`, `description`, `default_backing_kind`, `default_api_exposure`, `default_read_mode`, `default_write_mode`, `default_concurrency_mode`, `default_change_policy`.

Identity/scope/audit columns: `created_at`, `created_by`.

## 5. `metadata.entity_runtime_profile`

One explicit default runtime profile per change set. Backing kind plus storage plane/schema/object identifies table, view, materialized view, external or virtual backing. API exposure and read/write modes determine execution; facade modes require registered handler keys. Create mode describes form-only, early-draft, direct or source-document behavior. Optimistic concurrency requires `record_version_field_key`; append-only concurrency must match append-only writes. Tenant and soft-delete field keys map real columns. `draft_ttl_hours` applies to early drafts. These legal schema modes still require supported compilers and runtime handlers. Country explicitly uses table/shared, API, generic reads, no writes and no concurrency.

Properties: `profile_key`, `backing_kind`, `storage_plane`, `storage_schema`, `storage_object`, `api_exposure`, `read_mode`, `write_mode`, `read_handler_key`, `write_handler_key`, `create_mode`, `concurrency_mode`, `record_version_field_key`, `tenant_field_key`, `soft_delete_field_key`, `draft_ttl_hours`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 6. `metadata.entity_field`

Field semantics independent of UI placement. `field_key` is the contract identity; description explains its meaning. `data_type` and `type_config` define value shape; cardinality is one/zero_or_one/many. `value_origin` identifies stored/computed/projected/runtime data. `write_mode` is mutable/write_once/read_only/computed; `storage_path` maps storage. Default/computation/validation specs are typed declarative contracts, not permission to execute arbitrary SQL or scripts. Classification and retention policy control exposure/handling. Replacement and release-number properties describe deprecation and removal compatibility.

Properties: `field_key`, `description`, `data_type`, `type_config`, `cardinality`, `value_origin`, `write_mode`, `storage_path`, `default_spec`, `computation_spec`, `validation_spec`, `data_classification`, `retention_policy_code`, `status`, `replacement_field_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 7. `metadata.entity_key`

Names a primary, natural, alternate or idempotency key. `uniqueness_scope` is global or tenant, while `null_semantics` declares whether nulls are allowed and distinct. It does not create a physical database constraint. Match the actual storage key, especially composite state_region keys. Replacement/deprecation/removal coordinates govern key evolution.

Properties: `key_key`, `key_kind`, `uniqueness_scope`, `null_semantics`, `status`, `replacement_key_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 8. `metadata.entity_key_field`

Ordered membership in a key. `entity_key_id` points to the key, `entity_field_id` to a field in this graph, and `position` preserves composite ordering. UUID record identity and business natural keys serve different purposes; model both when needed.

Properties: `entity_key_id`, `entity_field_id`, `position`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 9. `metadata.entity_search_profile`

Names a keyword/full_text/hybrid search contract. Query operator combines terms; minimum length gates requests; language and normalization control text treatment; `is_default` selects the default profile. Lifecycle fields preserve compatibility. Do not assume a legal profile setting is consumed by every runtime query path: the Country follow-up leaves search.profileKey execution semantics to further qualification.

Properties: `search_key`, `search_kind`, `query_operator`, `minimum_query_length`, `language_code`, `normalization_mode`, `is_default`, `status`, `replacement_search_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 10. `metadata.entity_search_field`

Ordered searchable field membership. `match_mode` is exact/prefix/contains/full_text; `weight` expresses relative ranking where supported. Membership does not grant query permission. Country currently generates contains matching for its declared search fields.

Properties: `entity_search_profile_id`, `entity_field_id`, `position`, `match_mode`, `weight`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 11. `metadata.entity_relation`

Relationship semantics: relation kind/cardinality, foreign-key/logical/polymorphic resolution, reference/aggregate-child/shared ownership, and read-only/source-owned/target-owned/coordinated mutation. Delete/update actions express referential behavior; inverse key names the reverse relation when defined. Lifecycle coordinates control evolution. Physical FKs and authoring relations are separate; current Country native-to-split lowering rejects nonempty relations.

Properties: `relation_key`, `relation_kind`, `resolution_kind`, `ownership_mode`, `mutation_mode`, `on_delete`, `on_update`, `inverse_relation_key`, `status`, `replacement_relation_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 12. `metadata.entity_relation_target`

Resolves a relation to a target entity and target key. `relation_target_key` identifies this branch, `discriminator_value` selects polymorphic branches, and `is_default` marks a default target. Target version/dependency qualification must still ensure compatibility; an entity ID alone does not prove runtime availability.

Properties: `entity_relation_id`, `relation_target_key`, `target_entity_id`, `target_key_key`, `discriminator_value`, `is_default`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 13. `metadata.entity_relation_field`

Ordered join mapping from `source_field_id` to the target field key through a relation target. For a subdivision parent, preserve country plus parent code rather than joining parent code without country. Match target key arity and ordering.

Properties: `entity_relation_target_id`, `source_field_id`, `target_field_key`, `position`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 14. `metadata.entity_surface`

Reusable list/detail/form/lookup/embedded presentation. `surface_key` identifies it; title/description label it; layout kind and typed `layout_config` describe composition; `is_default` selects a default. Country embeds list experience/authorization and record presentation in layout config. Presentation is not a source of extra operation permission. Lifecycle fields allow explicit replacement.

Properties: `surface_key`, `surface_kind`, `title`, `description`, `layout_kind`, `layout_config`, `is_default`, `status`, `replacement_surface_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 15. `metadata.entity_surface_section`

Normalized section tree when that surface uses it. Parent section establishes hierarchy; kind selects section/group/fieldset/tab/columns. Position orders siblings; column count and collapse settings describe layout. Title/description and typed config describe presentation. Country detail sections are instead embedded in recordPresentation; do not duplicate incompatible representations.

Properties: `entity_surface_id`, `section_key`, `parent_section_id`, `section_kind`, `title`, `description`, `position`, `column_count`, `collapsible`, `collapsed_by_default`, `layout_config`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 16. `metadata.entity_surface_field_binding`

Places a field on a surface and optionally a section. Binding key and position identify/order placement. Label/help/placeholder/widget/span/required-indicator configure presentation. Display config, visibility and editability rules affect UI behavior but cannot widen backend field authorization. Status records active/deprecated binding.

Properties: `entity_surface_id`, `entity_surface_section_id`, `entity_field_id`, `binding_key`, `position`, `label_override`, `help_text`, `placeholder`, `widget_key`, `column_span`, `show_required_indicator`, `display_config`, `visibility_rule`, `editability_rule`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 17. `metadata.entity_surface_component_binding`

Embeds another reusable surface through `component_surface_id`. Cardinality describes singular/repeated content and `contract_slice_pointer` selects its contract slice. Position and optional section locate it. It is composition, not automatic child-record read/write authorization.

Properties: `entity_surface_id`, `entity_surface_section_id`, `component_surface_id`, `binding_key`, `position`, `cardinality`, `contract_slice_pointer`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 18. `metadata.entity_operation`

Canonical executable action. Key/kind identify create/read/update/delete/execute/transition/import/export intent; label/description explain it. Handler, permission, execution mode and idempotency specify dispatch and control. Input/confirmation/result surface keys reference presentation; requires_mfa and audit_event_code specify security/evidence requirements. Plane-specific permission rows and compiled authorization must remain consistent with any operation-level permission field. UI labels never establish handler availability. Lifecycle fields govern action evolution.

Properties: `operation_key`, `operation_kind`, `label`, `description`, `handler_key`, `permission_code`, `execution_mode`, `idempotency_mode`, `input_surface_key`, `confirmation_surface_key`, `result_surface_key`, `requires_mfa`, `audit_event_code`, `status`, `replacement_operation_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 19. `metadata.entity_operation_permission`

Binds an operation to an explicit target-plane permission code/kind. Permission definitions and role grants live in plane-local IAM; this row creates neither. For Country, list/read use common.platform.reference.view. BP requires policies appropriate to its data and operations.

Properties: `entity_operation_id`, `target_plane`, `permission_code`, `permission_kind`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 20. `metadata.entity_surface_operation`

Places an existing operation on a surface/section. Placement, interaction target, selection mode and position determine invocation UX; label/icon/variant and confirmation surface control presentation. Visibility rules may hide an action but server authorization must deny unauthorized execution even when called directly.

Properties: `entity_surface_id`, `entity_operation_id`, `entity_surface_section_id`, `placement_key`, `interaction_target`, `selection_mode`, `position`, `label_override`, `icon_key`, `presentation_variant`, `confirmation_surface_id`, `visibility_rule`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 21. `metadata.entity_operation_rule`

Ordered operation decision rules. Rule key/priority identify precedence; decision and optional plane/lifecycle state/transition/capability conditions determine eligibility, with reason_code explaining the result. This is not a replacement for the canonical lifecycle-operation binding or IAM permission check.

Properties: `entity_operation_id`, `rule_key`, `priority`, `decision`, `plane_code`, `lifecycle_state_code`, `lifecycle_transition_code`, `required_capability_code`, `reason_code`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 22. `metadata.entity_flow`

Multi-step orchestration referencing reusable surfaces. Flow kind/navigation mode define movement; entry/completion operations define boundaries; allow_draft_resume controls resumption. Title/description label it; lifecycle properties version its availability. Do not publish through the Country lowering path until flow support qualifies.

Properties: `flow_key`, `flow_kind`, `title`, `description`, `navigation_mode`, `entry_operation_id`, `completion_operation_id`, `allow_draft_resume`, `status`, `replacement_flow_key`, `deprecated_since_release_no`, `planned_removal_release_no`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 23. `metadata.entity_flow_step`

Places a surface in a flow with ordered step key. Title override/description provide step text; entry/completion conditions gate progression; is_optional marks an optional step. Fields and layout remain owned by the referenced surface, not duplicated in the step.

Properties: `entity_flow_id`, `entity_surface_id`, `step_key`, `position`, `title_override`, `description`, `entry_condition`, `completion_condition`, `is_optional`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 24. `metadata.entity_policy_binding`

References canonical control.policy_definition for an entity or operation. Binding stage/enforcement/priority define when and how evaluation applies; input_mapping supplies declared inputs. Policy body remains in the policy system. Qualify the referenced policy and evaluator, including missing-input denial.

Properties: `entity_operation_id`, `policy_definition_id`, `binding_key`, `binding_stage`, `enforcement`, `priority`, `input_mapping`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 25. `metadata.entity_field_policy_binding`

Applies a canonical policy to a field and optionally operation. Stage/enforcement/priority and input mapping describe evaluation. Use for field-level rules; verify that read masking and query channels cannot leak denied values. It does not replace storage tenant isolation.

Properties: `entity_field_id`, `entity_operation_id`, `policy_definition_id`, `binding_key`, `binding_stage`, `enforcement`, `priority`, `input_mapping`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 26. `metadata.entity_contract_test_case`

Versioned test definition, not its execution result. Test key/kind/title describe the case; target plane and optional operation/flow locate it. Input context and expected outcome/diagnostic codes form assertions. Immutable results belong in snapshot test-run/result artifacts. Include actual negative cases; an empty suite is not acceptance evidence.

Properties: `test_key`, `test_kind`, `title`, `description`, `target_plane`, `entity_operation_id`, `entity_flow_id`, `input_context`, `expected_outcome`, `expected_diagnostic_codes`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 27. `metadata.entity_lifecycle_binding`

Binds a state field to a named lifecycle revision in a target plane. Required marks whether the dependency is mandatory. The lifecycle body remains target-owned. A read-only status column need not imply that a transition service is exposed.

Properties: `entity_field_id`, `binding_key`, `target_plane`, `lifecycle_code`, `lifecycle_revision`, `required`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 28. `metadata.entity_lifecycle_operation_binding`

Maps a canonical operation to a transition code under a specific lifecycle binding. Mapping key identifies the association. Verify allowed transitions and permissions against the pinned lifecycle revision; naming a transition does not register its handler.

Properties: `entity_lifecycle_binding_id`, `entity_operation_id`, `mapping_key`, `transition_code`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 29. `metadata.entity_numbering_binding`

Binds a field to a target policy code/revision. Current DDL limits targets to Neon/Mesh. Automatic assignment requires a triggering operation; manual assignment deliberately has no triggering operation. Required and status control dependency participation. Mutable counters/allocations live in runtime_meta, not authoring metadata.

Properties: `entity_field_id`, `entity_operation_id`, `binding_key`, `target_plane`, `policy_code`, `policy_revision`, `assignment_mode`, `required`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 30. `metadata.entity_operation_scope_binding`

Scope-coordinate recipe frozen into artifacts. Decision mode is collection or entity_resource; scope kind selects tenant/workspace/module/company/legal entity/organization/network/resource scope. Coordinate source is tenant_context, request_field, record_field, collection_field or relation_resolver. Field sources require coordinate_key; relation resolution requires resolver_key. Tenant scope uses authenticated tenant context. Missing values must deny; collection decisions cannot use individual request/record-field coordinates. Country tenant gating does not imply tenant columns on shared rows.

Properties: `entity_operation_id`, `binding_key`, `target_plane`, `decision_mode`, `scope_kind`, `coordinate_source`, `coordinate_key`, `resolver_key`, `missing_value_behavior`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 31. `metadata.entity_change_case_binding`

Connects an operation to governed_change or direct_change case handling, a case entity and optional workflow/materialization binding. These are registered execution coordinates, not embedded executable programs. This branch is rejected by current Country native-to-split lowering and must be implemented/qualified for BP governed changes.

Properties: `entity_operation_id`, `binding_key`, `case_kind`, `case_entity_code`, `workflow_key`, `materialization_binding_key`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 32. `metadata.entity_operation_context_requirement`

Declares required operation context coordinates. Source kind selects tenant context, request field or record field; non-tenant sources name source_field_key. Required marks mandatory context. Validate supplied context and authorization together; caller-provided company or tenant values are not inherently trusted.

Properties: `entity_operation_id`, `coordinate_key`, `source_kind`, `source_field_key`, `required`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 33. `metadata.entity_field_reference_binding`

Declares one reference mechanism for a field: entity_relation with target_entity_code, lookup_domain with lookup_domain, or resolver with resolver_key. Exactly the corresponding coordinate is populated. require_active controls active-reference requirements. Dropdown rendering does not itself validate country/state compatibility or authorize the parent operation.

Properties: `entity_field_id`, `binding_key`, `reference_kind`, `target_entity_code`, `lookup_domain`, `resolver_key`, `require_active`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 34. `metadata.entity_materialization_binding`

Declares a registered versioned materializer and target entity/optional collection. The handler owns trusted execution; metadata does not contain SQL. Qualify transactional/retry behavior and target scope. Current Country lowering rejects this branch.

Properties: `binding_key`, `target_entity_code`, `materializer_key`, `target_collection_key`, `status`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 35. `metadata.entity_materialization_field_mapping`

Ordered source-to-target field mapping for a materialization binding. Optional transform_key identifies a registered versioned transform; required describes mandatory mapping input. Parent binding supplies graph context; this table has no direct entity_id/change_set_id columns. Transform identifiers must not be interpreted as arbitrary executable code.

Properties: `entity_materialization_binding_id`, `source_field_key`, `target_field_key`, `transform_key`, `required`, `position`.

Identity/scope/audit columns: `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## 36. `metadata.entity_capability`

Change-set-owned comments/attachments/activity configuration. Declaration advertises capability participation; binding contains the typed execution/admission/action policy. Optional profile, profile_definition and overrides record profile-based adoption. Surfaces cannot override the published capability policy. The guide details Country comment/attachment properties; each new service still requires registered handlers, permissions and target qualification.

Properties: `capability_key`, `declaration`, `binding`, `profile`, `profile_definition`, `overrides`.

Identity/scope/audit columns: `id`, `tenant_id`, `entity_id`, `change_set_id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

## Adjacent evidence and runtime tables

| Tables / source | Role and properties to reconcile |
| --- | --- |
| `snapshot.entity_contract_revision` | Immutable contract JSON, source entity/change set, contract hash and validation evidence. |
| `snapshot.entity_draft_save` | Saved draft history; not a published runtime head. |
| `snapshot.entity_contract_test_run`, `entity_contract_test_result` | Executed cases, outcomes and diagnostics; distinguish from test definitions. |
| `snapshot.entity_release_artifact` | Per-plane compilation source pinned to source release/revision and hashes. |
| `publication.release`, `entity_release_link` | Distribution release connected to authoring release; authority tenant and nullable source tenant are separate. |
| `publication.artifact`, `artifact_compilation` | Artifact identity and compilation evidence; reconcile compiler and content hashes. |
| `publication.deployment`, `deployment_event`, `deployment_acknowledgement` | Target delivery state, events and receipts; queued does not mean active. |
| `runtime_meta.applied_release`, `applied_release_payload` | Target-local applied identity and payload. |
| `runtime_meta.release_activation_head`, `release_activation_event` | Current target head and activation history; authoritative for which applied release is selected. |
| `runtime_meta.entity_contract`, `entity_descriptor` | Target runtime contract/descriptor projections consumed by services. |
| `runtime_meta.entity_number_counter`, `entity_number_allocation` | Mutable numbering state separate from metadata policy bindings. |
| `metadata.publication_recovery_archive`, `publication_recovery_revocation` | Separate recovery records declared in supplemental DDL, not ordinary entity authoring properties. Use the governed recovery path. |

Sources: [snapshot](../../server/db/ddl/planes/studio/snapshot/03_tables.sql),
[publication](../../server/db/ddl/planes/studio/publication/03_tables.sql),
[compiled source boundary](../../server/db/ddl/planes/studio/publication/14_compiled_entity_runtime.sql),
[runtime](../../server/db/ddl/common/runtime_meta/03_tables.sql),
[recovery](../../server/db/ddl/planes/studio/metadata/18_publication_recovery.sql).
Supplemental DDL may evolve these contracts; review the applicable migrations and
installed schema during every real onboarding baseline.
