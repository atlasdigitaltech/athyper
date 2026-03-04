/* ============================================================================
   Athyper — COLLAB Schema
   Comments: Entity Comments, Approval Comments (wf), Mentions, Reactions
   Tracking: Read Status, Drafts, Flags, Moderation
   SLA: Config, Tracking, Metrics, Response History
   Analytics: Daily, User Engagement, Thread Analytics
   Retention: Policies, Logs

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- COLLAB: Entity Comment (record-level commentary)
-- Merged: base (080) + visibility (087) + retention columns (092)
-- ============================================================================
create table if not exists collab.entity_comment (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  -- Polymorphic entity link
  entity_type       text not null,
  entity_id         uuid not null,

  -- Comment metadata
  commenter_id      uuid not null references core.principal(id) on delete set null,
  comment_text      text not null,

  -- Threading support
  parent_comment_id uuid references collab.entity_comment(id) on delete cascade,
  thread_depth      int not null default 0,

  -- Visibility (public / internal / private)
  visibility        text not null default 'public',

  -- Soft delete
  deleted_at        timestamptz,
  deleted_by        text,

  -- Retention (archive support)
  archived_at       timestamptz,
  archived_by       text,
  retention_until   timestamptz,
  retention_policy_id uuid,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,
  updated_by        text,

  constraint entity_comment_text_len_chk check (char_length(comment_text) <= 5000),
  constraint entity_comment_depth_chk check (thread_depth between 0 and 5),
  constraint entity_comment_visibility_chk check (visibility in ('public','internal','private'))
);

comment on table collab.entity_comment is 'Record-level comments with optional threading (max depth 5).';
comment on column collab.entity_comment.retention_until is 'Date when comment is eligible for archival/deletion per retention policy.';
comment on column collab.entity_comment.archived_at is 'Timestamp when comment was archived (soft-archived, can be restored).';

create index if not exists idx_entity_comment_entity
  on collab.entity_comment (tenant_id, entity_type, entity_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_entity_comment_commenter
  on collab.entity_comment (commenter_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_entity_comment_parent
  on collab.entity_comment (parent_comment_id, created_at asc)
  where parent_comment_id is not null and deleted_at is null;

create index if not exists idx_entity_comment_visibility
  on collab.entity_comment (tenant_id, entity_type, entity_id, visibility, created_at desc)
  where deleted_at is null;

create index if not exists idx_entity_comment_archived
  on collab.entity_comment (tenant_id, archived_at)
  where archived_at is not null;

create index if not exists idx_entity_comment_retention
  on collab.entity_comment (tenant_id, retention_until)
  where retention_until is not null and deleted_at is null;


-- ============================================================================
-- COLLAB: Comment Mention (@mentions parser results)
-- ============================================================================
create table if not exists collab.comment_mention (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  -- Comment reference (polymorphic: entity_comment OR approval_comment)
  comment_type      text not null,
  comment_id        uuid not null,

  mentioned_user_id uuid not null references core.principal(id) on delete cascade,
  mention_text      text not null,
  position          int not null,

  created_at        timestamptz not null default now(),

  constraint comment_mention_type_chk check (comment_type in ('entity_comment','approval_comment'))
);

comment on table collab.comment_mention is 'Parsed @mention references for notifications + search.';

create index if not exists idx_comment_mention_comment
  on collab.comment_mention (comment_type, comment_id);

create index if not exists idx_comment_mention_user
  on collab.comment_mention (mentioned_user_id, created_at desc);


-- ============================================================================
-- COLLAB: Comment Reaction (emoji reactions)
-- ============================================================================
create table if not exists collab.comment_reaction (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  -- Comment reference (polymorphic)
  comment_type  text not null,
  comment_id    uuid not null,

  user_id       uuid not null references core.principal(id) on delete cascade,
  reaction_type text not null,

  created_at    timestamptz not null default now(),

  constraint comment_reaction_type_chk check (comment_type in ('entity_comment','approval_comment')),
  constraint comment_reaction_emoji_chk check (reaction_type in ('👍','❤️','🎉','👀','👎','🚀','💡','🤔')),
  constraint comment_reaction_uniq unique (tenant_id, comment_type, comment_id, user_id, reaction_type)
);

comment on table collab.comment_reaction is 'Emoji reactions on comments (unique per user per comment per reaction type).';
comment on column collab.comment_reaction.reaction_type is 'Emoji character: thumbs up, heart, party, eyes, thumbs down, rocket, bulb, thinking.';

create index if not exists idx_comment_reaction_comment
  on collab.comment_reaction (tenant_id, comment_type, comment_id);

create index if not exists idx_comment_reaction_user
  on collab.comment_reaction (tenant_id, user_id, created_at desc);


-- ============================================================================
-- COLLAB: Comment Read Status (read tracking)
-- ============================================================================
create table if not exists collab.comment_read (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  -- Comment reference (polymorphic)
  comment_type text not null,
  comment_id   uuid not null,

  user_id      uuid not null references core.principal(id) on delete cascade,
  read_at      timestamptz not null default now(),

  constraint comment_read_type_chk check (comment_type in ('entity_comment','approval_comment')),
  constraint comment_read_uniq unique (tenant_id, comment_type, comment_id, user_id)
);

comment on table collab.comment_read is 'Tracks which comments have been read by which users (for unread badges).';

create index if not exists idx_comment_read_user
  on collab.comment_read (tenant_id, user_id, comment_type);

create index if not exists idx_comment_read_comment
  on collab.comment_read (tenant_id, comment_type, comment_id);


-- ============================================================================
-- COLLAB: Comment Draft (auto-save drafts)
-- ============================================================================
create table if not exists collab.comment_draft (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  user_id           uuid not null references core.principal(id) on delete cascade,
  entity_type       text not null,
  entity_id         uuid not null,
  parent_comment_id uuid references collab.entity_comment(id) on delete cascade,

  draft_text        text not null,
  visibility        text not null default 'public',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint comment_draft_visibility_chk check (visibility in ('public','internal','private')),
  constraint comment_draft_uniq unique (tenant_id, user_id, entity_type, entity_id, parent_comment_id)
);

comment on table collab.comment_draft is 'Auto-saved comment drafts (one draft per user per entity per parent comment).';
comment on column collab.comment_draft.parent_comment_id is 'NULL for top-level comments, UUID for reply drafts.';

create index if not exists idx_comment_draft_user
  on collab.comment_draft (tenant_id, user_id, updated_at desc);

create index if not exists idx_comment_draft_entity
  on collab.comment_draft (tenant_id, entity_type, entity_id);


-- ============================================================================
-- COLLAB: Comment Flag (moderation flags)
-- ============================================================================
create table if not exists collab.comment_flag (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  -- Comment reference (polymorphic)
  comment_type      text not null,
  comment_id        uuid not null,

  flagger_user_id   uuid not null references core.principal(id) on delete cascade,
  flag_reason       text not null,
  flag_details      text,

  status            text not null default 'pending',
  reviewed_by       uuid references core.principal(id) on delete set null,
  reviewed_at       timestamptz,
  resolution        text,

  created_at        timestamptz not null default now(),

  constraint comment_flag_type_chk check (comment_type in ('entity_comment','approval_comment')),
  constraint comment_flag_reason_chk check (flag_reason in ('spam','offensive','harassment','misinformation','other')),
  constraint comment_flag_status_chk check (status in ('pending','reviewed','dismissed','actioned')),
  constraint comment_flag_uniq unique (tenant_id, comment_type, comment_id, flagger_user_id)
);

comment on table collab.comment_flag is 'User-submitted moderation flags on comments (one flag per user per comment).';
comment on column collab.comment_flag.flag_reason is 'spam, offensive, harassment, misinformation, other.';
comment on column collab.comment_flag.status is 'pending, reviewed, dismissed, actioned.';

create index if not exists idx_comment_flag_pending
  on collab.comment_flag (tenant_id, status, created_at desc)
  where status = 'pending';

create index if not exists idx_comment_flag_comment
  on collab.comment_flag (tenant_id, comment_type, comment_id, status);


-- ============================================================================
-- COLLAB: Comment Moderation Status (aggregate moderation state)
-- ============================================================================
create table if not exists collab.comment_moderation (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,

  -- Comment reference (polymorphic)
  comment_type     text not null,
  comment_id       uuid not null,

  is_hidden        boolean not null default false,
  hidden_reason    text,
  hidden_at        timestamptz,
  hidden_by        uuid references core.principal(id) on delete set null,

  flag_count       int not null default 0,
  last_flagged_at  timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint comment_moderation_type_chk check (comment_type in ('entity_comment','approval_comment')),
  constraint comment_moderation_uniq unique (tenant_id, comment_type, comment_id)
);

comment on table collab.comment_moderation is 'Aggregate moderation state per comment (denormalized for performance).';

create index if not exists idx_comment_moderation_hidden
  on collab.comment_moderation (tenant_id, is_hidden, updated_at desc)
  where is_hidden = true;

create index if not exists idx_comment_moderation_flags
  on collab.comment_moderation (tenant_id, flag_count desc, last_flagged_at desc)
  where flag_count > 0;


-- ============================================================================
-- COLLAB: Comment SLA Config (SLA policies per entity type)
-- ============================================================================
create table if not exists collab.comment_sla_config (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references core.tenant(id) on delete cascade,

  entity_type          text not null,
  sla_target_seconds   int not null,
  business_hours_only  boolean not null default false,
  enabled              boolean not null default true,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           text not null,

  constraint comment_sla_config_target_chk check (sla_target_seconds > 0),
  constraint comment_sla_config_uniq unique (tenant_id, entity_type)
);

comment on table collab.comment_sla_config is 'SLA response time targets per entity type.';

create index if not exists idx_comment_sla_config_active
  on collab.comment_sla_config (tenant_id, enabled)
  where enabled = true;


-- ============================================================================
-- COLLAB: Comment SLA Metrics (single source of truth for SLA tracking per entity)
-- ============================================================================
create table if not exists collab.comment_sla_metrics (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references core.tenant(id) on delete cascade,

  entity_type               text not null,
  entity_id                 uuid not null,

  first_comment_at          timestamptz not null,
  first_comment_by          uuid not null references core.principal(id) on delete cascade,

  first_response_at         timestamptz,
  first_response_by         uuid references core.principal(id) on delete set null,
  first_response_time_seconds int,

  total_comments            int not null default 1,
  total_responses           int not null default 0,
  avg_response_time_seconds int,
  max_response_time_seconds int,

  sla_target_seconds        int,
  is_sla_breached           boolean not null default false,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint comment_sla_metrics_uniq unique (tenant_id, entity_type, entity_id)
);

comment on table collab.comment_sla_metrics is 'Tracks first response time and SLA compliance per entity.';
comment on column collab.comment_sla_metrics.first_response_time_seconds is 'Seconds from first comment to first response.';
comment on column collab.comment_sla_metrics.avg_response_time_seconds is 'Average response time across all responses.';

create index if not exists idx_comment_sla_breached
  on collab.comment_sla_metrics (tenant_id, is_sla_breached, first_comment_at desc)
  where is_sla_breached = true;

create index if not exists idx_comment_sla_pending
  on collab.comment_sla_metrics (tenant_id, first_comment_at desc)
  where first_response_at is null;

create index if not exists idx_comment_sla_response_time
  on collab.comment_sla_metrics (tenant_id, first_response_time_seconds);


-- ============================================================================
-- COLLAB: Comment Response History (response time log)
-- ============================================================================
create table if not exists collab.comment_response (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  entity_type         text not null,
  entity_id           uuid not null,
  comment_id          uuid not null,
  parent_comment_id   uuid,
  commenter_id        uuid not null references core.principal(id) on delete cascade,

  response_time_seconds int,

  created_at          timestamptz not null default now(),

  constraint comment_response_uniq unique (tenant_id, comment_id)
);

comment on table collab.comment_response is 'Historical log of all comment response times.';

create index if not exists idx_comment_response_entity
  on collab.comment_response (tenant_id, entity_type, entity_id, created_at desc);


-- ============================================================================
-- COLLAB: Comment Analytics Daily (pre-aggregated metrics)
-- ============================================================================
create table if not exists collab.comment_analytics_daily (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  date                date not null,
  entity_type         text,

  total_comments      int not null default 0,
  total_replies       int not null default 0,
  unique_commenters   int not null default 0,
  total_reactions     int not null default 0,
  total_flags         int not null default 0,
  avg_comment_length  numeric(10,2),
  avg_thread_depth    numeric(5,2),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint comment_analytics_daily_uniq unique (tenant_id, date, entity_type)
);

comment on table collab.comment_analytics_daily is 'Daily pre-aggregated comment metrics for dashboards.';

create index if not exists idx_comment_analytics_daily_date
  on collab.comment_analytics_daily (tenant_id, date desc);


-- ============================================================================
-- COLLAB: Comment User Engagement (user engagement metrics)
-- ============================================================================
create table if not exists collab.comment_user_analytics (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references core.tenant(id) on delete cascade,

  user_id                  uuid not null references core.principal(id) on delete cascade,
  period_start             date not null,
  period_end               date not null,

  total_comments           int not null default 0,
  total_replies            int not null default 0,
  total_reactions_given    int not null default 0,
  total_reactions_received int not null default 0,
  total_mentions_received  int not null default 0,
  avg_response_time_seconds int,
  engagement_score         int,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint comment_user_analytics_uniq unique (tenant_id, user_id, period_start, period_end)
);

comment on table collab.comment_user_analytics is 'User engagement metrics for leaderboards and gamification.';
comment on column collab.comment_user_analytics.engagement_score is 'Calculated engagement score (0-100).';

create index if not exists idx_comment_user_analytics_score
  on collab.comment_user_analytics (tenant_id, engagement_score desc nulls last, period_start desc);


-- ============================================================================
-- COLLAB: Comment Thread Analytics (per-entity thread metrics)
-- ============================================================================
create table if not exists collab.comment_thread_analytics (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  entity_type         text not null,
  entity_id           uuid not null,

  total_comments      int not null default 0,
  unique_participants int not null default 0,
  total_reactions     int not null default 0,
  thread_depth        int not null default 0,

  first_comment_at    timestamptz not null,
  last_comment_at     timestamptz not null,
  is_active           boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint comment_thread_analytics_uniq unique (tenant_id, entity_type, entity_id)
);

comment on table collab.comment_thread_analytics is 'Per-entity thread analytics for identifying hot topics.';

create index if not exists idx_comment_thread_analytics_active
  on collab.comment_thread_analytics (tenant_id, is_active, total_comments desc)
  where is_active = true;

create index if not exists idx_comment_thread_analytics_recent
  on collab.comment_thread_analytics (tenant_id, last_comment_at desc);


-- ============================================================================
-- COLLAB: Comment Retention Policy (retention policies)
-- ============================================================================
create table if not exists collab.comment_retention_policy (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,

  policy_name    text not null,
  entity_type    text,
  retention_days int not null,
  action         text not null default 'archive',
  enabled        boolean not null default true,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text,

  constraint comment_retention_policy_days_chk check (retention_days > 0),
  constraint comment_retention_policy_action_chk check (action in ('archive','hard_delete','keep')),
  constraint comment_retention_policy_uniq unique (tenant_id, entity_type)
);

comment on table collab.comment_retention_policy is 'Configurable retention policies for comments (GDPR compliance).';
comment on column collab.comment_retention_policy.action is 'archive (soft), hard_delete (permanent), keep (retain forever).';

create index if not exists idx_comment_retention_policy_active
  on collab.comment_retention_policy (tenant_id, enabled)
  where enabled = true;


-- ============================================================================
-- COLLAB: Comment Retention Log (retention audit trail)
-- ============================================================================
create table if not exists collab.comment_retention_log (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenant(id) on delete cascade,

  comment_type     text not null,
  comment_id       uuid not null,

  action           text not null,
  policy_id        uuid references collab.comment_retention_policy(id) on delete set null,
  executed_by      text not null,
  executed_at      timestamptz not null default now(),
  comment_snapshot jsonb,

  constraint comment_retention_log_type_chk check (comment_type in ('entity_comment','approval_comment')),
  constraint comment_retention_log_action_chk check (action in ('archived','hard_deleted','restored'))
);

comment on table collab.comment_retention_log is 'Audit trail for retention policy execution (compliance).';

create index if not exists idx_comment_retention_log_comment
  on collab.comment_retention_log (tenant_id, comment_type, comment_id, executed_at desc);

create index if not exists idx_comment_retention_log_policy
  on collab.comment_retention_log (tenant_id, policy_id, executed_at desc)
  where policy_id is not null;


-- ============================================================================
-- ALTER: Extend doc.attachment with comment link (collab concern)
-- ============================================================================
alter table doc.attachment
  add column if not exists comment_type text,
  add column if not exists comment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachment_comment_type_chk'
  ) then
    alter table doc.attachment
      add constraint attachment_comment_type_chk check
        (comment_type is null or comment_type in ('entity_comment','approval_comment'));
  end if;
end $$;

comment on column doc.attachment.comment_type is 'Optional: type of comment this attachment belongs to.';
comment on column doc.attachment.comment_id is 'Optional: ID of comment this attachment belongs to.';

create index if not exists idx_attachment_comment
  on doc.attachment (comment_type, comment_id)
  where comment_type is not null and comment_id is not null;


-- ============================================================================
-- ALTER: Extend wf.approval_comment with visibility + soft delete + retention
-- Merged: visibility (087) + retention columns (092)
-- ============================================================================
alter table wf.approval_comment
  add column if not exists visibility text not null default 'public',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists retention_until timestamptz,
  add column if not exists retention_policy_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'approval_comment_visibility_chk'
  ) then
    alter table wf.approval_comment
      add constraint approval_comment_visibility_chk check (visibility in ('public','internal','private'));
  end if;
end $$;

create index if not exists idx_approval_comment_visibility
  on wf.approval_comment (tenant_id, approval_instance_id, visibility, created_at desc)
  where deleted_at is null;

create index if not exists idx_approval_comment_archived
  on wf.approval_comment (tenant_id, archived_at)
  where archived_at is not null;

create index if not exists idx_approval_comment_retention
  on wf.approval_comment (tenant_id, retention_until)
  where retention_until is not null and deleted_at is null;


-- ============================================================================
-- COLLAB: Conversation (messaging container)
-- ============================================================================
create table if not exists collab.conversation (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  type         text not null,
  title        text,

  created_at   timestamptz(6) not null default now(),
  created_by   text not null,
  updated_at   timestamptz(6),
  updated_by   text
);

comment on table collab.conversation is 'Container for direct or group messaging.';
comment on column collab.conversation.type is 'Conversation type: direct | group';
comment on column collab.conversation.title is 'Conversation title (nullable for direct conversations)';

create index if not exists idx_conversation_tenant_type
  on collab.conversation(tenant_id, type, created_at desc);

create index if not exists idx_conversation_tenant_time
  on collab.conversation(tenant_id, created_at desc);


-- ============================================================================
-- COLLAB: Conversation Participant (join table with read tracking)
-- ============================================================================
create table if not exists collab.conversation_participant (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid not null references collab.conversation(id) on delete cascade,
  tenant_id             uuid not null references core.tenant(id) on delete cascade,
  user_id               uuid not null references core.principal(id) on delete cascade,

  role                  text not null default 'member',
  joined_at             timestamptz(6) not null default now(),
  left_at               timestamptz(6),
  last_read_message_id  uuid,
  last_read_at          timestamptz(6)
);

comment on table collab.conversation_participant is 'Join table tracking conversation participants with read tracking.';
comment on column collab.conversation_participant.role is 'Participant role: member | admin';
comment on column collab.conversation_participant.left_at is 'When participant left conversation (soft delete)';
comment on column collab.conversation_participant.last_read_message_id is 'Pointer to last message read by participant';

create unique index if not exists conversation_participant_tenant_conv_user_uniq
  on collab.conversation_participant(tenant_id, conversation_id, user_id);

create index if not exists idx_conversation_participant_user
  on collab.conversation_participant(tenant_id, user_id, left_at)
  where left_at is null;

create index if not exists idx_conversation_participant_conv
  on collab.conversation_participant(conversation_id, left_at)
  where left_at is null;

create index if not exists idx_conversation_participant_unread
  on collab.conversation_participant(tenant_id, user_id, last_read_at desc);


-- ============================================================================
-- COLLAB: Message (includes threading + FTS)
-- ============================================================================
create table if not exists collab.message (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,
  conversation_id     uuid not null references collab.conversation(id) on delete cascade,
  sender_id           uuid not null references core.principal(id) on delete cascade,

  body                text not null,
  body_format         text not null default 'plain',
  client_message_id   text,

  -- Threading (Feature E)
  parent_message_id   uuid,

  -- Full-text search (Feature F)
  body_tsv            tsvector,

  created_at          timestamptz(6) not null default now(),
  edited_at           timestamptz(6),
  deleted_at          timestamptz(6)
);

comment on table collab.message is 'Individual messages within conversations.';
comment on column collab.message.body_format is 'Message format: plain | markdown';
comment on column collab.message.client_message_id is 'Idempotency key from client for safe retries';
comment on column collab.message.parent_message_id is 'Parent message ID for threaded replies (NULL for root messages)';
comment on column collab.message.deleted_at is 'Soft delete timestamp';

-- Self-referencing FK for threading
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_parent_message_id_fkey'
  ) then
    alter table collab.message
      add constraint message_parent_message_id_fkey
        foreign key (parent_message_id)
        references collab.message(id)
        on delete set null on update no action;
  end if;
end $$;

-- Core message indexes
create unique index if not exists message_tenant_client_id_uniq
  on collab.message(tenant_id, client_message_id)
  where client_message_id is not null;

create index if not exists idx_message_conversation_time
  on collab.message(tenant_id, conversation_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_message_sender_time
  on collab.message(tenant_id, sender_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_message_client_id
  on collab.message(client_message_id)
  where client_message_id is not null;

-- Threading indexes
create index if not exists idx_message_parent_thread
  on collab.message(tenant_id, parent_message_id, created_at desc)
  where deleted_at is null and parent_message_id is not null;

create index if not exists idx_message_root
  on collab.message(tenant_id, conversation_id, created_at desc)
  where deleted_at is null and parent_message_id is null;

-- Full-text search indexes
create index if not exists idx_message_fts
  on collab.message using gin(body_tsv);

create index if not exists idx_message_tenant_fts
  on collab.message(tenant_id, body_tsv)
  where deleted_at is null;


-- ============================================================================
-- COLLAB: Message Delivery (per-recipient delivery/read tracking)
-- ============================================================================
create table if not exists collab.message_delivery (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references collab.message(id) on delete cascade,
  tenant_id       uuid not null references core.tenant(id) on delete cascade,
  recipient_id    uuid not null references core.principal(id) on delete cascade,

  delivered_at    timestamptz(6) not null default now(),
  read_at         timestamptz(6)
);

comment on table collab.message_delivery is 'Per-recipient delivery and read tracking.';
comment on column collab.message_delivery.delivered_at is 'When message was delivered to recipient';
comment on column collab.message_delivery.read_at is 'When message was read by recipient';

create unique index if not exists message_delivery_message_recipient_uniq
  on collab.message_delivery(message_id, recipient_id);

create index if not exists idx_message_delivery_recipient_unread
  on collab.message_delivery(tenant_id, recipient_id, read_at)
  where read_at is null;

create index if not exists idx_message_delivery_recipient_time
  on collab.message_delivery(tenant_id, recipient_id, delivered_at desc);

create index if not exists idx_message_delivery_message
  on collab.message_delivery(message_id);


-- ============================================================================
-- COLLAB: Deferred FK — conversation_participant.last_read_message_id
-- ============================================================================
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversation_participant_last_read_message_id_fkey'
  ) then
    alter table collab.conversation_participant
      add constraint conversation_participant_last_read_message_id_fkey
        foreign key (last_read_message_id)
        references collab.message(id)
        on update no action;
  end if;
end $$;


-- ============================================================================
-- COLLAB: Message FTS Trigger Function
-- ============================================================================
create or replace function collab.message_body_tsv_trigger()
returns trigger as $$
begin
  new.body_tsv := to_tsvector('english', coalesce(new.body, ''));
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'message_body_tsv_update'
  ) then
    create trigger message_body_tsv_update
      before insert or update of body
      on collab.message
      for each row
      execute function collab.message_body_tsv_trigger();
  end if;
end $$;


-- ============================================================================
-- COLLAB: Delegation Grants
-- ============================================================================
create table if not exists collab.delegation_grant (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  delegator_id    text not null,
  delegate_id     text not null,
  scope_type      text not null check (scope_type in ('task','entity','workflow','module')),
  scope_ref       text,
  permissions     text[] not null default '{}',
  reason          text,
  expires_at      timestamptz,
  is_revoked      boolean not null default false,
  revoked_at      timestamptz,
  revoked_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table collab.delegation_grant is 'Active task/scope delegations between principals';

create index if not exists idx_delegation_grant_tenant_delegator
  on collab.delegation_grant(tenant_id, delegator_id)
  where is_revoked = false;

create index if not exists idx_delegation_grant_tenant_delegate
  on collab.delegation_grant(tenant_id, delegate_id)
  where is_revoked = false;

create index if not exists idx_delegation_grant_expires
  on collab.delegation_grant(expires_at)
  where is_revoked = false and expires_at is not null;


-- ============================================================================
-- COLLAB: Delegation Requests (pending approval)
-- ============================================================================
create table if not exists collab.delegation_request (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  requester_id    text not null,
  target_id       text not null,
  scope_type      text not null,
  scope_ref       text,
  permissions     text[] not null default '{}',
  reason          text,
  status          text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

comment on table collab.delegation_request is 'Delegation requests awaiting approval';

create index if not exists idx_delegation_request_tenant_status
  on collab.delegation_request(tenant_id, status)
  where status = 'pending';


-- ============================================================================
-- COLLAB: Record-Level Sharing
-- ============================================================================
create table if not exists collab.record_share (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  entity_type     text not null,
  entity_id       text not null,
  shared_with_id  text not null,
  shared_with_type text not null default 'user' check (shared_with_type in ('user','group','ou')),
  permission_level text not null default 'view' check (permission_level in ('view','edit','admin')),
  shared_by       text not null,
  reason          text,
  expires_at      timestamptz,
  is_revoked      boolean not null default false,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table collab.record_share is 'Record-level sharing grants (user/group/OU)';

create index if not exists idx_record_share_entity
  on collab.record_share(tenant_id, entity_type, entity_id)
  where is_revoked = false;

create index if not exists idx_record_share_recipient
  on collab.record_share(tenant_id, shared_with_id)
  where is_revoked = false;

create index if not exists idx_record_share_expires
  on collab.record_share(expires_at)
  where is_revoked = false and expires_at is not null;

create unique index if not exists record_share_unique_active
  on collab.record_share(tenant_id, entity_type, entity_id, shared_with_id, shared_with_type)
  where is_revoked = false;


-- ============================================================================
-- COLLAB: Share Audit Trail
-- ============================================================================
create table if not exists collab.share_audit (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  grant_id        uuid,
  grant_type      text not null check (grant_type in ('delegation','record_share','external_share')),
  action          text not null check (action in ('grant_created','grant_revoked','grant_expired','access_via_share','share_modified','delegation_created','delegation_revoked')),
  actor_id        text not null,
  target_id       text,
  entity_type     text,
  entity_id       text,
  details         jsonb,
  created_at      timestamptz not null default now()
);

comment on table collab.share_audit is 'Sharing-specific audit trail for compliance';

create index if not exists idx_share_audit_tenant_time
  on collab.share_audit(tenant_id, created_at desc);

create index if not exists idx_share_audit_actor
  on collab.share_audit(tenant_id, actor_id, created_at desc);

create index if not exists idx_share_audit_entity
  on collab.share_audit(tenant_id, entity_type, entity_id, created_at desc);

create index if not exists idx_share_audit_grant
  on collab.share_audit(grant_id)
  where grant_id is not null;


-- ============================================================================
-- COLLAB: External Share Tokens (Cross-Tenant)
-- ============================================================================
create table if not exists collab.external_share_token (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  token_hash        text not null unique,
  issuer_tenant_id  uuid not null,
  issued_by         text not null,
  target_email      text not null,
  entity_type       text not null,
  entity_id         text not null,
  permission_level  text not null default 'view' check (permission_level in ('view','edit')),
  expires_at        timestamptz not null,
  is_revoked        boolean not null default false,
  revoked_at        timestamptz,
  last_accessed_at  timestamptz,
  access_count      integer not null default 0,
  created_at        timestamptz not null default now()
);

comment on table collab.external_share_token is 'Cross-tenant share tokens (JWT-based scoped access)';

create index if not exists idx_external_share_token_hash
  on collab.external_share_token(token_hash)
  where is_revoked = false;

create index if not exists idx_external_share_token_entity
  on collab.external_share_token(tenant_id, entity_type, entity_id)
  where is_revoked = false;

create index if not exists idx_external_share_token_expires
  on collab.external_share_token(expires_at)
  where is_revoked = false;
