-- ============================================================================
-- INTEGRATION HUB (INT) — Tables in wf schema
-- ============================================================================
-- External connectivity: endpoints, flows, webhooks, outbox, delivery/job logs.
-- Schema `wf` already created in 001_schemas.sql.
-- ============================================================================

-- ============================================================================
-- INTEGRATION: Endpoint Registry
-- ============================================================================
create table if not exists wf.integration_endpoint (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  code              text not null,
  name              text not null,
  description       text,
  url               text not null,
  http_method       text not null default 'POST',
  auth_type         text not null default 'NONE',
  auth_config       jsonb not null default '{}',
  default_headers   jsonb not null default '{}',
  timeout_ms        int not null default 30000,
  retry_policy      jsonb not null default '{"maxRetries":3,"backoffMs":1000,"backoffMultiplier":2}',
  rate_limit_config jsonb,
  is_active         boolean not null default true,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,
  updated_by        text,

  constraint integration_endpoint_auth_type_chk
    check (auth_type in ('NONE','API_KEY','BASIC','HMAC','OAUTH2')),
  constraint integration_endpoint_method_chk
    check (http_method in ('GET','POST','PUT','PATCH','DELETE')),
  constraint integration_endpoint_tenant_code_uniq
    unique (tenant_id, code)
);

comment on table wf.integration_endpoint
  is 'Registered external HTTP endpoints with auth and retry config.';

create index if not exists idx_integration_endpoint_tenant
  on wf.integration_endpoint (tenant_id);

create index if not exists idx_integration_endpoint_active
  on wf.integration_endpoint (tenant_id, is_active) where is_active = true;

-- ============================================================================
-- INTEGRATION: Flow Definitions
-- ============================================================================
create table if not exists wf.integration_flow (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  code              text not null,
  name              text not null,
  description       text,
  steps             jsonb not null default '[]',
  trigger_type      text not null default 'MANUAL',
  trigger_config    jsonb not null default '{}',
  is_active         boolean not null default true,
  version           int not null default 1,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,
  updated_by        text,

  constraint integration_flow_trigger_chk
    check (trigger_type in ('MANUAL','EVENT','SCHEDULE','WEBHOOK')),
  constraint integration_flow_tenant_code_uniq
    unique (tenant_id, code)
);

comment on table wf.integration_flow
  is 'Integration orchestration flows (step sequences with triggers).';

create index if not exists idx_integration_flow_tenant
  on wf.integration_flow (tenant_id);

create index if not exists idx_integration_flow_trigger
  on wf.integration_flow (tenant_id, trigger_type) where is_active = true;

-- ============================================================================
-- INTEGRATION: Webhook Subscriptions
-- ============================================================================
create table if not exists wf.webhook_subscription (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenant(id) on delete cascade,

  code                text not null,
  name                text not null,
  endpoint_url        text not null,
  secret_hash         text not null,
  event_types         text[] not null default '{}',
  is_active           boolean not null default true,
  metadata            jsonb,
  last_triggered_at   timestamptz,

  created_at          timestamptz not null default now(),
  created_by          text not null,
  updated_at          timestamptz,
  updated_by          text,

  constraint webhook_subscription_tenant_code_uniq
    unique (tenant_id, code)
);

comment on table wf.webhook_subscription
  is 'Outbound webhook subscriptions with HMAC verification secrets.';

create index if not exists idx_webhook_subscription_tenant
  on wf.webhook_subscription (tenant_id);

create index if not exists idx_webhook_subscription_events
  on wf.webhook_subscription using gin (event_types);

create index if not exists idx_webhook_subscription_active
  on wf.webhook_subscription (tenant_id, is_active) where is_active = true;

-- ============================================================================
-- INTEGRATION: Webhook Events
-- ============================================================================
create table if not exists wf.webhook_event (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,
  subscription_id   uuid not null references wf.webhook_subscription(id) on delete cascade,

  event_type        text not null,
  payload           jsonb not null,
  status            text not null default 'pending',
  attempts          int not null default 0,
  last_error        text,
  processed_at      timestamptz,

  created_at        timestamptz not null default now(),

  constraint webhook_event_status_chk
    check (status in ('pending','processing','delivered','failed','dead'))
);

comment on table wf.webhook_event
  is 'Inbound/outbound webhook event records with delivery tracking.';

create index if not exists idx_webhook_event_subscription
  on wf.webhook_event (tenant_id, subscription_id);

create index if not exists idx_webhook_event_status
  on wf.webhook_event (tenant_id, status, created_at)
  where status in ('pending','processing');

-- ============================================================================
-- INTEGRATION: Outbox Items (Reliable Delivery)
-- ============================================================================
create table if not exists wf.outbox_item (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  entity_type       text not null,
  entity_id         text not null,
  event_type        text not null,
  payload           jsonb not null,
  status            text not null default 'pending',
  retry_count       int not null default 0,
  max_retries       int not null default 5,
  next_retry_at     timestamptz not null default now(),
  locked_at         timestamptz,
  locked_by         text,
  last_error        text,
  endpoint_id       uuid references wf.integration_endpoint(id) on delete set null,

  created_at        timestamptz not null default now(),
  created_by        text not null,

  constraint outbox_item_status_chk
    check (status in ('pending','processing','completed','failed','dead'))
);

comment on table wf.outbox_item
  is 'Integration-specific outbox for reliable event delivery with retry.';

create index if not exists idx_outbox_item_pick
  on wf.outbox_item (tenant_id, status, next_retry_at)
  where status in ('pending','failed');

create index if not exists idx_outbox_item_entity
  on wf.outbox_item (tenant_id, entity_type, entity_id);

-- ============================================================================
-- INTEGRATION: Delivery Log (Append-Only)
-- ============================================================================
create table if not exists wf.delivery_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  endpoint_id       uuid references wf.integration_endpoint(id) on delete set null,
  outbox_item_id    uuid references wf.outbox_item(id) on delete set null,
  request_url       text not null,
  request_method    text not null,
  request_headers   jsonb,
  request_body      jsonb,
  response_status   int,
  response_headers  jsonb,
  response_body     text,
  duration_ms       int not null,
  success           boolean not null,
  error             text,

  created_at        timestamptz not null default now()
);

comment on table wf.delivery_log
  is 'Append-only HTTP delivery audit log (request/response pairs).';

create index if not exists idx_delivery_log_endpoint
  on wf.delivery_log (tenant_id, endpoint_id, created_at desc);

create index if not exists idx_delivery_log_outbox
  on wf.delivery_log (tenant_id, outbox_item_id);

create index if not exists idx_delivery_log_created
  on wf.delivery_log (tenant_id, created_at desc);

-- ============================================================================
-- INTEGRATION: Job Log (Flow Step Execution)
-- ============================================================================
create table if not exists wf.job_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  flow_id           uuid references wf.integration_flow(id) on delete set null,
  run_id            text not null,
  step_index        int not null,
  step_type         text not null,
  status            text not null default 'running',
  input             jsonb,
  output            jsonb,
  error             text,
  duration_ms       int,

  started_at        timestamptz not null default now(),
  completed_at      timestamptz,

  constraint job_log_status_chk
    check (status in ('running','completed','failed','skipped'))
);

comment on table wf.job_log
  is 'Step-level execution log for integration flow runs.';

create index if not exists idx_job_log_flow_run
  on wf.job_log (tenant_id, flow_id, run_id);

create index if not exists idx_job_log_tenant_status
  on wf.job_log (tenant_id, status, started_at desc);
