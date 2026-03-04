# Entity Relationships

## Core Dependency Graph

`core.tenant` is the root of the entire data model. Every business table references it.

```
core.tenant ─────────────────────────────────────────────────────────
  │
  ├── core.principal ──── core.idp_identity
  │     ├── core.principal_profile
  │     ├── core.principal_role ──── core.role
  │     ├── core.principal_ou ──── core.organizational_unit
  │     ├── core.group_member ──── core.principal_group
  │     └── core.entitlement
  │
  ├── core.operation_category ──── core.operation
  │                                   └── core.persona_capability
  │                                         └── core.persona
  │
  ├── core.module ──── core.tenant_module_subscription
  │
  └── core.tenant_profile
```

## Meta Engine Relationships

```
meta.entity ──────────── meta.entity_version
  │                        ├── meta.field
  │                        ├── meta.relation
  │                        ├── meta.index_def
  │                        ├── meta.entity_compiled
  │                        └── meta.entity_compiled_overlay
  │
  ├── meta.entity_policy (entity_id OR entity_version_id)
  ├── meta.field_security_policy
  ├── meta.overlay ──── meta.overlay_change
  ├── meta.entity_lifecycle ──── meta.lifecycle
  │                                ├── meta.lifecycle_state
  │                                └── meta.lifecycle_transition
  │                                      └── meta.lifecycle_transition_gate
  │
  ├── meta.entity_operation ──── core.operation (FK on code)
  │
  └── meta.entity_lifecycle_route_compiled


meta.permission_policy ──── meta.permission_policy_version
                              ├── meta.permission_rule
                              │     └── meta.permission_rule_operation ──── core.operation
                              └── meta.permission_policy_compiled


meta.approval_template ──── meta.approval_template_stage
                       └── meta.approval_template_rule

meta.approval_sla_policy
meta.lifecycle_timer_policy


meta.notification_channel ──── meta.notification_provider
meta.notification_template
meta.notification_rule ──── (referenced by notify.message)
```

## Workflow Relationships

```
wf.lifecycle ──── wf.lifecycle_version
                    └── wf.workflow_instance
                          ├── wf.workflow_transition
                          └── (references meta.lifecycle for timer schedules)

wf.approval_definition ──── wf.approval_instance
                              ├── wf.approval_task
                              ├── wf.approval_stage
                              ├── wf.approval_comment
                              ├── wf.approval_assignment_snapshot
                              ├── wf.approval_escalation
                              └── wf.approval_event

wf.lifecycle_timer_schedule ──── meta.lifecycle (FK)
                                  meta.lifecycle_state (FK)
                                  meta.lifecycle_transition (FK)
                                  meta.lifecycle_timer_policy (FK)
```

## Document Relationships

```
doc.attachment ──── doc.entity_document_link
  │             └── doc.document_acl
  │             └── doc.attachment_access_log
  │             └── doc.attachment_comment (threaded)
  │             └── doc.multipart_upload
  │             └── (self-ref: parent_attachment_id for versioning)
  │
doc.document

doc.template ──── doc.template_version
  │             └── doc.template_binding
  │
doc.letterhead
doc.brand_profile
doc.render_output ──── doc.render_job
                  └── doc.render_dlq
                  └── (self-ref: replaces_output_id)
```

## Collaboration Relationships

```
collab.entity_comment (threaded, self-ref parent_comment_id)
  ├── collab.comment_mention
  ├── collab.comment_reaction
  ├── collab.comment_read
  ├── collab.comment_flag ──── collab.comment_moderation
  └── collab.comment_draft

collab.conversation ──── collab.conversation_participant
                    └── collab.message (threaded, self-ref parent_message_id)
                          └── collab.message_delivery

collab.delegation_grant
collab.delegation_request
collab.record_share
collab.share_audit
collab.external_share_token

collab.comment_sla_config
collab.comment_sla_metrics
collab.comment_response
collab.comment_analytics_daily
collab.comment_user_analytics
collab.comment_thread_analytics
collab.comment_retention_policy ──── collab.comment_retention_log
```

## Notification Relationships

```
meta.notification_rule ──── notify.message
                              └── notify.delivery (partitioned)
                              └── notify.dlq

notify.notification (partitioned) ──── core.principal (recipient)

notify.preference ──── core.principal | core.organizational_unit | core.tenant (scoped)

notify.digest_staging ──── notify.message
notify.whatsapp_consent
notify.suppression
notify.push_subscription
```

## Cross-Schema Foreign Keys

| Source | Target | Relationship |
|--------|--------|-------------|
| `meta.entity_operation.operation_code` | `core.operation.code` | Entity capabilities reference operation catalog |
| `meta.permission_rule_operation.operation_id` | `core.operation.id` | Permission rules bind to operations |
| `wf.lifecycle_timer_schedule.lifecycle_id` | `meta.lifecycle.id` | Timer schedules reference meta lifecycles |
| `wf.lifecycle_timer_schedule.state_id` | `meta.lifecycle_state.id` | Timer schedules reference meta states |
| `wf.lifecycle_timer_schedule.transition_id` | `meta.lifecycle_transition.id` | Timer schedules reference meta transitions |
| `wf.lifecycle_timer_schedule.policy_id` | `meta.lifecycle_timer_policy.id` | Timer schedules snapshot meta policies |
| `notify.message.rule_id` | `meta.notification_rule.id` | Messages originate from meta rules |
| `audit.field_access_log.policy_id` | `meta.field_security_policy.id` | Field access logs reference security policies |
| `ent.customer.industry_domain_code, industry_code` | `ref.industry_code` | Customer industry classification |
| `ent.supplier.industry_domain_code, industry_code` | `ref.industry_code` | Supplier industry classification |
| `ent.product.commodity_domain_code, commodity_code` | `ref.commodity_code` | Product commodity classification |
| `ent.product_category.commodity_domain_code, commodity_code` | `ref.commodity_code` | Category commodity mapping |
| `ent.employee.manager_id` | `ent.employee.id` | Self-referencing manager hierarchy |
| `ent.employee.ou_id` | `core.organizational_unit.id` | Employee OU assignment |
| `ent.employee.principal_id` | `core.principal.id` | Employee-to-principal link |

## Polymorphic References

Several tables use text-based polymorphic entity references instead of UUID FKs:

| Table | Column(s) | Purpose |
|-------|-----------|---------|
| `collab.entity_comment` | `entity_type`, `entity_id` | Comments on any entity type |
| `collab.comment_mention` | `comment_type`, `comment_id` | Mentions in entity or approval comments |
| `collab.comment_reaction` | `comment_type`, `comment_id` | Reactions on any comment type |
| `doc.attachment` | `owner_entity`, `owner_entity_id` | File ownership by any entity |
| `doc.entity_document_link` | `entity_type`, `entity_id` | Document links to any entity |
| `ent.entity_relationship` | `entity_a_type/id`, `entity_b_type/id` | Generic entity-to-entity links |
| `audit.audit_log` | `entity_name`, `entity_id` | Audit trail for any entity |
| `wf.workflow_instance` | `entity_type`, `entity_id` | Workflow on any entity |
