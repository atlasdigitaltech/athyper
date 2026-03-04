/* ============================================================================
   Athyper v2.1 — Envelope & Budget Engine
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.operating_unit
   ============================================================================ */

-- ============================================================================
-- fin.funding_profile — Funding Profile master (4-level hierarchy)
-- ============================================================================
create table if not exists fin.funding_profile (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    code            varchar(50) not null,
    name            varchar(200) not null,
    description     text,
    level           smallint not null
                    check (level between 1 and 4),
                    -- 1=Enterprise, 2=Division, 3=OU, 4=Intent
    parent_id       uuid references fin.funding_profile(id),
    ou_id           uuid references fin.operating_unit(id),
    intent_id       uuid references fin.business_intent(id),

    -- Amounts (MC-4: DECIMAL only, NO FLOAT)
    total_limit      decimal(18,4) not null,
    currency_code    varchar(3) not null references ref.currency(code),

    reserved_amount  decimal(18,4) not null default 0,
    committed_amount decimal(18,4) not null default 0,
    consumed_amount  decimal(18,4) not null default 0,
    released_amount  decimal(18,4) not null default 0,

    -- Health
    health_status   varchar(10) not null default 'GREEN'
                    check (health_status in ('GREEN','YELLOW','RED','BLACK')),
    utilization_pct decimal(5,2) not null default 0,
    trend           varchar(15) not null default 'STABLE'
                    check (trend in ('IMPROVING','STABLE','DETERIORATING')),
    predicted_exhaustion_date date,
    last_reforecast_at timestamptz,

    -- Multi-year
    fiscal_year     smallint not null,
    is_multi_year   boolean not null default false,
    carry_forward_rule varchar(10) not null default 'NONE'
                    check (carry_forward_rule in ('NONE','PARTIAL','FULL')),
    carry_forward_cap decimal(18,4),

    status          varchar(20) not null default 'ACTIVE'
                    check (status in ('DRAFT','ACTIVE','FROZEN','CLOSED')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_fp_code unique (tenant_id, entity_code, code, fiscal_year),
    constraint chk_fin_fp_reserved check (reserved_amount >= 0),
    constraint chk_fin_fp_committed check (committed_amount >= 0),
    constraint chk_fin_fp_consumed check (consumed_amount >= 0),
    constraint chk_fin_fp_released check (released_amount >= 0)
);

create index if not exists idx_fin_fp_tenant on fin.funding_profile(tenant_id);
create index if not exists idx_fin_fp_parent on fin.funding_profile(parent_id);
create index if not exists idx_fin_fp_ou on fin.funding_profile(ou_id);
create index if not exists idx_fin_fp_health on fin.funding_profile(tenant_id, health_status);
create index if not exists idx_fin_fp_entity_year on fin.funding_profile(tenant_id, entity_code, fiscal_year);

-- ============================================================================
-- fin.funding_transaction — Funding lifecycle events
-- ============================================================================
create table if not exists fin.funding_transaction (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    fp_id           uuid not null references fin.funding_profile(id),
    txn_id          uuid not null,
    action          varchar(20) not null
                    check (action in ('RESERVE','COMMIT','CONSUME','RELEASE')),
    amount          decimal(18,4) not null,
    currency_code   varchar(3) not null,
    previous_state  jsonb not null,
    resulting_state jsonb not null,
    reason          text,
    performed_by    uuid not null,
    performed_at    timestamptz not null default now(),
    expires_at      timestamptz,
    idempotency_key varchar(200),

    constraint uq_fin_ftxn_idempotency unique (idempotency_key)
);

create index if not exists idx_fin_ftxn_fp on fin.funding_transaction(fp_id);
create index if not exists idx_fin_ftxn_txn on fin.funding_transaction(txn_id);
create index if not exists idx_fin_ftxn_tenant on fin.funding_transaction(tenant_id);
create index if not exists idx_fin_ftxn_expires on fin.funding_transaction(expires_at)
    where expires_at is not null;

-- ============================================================================
-- fin.funding_transfer — Cross-FP fund transfers
-- ============================================================================
create table if not exists fin.funding_transfer (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    from_fp_id      uuid not null references fin.funding_profile(id),
    to_fp_id        uuid not null references fin.funding_profile(id),
    amount          decimal(18,4) not null,
    currency_code   varchar(3) not null,
    reason          text not null,
    status          varchar(20) not null default 'PENDING'
                    check (status in ('PENDING','APPROVED','REJECTED','COMPLETED')),
    approved_by     uuid,
    approved_at     timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_fxfer_from on fin.funding_transfer(from_fp_id);
create index if not exists idx_fin_fxfer_to on fin.funding_transfer(to_fp_id);
create index if not exists idx_fin_fxfer_tenant on fin.funding_transfer(tenant_id);
