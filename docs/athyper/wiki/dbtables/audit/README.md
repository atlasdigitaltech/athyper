# Audit Schema -- Database Reference

**Schema**: `audit`
**Source**: `framework/adapters/db/src/sql/100_audit.sql`
**PostgreSQL**: 16+

The `audit` schema implements the platform's immutable audit subsystem. It provides unified append-only logging for all platform actions, fine-grained access decision auditing, field-level access tracking, partitioned workflow event logging with tamper-evidence hash chains, dead-letter queuing for failed audit outbox items, integrity verification reporting, and cold-tier archive tracking. The schema enforces immutability through database triggers, isolates tenants via Row-Level Security, and separates concerns through five dedicated database roles.

---

## Table of Contents

- [Base Tables](#base-tables)
  - [audit.audit_log](#auditaudit_log)
  - [audit.permission_decision_log](#auditpermission_decision_log)
  - [audit.field_access_log](#auditfield_access_log)
  - [audit.workflow_event_log](#auditworkflow_event_log)
  - [audit.hash_anchor](#audithash_anchor)
  - [audit.dlq](#auditdlq)
  - [audit.integrity_report](#auditintegrity_report)
  - [audit.archive_marker](#auditarchive_marker)
- [Immutability Trigger](#immutability-trigger)
  - [audit.prevent_audit_mutation()](#auditprevent_audit_mutation)
  - [Trigger Assignments](#trigger-assignments)
- [Partition Lifecycle Functions](#partition-lifecycle-functions)
  - [audit.create_next_audit_partition()](#auditcreate_next_audit_partition)
  - [audit.drop_audit_partition(p_year, p_month)](#auditdrop_audit_partitionp_year-p_month)
  - [audit.create_audit_partition_for_month(p_target)](#auditcreate_audit_partition_for_monthp_target)
  - [audit.list_audit_partitions()](#auditlist_audit_partitions)
  - [audit.check_audit_partition_indexes(p_partition)](#auditcheck_audit_partition_indexesp_partition)
- [Roles and Permissions](#roles-and-permissions)
- [Row-Level Security Policies](#row-level-security-policies)
- [SECURITY DEFINER Functions](#security-definer-functions)
  - [audit.audit_key_rotation_update()](#auditaudit_key_rotation_update)
  - [audit.audit_retention_delete()](#auditaudit_retention_delete)
- [Timeline Covering Indexes](#timeline-covering-indexes)
- [Deferred Foreign Keys](#deferred-foreign-keys)

---

## Base Tables

### audit.audit_log

**Functional Description**: The unified platform audit log, recording all significant actions across the system. This is an append-only table -- updates and deletes are blocked by the immutability trigger. Each entry captures who performed what action on which entity, along with request context (IP address, user agent, correlation ID) and an arbitrary JSONB payload for action-specific details.

#### Columns

| Column              | Type          | Nullable | Default             | Description                                                            |
| ------------------- | ------------- | -------- | ------------------- | ---------------------------------------------------------------------- |
| `id`                | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                                            |
| `tenant_id`         | `uuid`        | NOT NULL | --                  | Tenant reference; FK to `core.tenant(id)`                              |
| `occurred_at`       | `timestamptz` | NOT NULL | `now()`             | When the audited action occurred                                       |
| `actor_id`          | `uuid`        | NULL     | --                  | ID of the principal who performed the action (NULL for system actions) |
| `actor_type`        | `text`        | NOT NULL | --                  | Actor classification: `user`, `service`, or `system`                   |
| `action`            | `text`        | NOT NULL | --                  | Machine-readable action code (e.g., `entity.create`, `auth.login`)     |
| `entity_name`       | `text`        | NULL     | --                  | Type key of the affected entity                                        |
| `entity_id`         | `text`        | NULL     | --                  | ID of the affected entity                                              |
| `entity_version_id` | `uuid`        | NULL     | --                  | Version ID of the entity at the time of the action                     |
| `correlation_id`    | `text`        | NULL     | --                  | Request correlation ID for tracing                                     |
| `ip_address`        | `text`        | NULL     | --                  | Client IP address                                                      |
| `user_agent`        | `text`        | NULL     | --                  | Client user agent string                                               |
| `payload`           | `jsonb`       | NULL     | --                  | Arbitrary action-specific details                                      |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s)   | References        | On Delete |
| ---------- | ----------- | ----------------- | --------- |
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE   |

#### Constraints

| Name                   | Type  | Definition                                  |
| ---------------------- | ----- | ------------------------------------------- |
| `audit_actor_type_chk` | CHECK | `actor_type in ('user','service','system')` |

#### Indexes

| Name                            | Columns                                                                                     | Notes                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `idx_audit_log_tenant_time`     | `(tenant_id, occurred_at DESC)`                                                             | Primary query path: chronological audit feed |
| `idx_audit_log_timeline`        | `(tenant_id, occurred_at DESC) INCLUDE (action, entity_name, entity_id, actor_id, payload)` | Covering index for index-only timeline scans |
| `idx_audit_log_entity_timeline` | `(tenant_id, entity_name, entity_id, occurred_at DESC)`                                     | Entity-specific audit history                |

#### Immutability

Protected by trigger `trg_audit_log_immutable` which invokes `audit.prevent_audit_mutation()`.

#### Relationships

- **Parent**: `core.tenant`

---

### audit.permission_decision_log

**Functional Description**: Append-only audit log recording every access control decision (allow or deny). Captures the full decision context including the actor's principal ID, a JSONB snapshot of the subject's attributes at decision time, the entity and operation being evaluated, the matched policy rule and version, and a human-readable reason. Essential for security investigations and compliance reporting.

#### Columns

| Column                      | Type          | Nullable | Default             | Description                                                     |
| --------------------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------- |
| `id`                        | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                                     |
| `tenant_id`                 | `uuid`        | NOT NULL | --                  | Tenant reference; FK to `core.tenant(id)`                       |
| `occurred_at`               | `timestamptz` | NOT NULL | `now()`             | When the decision was made                                      |
| `actor_principal_id`        | `uuid`        | NULL     | --                  | ID of the principal whose access was evaluated                  |
| `subject_snapshot`          | `jsonb`       | NULL     | --                  | JSONB snapshot of the subject's attributes at decision time     |
| `entity_name`               | `text`        | NULL     | --                  | Type key of the entity being accessed                           |
| `entity_id`                 | `text`        | NULL     | --                  | ID of the entity being accessed                                 |
| `entity_version_id`         | `uuid`        | NULL     | --                  | Version of the entity at decision time                          |
| `operation_code`            | `text`        | NOT NULL | --                  | The operation being evaluated (e.g., `read`, `write`, `delete`) |
| `effect`                    | `text`        | NOT NULL | --                  | Decision outcome: `allow` or `deny`                             |
| `matched_rule_id`           | `uuid`        | NULL     | --                  | ID of the policy rule that matched                              |
| `matched_policy_version_id` | `uuid`        | NULL     | --                  | Version ID of the matched policy                                |
| `reason`                    | `text`        | NULL     | --                  | Human-readable explanation of the decision                      |
| `correlation_id`            | `text`        | NULL     | --                  | Request correlation ID for tracing                              |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s)   | References        | On Delete |
| ---------- | ----------- | ----------------- | --------- |
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE   |

#### Constraints

| Name                  | Type  | Definition                   |
| --------------------- | ----- | ---------------------------- |
| `decision_effect_chk` | CHECK | `effect in ('allow','deny')` |

#### Indexes

| Name                                      | Columns                                                                                                              | Notes                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `idx_decision_log_tenant_time`            | `(tenant_id, occurred_at DESC)`                                                                                      | Primary query path                           |
| `idx_permission_decision_timeline`        | `(tenant_id, occurred_at DESC) INCLUDE (effect, operation_code, actor_principal_id, entity_name, entity_id, reason)` | Covering index for index-only timeline scans |
| `idx_permission_decision_entity_timeline` | `(tenant_id, entity_name, entity_id, occurred_at DESC)`                                                              | Entity-specific decision history             |

#### Immutability

Protected by trigger `trg_permission_decision_log_immutable` which invokes `audit.prevent_audit_mutation()`.

#### Relationships

- **Parent**: `core.tenant`

---

### audit.field_access_log

**Functional Description**: Append-only audit log for field-level access decisions. Records every field-level read or write operation, whether it was allowed or denied, what masking was applied (if any), and which security policy governed the decision. Supports compliance requirements that demand proof of who accessed what data fields and when, especially for sensitive/PII data.

#### Columns

| Column           | Type          | Nullable | Default             | Description                                                         |
| ---------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------------- |
| `id`             | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                                         |
| `tenant_id`      | `uuid`        | NOT NULL | --                  | Tenant reference; FK to `core.tenant(id)`                           |
| `entity_key`     | `text`        | NOT NULL | --                  | Type key of the entity containing the field                         |
| `record_id`      | `uuid`        | NULL     | --                  | ID of the specific record (NULL for schema-level checks)            |
| `subject_id`     | `uuid`        | NOT NULL | --                  | ID of the principal whose access was evaluated                      |
| `subject_type`   | `text`        | NOT NULL | --                  | Subject classification: `user`, `service`, or `system`              |
| `action`         | `text`        | NOT NULL | --                  | Access type: `read` or `write`                                      |
| `field_path`     | `text`        | NOT NULL | --                  | Dot-notation path to the field (e.g., `employee.ssn`)               |
| `was_allowed`    | `boolean`     | NOT NULL | --                  | Whether the access was permitted                                    |
| `mask_applied`   | `text`        | NULL     | --                  | Name of the masking function applied (e.g., `partial_mask`, `hash`) |
| `policy_id`      | `uuid`        | NULL     | --                  | FK to `meta.field_security_policy(id)` that governed this decision  |
| `request_id`     | `text`        | NULL     | --                  | Request identifier for tracing                                      |
| `trace_id`       | `text`        | NULL     | --                  | Distributed trace ID                                                |
| `correlation_id` | `text`        | NULL     | --                  | Business correlation ID                                             |
| `created_at`     | `timestamptz` | NOT NULL | `now()`             | When the access was logged                                          |

#### Primary Key

`id`

#### Foreign Keys

| Constraint      | Column(s)   | References                       | On Delete |
| --------------- | ----------- | -------------------------------- | --------- |
| (implicit)      | `tenant_id` | `core.tenant(id)`                | CASCADE   |
| `fal_policy_fk` | `policy_id` | `meta.field_security_policy(id)` | SET NULL  |

#### Constraints

| Name                                | Type  | Definition                                      |
| ----------------------------------- | ----- | ----------------------------------------------- |
| `field_access_log_subject_type_chk` | CHECK | `subject_type in ('user', 'service', 'system')` |
| `field_access_log_action_chk`       | CHECK | `action in ('read', 'write')`                   |

#### Indexes

| Name                               | Columns                                                                                                     | Partial Filter           | Notes                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------- |
| `idx_field_access_log_entity`      | `(tenant_id, entity_key, created_at DESC)`                                                                  | --                       | Entity-level access timeline                 |
| `idx_field_access_log_subject`     | `(tenant_id, subject_id, created_at DESC)`                                                                  | --                       | Subject's access history                     |
| `idx_field_access_log_record`      | `(record_id)`                                                                                               | `record_id IS NOT NULL`  | Record-specific access                       |
| `idx_field_access_log_policy`      | `(policy_id)`                                                                                               | `policy_id IS NOT NULL`  | Policy usage audit                           |
| `idx_field_access_log_denied`      | `(tenant_id, created_at DESC)`                                                                              | `was_allowed = false`    | Denied access queries                        |
| `idx_field_access_log_request`     | `(request_id)`                                                                                              | `request_id IS NOT NULL` | Request correlation                          |
| `idx_field_access_timeline`        | `(tenant_id, created_at DESC) INCLUDE (action, field_path, was_allowed, subject_id, entity_key, record_id)` | --                       | Covering index for index-only timeline scans |
| `idx_field_access_entity_timeline` | `(tenant_id, entity_key, record_id, created_at DESC)`                                                       | --                       | Entity+record timeline                       |

#### Immutability

Protected by trigger `trg_field_access_log_immutable` which invokes `audit.prevent_audit_mutation()`.

#### Relationships

- **Parent**: `core.tenant`
- **References**: `meta.field_security_policy` (via `policy_id`)

---

### audit.workflow_event_log

**Functional Description**: The most comprehensive audit table in the system. Records every workflow-related event with rich context: event classification (type, severity, schema version), workflow instance and step references, denormalized entity and workflow JSONB snapshots, actor details, state transitions, human-readable comments, request context (IP, user agent, session, trace), tamper-evidence hash chain fields, PII redaction tracking, and encryption key versioning for column-level encryption. This table is **partitioned by range on `event_timestamp`** with monthly partitions, enabling efficient retention management via DDL partition drops.

#### Columns

| Column                      | Type          | Nullable | Default             | Description                                                                                           |
| --------------------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                        | `uuid`        | NOT NULL | `gen_random_uuid()` | Row ID (part of composite PK)                                                                         |
| `tenant_id`                 | `uuid`        | NOT NULL | --                  | Tenant reference; FK to `core.tenant(id)`                                                             |
| `event_type`                | `text`        | NOT NULL | --                  | Machine-readable event type code                                                                      |
| `severity`                  | `text`        | NOT NULL | `'info'`            | Severity level: `info`, `warning`, `error`, or `critical`                                             |
| `schema_version`            | `int`         | NOT NULL | `1`                 | Schema version of the event payload structure                                                         |
| `instance_id`               | `text`        | NOT NULL | --                  | Workflow instance identifier                                                                          |
| `step_instance_id`          | `text`        | NULL     | --                  | Workflow step instance identifier                                                                     |
| `entity_type`               | `text`        | NOT NULL | --                  | Type key of the associated entity                                                                     |
| `entity_id`                 | `text`        | NOT NULL | --                  | ID of the associated entity                                                                           |
| `entity`                    | `jsonb`       | NOT NULL | --                  | Full JSONB snapshot of the entity at event time                                                       |
| `workflow`                  | `jsonb`       | NOT NULL | --                  | Full JSONB snapshot of the workflow at event time                                                     |
| `workflow_template_code`    | `text`        | NULL     | --                  | Workflow template code                                                                                |
| `workflow_template_version` | `int`         | NULL     | --                  | Workflow template version                                                                             |
| `actor`                     | `jsonb`       | NOT NULL | --                  | Full JSONB snapshot of the actor at event time                                                        |
| `actor_user_id`             | `text`        | NULL     | --                  | Denormalized actor user ID for indexed queries                                                        |
| `actor_is_admin`            | `boolean`     | NULL     | `false`             | Whether the actor was operating as an admin                                                           |
| `module_code`               | `text`        | NULL     | `'WF'`              | Originating module: `WF`, `META`, `CORE`, `AUTH`, or `SEC`                                            |
| `action`                    | `text`        | NULL     | --                  | Action taken (e.g., `approve`, `reject`, `submit`)                                                    |
| `previous_state`            | `jsonb`       | NULL     | --                  | JSONB snapshot of state before the event                                                              |
| `new_state`                 | `jsonb`       | NULL     | --                  | JSONB snapshot of state after the event                                                               |
| `comment`                   | `text`        | NULL     | --                  | Human-readable comment (subject to encryption)                                                        |
| `attachments`               | `jsonb`       | NULL     | --                  | Associated attachments (subject to encryption)                                                        |
| `details`                   | `jsonb`       | NULL     | --                  | Freeform event details                                                                                |
| `ip_address`                | `text`        | NULL     | --                  | Client IP address (subject to encryption)                                                             |
| `user_agent`                | `text`        | NULL     | --                  | Client user agent (subject to encryption)                                                             |
| `correlation_id`            | `text`        | NULL     | --                  | Request correlation ID                                                                                |
| `session_id`                | `text`        | NULL     | --                  | Session identifier                                                                                    |
| `trace_id`                  | `text`        | NULL     | --                  | Distributed trace ID                                                                                  |
| `hash_prev`                 | `text`        | NULL     | --                  | Hash of the previous event in the chain (tamper evidence)                                             |
| `hash_curr`                 | `text`        | NULL     | --                  | Hash of the current event (tamper evidence)                                                           |
| `is_redacted`               | `boolean`     | NULL     | `false`             | Whether PII fields have been redacted                                                                 |
| `redaction_version`         | `int`         | NULL     | --                  | Version of the redaction rules applied                                                                |
| `key_version`               | `int`         | NULL     | --                  | Encryption key version for ip_address, user_agent, comment, attachments columns; NULL means plaintext |
| `event_timestamp`           | `timestamptz` | NOT NULL | `now()`             | Event timestamp (partition key)                                                                       |
| `created_at`                | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp                                                                                |

#### Primary Key

Composite: `(id, event_timestamp)` -- includes the partition key as required by PostgreSQL range partitioning.

#### Partitioning

- **Strategy**: `PARTITION BY RANGE (event_timestamp)`
- **Granularity**: Monthly partitions
- **Naming**: `workflow_event_log_YYYY_MM`
- **Auto-provisioning**: Current month + next 3 months are created at schema initialization; subsequent months are created via `audit.create_next_audit_partition()` (scheduled on the 25th via pg_cron)

#### Foreign Keys

| Constraint           | Column(s)   | References        | On Delete |
| -------------------- | ----------- | ----------------- | --------- |
| `wf_audit_tenant_fk` | `tenant_id` | `core.tenant(id)` | CASCADE   |

#### Constraints

| Name                    | Type  | Definition                                          |
| ----------------------- | ----- | --------------------------------------------------- |
| `wf_audit_severity_chk` | CHECK | `severity in ('info','warning','error','critical')` |
| `wf_audit_module_chk`   | CHECK | `module_code in ('WF','META','CORE','AUTH','SEC')`  |

#### Indexes

All indexes are created on the parent table and are automatically inherited by each partition.

| Name                          | Columns                                                                                                                     | Partial Filter                 | Notes                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| `idx_wf_audit_tenant_time`    | `(tenant_id, event_timestamp DESC)`                                                                                         | --                             | Primary chronological query                          |
| `idx_wf_audit_instance`       | `(tenant_id, instance_id, event_timestamp ASC)`                                                                             | --                             | Workflow instance event timeline                     |
| `idx_wf_audit_step`           | `(tenant_id, step_instance_id)`                                                                                             | `step_instance_id IS NOT NULL` | Step-level lookup                                    |
| `idx_wf_audit_correlation`    | `(tenant_id, correlation_id)`                                                                                               | `correlation_id IS NOT NULL`   | Request correlation                                  |
| `idx_wf_audit_event_type`     | `(tenant_id, event_type, event_timestamp DESC)`                                                                             | --                             | Event type filtering                                 |
| `idx_wf_audit_entity`         | `(tenant_id, entity_type, entity_id)`                                                                                       | --                             | Entity-level audit history                           |
| `idx_wf_audit_actor`          | `(tenant_id, actor_user_id, event_timestamp DESC)`                                                                          | --                             | Actor-level audit history                            |
| `idx_wf_audit_template`       | `(tenant_id, workflow_template_code)`                                                                                       | --                             | Template usage tracking                              |
| `idx_wf_audit_details_gin`    | GIN on `details`                                                                                                            | `details IS NOT NULL`          | JSONB containment queries on details                 |
| `idx_audit_event_key_version` | `(tenant_id, key_version)`                                                                                                  | `key_version IS NOT NULL`      | Key rotation worker: find rows needing re-encryption |
| `idx_audit_event_dedup`       | `(tenant_id, correlation_id, event_timestamp, event_type, actor_user_id)` UNIQUE                                            | `correlation_id IS NOT NULL`   | Replay deduplication                                 |
| `idx_wf_audit_timeline`       | `(tenant_id, event_timestamp DESC) INCLUDE (event_type, severity, entity_type, entity_id, actor_user_id, comment, details)` | --                             | Covering index for index-only timeline scans         |

#### Immutability

Protected by trigger `trg_audit_immutable_workflow_audit` which invokes `audit.prevent_audit_mutation()`. The trigger allows:

- **DELETE** by role `athyper_retention` when session variable `athyper.audit_retention_bypass` is set to `'true'`
- **UPDATE** of encryption-related columns (`key_version`, `ip_address`, `user_agent`, `comment`, `attachments`) by role `athyper_admin` when the bypass session variable is set

#### Relationships

- **Parent**: `core.tenant`

---

### audit.hash_anchor

**Functional Description**: Stores daily tamper-evidence checkpoints for the workflow event hash chain. Each anchor records the final hash value and total event count for a given tenant on a given date. Used by the integrity verification process to validate that the hash chain has not been tampered with between anchor points.

#### Columns

| Column        | Type          | Nullable | Default             | Description                                     |
| ------------- | ------------- | -------- | ------------------- | ----------------------------------------------- |
| `id`          | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                     |
| `tenant_id`   | `uuid`        | NOT NULL | --                  | Tenant reference; FK to `core.tenant(id)`       |
| `anchor_date` | `date`        | NOT NULL | --                  | Calendar date for this anchor point             |
| `last_hash`   | `text`        | NOT NULL | --                  | Final hash value of the last event on this date |
| `event_count` | `int`         | NOT NULL | --                  | Total number of events on this date             |
| `created_at`  | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp                          |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s)   | References        | On Delete |
| ---------- | ----------- | ----------------- | --------- |
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE   |

#### Constraints

| Name               | Type   | Definition                                                   |
| ------------------ | ------ | ------------------------------------------------------------ |
| `hash_anchor_uniq` | UNIQUE | `(tenant_id, anchor_date)` -- one anchor per tenant per date |

#### Indexes

| Name                     | Columns                         | Notes                      |
| ------------------------ | ------------------------------- | -------------------------- |
| `idx_hash_anchor_tenant` | `(tenant_id, anchor_date DESC)` | Anchor timeline per tenant |

#### RLS

Row-Level Security is enabled. Policy `audit_anchor_tenant_isolation` restricts access based on `athyper.current_tenant` session variable.

#### Relationships

- **Parent**: `core.tenant`
- **Related**: `audit.workflow_event_log` (provides the hash chain that anchors verify), `audit.integrity_report` (consumes anchors during verification)

---

### audit.dlq

**Functional Description**: Dead-letter queue for audit outbox items that have exceeded their maximum retry attempts. Captures the original outbox entry reference, event metadata, failure details (last error message and error category), attempt count, and replay lifecycle tracking. Allows operators to investigate failed events and replay them after fixing the underlying issue.

#### Columns

| Column           | Type          | Nullable | Default             | Description                                                     |
| ---------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------- |
| `id`             | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                                     |
| `tenant_id`      | `uuid`        | NOT NULL | --                  | Tenant reference; FK to `core.tenant(id)`                       |
| `outbox_id`      | `uuid`        | NOT NULL | --                  | Reference to the original outbox entry                          |
| `event_type`     | `text`        | NOT NULL | --                  | Event type of the failed event                                  |
| `payload`        | `jsonb`       | NOT NULL | --                  | Full event payload                                              |
| `last_error`     | `text`        | NULL     | --                  | Last error message from the processing attempt                  |
| `error_category` | `text`        | NULL     | --                  | Error classification (e.g., `transient`, `permanent`)           |
| `attempt_count`  | `int`         | NOT NULL | `0`                 | Number of processing attempts before dead-lettering             |
| `dead_at`        | `timestamptz` | NOT NULL | `now()`             | When the event was moved to the DLQ                             |
| `replayed_at`    | `timestamptz` | NULL     | --                  | When the event was successfully replayed (NULL if not replayed) |
| `replayed_by`    | `text`        | NULL     | --                  | Who initiated the replay                                        |
| `replay_count`   | `int`         | NOT NULL | `0`                 | Number of replay attempts                                       |
| `correlation_id` | `text`        | NULL     | --                  | Correlation ID for tracing                                      |
| `created_at`     | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp                                          |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s)   | References        | On Delete |
| ---------- | ----------- | ----------------- | --------- |
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE   |

#### Indexes

| Name                  | Columns                        | Partial Filter               | Notes                               |
| --------------------- | ------------------------------ | ---------------------------- | ----------------------------------- |
| `idx_dlq_unreplayed`  | `(tenant_id, dead_at DESC)`    | `replayed_at IS NULL`        | Pending DLQ items needing attention |
| `idx_dlq_tenant`      | `(tenant_id, created_at DESC)` | --                           | All DLQ items per tenant            |
| `idx_dlq_correlation` | `(correlation_id)`             | `correlation_id IS NOT NULL` | Correlation-based lookup            |

#### RLS

Row-Level Security is enabled. Policy `dlq_tenant_isolation` restricts access based on `athyper.current_tenant` session variable.

#### Relationships

- **Parent**: `core.tenant`

---

### audit.integrity_report

**Functional Description**: Stores the results of integrity verification runs. Each report covers a verification type (range, export, or full), a date range, and records what was checked (event count, chain validity, anchor matching, partition completeness, export hash validity) along with any failure details. Used to provide evidence-grade proof that the audit log has not been tampered with.

#### Columns

| Column                | Type          | Nullable | Default             | Description                                                               |
| --------------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------------------- |
| `id`                  | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                                               |
| `tenant_id`           | `uuid`        | NOT NULL | --                  | Tenant identifier                                                         |
| `verification_type`   | `text`        | NOT NULL | --                  | Type of verification: `range`, `export`, or `full`                        |
| `start_date`          | `timestamptz` | NULL     | --                  | Start of the verified date range                                          |
| `end_date`            | `timestamptz` | NULL     | --                  | End of the verified date range                                            |
| `status`              | `text`        | NOT NULL | `'pending'`         | Verification status: `pending`, `running`, `passed`, `failed`, or `error` |
| `events_checked`      | `int`         | NULL     | `0`                 | Number of events examined during verification                             |
| `chain_valid`         | `boolean`     | NULL     | --                  | Whether the hash chain was found to be valid                              |
| `anchor_match`        | `boolean`     | NULL     | --                  | Whether daily anchors matched the computed hashes                         |
| `partitions_complete` | `boolean`     | NULL     | --                  | Whether all expected partitions were present                              |
| `export_hash_valid`   | `boolean`     | NULL     | --                  | Whether export file hashes matched                                        |
| `broken_at_event_id`  | `text`        | NULL     | --                  | ID of the event where the chain first broke (if applicable)               |
| `broken_at_index`     | `int`         | NULL     | --                  | Index position of the broken event                                        |
| `error_message`       | `text`        | NULL     | --                  | Error message (if status is `error`)                                      |
| `details`             | `jsonb`       | NULL     | `'{}'`              | Freeform verification details                                             |
| `initiated_by`        | `text`        | NOT NULL | --                  | Who initiated the verification                                            |
| `started_at`          | `timestamptz` | NULL     | --                  | When verification processing began                                        |
| `completed_at`        | `timestamptz` | NULL     | --                  | When verification processing completed                                    |
| `created_at`          | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp                                                    |

#### Primary Key

`id`

#### Constraints

| Name                          | Type  | Definition                                                  |
| ----------------------------- | ----- | ----------------------------------------------------------- |
| `integrity_report_type_chk`   | CHECK | `verification_type in ('range','export','full')`            |
| `integrity_report_status_chk` | CHECK | `status in ('pending','running','passed','failed','error')` |

#### Indexes

| Name                                  | Columns                                | Notes                      |
| ------------------------------------- | -------------------------------------- | -------------------------- |
| `idx_integrity_report_tenant_created` | `(tenant_id, created_at DESC)`         | Report timeline per tenant |
| `idx_integrity_report_tenant_status`  | `(tenant_id, status, created_at DESC)` | Reports by status          |

#### RLS

Row-Level Security is enabled. Policy `tenant_isolation_integrity_report` restricts access based on `athyper.current_tenant` session variable.

#### Relationships

- **Related**: `audit.workflow_event_log` (the subject of verification), `audit.hash_anchor` (reference anchors used during verification)

---

### audit.archive_marker

**Functional Description**: Tracks which workflow_event_log partitions have been archived to object storage (cold tier) as part of the hot/warm/cold storage tiering strategy. Each marker records the partition name, the month it covers, the object storage key and SHA-256 hash of the exported NDJSON file, the row count, and when/by whom it was archived. The optional `detached_at` column indicates when the partition was detached from the live table after successful archival.

#### Columns

| Column            | Type          | Nullable | Default             | Description                                                  |
| ----------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------ |
| `id`              | `uuid`        | NOT NULL | `gen_random_uuid()` | Primary key                                                  |
| `partition_name`  | `text`        | NOT NULL | --                  | PostgreSQL partition table name (unique)                     |
| `partition_month` | `date`        | NOT NULL | --                  | Calendar month covered by this partition (unique)            |
| `ndjson_key`      | `text`        | NOT NULL | --                  | Object storage key for the exported NDJSON file              |
| `sha256`          | `text`        | NOT NULL | --                  | SHA-256 hash of the exported file for integrity verification |
| `row_count`       | `bigint`      | NOT NULL | `0`                 | Number of rows exported                                      |
| `archived_at`     | `timestamptz` | NOT NULL | `now()`             | When the archive was created                                 |
| `archived_by`     | `text`        | NOT NULL | --                  | Who initiated the archival                                   |
| `detached_at`     | `timestamptz` | NULL     | --                  | When the partition was detached from the live table          |
| `created_at`      | `timestamptz` | NOT NULL | `now()`             | Row creation timestamp                                       |

#### Primary Key

`id`

#### Constraints

| Name       | Type   | Definition        |
| ---------- | ------ | ----------------- |
| (implicit) | UNIQUE | `partition_name`  |
| (implicit) | UNIQUE | `partition_month` |

#### Indexes

| Name                       | Columns             | Notes                      |
| -------------------------- | ------------------- | -------------------------- |
| `idx_archive_marker_month` | `(partition_month)` | Month-based archive lookup |

#### Relationships

- **Related**: `audit.workflow_event_log` (the partitions being archived)

---

## Immutability Trigger

### audit.prevent_audit_mutation()

**Type**: Trigger function (`BEFORE UPDATE OR DELETE`)
**Language**: PL/pgSQL

**Description**: Core security control that enforces the append-only nature of all audit tables. Prevents any UPDATE or DELETE operation unless specific bypass conditions are met. The bypass requires both a session variable (`athyper.audit_retention_bypass = 'true'`) and membership in the appropriate database role.

**Bypass Rules**:

| Operation | Required Role       | Additional Condition                                                                                             |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| DELETE    | `athyper_retention` | Session variable `athyper.audit_retention_bypass = 'true'`                                                       |
| UPDATE    | `athyper_admin`     | Session variable set AND only on `workflow_event_log` AND only when `key_version` changes (encryption re-keying) |

If bypass conditions are not met, the function raises a `restrict_violation` exception with a descriptive error message.

```sql
CREATE OR REPLACE FUNCTION audit.prevent_audit_mutation()
RETURNS trigger AS $$
DECLARE
  v_bypass text;
  v_is_retention boolean;
  v_is_admin boolean;
BEGIN
  v_bypass := current_setting('athyper.audit_retention_bypass', true);

  IF v_bypass = 'true' THEN
    v_is_retention := pg_has_role(current_user, 'athyper_retention', 'MEMBER');
    v_is_admin := pg_has_role(current_user, 'athyper_admin', 'MEMBER');

    IF tg_op = 'DELETE' AND v_is_retention THEN
      RETURN old;
    END IF;

    IF tg_op = 'UPDATE' AND v_is_admin THEN
      IF tg_table_name = 'workflow_event_log' THEN
        IF old.key_version IS DISTINCT FROM new.key_version THEN
          RETURN new;
        END IF;
      END IF;
    END IF;

    RAISE EXCEPTION 'Audit mutation bypass requires appropriate role. op=%, user=%, table=%.%',
      tg_op, current_user, tg_table_schema, tg_table_name
      USING ERRCODE = 'restrict_violation';
  END IF;

  RAISE EXCEPTION 'Audit tables are immutable. % operations are not permitted on %.%',
    tg_op, tg_table_schema, tg_table_name
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### Trigger Assignments

The immutability trigger is attached to the following tables:

| Trigger Name                            | Table                           | Events                  |
| --------------------------------------- | ------------------------------- | ----------------------- |
| `trg_audit_log_immutable`               | `audit.audit_log`               | BEFORE UPDATE OR DELETE |
| `trg_permission_decision_log_immutable` | `audit.permission_decision_log` | BEFORE UPDATE OR DELETE |
| `trg_field_access_log_immutable`        | `audit.field_access_log`        | BEFORE UPDATE OR DELETE |
| `trg_audit_immutable_workflow_audit`    | `audit.workflow_event_log`      | BEFORE UPDATE OR DELETE |
| `trg_security_event_immutable`          | `sec.security_event`            | BEFORE UPDATE OR DELETE |

Note that `sec.security_event` (in the `sec` schema) is also protected by this audit immutability trigger, reflecting the shared security concern.

---

## Partition Lifecycle Functions

### audit.create_next_audit_partition()

**Type**: Function returning `void`
**Language**: PL/pgSQL

**Description**: Creates the next month's partition for `audit.workflow_event_log`. Designed to be scheduled via pg_cron on the 25th of each month, ensuring the next month's partition exists before it is needed.

**Partition naming**: `workflow_event_log_YYYY_MM`

---

### audit.drop_audit_partition(p_year, p_month)

**Type**: Function returning `void`
**Language**: PL/pgSQL
**Parameters**: `p_year int`, `p_month int`

**Description**: Drops a specific monthly partition by year and month. This is the recommended retention mechanism because DDL operations (`DROP TABLE`) bypass the immutability trigger (which only fires on DML). This avoids the need for bypass session variables when purging old data.

---

### audit.create_audit_partition_for_month(p_target)

**Type**: Function returning `text`
**Language**: PL/pgSQL
**Parameters**: `p_target date`

**Description**: Creates a partition for a specific target month. Returns the partition name. Useful for backfilling partitions or creating partitions for ad-hoc date ranges.

---

### audit.list_audit_partitions()

**Type**: Function returning `TABLE(partition_name text, range_start text, range_end text, row_count bigint, size_bytes bigint)`
**Language**: PL/pgSQL

**Description**: Lists all existing partitions of `audit.workflow_event_log` with their range boundaries, live row counts, and on-disk sizes. Useful for operational monitoring and capacity planning.

---

### audit.check_audit_partition_indexes(p_partition)

**Type**: Function returning `TABLE(expected_index text, exists_ boolean)`
**Language**: PL/pgSQL
**Parameters**: `p_partition text`

**Description**: Validates that a given partition has all expected indexes. Checks against a hardcoded list of 9 expected index prefixes (all `idx_wf_audit_*` indexes). Returns a row per expected index with a boolean indicating whether it exists on the specified partition. Useful for verifying partition health after creation or maintenance.

**Expected index prefixes checked**:

1. `idx_wf_audit_tenant_time`
2. `idx_wf_audit_instance`
3. `idx_wf_audit_step`
4. `idx_wf_audit_correlation`
5. `idx_wf_audit_event_type`
6. `idx_wf_audit_entity`
7. `idx_wf_audit_actor`
8. `idx_wf_audit_template`
9. `idx_wf_audit_details_gin`

---

## Roles and Permissions

Five dedicated database roles (all `NOLOGIN`, used via `SET ROLE`) provide least-privilege access to audit tables:

### athyper_retention

**Purpose**: Audit retention jobs. Allowed to DELETE old rows from audit tables.

**Grants**:
| Permission | Tables |
|-----------|--------|
| DELETE | `audit.workflow_event_log`, `audit.audit_log`, `audit.permission_decision_log`, `audit.field_access_log`, `sec.security_event` |

### athyper_admin

**Purpose**: Audit admin operations including key rotation and manual corrections.

**Grants**:
| Permission | Tables | Columns |
|-----------|--------|---------|
| UPDATE | `audit.workflow_event_log` | `key_version`, `ip_address`, `user_agent`, `comment`, `attachments` |

### athyper_app_writer

**Purpose**: INSERT-only role for audit tables. Used by application code during event ingestion.

**Grants**:
| Permission | Tables |
|-----------|--------|
| INSERT | `audit.workflow_event_log`, `audit.hash_anchor`, `audit.dlq`, `sec.security_event` |

### athyper_audit_reader

**Purpose**: SELECT-only role for audit tables with RLS enforcement. Used by query/reporting services.

**Grants**:
| Permission | Tables |
|-----------|--------|
| SELECT | `audit.workflow_event_log`, `audit.hash_anchor`, `audit.dlq`, `sec.security_event`, `audit.permission_decision_log`, `audit.field_access_log`, `audit.audit_log` |

### athyper_audit_admin

**Purpose**: Integrity verification, export operations, and audit-of-audit. Superset of reader permissions plus the ability to write integrity reports and security events.

**Grants**:
| Permission | Tables |
|-----------|--------|
| SELECT | `audit.workflow_event_log`, `audit.hash_anchor`, `audit.dlq`, `sec.security_event`, `audit.permission_decision_log`, `audit.field_access_log`, `audit.audit_log` |
| INSERT | `sec.security_event` |
| SELECT, INSERT, UPDATE | `audit.integrity_report` |

---

## Row-Level Security Policies

RLS is enabled on four audit tables to enforce tenant isolation. All policies use the PostgreSQL session variable `athyper.current_tenant` to filter rows.

| Table                      | Policy Name                         | Enforcement                                                                                      |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `audit.workflow_event_log` | `audit_event_tenant_isolation`      | `tenant_id = current_setting('athyper.current_tenant', true)::uuid` on both USING and WITH CHECK |
| `audit.hash_anchor`        | `audit_anchor_tenant_isolation`     | `tenant_id = current_setting('athyper.current_tenant', true)::uuid` on both USING and WITH CHECK |
| `audit.dlq`                | `dlq_tenant_isolation`              | `tenant_id = current_setting('athyper.current_tenant', true)::uuid` on both USING and WITH CHECK |
| `audit.integrity_report`   | `tenant_isolation_integrity_report` | `tenant_id::text = current_setting('athyper.current_tenant', true)` on USING (FOR ALL)           |

**Important**: The `athyper.current_tenant` session variable must be set before any query against these tables. The `true` parameter to `current_setting` makes the function return NULL instead of throwing an error if the variable is not set, which would cause the RLS policy to filter out all rows (fail-closed behavior).

---

## SECURITY DEFINER Functions

These functions execute with the privileges of their owning role rather than the calling user, providing controlled access to otherwise-blocked operations on immutable audit tables.

### audit.audit_key_rotation_update()

**Type**: SECURITY DEFINER function
**Owner**: `athyper_admin`
**Language**: PL/pgSQL
**Search Path**: `audit, pg_temp`
**Granted To**: `athyper_audit_admin` (EXECUTE)

**Parameters**:

| Parameter           | Type          | Description                                                     |
| ------------------- | ------------- | --------------------------------------------------------------- |
| `p_tenant_id`       | `uuid`        | Tenant scope for the update                                     |
| `p_row_id`          | `uuid`        | Row ID to update                                                |
| `p_event_timestamp` | `timestamptz` | Event timestamp (needed because it is part of the composite PK) |
| `p_ip_address`      | `text`        | Re-encrypted IP address                                         |
| `p_user_agent`      | `text`        | Re-encrypted user agent                                         |
| `p_comment`         | `text`        | Re-encrypted comment                                            |
| `p_attachments`     | `text`        | Re-encrypted attachments                                        |
| `p_key_version`     | `int`         | New encryption key version                                      |

**Description**: Re-encrypts sensitive columns in `audit.workflow_event_log` during key rotation. Sets the `athyper.audit_retention_bypass` session variable to `'true'` internally, then performs the UPDATE. Because the function is owned by `athyper_admin`, the immutability trigger's role check passes. Revoked from PUBLIC; only `athyper_audit_admin` can execute.

---

### audit.audit_retention_delete()

**Type**: SECURITY DEFINER function
**Owner**: `athyper_retention`
**Language**: PL/pgSQL
**Search Path**: `audit, pg_temp`
**Granted To**: `athyper_retention` (EXECUTE)

**Parameters**:

| Parameter       | Type          | Default | Description                                             |
| --------------- | ------------- | ------- | ------------------------------------------------------- |
| `p_table_name`  | `text`        | --      | Target table name (validated against allowlist)         |
| `p_cutoff_date` | `timestamptz` | --      | Delete rows with `created_at` before this date          |
| `p_tenant_id`   | `uuid`        | `NULL`  | Optional tenant scope (NULL for cross-tenant retention) |

**Returns**: `bigint` -- count of deleted rows.

**Description**: Deletes old audit rows for retention purposes. Validates the table name against a hardcoded allowlist to prevent SQL injection:

- `workflow_event_log`
- `audit_log`
- `permission_decision_log`
- `field_access_log`
- `security_event`

Sets the bypass session variable internally and is owned by `athyper_retention` so the immutability trigger allows the DELETE. Supports optional tenant scoping. Revoked from PUBLIC.

---

## Timeline Covering Indexes

A set of covering indexes (using the `INCLUDE` clause) are defined to enable index-only scans for common timeline queries. These indexes include frequently-accessed columns so that PostgreSQL can satisfy queries entirely from the index without fetching the heap.

| Index Name                                | Table                           | Key Columns                                             | Included Columns                                                                |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `idx_security_event_timeline`             | `sec.security_event`            | `(tenant_id, occurred_at DESC)`                         | `event_type, severity, principal_id, details`                                   |
| `idx_permission_decision_timeline`        | `audit.permission_decision_log` | `(tenant_id, occurred_at DESC)`                         | `effect, operation_code, actor_principal_id, entity_name, entity_id, reason`    |
| `idx_permission_decision_entity_timeline` | `audit.permission_decision_log` | `(tenant_id, entity_name, entity_id, occurred_at DESC)` | --                                                                              |
| `idx_field_access_timeline`               | `audit.field_access_log`        | `(tenant_id, created_at DESC)`                          | `action, field_path, was_allowed, subject_id, entity_key, record_id`            |
| `idx_field_access_entity_timeline`        | `audit.field_access_log`        | `(tenant_id, entity_key, record_id, created_at DESC)`   | --                                                                              |
| `idx_audit_log_timeline`                  | `audit.audit_log`               | `(tenant_id, occurred_at DESC)`                         | `action, entity_name, entity_id, actor_id, payload`                             |
| `idx_audit_log_entity_timeline`           | `audit.audit_log`               | `(tenant_id, entity_name, entity_id, occurred_at DESC)` | --                                                                              |
| `idx_wf_audit_timeline`                   | `audit.workflow_event_log`      | `(tenant_id, event_timestamp DESC)`                     | `event_type, severity, entity_type, entity_id, actor_user_id, comment, details` |

---

## Deferred Foreign Keys

| Constraint Name | Source Table             | Column      | References                       | On Delete |
| --------------- | ------------------------ | ----------- | -------------------------------- | --------- |
| `fal_policy_fk` | `audit.field_access_log` | `policy_id` | `meta.field_security_policy(id)` | SET NULL  |

This FK is created in a deferred `DO` block because `meta.field_security_policy` may not yet exist when the audit schema is first provisioned (the meta schema is loaded separately). The FK links each field access log entry to the security policy that governed the decision.
