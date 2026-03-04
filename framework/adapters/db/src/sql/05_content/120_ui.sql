/* ============================================================================
   Athyper — UI Schema
   Preferences: User Preferences
   Views: Saved Views, Dashboard Widgets
   Activity: Recent Activity, Search History

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- UI: User Preference (generic key-value preferences)
-- ============================================================================
create table if not exists ui.user_preference (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  preference_key text not null,
  preference_value jsonb not null,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text,

  constraint user_preference_principal_key_uniq unique (principal_id, preference_key)
);

comment on table ui.user_preference is 'Generic user preference storage (theme, layout, etc.).';

create index if not exists idx_user_preference_principal
  on ui.user_preference (principal_id);

-- ============================================================================
-- UI: Saved View (saved list/grid view configurations with scoped access)
-- ============================================================================
drop table if exists ui.saved_view cascade;

create table if not exists ui.saved_view (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  entity_key      text not null,                -- e.g. "batches", "documents"
  scope           text not null default 'USER'
                    constraint saved_view_scope_chk
                    check (scope in ('SYSTEM', 'USER', 'SHARED')),
  owner_user_id   uuid references core.principal(id) on delete cascade,

  name            text not null,
  is_pinned       boolean not null default false,
  is_default      boolean not null default false,

  state_json      jsonb not null,               -- full ViewPreset payload
  state_hash      text not null,                -- truncated SHA-256 for dirty detection

  version         int not null default 1,       -- optimistic concurrency

  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz,
  updated_by      text,
  deleted_at      timestamptz,                  -- soft delete

  constraint saved_view_entity_name_scope_uniq
    unique nulls not distinct (tenant_id, entity_key, scope, owner_user_id, name)
);

comment on table ui.saved_view is 'Saved list/grid view configurations (view mode, filters, sorts, columns, density).';

create index if not exists idx_saved_view_list
  on ui.saved_view (tenant_id, entity_key) where deleted_at is null;

create index if not exists idx_saved_view_user
  on ui.saved_view (tenant_id, owner_user_id, entity_key)
  where deleted_at is null and scope = 'USER';

-- ============================================================================
-- UI: Dashboard Widget (per-user dashboard layout)
-- ============================================================================
create table if not exists ui.dashboard_widget (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  widget_type    text not null,
  widget_name    text,
  description    text,

  position       jsonb not null default '{"x": 0, "y": 0, "w": 4, "h": 3}',

  config         jsonb,
  data_source    jsonb,

  is_visible     boolean not null default true,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text
);

comment on table ui.dashboard_widget is 'Per-user dashboard widget configurations.';

create index if not exists idx_dashboard_widget_principal
  on ui.dashboard_widget (principal_id);

create index if not exists idx_dashboard_widget_type
  on ui.dashboard_widget (widget_type);

-- ============================================================================
-- UI: Recent Activity (quick access to recently viewed entities)
-- ============================================================================
create table if not exists ui.recent_activity (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  entity_type    text not null,
  entity_id      uuid not null,
  entity_name    text,

  action         text not null default 'view',
  accessed_at    timestamptz not null default now(),

  metadata       jsonb,

  created_at     timestamptz not null default now()
);

comment on table ui.recent_activity is 'Recently accessed entities per user.';

create index if not exists idx_recent_activity_principal_time
  on ui.recent_activity (principal_id, accessed_at desc);

create index if not exists idx_recent_activity_entity
  on ui.recent_activity (tenant_id, entity_type, entity_id);

-- ============================================================================
-- UI: Search History (user search tracking)
-- ============================================================================
create table if not exists ui.search_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  query_text     text not null,
  entity_type    text,
  result_count   int,

  searched_at    timestamptz not null default now(),

  created_at     timestamptz not null default now()
);

comment on table ui.search_history is 'User search history for autocomplete and analytics.';

create index if not exists idx_search_history_principal_time
  on ui.search_history (principal_id, searched_at desc);
