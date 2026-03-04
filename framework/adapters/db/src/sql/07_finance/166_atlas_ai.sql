/* ============================================================================
   Athyper v2.1 — Atlas AI Engine
   Schema: fin
   Dependencies: core.tenant
   ============================================================================ */

-- ============================================================================
-- fin.ai_model_registry — Deployed ML model registry
-- ============================================================================
create table if not exists fin.ai_model_registry (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    model_code      varchar(50) not null,
    model_name      varchar(200) not null,
    model_version   varchar(20) not null,
    model_type      varchar(30) not null
                    check (model_type in ('CLASSIFICATION','REGRESSION','ANOMALY','RECOMMENDATION','NLP')),
    target_engine   varchar(50) not null,
    capability_level varchar(5) not null
                    check (capability_level in ('L1','L2','L3')),
    status          varchar(20) not null default 'TRAINING'
                    check (status in ('TRAINING','VALIDATING','DEPLOYED','DEPRECATED')),
    config          jsonb default '{}',
    performance_metrics jsonb default '{}',
    deployed_at     timestamptz,
    deployed_by     uuid,
    last_prediction_at timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_ai_model unique (tenant_id, model_code, model_version)
);

create index if not exists idx_fin_ai_model_tenant on fin.ai_model_registry(tenant_id);
create index if not exists idx_fin_ai_model_engine on fin.ai_model_registry(target_engine);
create index if not exists idx_fin_ai_model_status on fin.ai_model_registry(status);

-- ============================================================================
-- fin.ai_prediction — Prediction/recommendation log
-- ============================================================================
create table if not exists fin.ai_prediction (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    model_id        uuid not null references fin.ai_model_registry(id),
    txn_id          uuid,
    target_engine   varchar(50) not null,
    prediction_type varchar(30) not null
                    check (prediction_type in ('RECOMMENDATION','ANOMALY','CLASSIFICATION','FORECAST')),
    input_features  jsonb not null,
    output          jsonb not null,
    confidence      decimal(3,2) not null,
    reasoning_chain text not null,
    was_accepted    boolean,
    accepted_by     uuid,
    accepted_at     timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_ai_pred_tenant on fin.ai_prediction(tenant_id);
create index if not exists idx_fin_ai_pred_model on fin.ai_prediction(model_id);
create index if not exists idx_fin_ai_pred_txn on fin.ai_prediction(txn_id)
    where txn_id is not null;

-- ============================================================================
-- fin.ai_action — Autonomous action log (L3)
-- ============================================================================
create table if not exists fin.ai_action (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    model_id        uuid not null references fin.ai_model_registry(id),
    txn_id          uuid,
    target_engine   varchar(50) not null,
    action_type     varchar(50) not null,
    action_payload  jsonb not null,
    confidence      decimal(3,2) not null,
    reasoning_chain text not null,
    status          varchar(20) not null default 'PROPOSED'
                    check (status in ('PROPOSED','EXECUTED','REVERSED','REJECTED')),
    executed_at     timestamptz,
    reversal_window_expires_at timestamptz,
    reversed_at     timestamptz,
    reversed_by     uuid,
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_ai_action_tenant on fin.ai_action(tenant_id);
create index if not exists idx_fin_ai_action_status on fin.ai_action(status);
create index if not exists idx_fin_ai_action_reversal on fin.ai_action(reversal_window_expires_at)
    where status = 'EXECUTED';

-- ============================================================================
-- fin.ai_drift_monitor — Model bias/drift monitoring
-- ============================================================================
create table if not exists fin.ai_drift_monitor (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    model_id        uuid not null references fin.ai_model_registry(id),
    monitoring_date date not null,
    metric_name     varchar(50) not null,
    metric_value    decimal(10,6) not null,
    baseline_value  decimal(10,6) not null,
    drift_detected  boolean not null default false,
    alert_sent      boolean not null default false,
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_ai_drift_model on fin.ai_drift_monitor(model_id);
create index if not exists idx_fin_ai_drift_date on fin.ai_drift_monitor(monitoring_date);
