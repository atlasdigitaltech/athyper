/* ============================================================================
   Athyper — VOICE (TEL) Schema Extension
   Voice & Channel Integrations: Call Sessions, Recordings, Transcripts,
   IVR Flows, SMS Logs.

   Lives in existing `collab` schema — telephony is a collaboration concern.

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- VOICE: Call Session (call state machine)
-- ============================================================================
create table if not exists collab.call_session (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  -- Provider tracking
  session_ref       text not null,
  provider          text not null default 'twilio',

  -- Call metadata
  direction         text not null,
  status            text not null default 'initiated',
  from_number       text not null,
  to_number         text not null,
  duration_seconds  int,
  callback_url      text,

  -- CRM linkage (polymorphic, nullable)
  crm_entity_type   text,
  crm_entity_id     uuid,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,
  updated_by        text,
  ended_at          timestamptz,

  constraint call_session_direction_chk check (direction in ('inbound', 'outbound')),
  constraint call_session_status_chk check (status in ('initiated', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled')),
  constraint call_session_provider_chk check (provider in ('twilio', 'webrtc', 'sip')),
  constraint call_session_ref_uniq unique (tenant_id, session_ref)
);

comment on table collab.call_session is 'Voice call sessions — state machine for inbound/outbound calls.';

create index if not exists idx_call_session_tenant_status
  on collab.call_session (tenant_id, status, created_at desc);

create index if not exists idx_call_session_ref
  on collab.call_session (tenant_id, session_ref);

create index if not exists idx_call_session_crm
  on collab.call_session (tenant_id, crm_entity_type, crm_entity_id, created_at desc)
  where crm_entity_type is not null;

create index if not exists idx_call_session_from_number
  on collab.call_session (tenant_id, from_number, created_at desc);

create index if not exists idx_call_session_to_number
  on collab.call_session (tenant_id, to_number, created_at desc);

-- ============================================================================
-- VOICE: Call Recording (recording metadata + storage reference)
-- ============================================================================
create table if not exists collab.call_recording (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  session_id        uuid not null references collab.call_session(id) on delete cascade,

  -- Provider reference
  recording_ref     text not null,
  storage_key       text,
  duration_seconds  int,
  file_size_bytes   bigint,

  -- Status tracking
  status            text not null default 'pending',

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,

  constraint call_recording_status_chk check (status in ('pending', 'stored', 'failed', 'deleted')),
  constraint call_recording_ref_uniq unique (tenant_id, recording_ref)
);

comment on table collab.call_recording is 'Call recording metadata — links to object storage via storage_key.';

create index if not exists idx_call_recording_session
  on collab.call_recording (tenant_id, session_id);

create index if not exists idx_call_recording_status
  on collab.call_recording (tenant_id, status)
  where status = 'pending';

-- ============================================================================
-- VOICE: Call Transcript (transcription data)
-- ============================================================================
create table if not exists collab.call_transcript (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  session_id        uuid not null references collab.call_session(id) on delete cascade,

  -- Transcript content
  transcript_text   text not null,
  confidence        real,
  language          text default 'en',
  segments          jsonb,

  created_at        timestamptz not null default now(),

  constraint call_transcript_confidence_chk check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint call_transcript_session_uniq unique (tenant_id, session_id)
);

comment on table collab.call_transcript is 'Call transcription — one transcript per call session.';

create index if not exists idx_call_transcript_session
  on collab.call_transcript (tenant_id, session_id);

-- ============================================================================
-- VOICE: IVR Flow (interactive voice response flow definitions)
-- ============================================================================
create table if not exists collab.ivr_flow (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  code              text not null,
  name              text not null,
  description       text,
  steps             jsonb not null default '[]'::jsonb,
  is_active         boolean not null default true,
  version           int not null default 1,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,
  updated_by        text,

  constraint ivr_flow_code_uniq unique (tenant_id, code)
);

comment on table collab.ivr_flow is 'IVR flow definitions — step-based interactive voice response trees.';

create index if not exists idx_ivr_flow_tenant_active
  on collab.ivr_flow (tenant_id, is_active)
  where is_active = true;

-- ============================================================================
-- VOICE: SMS Log (send/receive message log)
-- ============================================================================
create table if not exists collab.sms_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  -- Message metadata
  direction         text not null,
  from_number       text not null,
  to_number         text not null,
  body              text not null,
  message_ref       text,
  status            text not null default 'queued',

  -- CRM linkage (polymorphic, nullable)
  crm_entity_type   text,
  crm_entity_id     uuid,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,

  constraint sms_log_direction_chk check (direction in ('inbound', 'outbound')),
  constraint sms_log_status_chk check (status in ('queued', 'sent', 'delivered', 'failed', 'received')),
  constraint sms_log_body_len_chk check (char_length(body) <= 1600)
);

comment on table collab.sms_log is 'SMS message log — inbound/outbound messages with CRM linkage.';

create index if not exists idx_sms_log_tenant_status
  on collab.sms_log (tenant_id, status, created_at desc);

create index if not exists idx_sms_log_crm
  on collab.sms_log (tenant_id, crm_entity_type, crm_entity_id, created_at desc)
  where crm_entity_type is not null;

create index if not exists idx_sms_log_from_number
  on collab.sms_log (tenant_id, from_number, created_at desc);

create index if not exists idx_sms_log_to_number
  on collab.sms_log (tenant_id, to_number, created_at desc);

create index if not exists idx_sms_log_date
  on collab.sms_log (tenant_id, cast(created_at at time zone 'UTC' as date));
