/* ============================================================================
   Athyper v2.1 — Event Store Engine
   Schema: evt
   Dependencies: core.tenant
   ============================================================================ */

-- ============================================================================
-- evt.event — Universal Event Store (partitioned by month on created_at)
-- ============================================================================
create table if not exists evt.event (
    id              uuid not null default gen_random_uuid(),
    event_type      varchar(100) not null,
    event_version   varchar(20) not null default 'v2.1',
    created_at      timestamptz not null default now(),
    source_engine   varchar(50) not null,

    -- Transaction Identity (MANDATORY)
    txn_id          uuid not null,
    doc_id          uuid not null,
    doc_type        varchar(20) not null
                    check (doc_type in ('PR','PO','INVOICE','PAYMENT','CREDIT','ACCRUAL','RECLASS','CONTRACT','GRN','JE','OTHER')),

    correlation_id  uuid not null,
    causation_id    uuid,

    actor_type      varchar(20) not null
                    check (actor_type in ('USER','SYSTEM','AI_AGENT','SCHEDULER')),
    actor_id        uuid not null,
    tenant_id       uuid not null,
    entity_code     varchar(20),
    ou_id           uuid,

    payload         jsonb not null default '{}',
    payload_hash    varchar(64) not null,
    metadata        jsonb default '{}',

    -- Partitioning
    partition_domain varchar(30) not null,
    partition_key   varchar(200) not null,
    sequence_no     bigint not null,

    -- Idempotency
    idempotency_key varchar(200),

    primary key (id, created_at)
) partition by range (created_at);

-- Create initial monthly partitions (current month + 3 ahead)
do $$
declare
    m_start date;
    m_end   date;
    p_name  text;
begin
    for i in 0..3 loop
        m_start := date_trunc('month', current_date) + (i || ' months')::interval;
        m_end   := m_start + '1 month'::interval;
        p_name  := 'evt_event_' || to_char(m_start, 'YYYY_MM');
        if not exists (
            select 1 from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'evt' and c.relname = p_name
        ) then
            execute format(
                'create table evt.%I partition of evt.event for values from (%L) to (%L)',
                p_name, m_start, m_end
            );
        end if;
    end loop;
end $$;

-- Indexes on the parent table (applied to all partitions)
create index if not exists idx_evt_event_tenant_partition
    on evt.event(tenant_id, partition_domain, partition_key, sequence_no);
create unique index if not exists uidx_evt_event_partition_seq
    on evt.event(tenant_id, partition_domain, partition_key, sequence_no, created_at);
create index if not exists idx_evt_event_txn
    on evt.event(tenant_id, txn_id);
create index if not exists idx_evt_event_type
    on evt.event(tenant_id, event_type);
create index if not exists idx_evt_event_correlation
    on evt.event(tenant_id, correlation_id);
create index if not exists idx_evt_event_doc
    on evt.event(tenant_id, doc_id);
create unique index if not exists uidx_evt_event_idempotency
    on evt.event(tenant_id, idempotency_key, created_at)
    where idempotency_key is not null;

-- Immutability trigger: prevent UPDATE/DELETE on events
create or replace function evt.prevent_event_mutation()
returns trigger as $$
begin
    raise exception 'Event store is append-only. UPDATE and DELETE are prohibited.';
end;
$$ language plpgsql;

-- Apply immutability trigger (only if not already exists)
do $$
begin
    if not exists (
        select 1 from pg_trigger where tgname = 'trg_evt_event_immutable'
    ) then
        create trigger trg_evt_event_immutable
            before update or delete on evt.event
            for each row execute function evt.prevent_event_mutation();
    end if;
end $$;

-- ============================================================================
-- evt.event_snapshot — Projection snapshots for rebuild
-- ============================================================================
create table if not exists evt.event_snapshot (
    id              uuid primary key default gen_random_uuid(),
    projection_id   varchar(100) not null,
    partition_domain varchar(30) not null,
    partition_key   varchar(200) not null,
    last_sequence_no bigint not null,
    state_checksum  varchar(64) not null,
    snapshot_data   jsonb not null,
    created_at      timestamptz not null default now(),
    tenant_id       uuid not null
);

create index if not exists idx_evt_snapshot_projection
    on evt.event_snapshot(tenant_id, projection_id, partition_domain, partition_key);

-- ============================================================================
-- evt.projection_registry — Formal projection registration
-- ============================================================================
create table if not exists evt.projection_registry (
    id                  uuid primary key default gen_random_uuid(),
    projection_id       varchar(100) not null,
    owning_engine       varchar(50) not null,
    projection_version  varchar(20) not null,
    source_event_types  text[] not null,
    partition_domains   text[] not null,
    checkpoint_strategy varchar(20) not null default 'SEQUENCE_NO',
    rebuild_strategy    varchar(30) not null default 'SNAPSHOT_AND_CATCHUP',
    snapshot_interval   integer,
    consistency_model   varchar(30) not null default 'BOUNDED_STALENESS',
    data_retention      varchar(50) not null default 'INHERIT_EVENT_STORE',
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    tenant_id           uuid not null,

    constraint uq_evt_projection_id unique (tenant_id, projection_id)
);

-- ============================================================================
-- evt.projection_checkpoint — Consumer checkpoints for resume/replay
-- ============================================================================
create table if not exists evt.projection_checkpoint (
    id              uuid primary key default gen_random_uuid(),
    projection_id   varchar(100) not null,
    partition_domain varchar(30) not null,
    partition_key   varchar(200) not null,
    last_event_id   uuid not null,
    last_sequence_no bigint not null,
    updated_at      timestamptz not null default now(),
    tenant_id       uuid not null,

    constraint uq_evt_checkpoint unique (tenant_id, projection_id, partition_domain, partition_key)
);

-- ============================================================================
-- evt.sequence_counter — Monotonic sequence generator per partition
-- ============================================================================
create table if not exists evt.sequence_counter (
    tenant_id       uuid not null,
    partition_domain varchar(30) not null,
    partition_key   varchar(200) not null,
    current_seq     bigint not null default 0,

    primary key (tenant_id, partition_domain, partition_key)
);

-- Function: atomic next-sequence (SELECT FOR UPDATE + increment)
create or replace function evt.next_sequence(
    p_tenant_id uuid,
    p_partition_domain varchar(30),
    p_partition_key varchar(200)
) returns bigint as $$
declare
    v_seq bigint;
begin
    insert into evt.sequence_counter (tenant_id, partition_domain, partition_key, current_seq)
    values (p_tenant_id, p_partition_domain, p_partition_key, 1)
    on conflict (tenant_id, partition_domain, partition_key)
    do update set current_seq = evt.sequence_counter.current_seq + 1
    returning current_seq into v_seq;

    return v_seq;
end;
$$ language plpgsql;
