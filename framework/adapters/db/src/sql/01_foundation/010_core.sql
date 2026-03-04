/* ============================================================================
   Athyper — CORE Schema
   Foundation: Tenant, Outbox, Jobs, Addresses, Contact Points
   Workspace: Workspaces, Features, Access, Usage Metrics
   Misc: Address Links, Locale Policies, Tags, Config, Feature Flags
   IAM: Principals, IDP Identities, Profiles, Groups, Roles, OUs, Entitlements
   Permissions: Operation Categories, Operations, Personas, Capabilities, Modules

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- CORE: Tenant
-- ============================================================================
create table if not exists core.tenant (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  display_name  text not null,
  realm_key     text not null default 'athyper',
  status        text not null default 'active',
  region        text,
  subscription  text not null default 'base',

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint tenant_status_chk check (status in ('active','suspended','archived')),
  constraint tenant_subscription_chk check (subscription in ('base','professional','enterprise'))
);

comment on table core.tenant is 'Canonical tenant registry (subscription, status, region).';
comment on column core.tenant.realm_key is 'IAM realm key (links to Keycloak realm).';
comment on column core.tenant.display_name is 'User-friendly display name.';

create index if not exists idx_tenant_realm_key
  on core.tenant (realm_key);

create index if not exists idx_tenant_status_active
  on core.tenant (status) where status = 'active';

-- ============================================================================
-- CORE: Outbox
-- ============================================================================
create table if not exists core.outbox (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  topic           text not null,
  event_key       text,
  payload         jsonb not null,
  status          text not null default 'pending',
  attempts        int not null default 0,
  available_at    timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,

  created_at      timestamptz not null default now(),
  created_by      text not null,

  constraint outbox_status_chk check (status in ('pending','processing','sent','failed','dead'))
);

comment on table core.outbox is 'Platform event outbox for reliable async processing.';

create index if not exists idx_outbox_pick
  on core.outbox (tenant_id, status, available_at);

-- ============================================================================
-- CORE: Job Definitions
-- ============================================================================
create table if not exists core.job (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  code          text not null,
  name          text not null,
  schedule_kind text not null,
  schedule_expr text,
  is_active     boolean not null default true,
  config        jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint job_schedule_kind_chk check (schedule_kind in ('cron','interval','manual')),
  constraint job_code_uniq unique (tenant_id, code)
);

comment on table core.job is 'Scheduler/job definitions (tenant-scoped).';

-- ============================================================================
-- CORE: Job Runs
-- ============================================================================
create table if not exists core.job_run (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,
  job_id       uuid not null references core.job(id) on delete cascade,

  status       text not null default 'queued',
  started_at   timestamptz,
  finished_at  timestamptz,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  log_ref      text,
  last_error   text,

  created_at   timestamptz not null default now(),

  constraint job_run_status_chk check (status in ('queued','running','succeeded','failed','canceled'))
);

comment on table core.job_run is 'Individual job execution records.';

create index if not exists idx_job_run_tenant_job_time
  on core.job_run (tenant_id, job_id, created_at desc);

-- ============================================================================
-- CORE: Addresses
-- MERGED: unique constraint on (tenant_id, id) from 046_address_link.sql
-- ============================================================================
create table if not exists core.address (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  country_code text,
  line1        text,
  line2        text,
  city         text,
  region       text,
  postal_code  text,
  metadata     jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint address_tenant_id_id_uq unique (tenant_id, id)
);

comment on table core.address is 'Physical/mailing addresses (tenant-scoped).';

create index if not exists idx_address_tenant
  on core.address (tenant_id);

-- ============================================================================
-- CORE: Contact Points
-- ============================================================================
create table if not exists core.contact_point (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  owner_type   text not null,
  owner_id     uuid not null,

  channel_type text not null,
  value        text not null,
  purpose      text,
  is_primary   boolean not null default false,
  is_verified  boolean not null default false,
  metadata     jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null
);

comment on table core.contact_point is 'Contact channels (email, phone, whatsapp, website, etc.).';

create index if not exists idx_contact_point_owner
  on core.contact_point (tenant_id, owner_type, owner_id);

-- ============================================================================
-- CORE: Contact Phone Details
-- ============================================================================
create table if not exists core.contact_phone (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  contact_point_id uuid not null references core.contact_point(id) on delete cascade,

  e164           text,
  country_code   text,
  national_number text,
  carrier_hint   text,

  created_at     timestamptz not null default now(),
  created_by     text not null
);

comment on table core.contact_phone is 'Structured phone data linked to a contact point.';

-- ============================================================================
-- CORE: Workspace (logical organizational namespace)
-- ============================================================================
create table if not exists core.workspace (
  id            uuid primary key default gen_random_uuid(),

  code          text not null unique,
  name          text not null,
  description   text,
  sort_order    int not null default 0,

  metadata      jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null default 'system',
  updated_at    timestamptz,
  updated_by    text
);

comment on table core.workspace is
'System-wide workspace definitions (Finance, Supply Chain, etc.).';

create index if not exists idx_workspace_sort
  on core.workspace (sort_order);

-- ============================================================================
-- CORE: Workspace Feature (feature enabled in workspace)
-- ============================================================================
create table if not exists core.workspace_feature (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,
  workspace_id  uuid not null references core.workspace(id) on delete cascade,

  feature_code  text not null,
  feature_name  text,

  is_enabled    boolean not null default true,
  enabled_at    timestamptz,

  config        jsonb,
  metadata      jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint workspace_feature_ws_feat_uniq unique (workspace_id, feature_code)
);

comment on table core.workspace_feature is 'Feature availability and configuration per workspace.';

create index if not exists idx_workspace_feature_workspace
  on core.workspace_feature (workspace_id, is_enabled);

create index if not exists idx_workspace_feature_code
  on core.workspace_feature (feature_code);

-- ============================================================================
-- CORE: Principal Workspace Access (role in workspace)
-- ============================================================================
create table if not exists core.principal_workspace_access (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,
  principal_id  uuid not null,  -- FK to core.principal added below (IAM section)
  workspace_id  uuid not null references core.workspace(id) on delete cascade,

  role_id       uuid,           -- FK to core.role added below (IAM section)
  persona_id    uuid,           -- FK to core.persona added below (IAM section)

  access_level  text not null default 'member',

  granted_at    timestamptz not null default now(),
  granted_by    text,
  expires_at    timestamptz,

  metadata      jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint principal_workspace_access_uniq unique (principal_id, workspace_id),
  constraint principal_workspace_access_level_chk
    check (access_level in ('owner','admin','manager','member','viewer','guest')),
  constraint principal_workspace_access_role_persona_ck check (
    (role_id is null or persona_id is null)
  )
);

comment on table core.principal_workspace_access is
'Principal access to workspaces (role or persona assignment).';

create index if not exists idx_principal_workspace_access_principal
  on core.principal_workspace_access (principal_id);

create index if not exists idx_principal_workspace_access_workspace
  on core.principal_workspace_access (workspace_id);

create index if not exists idx_principal_workspace_access_role
  on core.principal_workspace_access (role_id);

create index if not exists idx_principal_workspace_access_access_level
  on core.principal_workspace_access (access_level);

-- ============================================================================
-- CORE: Workspace Usage Metrics (audit/metering)
-- ============================================================================
create table if not exists core.workspace_usage_metric (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,
  workspace_id  uuid not null references core.workspace(id) on delete cascade,

  metric_key    text not null,
  metric_name   text,
  metric_value  numeric,
  metric_unit   text,

  period_start  timestamptz not null,
  period_end    timestamptz,

  recorded_at   timestamptz not null default now(),

  created_at    timestamptz not null default now()
);

comment on table core.workspace_usage_metric is 'Usage metrics per workspace for billing/quota enforcement.';

create index if not exists idx_workspace_usage_metric_workspace
  on core.workspace_usage_metric (workspace_id, period_end desc);

create index if not exists idx_workspace_usage_metric_metric_key
  on core.workspace_usage_metric (workspace_id, metric_key, period_end desc);

-- ============================================================================
-- VIEW: workspace_feature_view (denormalized workspace + feature)
-- ============================================================================
create or replace view core.workspace_feature_view as
  select
    wf.id,
    wf.tenant_id,
    wf.workspace_id,
    w.code as workspace_code,
    w.name as workspace_name,
    wf.feature_code,
    wf.feature_name,
    wf.is_enabled,
    wf.config
  from core.workspace_feature wf
  join core.workspace w on wf.workspace_id = w.id;

comment on view core.workspace_feature_view is
'Denormalized view: workspace + features.';

-- ============================================================================
-- CORE: Address Link (entity-address association)
-- Maps addresses to entities (customers, employees, etc.)
-- ============================================================================
create table if not exists core.address_link (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  owner_type     text not null,
  owner_id       uuid not null,

  address_id     uuid not null references core.address(id) on delete cascade,

  purpose        text not null,
  priority       int not null default 0,
  is_primary     boolean not null default false,

  effective_from timestamptz not null default now(),
  effective_until timestamptz,

  metadata       jsonb,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text,

  constraint address_link_owner_purpose_address_uniq
    unique (tenant_id, owner_type, owner_id, purpose, address_id),
  constraint address_link_purpose_chk check (
    purpose in ('billing','shipping','mailing','office','home','hq','legal','other')
  )
);

comment on table core.address_link is
'Entity-address association (tenant/customer/employee/org address links).';

create index if not exists idx_address_link_owner
  on core.address_link (tenant_id, owner_type, owner_id);

create index if not exists idx_address_link_address
  on core.address_link (address_id);

create index if not exists idx_address_link_purpose
  on core.address_link (tenant_id, purpose);

create index if not exists idx_address_link_primary
  on core.address_link (tenant_id, owner_type, owner_id) where is_primary = true;

-- ============================================================================
-- CORE: Tenant Locale Policy (regional/locale configuration)
-- ============================================================================
create table if not exists core.tenant_locale_policy (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references core.tenant(id) on delete cascade,

  code                  text not null,
  name                  text,

  -- Language/regional defaults
  default_locale        text not null default 'en-US',
  default_timezone      text not null default 'UTC',
  default_currency      text not null default 'USD',
  default_date_format   text not null default 'MM/dd/yyyy',
  default_time_format   text not null default 'hh:mm:ss a',
  default_decimal_sep   text not null default '.',
  default_thousands_sep text not null default ',',

  -- Compliance/regulatory
  data_residency        text,
  language_requirements text[],

  -- Contact/communication
  phone_format_hint     text,
  postal_code_pattern   text,

  metadata              jsonb,

  created_at            timestamptz not null default now(),
  created_by            text not null,
  updated_at            timestamptz,
  updated_by            text,

  constraint tenant_locale_policy_tenant_code_uniq unique (tenant_id, code)
);

comment on table core.tenant_locale_policy is
'Tenant-specific locale, regional, and compliance policies.';

comment on column core.tenant_locale_policy.data_residency is
'e.g., EU, US, APAC for GDPR/data sovereignty compliance.';

create index if not exists idx_tenant_locale_policy_tenant
  on core.tenant_locale_policy (tenant_id);

create index if not exists idx_tenant_locale_policy_code
  on core.tenant_locale_policy (tenant_id, code);

-- ============================================================================
-- CORE: Tenant Locale Assignment (principal-specific locale override)
-- ============================================================================
create table if not exists core.principal_locale_override (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references core.tenant(id) on delete cascade,
  principal_id               uuid not null,  -- FK to core.principal added below (IAM section)

  preferred_locale           text not null,
  preferred_timezone         text not null,
  preferred_currency         text,
  preferred_date_format      text,
  preferred_time_format      text,

  created_at                 timestamptz not null default now(),
  created_by                 text not null,
  updated_at                 timestamptz,
  updated_by                 text,

  constraint principal_locale_override_principal_uniq unique (principal_id)
);

comment on table core.principal_locale_override is
'Per-principal locale/timezone/currency preferences (overrides tenant policy).';

create index if not exists idx_principal_locale_override_principal
  on core.principal_locale_override (principal_id);

-- ============================================================================
-- CORE: Entity Tag (flexible entity tagging)
-- ============================================================================
create table if not exists core.entity_tag (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  entity_type  text not null,
  entity_id    uuid not null,

  tag_key      text not null,
  tag_value    text,

  created_at   timestamptz not null default now(),
  created_by   text not null,

  constraint entity_tag_entity_tag_uniq unique (entity_type, entity_id, tag_key)
);

comment on table core.entity_tag is 'Generic entity tagging (key-value metadata).';

create index if not exists idx_entity_tag_entity
  on core.entity_tag (tenant_id, entity_type, entity_id);

create index if not exists idx_entity_tag_key_value
  on core.entity_tag (tenant_id, tag_key, tag_value);

-- ============================================================================
-- CORE: System Configuration (key-value configuration store)
-- ============================================================================
create table if not exists core.system_config (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references core.tenant(id) on delete cascade,

  config_key    text not null,
  config_value  text not null,
  config_type   text not null default 'string',
  description   text,

  is_encrypted  boolean not null default false,
  is_global     boolean not null default false,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint system_config_type_chk check (
    config_type in ('string', 'integer', 'boolean', 'json', 'secret')
  )
);

-- Functional unique index: one key per tenant (NULL tenant coalesced to sentinel)
create unique index if not exists idx_system_config_key_uniq
  on core.system_config (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), config_key);

comment on table core.system_config is
'Tenant-scoped or global configuration key-value store.';

create index if not exists idx_system_config_tenant_key
  on core.system_config (tenant_id, config_key);

create index if not exists idx_system_config_global
  on core.system_config (config_key) where is_global = true;

-- ============================================================================
-- CORE: Feature Flag (runtime feature toggles)
-- ============================================================================
create table if not exists core.feature_flag (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  flag_key      text not null,
  flag_name     text,
  description   text,

  is_enabled    boolean not null default false,
  enabled_at    timestamptz,
  disabled_at   timestamptz,

  rollout_pct   int default 100,

  config        jsonb,
  metadata      jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint feature_flag_tenant_key_uniq unique (tenant_id, flag_key),
  constraint feature_flag_rollout_pct_chk check (rollout_pct >= 0 and rollout_pct <= 100)
);

comment on table core.feature_flag is 'Feature toggles with rollout percentage.';

create index if not exists idx_feature_flag_tenant_enabled
  on core.feature_flag (tenant_id, is_enabled);

-- ============================================================================
-- CORE/IAM: Principal (user, service, identity, group)
-- ============================================================================
create table if not exists core.principal (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenant(id) on delete cascade,

  realm_key         text not null default 'athyper',
  principal_type    text not null,
  principal_code    text not null unique,
  display_name      text,
  email             text,
  phone             text,
  given_name        text,
  family_name       text,
  preferred_name    text,

  external_id       text,
  subject_id        text,

  is_active         boolean not null default true,
  is_service_account boolean not null default false,
  is_locked         boolean not null default false,

  password_hash     text,
  password_updated_at timestamptz,
  last_login_at     timestamptz,
  last_login_ip     text,

  idp_display_name  text,
  idp_family_name   text,
  idp_given_name    text,
  idp_email         text,
  idp_email_verified boolean,
  idp_phone_number  text,
  idp_phone_verified boolean,
  idp_picture       text,
  idp_locale        text,
  idp_timezone      text,

  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz,
  updated_by        text,

  constraint principal_type_chk check (principal_type in ('user','service','identity','group')),
  constraint principal_tenant_external_uniq unique (tenant_id, external_id) deferrable
);

comment on table core.principal is 'Unified principal registry (users, services, identities, groups).';
comment on column core.principal.principal_type is 'One of: user, service, identity, group.';
comment on column core.principal.principal_code is 'Unique business code (e.g., demomalaysia_viewer).';
comment on column core.principal.external_id is 'External ID from IDP (Keycloak subject).';
comment on column core.principal.subject_id is 'OIDC subject claim (immutable).';

create index if not exists idx_principal_tenant_type
  on core.principal (tenant_id, principal_type);

create index if not exists idx_principal_email
  on core.principal (tenant_id, email);

create index if not exists idx_principal_code
  on core.principal (principal_code);

create index if not exists idx_principal_active
  on core.principal (tenant_id, is_active) where is_active = true;

create index if not exists idx_principal_external_id
  on core.principal (tenant_id, external_id);

-- ============================================================================
-- CORE/IAM: IDP Identity (OAuth/OIDC provider record)
-- ============================================================================
create table if not exists core.idp_identity (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references core.tenant(id) on delete cascade,
  principal_id       uuid not null references core.principal(id) on delete cascade,

  idp_name           text not null,
  idp_subject        text not null,

  access_token       text,
  access_token_expires_at timestamptz,
  refresh_token      text,
  refresh_token_expires_at timestamptz,

  id_token           text,
  id_token_expires_at timestamptz,

  token_type         text,
  scope              text,

  last_refreshed_at  timestamptz,
  last_authenticated_at timestamptz,

  raw_claims         jsonb,

  created_at         timestamptz not null default now(),
  created_by         text not null,
  updated_at         timestamptz,
  updated_by         text,

  constraint idp_identity_tenant_idp_subject_uniq unique (tenant_id, idp_name, idp_subject) deferrable
);

comment on table core.idp_identity is 'OAuth/OIDC provider identity link (tokens, claims).';

create index if not exists idx_idp_identity_principal
  on core.idp_identity (tenant_id, principal_id);

create index if not exists idx_idp_identity_idp_subject
  on core.idp_identity (tenant_id, idp_name, idp_subject);

-- ============================================================================
-- CORE/IAM: Principal Profile (merged from principal table above)
-- Keycloak-synced attributes
-- ============================================================================
create table if not exists core.principal_profile (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references core.tenant(id) on delete cascade,
  principal_id       uuid not null references core.principal(id) on delete cascade,

  -- Personal info
  first_name         text,
  last_name          text,
  locale             text,
  timezone           text,

  -- Keycloak source
  keycloak_id        text,
  keycloak_created_at_millis bigint,
  keycloak_federation_link text,

  -- Custom attributes
  attributes         jsonb,

  -- Keycloak singletons
  enabled_date       timestamptz,
  disabled_date      timestamptz,

  created_at         timestamptz not null default now(),
  created_by         text not null,
  updated_at         timestamptz,
  updated_by         text,

  constraint principal_profile_principal_uniq unique (principal_id)
);

comment on table core.principal_profile is 'Extended profile attributes for principals (personal info + Keycloak sync).';

create index if not exists idx_principal_profile_tenant
  on core.principal_profile (tenant_id);

create index if not exists idx_principal_profile_keycloak_id
  on core.principal_profile (tenant_id, keycloak_id);

-- ============================================================================
-- CORE/IAM: Tenant Profile (regional/business configuration per tenant)
-- ============================================================================
create table if not exists core.tenant_profile (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null unique references core.tenant(id) on delete cascade,

  country                text,
  currency               text,
  locale                 text,
  timezone               text,
  fiscal_year_start_month int,

  metadata               jsonb,

  created_at             timestamptz not null default now(),
  created_by             text not null,
  updated_at             timestamptz,
  updated_by             text
);

comment on table core.tenant_profile is
'Tenant-specific regional/business configuration (country, currency, fiscal year, etc.).';

create index if not exists idx_tenant_profile_tenant
  on core.tenant_profile (tenant_id);

-- ============================================================================
-- CORE/IAM: Group
-- ============================================================================
create table if not exists core.principal_group (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  description  text,
  metadata     jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null,
  updated_at   timestamptz,
  updated_by   text,

  constraint principal_group_tenant_code_uniq unique (tenant_id, code)
);

comment on table core.principal_group is 'Principal groups (for bulk assignment).';

create index if not exists idx_principal_group_tenant
  on core.principal_group (tenant_id);

-- ============================================================================
-- CORE/IAM: Group Membership
-- ============================================================================
create table if not exists core.group_member (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,
  group_id     uuid not null references core.principal_group(id) on delete cascade,
  principal_id uuid not null references core.principal(id) on delete cascade,

  joined_at    timestamptz not null default now(),

  constraint group_member_gp_princ_uniq unique (group_id, principal_id)
);

comment on table core.group_member is 'Group membership records.';

create index if not exists idx_group_member_principal
  on core.group_member (tenant_id, principal_id);

-- ============================================================================
-- CORE/IAM: Role
-- ============================================================================
create table if not exists core.role (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,

  code         text not null,
  name         text not null,
  description  text,
  category     text,
  metadata     jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null,
  updated_at   timestamptz,
  updated_by   text,

  constraint role_tenant_code_uniq unique (tenant_id, code)
);

comment on table core.role is 'Roles (for assignment to principals).';

create index if not exists idx_role_tenant
  on core.role (tenant_id);

create index if not exists idx_role_category
  on core.role (tenant_id, category);

-- ============================================================================
-- CORE/IAM: Principal Role Assignment
-- ============================================================================
create table if not exists core.principal_role (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,
  principal_id uuid not null references core.principal(id) on delete cascade,
  role_id      uuid not null references core.role(id) on delete cascade,

  assigned_at  timestamptz not null default now(),
  assigned_by  text,
  expires_at   timestamptz,

  constraint principal_role_principal_role_uniq unique (principal_id, role_id)
);

comment on table core.principal_role is 'Principal-to-role assignments.';

create index if not exists idx_principal_role_principal
  on core.principal_role (tenant_id, principal_id);

create index if not exists idx_principal_role_role
  on core.principal_role (tenant_id, role_id);

create index if not exists idx_principal_role_expires
  on core.principal_role (expires_at)
  where expires_at is not null;

-- ============================================================================
-- CORE/IAM: Organizational Unit (hierarchy support)
-- ============================================================================
create table if not exists core.organizational_unit (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  code          text not null,
  name          text not null,
  description   text,
  parent_id     uuid references core.organizational_unit(id) on delete set null,

  metadata      jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz,
  updated_by    text,

  constraint organizational_unit_tenant_code_uniq unique (tenant_id, code)
);

comment on table core.organizational_unit is 'Hierarchical organizational units.';

create index if not exists idx_ou_tenant
  on core.organizational_unit (tenant_id);

create index if not exists idx_ou_parent
  on core.organizational_unit (parent_id);

-- ============================================================================
-- CORE/IAM: Principal OU Assignment
-- ============================================================================
create table if not exists core.principal_ou (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,
  principal_id  uuid not null references core.principal(id) on delete cascade,
  ou_id         uuid not null references core.organizational_unit(id) on delete cascade,

  assigned_at   timestamptz not null default now(),
  assigned_by   text,

  constraint principal_ou_principal_ou_uniq unique (principal_id, ou_id)
);

comment on table core.principal_ou is 'Principal assignment to organizational units.';

create index if not exists idx_principal_ou_principal
  on core.principal_ou (tenant_id, principal_id);

create index if not exists idx_principal_ou_ou
  on core.principal_ou (tenant_id, ou_id);

-- ============================================================================
-- CORE/IAM: Entitlement (capability grant)
-- ============================================================================
create table if not exists core.entitlement (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenant(id) on delete cascade,

  principal_id  uuid references core.principal(id) on delete cascade,
  role_id       uuid references core.role(id) on delete cascade,
  group_id      uuid references core.principal_group(id) on delete cascade,

  capability    text not null,
  resource_type text,
  resource_id   text,

  effect        text not null default 'allow',
  granted_at    timestamptz not null default now(),
  granted_by    text,
  expires_at    timestamptz,

  metadata      jsonb,

  constraint entitlement_effect_chk check (effect in ('allow','deny')),
  constraint entitlement_has_grantee check (
    (principal_id is not null)::int
    + (role_id is not null)::int
    + (group_id is not null)::int
    = 1
  )
);

comment on table core.entitlement is 'Direct capability grants (principal, role, or group).';

create index if not exists idx_entitlement_principal
  on core.entitlement (tenant_id, principal_id);

create index if not exists idx_entitlement_role
  on core.entitlement (tenant_id, role_id);

create index if not exists idx_entitlement_group
  on core.entitlement (tenant_id, group_id);

create index if not exists idx_entitlement_capability
  on core.entitlement (tenant_id, capability);

create index if not exists idx_entitlement_expires
  on core.entitlement (expires_at)
  where expires_at is not null;

-- ============================================================================
-- CORE/IAM: Operation Category (system-wide operation classification)
-- ============================================================================
create table if not exists core.operation_category (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,
  sort_order   int not null default 0,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'system',
  updated_at   timestamptz,
  updated_by   text
);

comment on table core.operation_category is
'System-wide operation categories (entity, workflow, utilities, etc.).';

create index if not exists idx_operation_category_sort
  on core.operation_category (sort_order);

-- ============================================================================
-- CORE/IAM: Operation (atomic permission action — system-wide)
-- ============================================================================
create table if not exists core.operation (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid not null references core.operation_category(id) on delete cascade,

  code               text not null,
  name               text not null,
  description        text,

  requires_record    boolean not null default false,
  requires_ownership boolean not null default false,
  sort_order         int not null default 0,

  created_at         timestamptz not null default now(),
  created_by         text not null default 'system',
  updated_at         timestamptz,
  updated_by         text,

  constraint operation_category_code_uniq unique (category_id, code)
);

comment on table core.operation is
'Atomic permission actions (create, read, update, delete, etc.).';

create index if not exists idx_operation_category
  on core.operation (category_id);

create index if not exists idx_operation_code
  on core.operation (code);

-- Global uniqueness: operation codes are unique across all categories.
-- Enables meta.entity_operation to reference operation_code as a text FK.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operation_code_global_uniq') THEN
    ALTER TABLE core.operation ADD CONSTRAINT operation_code_global_uniq UNIQUE (code);
  END IF;
END $$;

-- ============================================================================
-- CORE/IAM: Persona (permission bundle — system-wide)
-- ============================================================================
create table if not exists core.persona (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,

  scope_mode   text not null default 'tenant',
  priority     int not null default 0,
  is_system    boolean not null default false,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'system',
  updated_at   timestamptz,
  updated_by   text,

  constraint persona_scope_mode_chk check (scope_mode in ('tenant','ou','module'))
);

comment on table core.persona is
'Permission bundling/specialization (viewer, agent, manager, admin, etc.).';

create index if not exists idx_persona_scope_mode
  on core.persona (scope_mode);

create index if not exists idx_persona_system
  on core.persona (is_system) where is_system = true;

-- Defense-in-depth: prevent modification or deletion of system personas.
-- Application layer already blocks these via API-level 403 checks;
-- this trigger protects against direct SQL bypass.
create or replace function core.trg_protect_system_persona()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system = true then
      raise exception 'Cannot delete system persona: %', old.code
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_system = true then
      -- Allow updating description and name (cosmetic), block structural changes
      if old.code       is distinct from new.code
      or old.scope_mode is distinct from new.scope_mode
      or old.priority   is distinct from new.priority
      or old.is_system  is distinct from new.is_system then
        raise exception 'Cannot modify structural fields of system persona: %', old.code
          using errcode = 'restrict_violation';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists protect_system_persona on core.persona;
create trigger protect_system_persona
  before update or delete on core.persona
  for each row execute function core.trg_protect_system_persona();

-- ============================================================================
-- CORE/IAM: Persona Capability (persona -> operation grant)
-- ============================================================================
create table if not exists core.persona_capability (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references core.persona(id) on delete cascade,
  operation_id    uuid not null references core.operation(id) on delete cascade,

  is_granted      boolean not null default true,
  constraint_type text not null default 'none',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  constraint persona_capability_persona_op_uniq unique (persona_id, operation_id)
);

comment on table core.persona_capability is
'Persona-to-operation capability mapping with constraint type.';

create index if not exists idx_persona_capability_persona
  on core.persona_capability (persona_id);

create index if not exists idx_persona_capability_operation
  on core.persona_capability (operation_id);

-- ============================================================================
-- CORE/IAM: Module (logical feature grouping — system-wide)
-- ============================================================================
create table if not exists core.module (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,

  workspace_id uuid,  -- FK to core.workspace added at end of file

  config       jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'system',
  updated_at   timestamptz,
  updated_by   text
);

comment on table core.module is
'Logical feature/permission modules (billing, analytics, etc.).';

comment on column core.module.workspace_id is
'FK to core.workspace — constraint added at end of file.';

create index if not exists idx_module_code
  on core.module (code);

create index if not exists idx_module_workspace
  on core.module (workspace_id) where workspace_id is not null;

-- ============================================================================
-- CORE/IAM: Tenant Module Subscription (tenant -> module activation)
-- ============================================================================
create table if not exists core.tenant_module_subscription (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenant(id) on delete cascade,
  module_id    uuid not null references core.module(id) on delete cascade,

  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'system',
  updated_at   timestamptz,
  updated_by   text,

  constraint tenant_module_subscription_uniq unique (tenant_id, module_id)
);

comment on table core.tenant_module_subscription is
'Tenant-to-module activation/subscription mapping.';

create index if not exists idx_tenant_module_sub_tenant
  on core.tenant_module_subscription (tenant_id);

create index if not exists idx_tenant_module_sub_module
  on core.tenant_module_subscription (module_id);

create index if not exists idx_tenant_module_sub_active
  on core.tenant_module_subscription (tenant_id, is_active) where is_active = true;

-- ============================================================================
-- Deferred FKs (tables defined earlier referencing IAM tables defined above)
-- ============================================================================

-- core.principal_workspace_access → core.principal, core.role, core.persona
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pwa_principal_fk') then
    alter table core.principal_workspace_access
      add constraint pwa_principal_fk
      foreign key (principal_id) references core.principal(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pwa_role_fk') then
    alter table core.principal_workspace_access
      add constraint pwa_role_fk
      foreign key (role_id) references core.role(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pwa_persona_fk') then
    alter table core.principal_workspace_access
      add constraint pwa_persona_fk
      foreign key (persona_id) references core.persona(id) on delete set null;
  end if;
end $$;

-- core.principal_locale_override → core.principal
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plo_principal_fk') then
    alter table core.principal_locale_override
      add constraint plo_principal_fk
      foreign key (principal_id) references core.principal(id) on delete cascade;
  end if;
end $$;

-- core.module → core.workspace
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'module_workspace_fk') then
    alter table core.module
      add constraint module_workspace_fk
      foreign key (workspace_id) references core.workspace(id) on delete set null;
  end if;
end $$;
