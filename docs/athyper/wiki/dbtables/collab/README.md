# Collab Schema -- Database Reference

**Schema**: `collab`
**Source**: `framework/adapters/db/src/sql/090_collab.sql`
**PostgreSQL**: 16+

The `collab` schema implements the collaboration subsystem of the Athyper platform. It covers record-level commenting with threading, @mentions, emoji reactions, read tracking, auto-save drafts, content moderation, SLA monitoring, engagement analytics, GDPR-compliant retention, direct/group messaging with full-text search, task delegation, record-level sharing, and cross-tenant external share tokens.

---

## Table of Contents

- [Comments and Moderation](#comments-and-moderation)
  - [collab.entity_comment](#collabentity_comment)
  - [collab.comment_mention](#collabcomment_mention)
  - [collab.comment_reaction](#collabcomment_reaction)
  - [collab.comment_read](#collabcomment_read)
  - [collab.comment_draft](#collabcomment_draft)
  - [collab.comment_flag](#collabcomment_flag)
  - [collab.comment_moderation](#collabcomment_moderation)
- [SLA and Analytics](#sla-and-analytics)
  - [collab.comment_sla_config](#collabcomment_sla_config)
  - [collab.comment_sla_metrics](#collabcomment_sla_metrics)
  - [collab.comment_response](#collabcomment_response)
  - [collab.comment_analytics_daily](#collabcomment_analytics_daily)
  - [collab.comment_user_analytics](#collabcomment_user_analytics)
  - [collab.comment_thread_analytics](#collabcomment_thread_analytics)
- [Retention](#retention)
  - [collab.comment_retention_policy](#collabcomment_retention_policy)
  - [collab.comment_retention_log](#collabcomment_retention_log)
- [Messaging](#messaging)
  - [collab.conversation](#collabconversation)
  - [collab.conversation_participant](#collabconversation_participant)
  - [collab.message](#collabmessage)
  - [collab.message_delivery](#collabmessage_delivery)
- [Delegation and Sharing](#delegation-and-sharing)
  - [collab.delegation_grant](#collabdelegation_grant)
  - [collab.delegation_request](#collabdelegation_request)
  - [collab.record_share](#collabrecord_share)
  - [collab.share_audit](#collabshare_audit)
  - [collab.external_share_token](#collabexternal_share_token)
- [Functions and Triggers](#functions-and-triggers)
  - [collab.message_body_tsv_trigger()](#collabmessage_body_tsv_trigger)
- [Schema Alterations](#schema-alterations)
  - [doc.attachment -- Comment Link Columns](#docattachment--comment-link-columns)
  - [wf.approval_comment -- Visibility, Soft Delete, and Retention Columns](#wfapproval_comment--visibility-soft-delete-and-retention-columns)

---

## Comments and Moderation

### collab.entity_comment

**Functional Description**: Stores record-level comments attached to any entity type in the system. Supports threaded conversations with a maximum nesting depth of 5, three visibility levels (public, internal, private), soft deletion, and GDPR-compliant archival/retention tracking. Comments are polymorphically linked to entities via `entity_type` and `entity_id`.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `entity_type` | `text` | NOT NULL | -- | Type key identifying the entity this comment belongs to |
| `entity_id` | `uuid` | NOT NULL | -- | ID of the entity record being commented on |
| `commenter_id` | `uuid` | NOT NULL | -- | The principal who authored the comment; FK to `core.principal(id)` |
| `comment_text` | `text` | NOT NULL | -- | Comment body text (max 5000 characters) |
| `parent_comment_id` | `uuid` | NULL | -- | Self-referencing FK for threaded replies; NULL for top-level comments |
| `thread_depth` | `int` | NOT NULL | `0` | Nesting depth of this comment in the thread (0 = top-level, max 5) |
| `visibility` | `text` | NOT NULL | `'public'` | Visibility level: `public`, `internal`, or `private` |
| `deleted_at` | `timestamptz` | NULL | -- | Soft delete timestamp |
| `deleted_by` | `text` | NULL | -- | Identifier of the actor who soft-deleted the comment |
| `archived_at` | `timestamptz` | NULL | -- | Timestamp when the comment was archived (can be restored) |
| `archived_by` | `text` | NULL | -- | Identifier of the actor who archived the comment |
| `retention_until` | `timestamptz` | NULL | -- | Date when the comment becomes eligible for archival/deletion per retention policy |
| `retention_policy_id` | `uuid` | NULL | -- | FK to the retention policy governing this comment's lifecycle |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `created_by` | `text` | NOT NULL | -- | Identifier of the actor who created the comment |
| `updated_at` | `timestamptz` | NULL | -- | Last update timestamp |
| `updated_by` | `text` | NULL | -- | Identifier of the actor who last updated the comment |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `commenter_id` | `core.principal(id)` | SET NULL |
| (implicit) | `parent_comment_id` | `collab.entity_comment(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `entity_comment_text_len_chk` | CHECK | `char_length(comment_text) <= 5000` |
| `entity_comment_depth_chk` | CHECK | `thread_depth between 0 and 5` |
| `entity_comment_visibility_chk` | CHECK | `visibility in ('public','internal','private')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_entity_comment_entity` | `(tenant_id, entity_type, entity_id, created_at DESC)` | `deleted_at IS NULL` | Main query path: comments for an entity |
| `idx_entity_comment_commenter` | `(commenter_id, created_at DESC)` | `deleted_at IS NULL` | User's comment history |
| `idx_entity_comment_parent` | `(parent_comment_id, created_at ASC)` | `parent_comment_id IS NOT NULL AND deleted_at IS NULL` | Thread child traversal |
| `idx_entity_comment_visibility` | `(tenant_id, entity_type, entity_id, visibility, created_at DESC)` | `deleted_at IS NULL` | Visibility-filtered queries |
| `idx_entity_comment_archived` | `(tenant_id, archived_at)` | `archived_at IS NOT NULL` | Archived comment queries |
| `idx_entity_comment_retention` | `(tenant_id, retention_until)` | `retention_until IS NOT NULL AND deleted_at IS NULL` | Retention batch processing |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`
- **Self-referencing**: `parent_comment_id` for threading
- **Children**: `collab.comment_mention`, `collab.comment_reaction`, `collab.comment_read`, `collab.comment_draft`, `collab.comment_flag`, `collab.comment_moderation` (via polymorphic comment_type/comment_id)

---

### collab.comment_mention

**Functional Description**: Stores parsed @mention references extracted from comment text. Each row represents one @mention of a user within a comment. Used to drive notification dispatch and enable mention-based search. Supports polymorphic comment references to both entity comments and approval comments.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `comment_type` | `text` | NOT NULL | -- | Polymorphic discriminator: `entity_comment` or `approval_comment` |
| `comment_id` | `uuid` | NOT NULL | -- | ID of the comment containing the mention |
| `mentioned_user_id` | `uuid` | NOT NULL | -- | The principal who was mentioned; FK to `core.principal(id)` |
| `mention_text` | `text` | NOT NULL | -- | The raw mention text as it appeared (e.g., `@john.doe`) |
| `position` | `int` | NOT NULL | -- | Character offset position of the mention in the comment text |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `mentioned_user_id` | `core.principal(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_mention_type_chk` | CHECK | `comment_type in ('entity_comment','approval_comment')` |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_mention_comment` | `(comment_type, comment_id)` | Lookup mentions within a comment |
| `idx_comment_mention_user` | `(mentioned_user_id, created_at DESC)` | User's incoming mentions feed |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`
- **Polymorphic reference**: Points to either `collab.entity_comment` or `wf.approval_comment` via `comment_type` + `comment_id`

---

### collab.comment_reaction

**Functional Description**: Records emoji reactions on comments. Each user can leave one of each reaction type per comment, enforced by a unique constraint. Supports 8 emoji types: thumbs up, heart, party, eyes, thumbs down, rocket, bulb, and thinking. Reactions can target both entity comments and approval comments via polymorphic linking.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `comment_type` | `text` | NOT NULL | -- | Polymorphic discriminator: `entity_comment` or `approval_comment` |
| `comment_id` | `uuid` | NOT NULL | -- | ID of the comment being reacted to |
| `user_id` | `uuid` | NOT NULL | -- | The principal who reacted; FK to `core.principal(id)` |
| `reaction_type` | `text` | NOT NULL | -- | Emoji character (one of 8 supported types) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `user_id` | `core.principal(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_reaction_type_chk` | CHECK | `comment_type in ('entity_comment','approval_comment')` |
| `comment_reaction_emoji_chk` | CHECK | `reaction_type in ('thumbs_up','heart','party','eyes','thumbs_down','rocket','bulb','thinking')` (stored as emoji characters) |
| `comment_reaction_uniq` | UNIQUE | `(tenant_id, comment_type, comment_id, user_id, reaction_type)` -- one reaction type per user per comment |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_reaction_comment` | `(tenant_id, comment_type, comment_id)` | Aggregate reactions for a comment |
| `idx_comment_reaction_user` | `(tenant_id, user_id, created_at DESC)` | User's reaction history |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`
- **Polymorphic reference**: Points to either `collab.entity_comment` or `wf.approval_comment` via `comment_type` + `comment_id`

---

### collab.comment_read

**Functional Description**: Tracks which comments have been read by which users. Provides the data backing for unread comment badges and notification dismissal. Each user can mark a comment as read exactly once, enforced by a unique constraint. Supports polymorphic comment references.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `comment_type` | `text` | NOT NULL | -- | Polymorphic discriminator: `entity_comment` or `approval_comment` |
| `comment_id` | `uuid` | NOT NULL | -- | ID of the comment that was read |
| `user_id` | `uuid` | NOT NULL | -- | The principal who read the comment; FK to `core.principal(id)` |
| `read_at` | `timestamptz` | NOT NULL | `now()` | Timestamp when the comment was read |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `user_id` | `core.principal(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_read_type_chk` | CHECK | `comment_type in ('entity_comment','approval_comment')` |
| `comment_read_uniq` | UNIQUE | `(tenant_id, comment_type, comment_id, user_id)` -- one read record per user per comment |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_read_user` | `(tenant_id, user_id, comment_type)` | User's read history by type |
| `idx_comment_read_comment` | `(tenant_id, comment_type, comment_id)` | Who has read a specific comment |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`
- **Polymorphic reference**: Points to either `collab.entity_comment` or `wf.approval_comment` via `comment_type` + `comment_id`

---

### collab.comment_draft

**Functional Description**: Persists auto-saved comment drafts so that in-progress text is not lost on page navigation or session expiry. Each user may have at most one draft per entity per parent comment slot, enforced by a unique constraint. Drafts reference entity comments for reply context and support the same visibility model as published comments.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `user_id` | `uuid` | NOT NULL | -- | The principal who owns the draft; FK to `core.principal(id)` |
| `entity_type` | `text` | NOT NULL | -- | Type key of the entity the draft is attached to |
| `entity_id` | `uuid` | NOT NULL | -- | ID of the entity the draft is attached to |
| `parent_comment_id` | `uuid` | NULL | -- | FK to `collab.entity_comment(id)`; NULL for top-level comment drafts, set for reply drafts |
| `draft_text` | `text` | NOT NULL | -- | The draft comment body text |
| `visibility` | `text` | NOT NULL | `'public'` | Intended visibility level: `public`, `internal`, or `private` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last auto-save timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `user_id` | `core.principal(id)` | CASCADE |
| (implicit) | `parent_comment_id` | `collab.entity_comment(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_draft_visibility_chk` | CHECK | `visibility in ('public','internal','private')` |
| `comment_draft_uniq` | UNIQUE | `(tenant_id, user_id, entity_type, entity_id, parent_comment_id)` -- one draft per user per entity per reply slot |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_draft_user` | `(tenant_id, user_id, updated_at DESC)` | User's most recently edited drafts |
| `idx_comment_draft_entity` | `(tenant_id, entity_type, entity_id)` | Drafts for a specific entity |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`, `collab.entity_comment` (optional, for reply drafts)

---

### collab.comment_flag

**Functional Description**: Records user-submitted moderation flags on comments. A user can flag a comment once (unique per user per comment). Flags have a reason category (spam, offensive, harassment, misinformation, other) and progress through a moderation lifecycle from pending to reviewed/dismissed/actioned. Reviewers and resolutions are tracked.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `comment_type` | `text` | NOT NULL | -- | Polymorphic discriminator: `entity_comment` or `approval_comment` |
| `comment_id` | `uuid` | NOT NULL | -- | ID of the flagged comment |
| `flagger_user_id` | `uuid` | NOT NULL | -- | The principal who submitted the flag; FK to `core.principal(id)` |
| `flag_reason` | `text` | NOT NULL | -- | Reason category: `spam`, `offensive`, `harassment`, `misinformation`, or `other` |
| `flag_details` | `text` | NULL | -- | Free-text details provided by the flagger |
| `status` | `text` | NOT NULL | `'pending'` | Moderation status: `pending`, `reviewed`, `dismissed`, or `actioned` |
| `reviewed_by` | `uuid` | NULL | -- | Principal who reviewed the flag; FK to `core.principal(id)` |
| `reviewed_at` | `timestamptz` | NULL | -- | Timestamp of review |
| `resolution` | `text` | NULL | -- | Free-text resolution note from the reviewer |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `flagger_user_id` | `core.principal(id)` | CASCADE |
| (implicit) | `reviewed_by` | `core.principal(id)` | SET NULL |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_flag_type_chk` | CHECK | `comment_type in ('entity_comment','approval_comment')` |
| `comment_flag_reason_chk` | CHECK | `flag_reason in ('spam','offensive','harassment','misinformation','other')` |
| `comment_flag_status_chk` | CHECK | `status in ('pending','reviewed','dismissed','actioned')` |
| `comment_flag_uniq` | UNIQUE | `(tenant_id, comment_type, comment_id, flagger_user_id)` -- one flag per user per comment |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_flag_pending` | `(tenant_id, status, created_at DESC)` | `status = 'pending'` | Moderation queue: pending flags |
| `idx_comment_flag_comment` | `(tenant_id, comment_type, comment_id, status)` | -- | Flag status per comment |

#### Relationships

- **Parent**: `core.tenant`, `core.principal` (flagger and reviewer)
- **Polymorphic reference**: Points to either `collab.entity_comment` or `wf.approval_comment` via `comment_type` + `comment_id`
- **Related**: `collab.comment_moderation` (aggregate state is maintained separately)

---

### collab.comment_moderation

**Functional Description**: Maintains the aggregate moderation state for a comment. This is a denormalized performance table that consolidates flag counts and hidden state so that comment rendering does not require joining to the flags table. One row per comment, keyed by the unique constraint on (tenant, comment_type, comment_id).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `comment_type` | `text` | NOT NULL | -- | Polymorphic discriminator: `entity_comment` or `approval_comment` |
| `comment_id` | `uuid` | NOT NULL | -- | ID of the moderated comment |
| `is_hidden` | `boolean` | NOT NULL | `false` | Whether the comment is currently hidden from display |
| `hidden_reason` | `text` | NULL | -- | Free-text reason for hiding |
| `hidden_at` | `timestamptz` | NULL | -- | When the comment was hidden |
| `hidden_by` | `uuid` | NULL | -- | Principal who hid the comment; FK to `core.principal(id)` |
| `flag_count` | `int` | NOT NULL | `0` | Total number of flags received |
| `last_flagged_at` | `timestamptz` | NULL | -- | Timestamp of most recent flag |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `hidden_by` | `core.principal(id)` | SET NULL |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_moderation_type_chk` | CHECK | `comment_type in ('entity_comment','approval_comment')` |
| `comment_moderation_uniq` | UNIQUE | `(tenant_id, comment_type, comment_id)` -- one moderation record per comment |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_moderation_hidden` | `(tenant_id, is_hidden, updated_at DESC)` | `is_hidden = true` | List hidden comments |
| `idx_comment_moderation_flags` | `(tenant_id, flag_count DESC, last_flagged_at DESC)` | `flag_count > 0` | Most-flagged comments |

#### Relationships

- **Parent**: `core.tenant`, `core.principal` (for `hidden_by`)
- **Polymorphic reference**: Points to either `collab.entity_comment` or `wf.approval_comment` via `comment_type` + `comment_id`
- **Related**: `collab.comment_flag` (source of the aggregated counts)

---

## SLA and Analytics

### collab.comment_sla_config

**Functional Description**: Defines SLA response time targets on a per-entity-type basis for each tenant. Administrators configure the target response time (in seconds), whether to count only business hours, and whether the policy is currently active. One configuration per entity type per tenant.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `entity_type` | `text` | NOT NULL | -- | Entity type this SLA applies to |
| `sla_target_seconds` | `int` | NOT NULL | -- | Target response time in seconds (must be > 0) |
| `business_hours_only` | `boolean` | NOT NULL | `false` | Whether SLA clock ticks only during business hours |
| `enabled` | `boolean` | NOT NULL | `true` | Whether this SLA policy is currently active |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |
| `created_by` | `text` | NOT NULL | -- | Identifier of the actor who created the config |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_sla_config_target_chk` | CHECK | `sla_target_seconds > 0` |
| `comment_sla_config_uniq` | UNIQUE | `(tenant_id, entity_type)` -- one SLA config per entity type per tenant |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_sla_config_active` | `(tenant_id, enabled)` | `enabled = true` | Active SLA policies |

#### Relationships

- **Parent**: `core.tenant`
- **Related**: `collab.comment_sla_metrics` (references the target for breach detection)

---

### collab.comment_sla_metrics

**Functional Description**: Serves as the single source of truth for SLA tracking per entity. Records when the first comment was made, when (and by whom) the first response arrived, the calculated response time, and whether the SLA target has been breached. Also maintains rolling aggregate metrics including average and maximum response times across all responses to that entity's comments.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `entity_type` | `text` | NOT NULL | -- | Entity type being tracked |
| `entity_id` | `uuid` | NOT NULL | -- | Entity ID being tracked |
| `first_comment_at` | `timestamptz` | NOT NULL | -- | Timestamp of the first comment on this entity |
| `first_comment_by` | `uuid` | NOT NULL | -- | Principal who posted the first comment; FK to `core.principal(id)` |
| `first_response_at` | `timestamptz` | NULL | -- | Timestamp of the first response (NULL if awaiting response) |
| `first_response_by` | `uuid` | NULL | -- | Principal who posted the first response; FK to `core.principal(id)` |
| `first_response_time_seconds` | `int` | NULL | -- | Seconds from first comment to first response |
| `total_comments` | `int` | NOT NULL | `1` | Total number of comments on this entity |
| `total_responses` | `int` | NOT NULL | `0` | Total number of responses (replies) on this entity |
| `avg_response_time_seconds` | `int` | NULL | -- | Average response time across all responses |
| `max_response_time_seconds` | `int` | NULL | -- | Maximum response time across all responses |
| `sla_target_seconds` | `int` | NULL | -- | Snapshot of the SLA target at time of first comment |
| `is_sla_breached` | `boolean` | NOT NULL | `false` | Whether the SLA target was breached |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `first_comment_by` | `core.principal(id)` | CASCADE |
| (implicit) | `first_response_by` | `core.principal(id)` | SET NULL |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_sla_metrics_uniq` | UNIQUE | `(tenant_id, entity_type, entity_id)` -- one metrics row per entity |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_sla_breached` | `(tenant_id, is_sla_breached, first_comment_at DESC)` | `is_sla_breached = true` | Breached SLA queries |
| `idx_comment_sla_pending` | `(tenant_id, first_comment_at DESC)` | `first_response_at IS NULL` | Awaiting first response |
| `idx_comment_sla_response_time` | `(tenant_id, first_response_time_seconds)` | -- | Response time distribution queries |

#### Relationships

- **Parent**: `core.tenant`, `core.principal` (first commenter and first responder)
- **Related**: `collab.comment_sla_config` (defines SLA targets), `collab.comment_response` (individual response history)

---

### collab.comment_response

**Functional Description**: Historical log recording every comment response with its calculated response time. This provides a complete response time history per entity, enabling trend analysis and audit. Each entry is unique per comment (one response record per reply comment).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `entity_type` | `text` | NOT NULL | -- | Entity type of the commented record |
| `entity_id` | `uuid` | NOT NULL | -- | Entity ID of the commented record |
| `comment_id` | `uuid` | NOT NULL | -- | The reply comment that constitutes this response |
| `parent_comment_id` | `uuid` | NULL | -- | The parent comment being responded to |
| `commenter_id` | `uuid` | NOT NULL | -- | Principal who made the response; FK to `core.principal(id)` |
| `response_time_seconds` | `int` | NULL | -- | Time elapsed (in seconds) from parent comment to this response |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `commenter_id` | `core.principal(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_response_uniq` | UNIQUE | `(tenant_id, comment_id)` -- one response record per comment |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_response_entity` | `(tenant_id, entity_type, entity_id, created_at DESC)` | Response timeline per entity |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`
- **Related**: `collab.comment_sla_metrics` (aggregates from this table)

---

### collab.comment_analytics_daily

**Functional Description**: Pre-aggregated daily comment metrics intended for dashboard rendering without expensive runtime aggregation. Captures total comments, replies, unique commenters, reactions, flags, average comment length, and average thread depth, broken down by date and optionally by entity type. One row per tenant per date per entity type.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `date` | `date` | NOT NULL | -- | The calendar date for these metrics |
| `entity_type` | `text` | NULL | -- | Entity type filter (NULL for tenant-wide aggregate) |
| `total_comments` | `int` | NOT NULL | `0` | Number of new comments posted on this date |
| `total_replies` | `int` | NOT NULL | `0` | Number of reply comments posted on this date |
| `unique_commenters` | `int` | NOT NULL | `0` | Count of distinct users who commented on this date |
| `total_reactions` | `int` | NOT NULL | `0` | Number of reactions added on this date |
| `total_flags` | `int` | NOT NULL | `0` | Number of moderation flags submitted on this date |
| `avg_comment_length` | `numeric(10,2)` | NULL | -- | Average character length of comments posted on this date |
| `avg_thread_depth` | `numeric(5,2)` | NULL | -- | Average thread depth of comments posted on this date |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_analytics_daily_uniq` | UNIQUE | `(tenant_id, date, entity_type)` -- one row per tenant per date per entity type |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_analytics_daily_date` | `(tenant_id, date DESC)` | Date range queries for dashboards |

#### Relationships

- **Parent**: `core.tenant`

---

### collab.comment_user_analytics

**Functional Description**: Tracks per-user engagement metrics over defined time periods. Used for leaderboards, gamification, and identifying top contributors. Captures comment and reply counts, reactions given and received, mentions received, average response time, and a calculated engagement score (0-100).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `user_id` | `uuid` | NOT NULL | -- | The principal being tracked; FK to `core.principal(id)` |
| `period_start` | `date` | NOT NULL | -- | Start of the analytics period |
| `period_end` | `date` | NOT NULL | -- | End of the analytics period |
| `total_comments` | `int` | NOT NULL | `0` | Number of comments authored during this period |
| `total_replies` | `int` | NOT NULL | `0` | Number of reply comments authored during this period |
| `total_reactions_given` | `int` | NOT NULL | `0` | Number of reactions this user gave during this period |
| `total_reactions_received` | `int` | NOT NULL | `0` | Number of reactions this user's comments received during this period |
| `total_mentions_received` | `int` | NOT NULL | `0` | Number of times this user was @mentioned during this period |
| `avg_response_time_seconds` | `int` | NULL | -- | Average time to respond to comments during this period |
| `engagement_score` | `int` | NULL | -- | Calculated engagement score (0-100) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `user_id` | `core.principal(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_user_analytics_uniq` | UNIQUE | `(tenant_id, user_id, period_start, period_end)` -- one row per user per period |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_comment_user_analytics_score` | `(tenant_id, engagement_score DESC NULLS LAST, period_start DESC)` | Leaderboard queries |

#### Relationships

- **Parent**: `core.tenant`, `core.principal`

---

### collab.comment_thread_analytics

**Functional Description**: Maintains per-entity-level thread analytics that identify hot topics and measure engagement. Tracks total comments, unique participants, reaction counts, maximum thread depth, and activity window. Used for surfacing trending discussions and monitoring thread health.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `entity_type` | `text` | NOT NULL | -- | Entity type of the record with comments |
| `entity_id` | `uuid` | NOT NULL | -- | Entity ID of the record with comments |
| `total_comments` | `int` | NOT NULL | `0` | Total number of comments on this entity |
| `unique_participants` | `int` | NOT NULL | `0` | Count of distinct users who commented |
| `total_reactions` | `int` | NOT NULL | `0` | Total reactions across all comments |
| `thread_depth` | `int` | NOT NULL | `0` | Maximum nesting depth reached |
| `first_comment_at` | `timestamptz` | NOT NULL | -- | Timestamp of the earliest comment |
| `last_comment_at` | `timestamptz` | NOT NULL | -- | Timestamp of the most recent comment |
| `is_active` | `boolean` | NOT NULL | `true` | Whether the thread is currently active |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_thread_analytics_uniq` | UNIQUE | `(tenant_id, entity_type, entity_id)` -- one row per entity |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_thread_analytics_active` | `(tenant_id, is_active, total_comments DESC)` | `is_active = true` | Hot topics: most-commented active threads |
| `idx_comment_thread_analytics_recent` | `(tenant_id, last_comment_at DESC)` | -- | Recently active threads |

#### Relationships

- **Parent**: `core.tenant`

---

## Retention

### collab.comment_retention_policy

**Functional Description**: Configurable retention policies for comment lifecycle management in support of GDPR and data governance compliance. Each policy specifies how long comments should be retained (in days) for a given entity type, and what action to take when the retention period expires: archive (soft), hard_delete (permanent), or keep (retain forever). One policy per entity type per tenant.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `policy_name` | `text` | NOT NULL | -- | Human-readable name for the retention policy |
| `entity_type` | `text` | NULL | -- | Entity type this policy applies to (NULL for tenant-wide default) |
| `retention_days` | `int` | NOT NULL | -- | Number of days to retain comments (must be > 0) |
| `action` | `text` | NOT NULL | `'archive'` | Action at expiry: `archive`, `hard_delete`, or `keep` |
| `enabled` | `boolean` | NOT NULL | `true` | Whether this policy is currently active |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `created_by` | `text` | NOT NULL | -- | Identifier of the actor who created the policy |
| `updated_at` | `timestamptz` | NULL | -- | Last update timestamp |
| `updated_by` | `text` | NULL | -- | Identifier of the actor who last updated the policy |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_retention_policy_days_chk` | CHECK | `retention_days > 0` |
| `comment_retention_policy_action_chk` | CHECK | `action in ('archive','hard_delete','keep')` |
| `comment_retention_policy_uniq` | UNIQUE | `(tenant_id, entity_type)` -- one policy per entity type per tenant |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_retention_policy_active` | `(tenant_id, enabled)` | `enabled = true` | Active policies lookup |

#### Relationships

- **Parent**: `core.tenant`
- **Children**: `collab.comment_retention_log` (via `policy_id` FK)
- **Related**: `collab.entity_comment` (via `retention_policy_id`)

---

### collab.comment_retention_log

**Functional Description**: Provides an audit trail of all retention policy executions for compliance and regulatory evidence. Each entry records what action was taken (archived, hard_deleted, restored), by whom, under which policy, and includes a JSONB snapshot of the comment at the time of action for evidentiary purposes.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `comment_type` | `text` | NOT NULL | -- | Polymorphic discriminator: `entity_comment` or `approval_comment` |
| `comment_id` | `uuid` | NOT NULL | -- | ID of the comment that was acted upon |
| `action` | `text` | NOT NULL | -- | Action taken: `archived`, `hard_deleted`, or `restored` |
| `policy_id` | `uuid` | NULL | -- | FK to `collab.comment_retention_policy(id)`; NULL for manual actions |
| `executed_by` | `text` | NOT NULL | -- | Identifier of the actor or system that executed the action |
| `executed_at` | `timestamptz` | NOT NULL | `now()` | Timestamp of execution |
| `comment_snapshot` | `jsonb` | NULL | -- | JSONB snapshot of the comment at time of action |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `policy_id` | `collab.comment_retention_policy(id)` | SET NULL |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `comment_retention_log_type_chk` | CHECK | `comment_type in ('entity_comment','approval_comment')` |
| `comment_retention_log_action_chk` | CHECK | `action in ('archived','hard_deleted','restored')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_comment_retention_log_comment` | `(tenant_id, comment_type, comment_id, executed_at DESC)` | -- | History for a specific comment |
| `idx_comment_retention_log_policy` | `(tenant_id, policy_id, executed_at DESC)` | `policy_id IS NOT NULL` | Executions under a specific policy |

#### Relationships

- **Parent**: `core.tenant`, `collab.comment_retention_policy`

---

## Messaging

### collab.conversation

**Functional Description**: Container entity for direct or group messaging conversations. Each conversation has a type (direct for 1-on-1, group for multi-party) and an optional title. Group conversations can be named; direct conversations typically omit the title. All timestamps use microsecond precision (`timestamptz(6)`).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `type` | `text` | NOT NULL | -- | Conversation type: `direct` or `group` |
| `title` | `text` | NULL | -- | Conversation title (nullable for direct conversations) |
| `created_at` | `timestamptz(6)` | NOT NULL | `now()` | Creation timestamp (microsecond precision) |
| `created_by` | `text` | NOT NULL | -- | Identifier of the actor who created the conversation |
| `updated_at` | `timestamptz(6)` | NULL | -- | Last update timestamp (microsecond precision) |
| `updated_by` | `text` | NULL | -- | Identifier of the actor who last updated the conversation |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |

#### Indexes

| Name | Columns | Notes |
|------|---------|-------|
| `idx_conversation_tenant_type` | `(tenant_id, type, created_at DESC)` | Conversations by type |
| `idx_conversation_tenant_time` | `(tenant_id, created_at DESC)` | All conversations in chronological order |

#### Relationships

- **Parent**: `core.tenant`
- **Children**: `collab.conversation_participant`, `collab.message`

---

### collab.conversation_participant

**Functional Description**: Join table tracking which users participate in each conversation. Includes role assignment (member or admin), join/leave timestamps for soft membership management, and read tracking via a pointer to the last read message. This enables unread count calculations without scanning the full message history.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `conversation_id` | `uuid` | NOT NULL | -- | FK to `collab.conversation(id)` |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `user_id` | `uuid` | NOT NULL | -- | The participating principal; FK to `core.principal(id)` |
| `role` | `text` | NOT NULL | `'member'` | Participant role: `member` or `admin` |
| `joined_at` | `timestamptz(6)` | NOT NULL | `now()` | When the participant joined (microsecond precision) |
| `left_at` | `timestamptz(6)` | NULL | -- | When the participant left (soft delete; NULL if still active) |
| `last_read_message_id` | `uuid` | NULL | -- | Pointer to the last message read by this participant; FK to `collab.message(id)` |
| `last_read_at` | `timestamptz(6)` | NULL | -- | Timestamp of last read action |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `conversation_id` | `collab.conversation(id)` | CASCADE |
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `user_id` | `core.principal(id)` | CASCADE |
| `conversation_participant_last_read_message_id_fkey` | `last_read_message_id` | `collab.message(id)` | NO ACTION (deferred FK) |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `conversation_participant_tenant_conv_user_uniq` | UNIQUE (index) | `(tenant_id, conversation_id, user_id)` -- one participation per user per conversation |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `conversation_participant_tenant_conv_user_uniq` | `(tenant_id, conversation_id, user_id)` | -- | Uniqueness + lookup |
| `idx_conversation_participant_user` | `(tenant_id, user_id, left_at)` | `left_at IS NULL` | Active participants by user |
| `idx_conversation_participant_conv` | `(conversation_id, left_at)` | `left_at IS NULL` | Active participants in a conversation |
| `idx_conversation_participant_unread` | `(tenant_id, user_id, last_read_at DESC)` | -- | Unread conversations ordering |

#### Relationships

- **Parent**: `collab.conversation`, `core.tenant`, `core.principal`
- **References**: `collab.message` (via `last_read_message_id`)

---

### collab.message

**Functional Description**: Individual messages within conversations. Supports plain text and markdown formatting, threaded replies via a self-referencing foreign key, soft deletion, idempotent client submissions via `client_message_id`, and full-text search via a `tsvector` column automatically maintained by a trigger. All timestamps use microsecond precision.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `conversation_id` | `uuid` | NOT NULL | -- | FK to `collab.conversation(id)` |
| `sender_id` | `uuid` | NOT NULL | -- | The principal who sent the message; FK to `core.principal(id)` |
| `body` | `text` | NOT NULL | -- | Message body text |
| `body_format` | `text` | NOT NULL | `'plain'` | Message format: `plain` or `markdown` |
| `client_message_id` | `text` | NULL | -- | Idempotency key from the client for safe retries |
| `parent_message_id` | `uuid` | NULL | -- | Parent message ID for threaded replies (NULL for root messages) |
| `body_tsv` | `tsvector` | NULL | -- | Auto-populated full-text search vector (English configuration) |
| `created_at` | `timestamptz(6)` | NOT NULL | `now()` | Creation timestamp (microsecond precision) |
| `edited_at` | `timestamptz(6)` | NULL | -- | Last edit timestamp |
| `deleted_at` | `timestamptz(6)` | NULL | -- | Soft delete timestamp |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `conversation_id` | `collab.conversation(id)` | CASCADE |
| (implicit) | `sender_id` | `core.principal(id)` | CASCADE |
| `message_parent_message_id_fkey` | `parent_message_id` | `collab.message(id)` | SET NULL |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `message_tenant_client_id_uniq` | `(tenant_id, client_message_id)` | `client_message_id IS NOT NULL` | Idempotency dedup (unique) |
| `idx_message_conversation_time` | `(tenant_id, conversation_id, created_at DESC)` | `deleted_at IS NULL` | Main message feed |
| `idx_message_sender_time` | `(tenant_id, sender_id, created_at DESC)` | `deleted_at IS NULL` | User's sent messages |
| `idx_message_client_id` | `(client_message_id)` | `client_message_id IS NOT NULL` | Client ID lookup |
| `idx_message_parent_thread` | `(tenant_id, parent_message_id, created_at DESC)` | `deleted_at IS NULL AND parent_message_id IS NOT NULL` | Thread replies |
| `idx_message_root` | `(tenant_id, conversation_id, created_at DESC)` | `deleted_at IS NULL AND parent_message_id IS NULL` | Root-level messages only |
| `idx_message_fts` | GIN on `body_tsv` | -- | Full-text search |
| `idx_message_tenant_fts` | `(tenant_id, body_tsv)` | `deleted_at IS NULL` | Tenant-scoped FTS |

#### Relationships

- **Parent**: `collab.conversation`, `core.tenant`, `core.principal`
- **Self-referencing**: `parent_message_id` for threading
- **Children**: `collab.message_delivery`
- **Referenced by**: `collab.conversation_participant` (via `last_read_message_id`)

---

### collab.message_delivery

**Functional Description**: Per-recipient delivery and read tracking for messages. Each row represents the delivery of a specific message to a specific recipient. Tracks when the message was delivered and when (if ever) it was read. Used for delivery receipts, read receipts, and unread message counts.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `message_id` | `uuid` | NOT NULL | -- | FK to `collab.message(id)` |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant reference; FK to `core.tenant(id)` |
| `recipient_id` | `uuid` | NOT NULL | -- | The recipient principal; FK to `core.principal(id)` |
| `delivered_at` | `timestamptz(6)` | NOT NULL | `now()` | When the message was delivered to this recipient |
| `read_at` | `timestamptz(6)` | NULL | -- | When the message was read by this recipient (NULL if unread) |

#### Primary Key

`id`

#### Foreign Keys

| Constraint | Column(s) | References | On Delete |
|------------|-----------|------------|-----------|
| (implicit) | `message_id` | `collab.message(id)` | CASCADE |
| (implicit) | `tenant_id` | `core.tenant(id)` | CASCADE |
| (implicit) | `recipient_id` | `core.principal(id)` | CASCADE |

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| `message_delivery_message_recipient_uniq` | UNIQUE (index) | `(message_id, recipient_id)` -- one delivery per recipient per message |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `message_delivery_message_recipient_uniq` | `(message_id, recipient_id)` | -- | Uniqueness + lookup |
| `idx_message_delivery_recipient_unread` | `(tenant_id, recipient_id, read_at)` | `read_at IS NULL` | Unread messages for a user |
| `idx_message_delivery_recipient_time` | `(tenant_id, recipient_id, delivered_at DESC)` | -- | Delivery timeline per user |
| `idx_message_delivery_message` | `(message_id)` | -- | All deliveries for a message |

#### Relationships

- **Parent**: `collab.message`, `core.tenant`, `core.principal`

---

## Delegation and Sharing

### collab.delegation_grant

**Functional Description**: Records active task and scope delegations between principals. A delegator grants a delegate specific permissions over a scoped resource (task, entity, workflow, or module). Delegations can be time-limited via `expires_at` and revocable. Revocation details (when and by whom) are tracked for audit.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant identifier |
| `delegator_id` | `text` | NOT NULL | -- | Identifier of the principal granting the delegation |
| `delegate_id` | `text` | NOT NULL | -- | Identifier of the principal receiving the delegation |
| `scope_type` | `text` | NOT NULL | -- | Scope of delegation: `task`, `entity`, `workflow`, or `module` |
| `scope_ref` | `text` | NULL | -- | Reference to the specific scoped resource (e.g., task ID, entity key) |
| `permissions` | `text[]` | NOT NULL | `'{}'` | Array of permission strings granted |
| `reason` | `text` | NULL | -- | Free-text reason for the delegation |
| `expires_at` | `timestamptz` | NULL | -- | Expiration timestamp (NULL for no expiry) |
| `is_revoked` | `boolean` | NOT NULL | `false` | Whether this delegation has been revoked |
| `revoked_at` | `timestamptz` | NULL | -- | When the delegation was revoked |
| `revoked_by` | `text` | NULL | -- | Who revoked the delegation |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| (inline) | CHECK | `scope_type in ('task','entity','workflow','module')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_delegation_grant_tenant_delegator` | `(tenant_id, delegator_id)` | `is_revoked = false` | Active delegations by delegator |
| `idx_delegation_grant_tenant_delegate` | `(tenant_id, delegate_id)` | `is_revoked = false` | Active delegations by delegate |
| `idx_delegation_grant_expires` | `(expires_at)` | `is_revoked = false AND expires_at IS NOT NULL` | Expiring delegations batch processing |

#### Relationships

- **Related**: `collab.share_audit` (audit trail for delegation events)

---

### collab.delegation_request

**Functional Description**: Stores delegation requests that require approval before they become active grants. Tracks the requester, target (who would be the delegate), requested scope and permissions, and the approval lifecycle (pending, approved, rejected, cancelled). Once approved, a corresponding `delegation_grant` record is created.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant identifier |
| `requester_id` | `text` | NOT NULL | -- | Identifier of the principal requesting the delegation |
| `target_id` | `text` | NOT NULL | -- | Identifier of the intended delegate |
| `scope_type` | `text` | NOT NULL | -- | Scope of the requested delegation |
| `scope_ref` | `text` | NULL | -- | Reference to the specific scoped resource |
| `permissions` | `text[]` | NOT NULL | `'{}'` | Array of permission strings requested |
| `reason` | `text` | NULL | -- | Free-text justification for the request |
| `status` | `text` | NOT NULL | `'pending'` | Request status: `pending`, `approved`, `rejected`, or `cancelled` |
| `decided_by` | `text` | NULL | -- | Identifier of the approver/rejecter |
| `decided_at` | `timestamptz` | NULL | -- | Timestamp of the decision |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| (inline) | CHECK | `status in ('pending','approved','rejected','cancelled')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_delegation_request_tenant_status` | `(tenant_id, status)` | `status = 'pending'` | Pending requests queue |

#### Relationships

- **Related**: `collab.delegation_grant` (created upon approval)

---

### collab.record_share

**Functional Description**: Implements record-level sharing, allowing individual entity records to be shared with specific users, groups, or organizational units. Shares carry a permission level (view, edit, admin) and can be time-limited and revocable. Active shares are enforced by a unique partial index that prevents duplicate active grants for the same (entity, recipient, type) combination.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant identifier |
| `entity_type` | `text` | NOT NULL | -- | Type key of the shared entity |
| `entity_id` | `text` | NOT NULL | -- | ID of the shared entity |
| `shared_with_id` | `text` | NOT NULL | -- | Identifier of the recipient (user, group, or OU) |
| `shared_with_type` | `text` | NOT NULL | `'user'` | Recipient type: `user`, `group`, or `ou` |
| `permission_level` | `text` | NOT NULL | `'view'` | Permission level: `view`, `edit`, or `admin` |
| `shared_by` | `text` | NOT NULL | -- | Identifier of the principal who created the share |
| `reason` | `text` | NULL | -- | Free-text reason for sharing |
| `expires_at` | `timestamptz` | NULL | -- | Expiration timestamp (NULL for no expiry) |
| `is_revoked` | `boolean` | NOT NULL | `false` | Whether this share has been revoked |
| `revoked_at` | `timestamptz` | NULL | -- | When the share was revoked |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

#### Primary Key

`id`

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| (inline) | CHECK | `shared_with_type in ('user','group','ou')` |
| (inline) | CHECK | `permission_level in ('view','edit','admin')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_record_share_entity` | `(tenant_id, entity_type, entity_id)` | `is_revoked = false` | Active shares for an entity |
| `idx_record_share_recipient` | `(tenant_id, shared_with_id)` | `is_revoked = false` | Active shares for a recipient |
| `idx_record_share_expires` | `(expires_at)` | `is_revoked = false AND expires_at IS NOT NULL` | Expiring shares batch processing |
| `record_share_unique_active` | `(tenant_id, entity_type, entity_id, shared_with_id, shared_with_type)` | `is_revoked = false` | Unique active share per recipient per entity (unique index) |

#### Relationships

- **Related**: `collab.share_audit` (audit trail for share events)

---

### collab.share_audit

**Functional Description**: Compliance-oriented audit trail for all sharing and delegation operations. Captures the full lifecycle of grants -- creation, revocation, expiration, modification, and access events. Each entry records the grant type (delegation, record_share, external_share), the action taken, the actor, and optional entity/target references with freeform JSONB details.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant identifier |
| `grant_id` | `uuid` | NULL | -- | FK to the specific grant being audited (nullable for system events) |
| `grant_type` | `text` | NOT NULL | -- | Type of grant: `delegation`, `record_share`, or `external_share` |
| `action` | `text` | NOT NULL | -- | Action: `grant_created`, `grant_revoked`, `grant_expired`, `access_via_share`, `share_modified`, `delegation_created`, or `delegation_revoked` |
| `actor_id` | `text` | NOT NULL | -- | Identifier of the actor who performed the action |
| `target_id` | `text` | NULL | -- | Identifier of the target principal (if applicable) |
| `entity_type` | `text` | NULL | -- | Entity type involved (if applicable) |
| `entity_id` | `text` | NULL | -- | Entity ID involved (if applicable) |
| `details` | `jsonb` | NULL | -- | Freeform details about the action |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| (inline) | CHECK | `grant_type in ('delegation','record_share','external_share')` |
| (inline) | CHECK | `action in ('grant_created','grant_revoked','grant_expired','access_via_share','share_modified','delegation_created','delegation_revoked')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_share_audit_tenant_time` | `(tenant_id, created_at DESC)` | -- | Chronological audit feed |
| `idx_share_audit_actor` | `(tenant_id, actor_id, created_at DESC)` | -- | Audit by actor |
| `idx_share_audit_entity` | `(tenant_id, entity_type, entity_id, created_at DESC)` | -- | Audit by entity |
| `idx_share_audit_grant` | `(grant_id)` | `grant_id IS NOT NULL` | Audit history for a specific grant |

#### Relationships

- **Related**: `collab.delegation_grant`, `collab.record_share`, `collab.external_share_token` (via `grant_id` and `grant_type`)

---

### collab.external_share_token

**Functional Description**: Manages cross-tenant share tokens that enable JWT-based scoped access to specific entity records for external users (identified by email). Tokens are stored as hashes, carry permission levels (view or edit), have mandatory expiration, and track access counts. Supports revocation with timestamp tracking.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | Tenant identifier |
| `token_hash` | `text` | NOT NULL | -- | SHA-256 hash of the share token (unique) |
| `issuer_tenant_id` | `uuid` | NOT NULL | -- | Tenant that issued the share |
| `issued_by` | `text` | NOT NULL | -- | Identifier of the principal who issued the token |
| `target_email` | `text` | NOT NULL | -- | Email address of the intended external recipient |
| `entity_type` | `text` | NOT NULL | -- | Type key of the shared entity |
| `entity_id` | `text` | NOT NULL | -- | ID of the shared entity |
| `permission_level` | `text` | NOT NULL | `'view'` | Permission level: `view` or `edit` |
| `expires_at` | `timestamptz` | NOT NULL | -- | Mandatory expiration timestamp |
| `is_revoked` | `boolean` | NOT NULL | `false` | Whether this token has been revoked |
| `revoked_at` | `timestamptz` | NULL | -- | When the token was revoked |
| `last_accessed_at` | `timestamptz` | NULL | -- | Timestamp of most recent access |
| `access_count` | `integer` | NOT NULL | `0` | Total number of times this token has been used |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |

#### Primary Key

`id`

#### Constraints

| Name | Type | Definition |
|------|------|------------|
| (implicit) | UNIQUE | `token_hash` |
| (inline) | CHECK | `permission_level in ('view','edit')` |

#### Indexes

| Name | Columns | Partial Filter | Notes |
|------|---------|----------------|-------|
| `idx_external_share_token_hash` | `(token_hash)` | `is_revoked = false` | Token lookup on validation |
| `idx_external_share_token_entity` | `(tenant_id, entity_type, entity_id)` | `is_revoked = false` | Active tokens per entity |
| `idx_external_share_token_expires` | `(expires_at)` | `is_revoked = false` | Expiring tokens batch processing |

#### Relationships

- **Related**: `collab.share_audit` (audit trail for external share events)

---

## Functions and Triggers

### collab.message_body_tsv_trigger()

**Type**: Trigger function (`BEFORE INSERT OR UPDATE OF body`)

**Description**: Automatically generates and populates the `body_tsv` tsvector column on the `collab.message` table using PostgreSQL's `to_tsvector('english', ...)` function. Fires before every insert or before any update that modifies the `body` column, ensuring the full-text search index stays in sync with message content.

```sql
CREATE OR REPLACE FUNCTION collab.message_body_tsv_trigger()
RETURNS trigger AS $$
BEGIN
  new.body_tsv := to_tsvector('english', coalesce(new.body, ''));
  RETURN new;
END;
$$ LANGUAGE plpgsql;
```

**Trigger**: `message_body_tsv_update`
- **Table**: `collab.message`
- **Timing**: `BEFORE INSERT OR UPDATE OF body`
- **Granularity**: `FOR EACH ROW`

---

## Schema Alterations

The collab SQL file also extends two tables in other schemas to support collab concerns.

### doc.attachment -- Comment Link Columns

Two columns are added to `doc.attachment` to allow attachments to be linked to comments:

| Column | Type | Description |
|--------|------|-------------|
| `comment_type` | `text` | Optional: type of comment this attachment belongs to (`entity_comment` or `approval_comment`) |
| `comment_id` | `uuid` | Optional: ID of comment this attachment belongs to |

**Constraint**: `attachment_comment_type_chk` -- `comment_type IS NULL OR comment_type IN ('entity_comment','approval_comment')`

**Index**: `idx_attachment_comment` on `(comment_type, comment_id)` where both are not null.

### wf.approval_comment -- Visibility, Soft Delete, and Retention Columns

Six columns are added to `wf.approval_comment` to bring it in line with the `collab.entity_comment` feature set:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `visibility` | `text` | `'public'` | Visibility level: `public`, `internal`, or `private` |
| `deleted_at` | `timestamptz` | -- | Soft delete timestamp |
| `deleted_by` | `text` | -- | Identifier of the deleting actor |
| `archived_at` | `timestamptz` | -- | Archival timestamp |
| `archived_by` | `text` | -- | Identifier of the archiving actor |
| `retention_until` | `timestamptz` | -- | Date when eligible for retention action |
| `retention_policy_id` | `uuid` | -- | FK to retention policy |

**Constraint**: `approval_comment_visibility_chk` -- `visibility IN ('public','internal','private')`

**Indexes**:
- `idx_approval_comment_visibility` on `(tenant_id, approval_instance_id, visibility, created_at DESC)` where `deleted_at IS NULL`
- `idx_approval_comment_archived` on `(tenant_id, archived_at)` where `archived_at IS NOT NULL`
- `idx_approval_comment_retention` on `(tenant_id, retention_until)` where `retention_until IS NOT NULL AND deleted_at IS NULL`
