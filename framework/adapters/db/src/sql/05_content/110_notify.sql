/* ============================================================================
   Athyper — NOTIFY Schema
   Notifications, Preferences, Delivery Pipeline, Consent

   Tables:
     notification        — In-app / multi-channel notifications  (partitioned by month)
     preference          — Scoped notification preferences
     dlq                 — Dead-letter queue for failed deliveries
     digest_staging      — Staging area for digest rollups
     whatsapp_consent    — WhatsApp opt-in / opt-out consent
     message             — Fan-out root per event per rule
     delivery            — Per-channel per-recipient delivery     (partitioned by month)
     suppression         — Bounces, opt-outs, compliance blocks

   PostgreSQL 16+
   ============================================================================ */

-- citext extension (case-insensitive text for address normalization)
create extension if not exists citext;

-- ============================================================================
-- NOTIFY: Notification (in-app / multi-channel notifications)
-- Partitioned by RANGE on created_at (monthly)
-- ============================================================================

-- Guard: only drop if it is a plain (non-partitioned) table, never a live partitioned one
do $guard$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'notify' and c.relname = 'notification'
      and c.relkind = 'r'  -- ordinary table, NOT 'p' (partitioned)
  ) then
    drop table notify.notification cascade;
  end if;
end $guard$;

create table if not exists notify.notification (
  id                       uuid        not null default gen_random_uuid(),
  tenant_id                uuid        not null,
  recipient_id             uuid        not null,
  sender_id                uuid,

  channel                  text        not null default 'in_app',
  category                 text,
  priority                 text        not null default 'normal',

  title                    text        not null,
  body                     text,
  icon                     text,
  action_url               text,

  entity_type              text,
  entity_id                uuid,

  is_read                  boolean     not null default false,
  read_at                  timestamptz,
  is_dismissed             boolean     not null default false,
  dismissed_at             timestamptz,

  expires_at               timestamptz,

  metadata                 jsonb,

  created_at               timestamptz not null default now(),
  created_by_principal_id  uuid,
  created_by_service       text,

  -- PK includes partition key
  constraint notification_pkey
      primary key (id, created_at),

  -- Channel & priority consistency
  constraint notification_channel_chk
      check (channel in ('in_app','email','sms','push','webhook','whatsapp')),
  constraint notification_priority_chk
      check (priority in ('low','normal','high','urgent')),

  -- Read/dismiss consistency: can't be read without a timestamp, can't be dismissed without a timestamp
  constraint notification_read_consistency_chk
      check ((is_read = false and read_at is null) or (is_read = true and read_at is not null)),
  constraint notification_dismiss_consistency_chk
      check ((is_dismissed = false and dismissed_at is null) or (is_dismissed = true and dismissed_at is not null)),

  -- Expiry sanity: expires_at must be after created_at
  constraint notification_expiry_sanity_chk
      check (expires_at is null or expires_at > created_at),

  -- Created-by: exactly one of principal or service must be set
  constraint notification_created_by_chk
      check (num_nonnulls(created_by_principal_id, created_by_service) = 1)
) partition by range (created_at);

comment on table notify.notification
    is 'User notifications (in-app, email, push, etc.). Partitioned by month on created_at.';

-- FKs declared separately (cannot be inline on partitioned tables in PG < 17)
-- tenant_id FK
do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_tenant_id_fkey'
      and connamespace = (select oid from pg_namespace where nspname = 'notify')
  ) then
    alter table notify.notification
      add constraint notification_tenant_id_fkey
      foreign key (tenant_id) references core.tenant(id) on delete cascade;
  end if;
end $fk$;

-- Initial partitions: current month + 3 months forward
do $parts$
declare
  m integer;
  y integer;
  part_start date;
  part_end   date;
  part_name  text;
begin
  for m in 0..3 loop
    part_start := date_trunc('month', current_date) + (m || ' months')::interval;
    part_end   := part_start + '1 month'::interval;
    y := extract(year from part_start)::integer;
    part_name  := format('notification_%s_%02s',
                         y,
                         extract(month from part_start)::integer);
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'notify' and c.relname = part_name
    ) then
      execute format(
        'create table notify.%I partition of notify.notification for values from (%L) to (%L)',
        part_name, part_start, part_end
      );
    end if;
  end loop;
end $parts$;

-- Indexes (created on parent; PG propagates to partitions)
create index if not exists idx_notification_recipient_unread
    on notify.notification (recipient_id, is_read, created_at desc)
    where is_read = false;

create index if not exists idx_notification_recipient_active
    on notify.notification (tenant_id, recipient_id, created_at desc)
    where is_dismissed = false;

create index if not exists idx_notification_recipient_time
    on notify.notification (tenant_id, recipient_id, created_at desc);

create index if not exists idx_notification_entity
    on notify.notification (tenant_id, entity_type, entity_id);

create index if not exists idx_notification_expires
    on notify.notification (expires_at)
    where expires_at is not null;

-- ============================================================================
-- NOTIFY: Preference (scoped notification preferences)
-- Scope columns: user_principal_id | org_unit_id | tenant_id (for tenant scope)
-- ============================================================================
create table if not exists notify.preference (
    id                   uuid           not null default gen_random_uuid(),
    tenant_id            uuid           not null,
    scope                text           not null,

    -- Typed scope columns (exactly one set based on scope)
    user_principal_id    uuid,
    org_unit_id          uuid,

    event_code           text           not null,
    channel              text           not null,
    is_enabled           boolean        not null default true,
    frequency            text           not null default 'immediate',
    quiet_hours          jsonb,
    metadata             jsonb,

    created_at           timestamptz(6) not null default now(),
    created_by_principal_id  uuid,
    created_by_service       text,
    updated_at           timestamptz(6),
    updated_by           text,

    constraint preference_pkey
        primary key (id),
    constraint preference_tenant_fkey
        foreign key (tenant_id) references core.tenant(id)
        on delete cascade on update no action,
    constraint preference_user_principal_fkey
        foreign key (user_principal_id) references core.principal(id)
        on delete cascade on update no action,
    constraint preference_scope_chk
        check (scope in ('user', 'org_unit', 'tenant')),
    constraint preference_channel_chk
        check (channel in ('in_app','email','sms','push','webhook','whatsapp')),
    constraint preference_frequency_chk
        check (frequency in ('immediate', 'hourly_digest', 'daily_digest', 'weekly_digest')),

    -- Scope integrity: exactly one typed column set per scope value
    constraint preference_scope_user_chk
        check (scope <> 'user'     or (user_principal_id is not null and org_unit_id is null)),
    constraint preference_scope_org_unit_chk
        check (scope <> 'org_unit' or (org_unit_id is not null and user_principal_id is null)),
    constraint preference_scope_tenant_chk
        check (scope <> 'tenant'   or (user_principal_id is null and org_unit_id is null)),

    -- Created-by: exactly one of principal or service must be set
    constraint preference_created_by_chk
        check (num_nonnulls(created_by_principal_id, created_by_service) = 1)
);

-- Partial unique indexes per scope (replace the single polymorphic unique index)
create unique index if not exists preference_user_scope_uniq
    on notify.preference (tenant_id, user_principal_id, event_code, channel)
    where scope = 'user';

create unique index if not exists preference_org_unit_scope_uniq
    on notify.preference (tenant_id, org_unit_id, event_code, channel)
    where scope = 'org_unit';

create unique index if not exists preference_tenant_scope_uniq
    on notify.preference (tenant_id, event_code, channel)
    where scope = 'tenant';

create index if not exists idx_preference_lookup
    on notify.preference (tenant_id, event_code, channel);

-- ============================================================================
-- NOTIFY: DLQ (dead-letter queue for failed deliveries)
-- ============================================================================
create table if not exists notify.dlq (
    id              uuid           not null default gen_random_uuid(),
    tenant_id       uuid           not null,
    delivery_id     uuid           not null,
    message_id      uuid           not null,
    channel         text           not null,
    provider_code   text           not null,
    recipient_id    uuid,
    recipient_addr  text           not null,
    last_error      text,
    error_category  text,
    attempt_count   integer        not null default 0,
    payload         jsonb          not null,
    metadata        jsonb,
    dead_at         timestamptz(6) not null default now(),
    replayed_at     timestamptz(6),
    replayed_by     text,
    replay_count    integer        not null default 0,
    created_at      timestamptz(6) not null default now(),

    constraint dlq_pkey
        primary key (id),
    constraint dlq_tenant_fkey
        foreign key (tenant_id) references core.tenant(id)
        on delete cascade on update no action,
    constraint dlq_channel_chk
        check (channel in ('in_app','email','sms','push','webhook','whatsapp')),
    constraint dlq_error_category_chk
        check (error_category is null or error_category in ('transient', 'permanent', 'rate_limit', 'auth'))
);

create index if not exists idx_dlq_tenant
    on notify.dlq (tenant_id, dead_at desc);

create index if not exists idx_dlq_unreplayed
    on notify.dlq (tenant_id)
    where replayed_at is null;

-- ============================================================================
-- NOTIFY: Digest Staging (staging area for digest rollups)
-- ============================================================================
create table if not exists notify.digest_staging (
    id              uuid           not null default gen_random_uuid(),
    tenant_id       uuid           not null,
    recipient_id    uuid           not null,
    channel         text           not null,
    frequency       text           not null,
    message_id      uuid           not null,
    event_code      text           not null,
    subject         text,
    payload         jsonb          not null,
    template_key    text           not null,
    priority        text           not null default 'normal',
    metadata        jsonb,
    staged_at       timestamptz(6) not null default now(),
    delivered_at    timestamptz(6),

    constraint digest_staging_pkey
        primary key (id),
    constraint digest_staging_tenant_fkey
        foreign key (tenant_id) references core.tenant(id)
        on delete cascade on update no action,
    constraint digest_staging_channel_chk
        check (channel in ('in_app','email','sms','push','webhook','whatsapp')),
    constraint digest_staging_frequency_chk
        check (frequency in ('hourly_digest', 'daily_digest', 'weekly_digest')),
    constraint digest_staging_priority_chk
        check (priority in ('low','normal','high','urgent'))
);

create index if not exists idx_digest_staging_pending
    on notify.digest_staging (tenant_id, recipient_id, channel, frequency)
    where delivered_at is null;

create index if not exists idx_digest_staging_frequency
    on notify.digest_staging (frequency, staged_at)
    where delivered_at is null;

create index if not exists idx_digest_staging_pending_order
    on notify.digest_staging (tenant_id, recipient_id, staged_at)
    where delivered_at is null;

-- ============================================================================
-- NOTIFY: WhatsApp Consent (opt-in / opt-out)
-- ============================================================================
create table if not exists notify.whatsapp_consent (
    id                          uuid           not null default gen_random_uuid(),
    tenant_id                   uuid           not null,
    phone_number                text           not null,
    principal_id                uuid,
    opted_in                    boolean        not null default false,
    opted_in_at                 timestamptz(6),
    opted_out_at                timestamptz(6),
    opt_in_method               text,
    conversation_window_start   timestamptz(6),
    conversation_window_end     timestamptz(6),
    metadata                    jsonb,
    created_at                  timestamptz(6) not null default now(),
    updated_at                  timestamptz(6),

    constraint whatsapp_consent_pkey
        primary key (id),
    constraint whatsapp_consent_tenant_fkey
        foreign key (tenant_id) references core.tenant(id)
        on delete cascade on update no action,

    -- E.164 format: + followed by 1-15 digits, first digit non-zero
    constraint whatsapp_consent_phone_e164_chk
        check (phone_number ~ '^\+[1-9]\d{1,14}$')
);

create unique index if not exists whatsapp_consent_tenant_phone_uniq
    on notify.whatsapp_consent (tenant_id, phone_number);

create index if not exists idx_whatsapp_consent_principal
    on notify.whatsapp_consent (principal_id)
    where principal_id is not null;

-- ============================================================================
-- NOTIFY: Message (fan-out root per event per rule)
-- ============================================================================
create table if not exists notify.message (
    id                   uuid           not null default gen_random_uuid(),
    tenant_id            uuid           not null,
    event_id             text           not null,
    event_code           text           not null,
    rule_id              uuid,
    template_key         text           not null,
    template_version     integer        not null,
    subject              text,
    payload              jsonb          not null,
    priority             text           not null default 'normal',
    status               text           not null default 'pending',
    recipient_count      integer        not null default 0,
    delivered_count      integer        not null default 0,
    failed_count         integer        not null default 0,
    entity_type          text,
    entity_id            uuid,
    correlation_id       text,
    metadata             jsonb,
    created_at           timestamptz(6) not null default now(),
    completed_at         timestamptz(6),
    expires_at           timestamptz(6),

    constraint message_pkey
        primary key (id),
    constraint message_tenant_id_fkey
        foreign key (tenant_id) references core.tenant(id)
        on delete cascade on update no action,
    constraint message_rule_id_fkey
        foreign key (rule_id) references meta.notification_rule(id)
        on update no action,
    constraint message_status_chk
        check (status in ('pending', 'planning', 'delivering', 'completed', 'partial', 'failed')),
    constraint message_priority_chk
        check (priority in ('low', 'normal', 'high', 'urgent')),
    constraint message_channel_chk
        check (true),  -- message is channel-agnostic; kept for schema consistency comment
    -- Expiry sanity
    constraint message_expiry_sanity_chk
        check (expires_at is null or expires_at > created_at)
);

comment on table notify.message
    is 'Logical notification messages (one per event per rule).';

create index if not exists idx_message_tenant
    on notify.message (tenant_id, created_at desc);

create index if not exists idx_message_event
    on notify.message (event_id);

create index if not exists idx_message_status
    on notify.message (status)
    where status not in ('completed');

-- ============================================================================
-- NOTIFY: Delivery (per-channel per-recipient delivery attempts)
-- Partitioned by RANGE on created_at (monthly)
-- ============================================================================

-- Guard: only drop if it is a plain (non-partitioned) table
do $guard2$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'notify' and c.relname = 'delivery'
      and c.relkind = 'r'
  ) then
    drop table notify.delivery cascade;
  end if;
end $guard2$;

create table if not exists notify.delivery (
    id              uuid           not null default gen_random_uuid(),
    message_id      uuid           not null,
    tenant_id       uuid           not null,
    channel         text           not null,
    provider_code   text           not null,
    recipient_id    uuid,
    recipient_addr  text           not null,
    status          text           not null default 'pending',
    attempt_count   integer        not null default 0,
    max_attempts    integer        not null default 3,
    last_error      text,
    error_category  text,
    external_id     text,
    sent_at         timestamptz(6),
    delivered_at    timestamptz(6),
    opened_at       timestamptz(6),
    clicked_at      timestamptz(6),
    bounced_at      timestamptz(6),
    metadata        jsonb,
    created_at      timestamptz(6) not null default now(),
    updated_at      timestamptz(6),

    -- PK includes partition key
    constraint delivery_pkey
        primary key (id, created_at),

    constraint delivery_channel_chk
        check (channel in ('in_app','email','sms','push','webhook','whatsapp')),
    constraint delivery_status_chk
        check (status in ('pending', 'queued', 'sent', 'delivered', 'bounced', 'failed', 'cancelled')),
    constraint delivery_error_category_chk
        check (error_category is null or error_category in ('transient', 'permanent', 'rate_limit', 'auth')),

    -- Delivery attempts sanity: attempt_count <= max_attempts
    constraint delivery_attempts_sanity_chk
        check (attempt_count <= max_attempts)
) partition by range (created_at);

comment on table notify.delivery
    is 'Individual delivery attempts per channel per recipient. Partitioned by month on created_at.';

-- FK to message (non-partitioned parent — valid cross-reference)
do $fk2$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_message_id_fkey'
      and connamespace = (select oid from pg_namespace where nspname = 'notify')
  ) then
    alter table notify.delivery
      add constraint delivery_message_id_fkey
      foreign key (message_id) references notify.message(id) on delete cascade;
  end if;
end $fk2$;

-- FK to tenant
do $fk3$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_tenant_id_fkey'
      and connamespace = (select oid from pg_namespace where nspname = 'notify')
  ) then
    alter table notify.delivery
      add constraint delivery_tenant_id_fkey
      foreign key (tenant_id) references core.tenant(id) on delete cascade;
  end if;
end $fk3$;

-- Initial partitions: current month + 3 months forward
do $dparts$
declare
  m integer;
  y integer;
  part_start date;
  part_end   date;
  part_name  text;
begin
  for m in 0..3 loop
    part_start := date_trunc('month', current_date) + (m || ' months')::interval;
    part_end   := part_start + '1 month'::interval;
    y := extract(year from part_start)::integer;
    part_name  := format('delivery_%s_%02s',
                         y,
                         extract(month from part_start)::integer);
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'notify' and c.relname = part_name
    ) then
      execute format(
        'create table notify.%I partition of notify.delivery for values from (%L) to (%L)',
        part_name, part_start, part_end
      );
    end if;
  end loop;
end $dparts$;

-- Indexes
create index if not exists idx_delivery_message
    on notify.delivery (message_id);

create index if not exists idx_delivery_status
    on notify.delivery (status)
    where status in ('pending', 'queued', 'sent');

create index if not exists idx_delivery_external
    on notify.delivery (external_id)
    where external_id is not null;

create index if not exists idx_delivery_tenant_time
    on notify.delivery (tenant_id, created_at desc);

-- Worker pickup index: channel + provider + status for delivery workers
create index if not exists idx_delivery_pickup
    on notify.delivery (channel, provider_code, status, created_at)
    where status in ('pending', 'queued');

-- ============================================================================
-- NOTIFY: Suppression (bounces, opt-outs, compliance blocks)
-- ============================================================================
create table if not exists notify.suppression (
    id              uuid           not null default gen_random_uuid(),
    tenant_id       uuid           not null,
    channel         text           not null,
    address         citext         not null,
    reason          text           not null,
    source          text,
    provider_code   text,
    metadata        jsonb,
    suppressed_at   timestamptz(6) not null default now(),
    expires_at      timestamptz(6),
    created_by_principal_id  uuid,
    created_by_service       text,

    constraint suppression_pkey
        primary key (id),
    constraint suppression_tenant_id_fkey
        foreign key (tenant_id) references core.tenant(id)
        on delete cascade on update no action,
    constraint suppression_channel_chk
        check (channel in ('in_app','email','sms','push','webhook','whatsapp')),
    constraint suppression_reason_chk
        check (reason in ('hard_bounce', 'complaint', 'opt_out', 'compliance_block', 'manual')),

    -- Created-by: exactly one of principal or service must be set
    constraint suppression_created_by_chk
        check (num_nonnulls(created_by_principal_id, created_by_service) = 1)
);

comment on table notify.suppression
    is 'Suppression list for bounces, opt-outs, and compliance blocks.';

create unique index if not exists suppression_tenant_channel_address_uniq
    on notify.suppression (tenant_id, channel, address);

create index if not exists idx_suppression_lookup
    on notify.suppression (channel, address);

-- ============================================================================
-- Push Subscription — Web Push subscription storage
-- ============================================================================

create table if not exists notify.push_subscription (
    id              uuid        default gen_random_uuid() primary key,
    tenant_id       uuid        not null,
    principal_id    text        not null,
    endpoint        text        not null,
    p256dh          text        not null,
    auth            text        not null,
    is_active       boolean     not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table notify.push_subscription
    is 'Web Push subscription registrations per user device.';

create unique index if not exists push_sub_tenant_endpoint_uniq
    on notify.push_subscription (tenant_id, endpoint);

create index if not exists idx_push_sub_principal
    on notify.push_subscription (tenant_id, principal_id, is_active);
