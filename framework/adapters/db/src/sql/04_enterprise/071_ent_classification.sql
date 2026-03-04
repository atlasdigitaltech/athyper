/* ============================================================================
   Athyper v2.1 -- Classification Infrastructure
   Schema: ent
   Dependencies: ref.commodity_domain, ref.commodity_code,
                 ref.industry_domain, ref.industry_code,
                 ent.product_category, core.tenant, ref.currency

   Purpose: Cross-domain taxonomy translation (crosswalks), tenant classification
   configuration, and AI-assisted classification with feedback loop.
   ============================================================================ */

-- ============================================================================
-- ent.commodity_crosswalk -- Rosetta Stone between commodity domains
-- Maps UNSPSC <-> HS <-> customer custom codes with confidence + provenance
-- ============================================================================
create table if not exists ent.commodity_crosswalk (
    id                   uuid primary key default gen_random_uuid(),
    source_domain_code   text not null references ref.commodity_domain(code),
    source_code          text not null,
    target_domain_code   text not null references ref.commodity_domain(code),
    target_code          text not null,

    -- Mapping semantics (SKOS-aligned)
    mapping_type         text not null
                         check (mapping_type in ('EXACT','BROAD','NARROW','PARTIAL','RELATED')),
    confidence           decimal(5,2)
                         check (confidence is null or (confidence >= 0 and confidence <= 100)),
    provenance           text not null default 'MANUAL'
                         check (provenance in ('OFFICIAL','AI_GENERATED','AI_VERIFIED','MANUAL','IMPORTED')),

    -- Verification
    verified             boolean not null default false,
    verified_by          text,
    verified_at          timestamptz,

    notes                text,
    metadata             jsonb not null default '{}'::jsonb,

    created_at           timestamptz not null default now(),
    created_by           text not null default 'seed',
    updated_at           timestamptz,
    updated_by           text,

    constraint uq_ent_commodity_xwalk
        unique (source_domain_code, source_code, target_domain_code, target_code),
    constraint fk_ent_commodity_xwalk_source
        foreign key (source_domain_code, source_code)
        references ref.commodity_code(domain_code, code),
    constraint fk_ent_commodity_xwalk_target
        foreign key (target_domain_code, target_code)
        references ref.commodity_code(domain_code, code)
);

comment on table ent.commodity_crosswalk is 'Cross-domain commodity code mappings (UNSPSC/HS/custom) with confidence scoring.';

create index if not exists idx_ent_cxwalk_source
    on ent.commodity_crosswalk(source_domain_code, source_code);
create index if not exists idx_ent_cxwalk_target
    on ent.commodity_crosswalk(target_domain_code, target_code);
create index if not exists idx_ent_cxwalk_confidence
    on ent.commodity_crosswalk(confidence) where verified = false;

-- ============================================================================
-- ent.industry_crosswalk -- Rosetta Stone between industry domains
-- Maps ISIC <-> NAICS <-> custom industry codes
-- ============================================================================
create table if not exists ent.industry_crosswalk (
    id                   uuid primary key default gen_random_uuid(),
    source_domain_code   text not null references ref.industry_domain(code),
    source_code          text not null,
    target_domain_code   text not null references ref.industry_domain(code),
    target_code          text not null,

    mapping_type         text not null
                         check (mapping_type in ('EXACT','BROAD','NARROW','PARTIAL','RELATED')),
    confidence           decimal(5,2)
                         check (confidence is null or (confidence >= 0 and confidence <= 100)),
    provenance           text not null default 'MANUAL'
                         check (provenance in ('OFFICIAL','AI_GENERATED','AI_VERIFIED','MANUAL','IMPORTED')),

    verified             boolean not null default false,
    verified_by          text,
    verified_at          timestamptz,

    notes                text,
    metadata             jsonb not null default '{}'::jsonb,

    created_at           timestamptz not null default now(),
    created_by           text not null default 'seed',
    updated_at           timestamptz,
    updated_by           text,

    constraint uq_ent_industry_xwalk
        unique (source_domain_code, source_code, target_domain_code, target_code),
    constraint fk_ent_industry_xwalk_source
        foreign key (source_domain_code, source_code)
        references ref.industry_code(domain_code, code),
    constraint fk_ent_industry_xwalk_target
        foreign key (target_domain_code, target_code)
        references ref.industry_code(domain_code, code)
);

comment on table ent.industry_crosswalk is 'Cross-domain industry code mappings (ISIC/NAICS/custom) with confidence scoring.';

create index if not exists idx_ent_ixwalk_source
    on ent.industry_crosswalk(source_domain_code, source_code);
create index if not exists idx_ent_ixwalk_target
    on ent.industry_crosswalk(target_domain_code, target_code);

-- ============================================================================
-- ent.category_commodity_map -- Bridges tenant product_category to standard codes
-- Enables: customer uploads custom taxonomy -> AI maps to UNSPSC/HS
-- ============================================================================
create table if not exists ent.category_commodity_map (
    id                    uuid primary key default gen_random_uuid(),
    tenant_id             uuid not null references core.tenant(id) on delete cascade,
    category_id           uuid not null references ent.product_category(id) on delete cascade,
    commodity_domain_code text not null,
    commodity_code        text not null,

    mapping_type          text not null default 'EXACT'
                          check (mapping_type in ('EXACT','BROAD','NARROW','PARTIAL')),
    confidence            decimal(5,2)
                          check (confidence is null or (confidence >= 0 and confidence <= 100)),
    provenance            text not null default 'MANUAL'
                          check (provenance in ('OFFICIAL','AI_GENERATED','AI_VERIFIED','MANUAL','IMPORTED')),
    is_primary            boolean not null default false,

    metadata              jsonb not null default '{}'::jsonb,

    created_at            timestamptz not null default now(),
    created_by            text not null default 'seed',
    updated_at            timestamptz,
    updated_by            text,

    constraint uq_ent_cat_commodity
        unique (tenant_id, category_id, commodity_domain_code, commodity_code),
    constraint fk_ent_cat_commodity_code
        foreign key (commodity_domain_code, commodity_code)
        references ref.commodity_code(domain_code, code)
);

comment on table ent.category_commodity_map is 'Maps tenant product categories to standard commodity codes (UNSPSC/HS).';

create index if not exists idx_ent_cat_commodity_tenant
    on ent.category_commodity_map(tenant_id);
create index if not exists idx_ent_cat_commodity_category
    on ent.category_commodity_map(category_id);
create index if not exists idx_ent_cat_commodity_code
    on ent.category_commodity_map(commodity_domain_code, commodity_code);

-- ============================================================================
-- ent.classification_config -- Per-tenant classification preferences + policies
-- Controls: which domains used, when classification mandatory, AI settings
-- ============================================================================
create table if not exists ent.classification_config (
    tenant_id                  uuid primary key references core.tenant(id) on delete cascade,

    -- Which classification domains this tenant uses
    primary_commodity_domain   text references ref.commodity_domain(code),
    trade_commodity_domain     text references ref.commodity_domain(code),
    primary_industry_domain    text references ref.industry_domain(code),

    -- When classification becomes mandatory (policy-driven)
    require_commodity_code     boolean not null default false,
    require_trade_code         boolean not null default false,
    require_for_capex_above    decimal(18,4),
    require_for_capex_currency varchar(3) references ref.currency(code),
    require_for_regulated      boolean not null default true,

    -- AI classification settings
    auto_classify_enabled      boolean not null default true,
    auto_crosswalk_enabled     boolean not null default true,
    min_confidence_auto        decimal(5,2) not null default 90.00,
    min_confidence_suggest     decimal(5,2) not null default 60.00,
    crosswalk_strategy         text not null default 'BEST_MATCH'
                               check (crosswalk_strategy in ('EXACT_ONLY','BEST_MATCH','AI_ASSISTED')),

    -- Cross-border determination triggers
    cross_border_triggers      jsonb not null default '["SUPPLIER_COUNTRY_MISMATCH","SHIP_TO_MISMATCH","IMPORT_TAX","CUSTOMS_REQUIRED"]'::jsonb,

    metadata                   jsonb not null default '{}'::jsonb,

    created_at                 timestamptz not null default now(),
    created_by                 text not null default 'seed',
    updated_at                 timestamptz,
    updated_by                 text
);

comment on table ent.classification_config is 'Per-tenant classification preferences: domains, mandatory policies, AI thresholds.';

-- ============================================================================
-- ent.classification_suggestion -- AI classification predictions
-- Records every AI suggestion for audit + feedback loop
-- ============================================================================
create table if not exists ent.classification_suggestion (
    id                     uuid primary key default gen_random_uuid(),
    tenant_id              uuid not null references core.tenant(id) on delete cascade,

    -- What was classified
    source_type            text not null
                           check (source_type in ('PO_LINE','PR_LINE','INVOICE_LINE','CATALOG_ITEM','FREE_TEXT')),
    source_id              uuid,
    source_text            text not null,

    -- AI prediction
    scheme_type            text not null
                           check (scheme_type in ('COMMODITY','INDUSTRY','SPEND_CATEGORY')),
    suggested_domain_code  text,
    suggested_code         text not null,
    confidence             decimal(5,2) not null
                           check (confidence >= 0 and confidence <= 100),
    model_id               uuid,
    model_version          text,

    -- Resolution
    status                 text not null default 'PENDING'
                           check (status in ('PENDING','ACCEPTED','REJECTED','OVERRIDDEN')),
    accepted_code          text,
    resolved_by            text,
    resolved_at            timestamptz,

    created_at             timestamptz not null default now()
);

comment on table ent.classification_suggestion is 'AI classification predictions with resolution tracking.';

create index if not exists idx_ent_cls_suggestion_tenant
    on ent.classification_suggestion(tenant_id);
create index if not exists idx_ent_cls_suggestion_source
    on ent.classification_suggestion(tenant_id, source_type, source_id);
create index if not exists idx_ent_cls_suggestion_status
    on ent.classification_suggestion(status) where status = 'PENDING';

-- ============================================================================
-- ent.classification_feedback -- Correction feedback for AI training
-- Every user correction improves future classification accuracy
-- ============================================================================
create table if not exists ent.classification_feedback (
    id                     uuid primary key default gen_random_uuid(),
    tenant_id              uuid not null references core.tenant(id) on delete cascade,

    input_text             text not null,
    scheme_type            text not null
                           check (scheme_type in ('COMMODITY','INDUSTRY','SPEND_CATEGORY')),
    correct_domain_code    text,
    correct_code           text not null,

    source                 text not null
                           check (source in ('USER_CORRECTION','BULK_IMPORT','EXPERT_REVIEW','CROSSWALK_VERIFY')),
    suggestion_id          uuid references ent.classification_suggestion(id) on delete set null,

    metadata               jsonb not null default '{}'::jsonb,

    created_at             timestamptz not null default now(),
    created_by             text not null
);

comment on table ent.classification_feedback is 'AI training feedback from user corrections and expert reviews.';

create index if not exists idx_ent_cls_feedback_tenant
    on ent.classification_feedback(tenant_id);
create index if not exists idx_ent_cls_feedback_scheme
    on ent.classification_feedback(scheme_type, correct_domain_code, correct_code);
