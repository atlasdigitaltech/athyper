-- ============================================================================
-- master/01d_tables_payment_terms.sql
-- Concept: Payment Terms — holiday calendars, payment conditions, discount tiers
-- Depends on: 04_tables/003a_master_identity.sql
-- Tables:
--   master.holiday_calendar              (§HC1) — tenant business calendar header
--   master.holiday_calendar_day          (§HC2) — individual holiday/override dates
--   master.payment_term                  (§PT1) — payment term header + net-days rule
--   master.payment_term_clause           (§PT2) — unified clause (advance/retention/recovery/release)
--   master.payment_term_discount_tier    (§PT3) — settlement-time early-payment discounts
--   document.payment_term_application    (§PT4) — invoice × clause evaluation result
--   document.payment_term_discount_result(§PT5) — settlement discount realization
--   document.commitment                  (ALTER) — payment term snapshot columns
--
-- Review fixes applied (v2):
--   FIX-1:  Tenant-scoped composite FKs on all cross-table references
--   FIX-2:  discount_result: expression UNIQUE → index; reversal via is_reversal+reverses_id
--   FIX-3:  Flexible bounds split: PERCENT → min/max_pct, FIXED_AMOUNT → min/max_amount
--   FIX-4:  settles_clause_code self-FK + trigger for type pairing validation
--   FIX-5:  Application uniqueness includes COALESCE(invoice_line_id) for line-scope
--   FIX-6:  Cumulative indexes by clause_code, not just clause_type
--   FIX-7:  Immutability trigger allows lifecycle columns (status, is_current_version, etc.)
--   FIX-8:  Holiday calendar: weekend_days for CUSTOM + scope uniqueness guard
--   FIX-9:  Forbid irrelevant header fields (due_day_of_month when not FIXED_DAY, etc.)
--   FIX-10: Commitment snapshot fully required when payment_term_id is set
--   FIX-11: Override reason check covers both pct and amount overrides
-- ============================================================================


-- ============================================================================
-- PART A — HOLIDAY CALENDAR (master schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.holiday_calendar (
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,
    country_code     character(2),
    company_code_id  uuid,
    legal_entity_id  uuid,
    site_id          uuid,
    weekend_pattern  text         NOT NULL DEFAULT 'SAT_SUN',
    weekend_days     smallint[],
    description      text,
    is_default       boolean      NOT NULL DEFAULT false,
    sort_order       smallint     NOT NULL DEFAULT 0,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    status           shared.active_inactive_archived_d NOT NULL DEFAULT 'active',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT hc_pkey              PRIMARY KEY (id),
    CONSTRAINT hc_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT hc_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT hc_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT hc_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT hc_weekend_chk       CHECK (weekend_pattern IN (
        'SAT_SUN','FRI_SAT','FRI_ONLY','SUN_ONLY','CUSTOM','NONE')),
    CONSTRAINT hc_custom_days_req   CHECK (weekend_pattern <> 'CUSTOM' OR (
        weekend_days IS NOT NULL AND array_length(weekend_days, 1) > 0)),
    CONSTRAINT hc_noncustom_days    CHECK (weekend_pattern = 'CUSTOM' OR weekend_days IS NULL),
    CONSTRAINT hc_weekend_range_chk CHECK (weekend_days IS NULL
        OR weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
    CONSTRAINT hc_weekend_max_chk   CHECK (weekend_days IS NULL
        OR array_length(weekend_days, 1) <= 7)
);

CREATE UNIQUE INDEX IF NOT EXISTS hc_scope_active_uq
    ON master.holiday_calendar (
        tenant_id,
        COALESCE(country_code, ''),
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'),
        COALESCE(legal_entity_id, '00000000-0000-0000-0000-000000000000'),
        COALESCE(site_id,         '00000000-0000-0000-0000-000000000000')
    )
    WHERE status = 'active';

COMMENT ON TABLE master.holiday_calendar IS
    'ARCHETYPE=B;SCOPE=T. Tenant business calendar. Dimensional scope: tenant-wide, per-country, per-company, per-site. '
    'weekend_pattern avoids 52 HOLIDAY rows for weekends. CUSTOM requires weekend_days array.';


CREATE TABLE IF NOT EXISTS master.holiday_calendar_day (
    id                    uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid         NOT NULL,
    holiday_calendar_id   uuid         NOT NULL,
    calendar_year         smallint     NOT NULL,
    holiday_date          date         NOT NULL,
    name                  text         NOT NULL,
    day_type              text         NOT NULL DEFAULT 'HOLIDAY',
    observance_type       text         NOT NULL DEFAULT 'MANDATORY',
    is_half_day           boolean      NOT NULL DEFAULT false,
    metadata              jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    created_by            uuid         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT hcd_pkey              PRIMARY KEY (id),
    CONSTRAINT hcd_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT hcd_calendar_date_uq  UNIQUE (holiday_calendar_id, holiday_date),
    CONSTRAINT hcd_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT hcd_day_type_chk      CHECK (day_type IN ('HOLIDAY','WORKING_OVERRIDE','BLACKOUT')),
    CONSTRAINT hcd_observance_chk    CHECK (observance_type IN ('MANDATORY','RESTRICTED','OPTIONAL')),
    CONSTRAINT hcd_year_chk          CHECK (calendar_year BETWEEN 2000 AND 2099),
    CONSTRAINT hcd_year_date_chk     CHECK (EXTRACT(YEAR FROM holiday_date) = calendar_year)
);

COMMENT ON TABLE master.holiday_calendar_day IS
    'ARCHETYPE=C;SCOPE=T. Individual holiday/override dates. HOLIDAY=non-working, WORKING_OVERRIDE=normally off but working, BLACKOUT=special closure.';


-- ============================================================================
-- PART B — PAYMENT TERM MASTER (master schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.payment_term (
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,
    description      text,
    applicable_to    text         NOT NULL DEFAULT 'BOTH',
    base_event       text         NOT NULL DEFAULT 'INVOICE_DATE',
    due_rule_type    text         NOT NULL DEFAULT 'NET_DAYS',
    due_days         smallint,
    due_day_of_month smallint,
    grace_days       smallint     NOT NULL DEFAULT 0,
    due_date_flexibility text     NOT NULL DEFAULT 'FIXED',
    business_day_convention text,
    holiday_calendar_id     uuid,
    month_offset            smallint     NOT NULL DEFAULT 0,
    term_category    text         NOT NULL DEFAULT 'standard',
    installment_count smallint,
    version          smallint     NOT NULL DEFAULT 1,
    supersedes_payment_term_id uuid,
    is_current_version boolean   NOT NULL DEFAULT true,
    effective_from   date,
    effective_to     date,
    sort_order       smallint     NOT NULL DEFAULT 0,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT pt_pkey                  PRIMARY KEY (id),
    CONSTRAINT pt_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT pt_tenant_code_ver_uq    UNIQUE (tenant_id, code, version),
    CONSTRAINT pt_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT pt_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT pt_status_chk            CHECK (status IN (
        'draft','active','inactive','superseded','archived')),
    CONSTRAINT pt_applicable_chk        CHECK (applicable_to IN ('PURCHASE','SALE','BOTH')),
    CONSTRAINT pt_base_event_chk        CHECK (base_event IN (
        'INVOICE_DATE','GR_DATE','SERVICE_ENTRY_DATE','DELIVERY_DATE',
        'CERTIFIED_DATE','CONTRACT_DATE')),
    CONSTRAINT pt_due_rule_chk          CHECK (due_rule_type IN (
        'NET_DAYS','EOM','FIXED_DAY','COD','PREPAID')),
    CONSTRAINT pt_due_date_flex_chk     CHECK (due_date_flexibility IN ('FIXED','FLEXIBLE')),
    CONSTRAINT pt_bdc_chk               CHECK (business_day_convention IS NULL
        OR business_day_convention IN ('NONE','FOLLOWING','PRECEDING','MODIFIED_FOLLOWING')),
    CONSTRAINT pt_version_chk           CHECK (version >= 1),
    CONSTRAINT pt_effective_chk         CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT pt_no_self_supersede     CHECK (supersedes_payment_term_id IS DISTINCT FROM id),
    CONSTRAINT pt_due_days_nonneg       CHECK (due_days IS NULL OR due_days >= 0),
    CONSTRAINT pt_grace_nonneg          CHECK (grace_days >= 0),
    CONSTRAINT pt_dom_chk               CHECK (due_day_of_month IS NULL OR due_day_of_month BETWEEN 1 AND 31),
    CONSTRAINT pt_month_offset_chk      CHECK (month_offset BETWEEN 0 AND 12),
    CONSTRAINT pt_net_days_req_chk      CHECK (due_rule_type <> 'NET_DAYS' OR due_days IS NOT NULL),
    CONSTRAINT pt_fixed_day_req_chk     CHECK (due_rule_type <> 'FIXED_DAY' OR due_day_of_month IS NOT NULL),
    CONSTRAINT pt_dom_only_fixed_chk    CHECK (due_rule_type = 'FIXED_DAY' OR due_day_of_month IS NULL),
    CONSTRAINT pt_cod_no_days_chk       CHECK (due_rule_type NOT IN ('COD','PREPAID') OR due_days IS NULL),
    CONSTRAINT pt_installment_pos_chk   CHECK (installment_count IS NULL OR installment_count >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS pt_current_version_uq
    ON master.payment_term (tenant_id, code)
    WHERE is_current_version = true;

COMMENT ON TABLE master.payment_term IS
    'ARCHETYPE=B;SCOPE=T. Payment term master: executable net-days rule + container for clause children. '
    'Versioned per (tenant, code, version). Supersedes chain for audit trail.';


CREATE TABLE IF NOT EXISTS master.payment_term_clause (
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    payment_term_id  uuid         NOT NULL,
    clause_code      text         NOT NULL,
    clause_type      text         NOT NULL,
    sequence_no      smallint     NOT NULL,
    settles_clause_code text,
    application_scope text        NOT NULL DEFAULT 'HEADER',
    basis_amount_mode text        NOT NULL DEFAULT 'GROSS',
    calc_mode         text        NOT NULL DEFAULT 'PERCENT',
    default_pct       numeric(5,2),
    default_amount    numeric(18,4),
    currency_code     character(3),
    flexibility_mode  text        NOT NULL DEFAULT 'FIXED',
    min_pct           numeric(5,2),
    max_pct           numeric(5,2),
    min_amount        numeric(18,4),
    max_amount        numeric(18,4),
    cumulative_cap_pct    numeric(5,2),
    cumulative_cap_amount numeric(18,4),
    trigger_event         text,
    release_event         text,
    release_delay_days    smallint,
    recovery_start_after_pct  numeric(5,2),
    recovery_end_before_pct   numeric(5,2),
    recovery_method       text,
    partial_release_pct   numeric(5,2),
    partial_release_event text,
    rounding_method  text         DEFAULT 'ROUND_HALF_UP',
    rounding_scale   smallint,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    is_active        boolean      NOT NULL DEFAULT true,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT ptc_pkey                 PRIMARY KEY (id),
    CONSTRAINT ptc_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT ptc_term_code_uq         UNIQUE (tenant_id, payment_term_id, clause_code),
    CONSTRAINT ptc_term_seq_uq          UNIQUE (tenant_id, payment_term_id, sequence_no),
    CONSTRAINT ptc_code_nonempty        CHECK (btrim(clause_code) <> ''),
    CONSTRAINT ptc_clause_type_chk      CHECK (clause_type IN (
        'ADVANCE','ADVANCE_RECOVERY','RETENTION','RETENTION_RELEASE')),
    CONSTRAINT ptc_scope_chk            CHECK (application_scope IN ('HEADER','LINE','SCHEDULE')),
    CONSTRAINT ptc_basis_chk            CHECK (basis_amount_mode IN (
        'GROSS','NET_OF_TAX','LINE_NET','NET_OF_RETENTION')),
    CONSTRAINT ptc_calc_chk             CHECK (calc_mode IN ('PERCENT','FIXED_AMOUNT')),
    CONSTRAINT ptc_flex_chk             CHECK (flexibility_mode IN ('FIXED','FLEXIBLE')),
    CONSTRAINT ptc_rounding_chk         CHECK (rounding_method IS NULL OR rounding_method IN (
        'ROUND_HALF_UP','ROUND_HALF_EVEN','ROUND_DOWN','ROUND_UP')),
    CONSTRAINT ptc_pct_req_chk          CHECK (calc_mode <> 'PERCENT' OR default_pct IS NOT NULL),
    CONSTRAINT ptc_amt_req_chk          CHECK (calc_mode <> 'FIXED_AMOUNT' OR (
        default_amount IS NOT NULL AND currency_code IS NOT NULL)),
    CONSTRAINT ptc_pct_null_chk         CHECK (calc_mode <> 'FIXED_AMOUNT' OR default_pct IS NULL),
    CONSTRAINT ptc_amt_null_chk         CHECK (calc_mode <> 'PERCENT' OR default_amount IS NULL),
    CONSTRAINT ptc_cap_xor_chk          CHECK (NOT (
        cumulative_cap_pct IS NOT NULL AND cumulative_cap_amount IS NOT NULL)),
    CONSTRAINT ptc_recovery_method_chk  CHECK (
        clause_type = 'ADVANCE_RECOVERY' OR recovery_method IS NULL),
    CONSTRAINT ptc_release_event_chk    CHECK (
        clause_type = 'RETENTION_RELEASE' OR release_event IS NULL),
    CONSTRAINT ptc_release_delay_chk    CHECK (
        clause_type = 'RETENTION_RELEASE' OR release_delay_days IS NULL),
    CONSTRAINT ptc_partial_rel_chk      CHECK (
        partial_release_pct IS NULL OR partial_release_event IS NOT NULL),
    CONSTRAINT ptc_settles_req_chk      CHECK (
        clause_type NOT IN ('ADVANCE_RECOVERY','RETENTION_RELEASE')
        OR settles_clause_code IS NOT NULL),
    CONSTRAINT ptc_settles_null_chk     CHECK (
        clause_type NOT IN ('ADVANCE','RETENTION')
        OR settles_clause_code IS NULL),
    CONSTRAINT ptc_flex_pct_bounds_chk  CHECK (
        NOT (flexibility_mode = 'FLEXIBLE' AND calc_mode = 'PERCENT')
        OR (min_pct IS NOT NULL AND max_pct IS NOT NULL AND min_pct <= max_pct
            AND min_amount IS NULL AND max_amount IS NULL)),
    CONSTRAINT ptc_flex_amt_bounds_chk  CHECK (
        NOT (flexibility_mode = 'FLEXIBLE' AND calc_mode = 'FIXED_AMOUNT')
        OR (min_amount IS NOT NULL AND max_amount IS NOT NULL AND min_amount <= max_amount
            AND min_pct IS NULL AND max_pct IS NULL)),
    CONSTRAINT ptc_fixed_no_bounds_chk  CHECK (
        flexibility_mode <> 'FIXED'
        OR (min_pct IS NULL AND max_pct IS NULL AND min_amount IS NULL AND max_amount IS NULL)),
    CONSTRAINT ptc_pct_range_chk        CHECK (default_pct IS NULL OR default_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_min_pct_range_chk    CHECK (min_pct IS NULL OR min_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_max_pct_range_chk    CHECK (max_pct IS NULL OR max_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_cap_pct_range_chk    CHECK (cumulative_cap_pct IS NULL OR cumulative_cap_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_cap_amt_nonneg       CHECK (cumulative_cap_amount IS NULL OR cumulative_cap_amount >= 0),
    CONSTRAINT ptc_default_amt_nonneg   CHECK (default_amount IS NULL OR default_amount >= 0),
    CONSTRAINT ptc_min_amt_nonneg       CHECK (min_amount IS NULL OR min_amount >= 0),
    CONSTRAINT ptc_max_amt_nonneg       CHECK (max_amount IS NULL OR max_amount >= 0),
    CONSTRAINT ptc_recovery_start_chk   CHECK (recovery_start_after_pct IS NULL OR recovery_start_after_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_recovery_end_chk     CHECK (recovery_end_before_pct IS NULL OR recovery_end_before_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_recovery_range_chk   CHECK (
        recovery_start_after_pct IS NULL OR recovery_end_before_pct IS NULL
        OR recovery_start_after_pct < recovery_end_before_pct),
    CONSTRAINT ptc_partial_rel_range    CHECK (partial_release_pct IS NULL OR partial_release_pct BETWEEN 0 AND 100),
    CONSTRAINT ptc_seq_positive         CHECK (sequence_no > 0),
    CONSTRAINT ptc_release_delay_nonneg CHECK (release_delay_days IS NULL OR release_delay_days >= 0)
);

COMMENT ON TABLE master.payment_term_clause IS
    'ARCHETYPE=C;SCOPE=T. Unified deduction/release clause. clause_type: ADVANCE, ADVANCE_RECOVERY, RETENTION, RETENTION_RELEASE. '
    'FIX-3: bounds enforce min/max_pct for PERCENT, min/max_amount for FIXED_AMOUNT. '
    'is_active is a manual boolean (not GENERATED) — no status column on this table.';


CREATE TABLE IF NOT EXISTS master.payment_term_discount_tier (
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    payment_term_id  uuid         NOT NULL,
    tier_no          smallint     NOT NULL,
    qualify_within_days smallint  NOT NULL,
    discount_pct     numeric(5,2),
    discount_fixed   numeric(18,4),
    currency_code    character(3),
    discount_basis_mode text     NOT NULL DEFAULT 'GROSS',
    min_invoice_amount  numeric(18,4),
    is_best_only        boolean  NOT NULL DEFAULT true,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT ptdt_pkey                PRIMARY KEY (id),
    CONSTRAINT ptdt_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT ptdt_term_tier_uq        UNIQUE (payment_term_id, tier_no),
    CONSTRAINT ptdt_basis_chk           CHECK (discount_basis_mode IN ('GROSS','NET')),
    CONSTRAINT ptdt_tier_positive        CHECK (tier_no > 0),
    CONSTRAINT ptdt_days_positive        CHECK (qualify_within_days > 0),
    CONSTRAINT ptdt_discount_xor_chk    CHECK (
        (discount_pct IS NOT NULL AND discount_fixed IS NULL)
        OR (discount_pct IS NULL AND discount_fixed IS NOT NULL)),
    CONSTRAINT ptdt_pct_range_chk       CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100),
    CONSTRAINT ptdt_fixed_nonneg        CHECK (discount_fixed IS NULL OR discount_fixed >= 0),
    CONSTRAINT ptdt_fixed_currency_chk  CHECK (discount_fixed IS NULL OR currency_code IS NOT NULL),
    CONSTRAINT ptdt_min_amt_nonneg      CHECK (min_invoice_amount IS NULL OR min_invoice_amount >= 0)
);

COMMENT ON TABLE master.payment_term_discount_tier IS
    'ARCHETYPE=C;SCOPE=T. Early-payment discount tiers. Settlement-time only — not an invoice deduction.';


-- ============================================================================

-- PART E — SUPPLIER/CUSTOMER PROFILE ADDITIONS
-- ============================================================================

ALTER TABLE master.company_code_supplier_profile
    ADD COLUMN IF NOT EXISTS payment_term_id uuid;

ALTER TABLE master.company_code_customer_profile
    ADD COLUMN IF NOT EXISTS payment_term_id uuid;
