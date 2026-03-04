/* ============================================================================
   Athyper v2.1 — Production / WIP Engine
   Schema: fin
   Dependencies: core.tenant, ent.product, ref.uom,
                 fin.journal_entry, fin.item_master, fin.warehouse,
                 fin.inventory_movement
   ============================================================================ */

-- ============================================================================
-- fin.bill_of_materials — BOM definitions (multi-level recursive)
-- ============================================================================
create table if not exists fin.bill_of_materials (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    product_id      uuid not null references ent.product(id),
    version         integer not null default 1,
    status          varchar(20) not null default 'DRAFT'
                    check (status in ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from  date,
    effective_to    date,

    constraint uq_fin_bom unique (tenant_id, entity_code, product_id, version)
);

create index if not exists idx_fin_bom_product on fin.bill_of_materials(product_id);
create index if not exists idx_fin_bom_tenant on fin.bill_of_materials(tenant_id);

-- ============================================================================
-- fin.bom_line — BOM components
-- ============================================================================
create table if not exists fin.bom_line (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    bom_id          uuid not null references fin.bill_of_materials(id) on delete cascade,
    line_no         smallint not null,
    component_product_id uuid not null references ent.product(id),
    quantity_per    decimal(18,6) not null,
    uom_code        varchar(10),
    scrap_pct       decimal(5,2) not null default 0,
    is_phantom      boolean not null default false,

    constraint uq_fin_bom_line unique (tenant_id, bom_id, line_no)
);

create index if not exists idx_fin_bom_line_bom on fin.bom_line(bom_id);

-- ============================================================================
-- fin.routing — Manufacturing routing (operations)
-- ============================================================================
create table if not exists fin.routing (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    product_id      uuid not null references ent.product(id),
    operation_seq   smallint not null,
    operation_name  varchar(200) not null,
    work_center     varchar(50),
    setup_time_hours decimal(8,2),
    run_time_hours  decimal(8,2),
    labor_rate      decimal(18,4),
    overhead_rate   decimal(18,4),
    currency_code   varchar(3),

    constraint uq_fin_routing unique (tenant_id, entity_code, product_id, operation_seq)
);

create index if not exists idx_fin_routing_product on fin.routing(product_id);

-- ============================================================================
-- fin.work_order — Production work orders
-- ============================================================================
create table if not exists fin.work_order (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    wo_number       varchar(50) not null,
    product_id      uuid not null references ent.product(id),
    bom_id          uuid references fin.bill_of_materials(id),
    planned_qty     decimal(18,4) not null,
    completed_qty   decimal(18,4) not null default 0,
    uom_code        varchar(10),
    status          varchar(20) not null default 'PLANNED'
                    check (status in ('PLANNED','RELEASED','IN_PROGRESS','COMPLETED','CLOSED')),
    planned_start   date,
    planned_end     date,
    actual_start    date,
    actual_end      date,
    ou_id           uuid,
    cost_center_id  uuid,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_wo_number unique (tenant_id, entity_code, wo_number)
);

create index if not exists idx_fin_wo_tenant on fin.work_order(tenant_id);
create index if not exists idx_fin_wo_product on fin.work_order(product_id);
create index if not exists idx_fin_wo_status on fin.work_order(status);

-- ============================================================================
-- fin.work_order_cost — WIP cost accumulation
-- ============================================================================
create table if not exists fin.work_order_cost (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    work_order_id   uuid not null references fin.work_order(id) on delete cascade,
    cost_type       varchar(20) not null
                    check (cost_type in ('MATERIAL','LABOR','OVERHEAD')),
    planned_amount  decimal(18,4) not null,
    actual_amount   decimal(18,4) not null default 0,
    variance        decimal(18,4) generated always as (actual_amount - planned_amount) stored,
    currency_code   varchar(3) not null,
    reference_je_id uuid              -- FK added in 190_posting.sql (forward dependency)
);

create index if not exists idx_fin_wo_cost_wo on fin.work_order_cost(work_order_id);

-- ============================================================================
-- fin.work_order_material_issue — Material consumption
-- ============================================================================
create table if not exists fin.work_order_material_issue (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    work_order_id   uuid not null references fin.work_order(id),
    item_id         uuid not null,
    warehouse_id    uuid not null,
    planned_qty     decimal(18,4) not null,
    issued_qty      decimal(18,4) not null default 0,
    unit_cost       decimal(18,4),
    total_cost      decimal(18,4),
    movement_id     uuid,
    issued_at       timestamptz
);

create index if not exists idx_fin_wo_mat_wo on fin.work_order_material_issue(work_order_id);

-- ============================================================================
-- fin.production_variance — Variance analysis at WO close
-- ============================================================================
create table if not exists fin.production_variance (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    work_order_id   uuid not null references fin.work_order(id),
    variance_type   varchar(30) not null
                    check (variance_type in ('PRICE','USAGE','RATE','EFFICIENCY','VOLUME')),
    cost_type       varchar(20) not null
                    check (cost_type in ('MATERIAL','LABOR','OVERHEAD')),
    standard_amount decimal(18,4) not null,
    actual_amount   decimal(18,4) not null,
    variance_amount decimal(18,4) not null,
    reference_je_id uuid,           -- FK added in 190_posting.sql (forward dependency)
    analyzed_at     timestamptz not null default now()
);

create index if not exists idx_fin_prod_var_wo on fin.production_variance(work_order_id);
