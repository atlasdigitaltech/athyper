-- master/01l_tables_app_indexes.sql
-- Denormalized read/search projection tables for high-traffic BP-role lookups.
--
-- Architecture:
--   master.business_partner  = canonical identity (source of truth)
--   master.supplier          = AP role (thin, no identity columns)
--   master.customer          = AR role (thin, no identity columns)
--   master.supplier_app_index = denormalized supplier list/search surface
--   master.customer_app_index = denormalized customer list/search surface
--
-- Key design rule:
--   id = supplier_id / customer_id (same UUID as the canonical role row)
--   This lets context-menu navigation use row.id directly without a secondary
--   lookup, and lets FK ON DELETE CASCADE remove the index row automatically.
--
-- Maintenance: triggers on supplier, customer, business_partner keep the indexes
--   current within the same transaction.  Direct writes are forbidden (no tenant
--   DML policies).  Only athyperadmin (trigger owner via SECURITY DEFINER) writes.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; DROP TRIGGER/FUNCTION IF EXISTS before CREATE.
--
-- Run AFTER: 01h_tables_business_partner.sql

-- ── Extension: pg_trgm for fast ILIKE search on search_text ──────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. master.supplier_app_index
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS master.supplier_app_index (
    -- id = supplier.id  (not an independent UUID)
    id                          uuid          NOT NULL,
    tenant_id                   uuid          NOT NULL,

    -- FKs to canonical tables
    supplier_id                 uuid          NOT NULL,
    business_partner_id         uuid          NOT NULL,

    -- Role fields (source: master.supplier)
    supplier_code               text          NOT NULL,
    supplier_type               text,
    supplier_status             text          NOT NULL DEFAULT 'active',
    is_payment_ready            boolean       NOT NULL DEFAULT false,

    -- Identity fields (source: master.business_partner)
    business_partner_code       text,
    name                        text,
    display_name                text,
    legal_name                  text,
    legal_form                  text,
    registration_no             text,
    registration_country_code   text,
    tax_residence_country_code  text,
    partner_category            text,
    aliases                     text[],
    business_types              text[]        NOT NULL DEFAULT '{}',

    -- Denormalized search surface (lowercased, maintained by trigger)
    search_text                 text          NOT NULL DEFAULT '',

    -- Housekeeping
    updated_at                  timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT supplier_app_index_pkey            PRIMARY KEY (id),
    CONSTRAINT supplier_app_index_tenant_sup_uq   UNIQUE      (tenant_id, supplier_id),
    CONSTRAINT supplier_app_index_supplier_fk     FOREIGN KEY (id)
        REFERENCES master.supplier(id) ON DELETE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sai_tenant_idx         ON master.supplier_app_index (tenant_id);
CREATE INDEX IF NOT EXISTS sai_supplier_code_idx  ON master.supplier_app_index (tenant_id, supplier_code);
CREATE INDEX IF NOT EXISTS sai_bp_idx             ON master.supplier_app_index (tenant_id, business_partner_id);
CREATE INDEX IF NOT EXISTS sai_search_text_gin    ON master.supplier_app_index USING GIN (search_text gin_trgm_ops);

-- ── Row-level security ────────────────────────────────────────────────────────
ALTER TABLE master.supplier_app_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.supplier_app_index FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS tenant_read   ON master.supplier_app_index;
    DROP POLICY IF EXISTS admin_read    ON master.supplier_app_index;
    DROP POLICY IF EXISTS admin_write   ON master.supplier_app_index;
END $$;

CREATE POLICY tenant_read  ON master.supplier_app_index FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY admin_read   ON master.supplier_app_index FOR SELECT  TO athyperadmin USING (true);
CREATE POLICY admin_write  ON master.supplier_app_index FOR ALL     TO athyperadmin USING (true) WITH CHECK (true);

-- ── Column additions (idempotent — safe when table already exists) ────────────
ALTER TABLE master.supplier_app_index
    ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. master.customer_app_index
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS master.customer_app_index (
    -- id = customer.id  (not an independent UUID)
    id                          uuid          NOT NULL,
    tenant_id                   uuid          NOT NULL,

    -- FKs to canonical tables
    customer_id                 uuid          NOT NULL,
    business_partner_id         uuid          NOT NULL,

    -- Role fields (source: master.customer)
    customer_code               text          NOT NULL,
    customer_type               text,
    customer_status             text          NOT NULL DEFAULT 'active',
    is_key_account              boolean       NOT NULL DEFAULT false,
    risk_rating                 text,

    -- Identity fields (source: master.business_partner)
    business_partner_code       text,
    name                        text,
    display_name                text,
    legal_name                  text,
    legal_form                  text,
    registration_no             text,
    registration_country_code   text,
    aliases                     text[],
    business_types              text[]        NOT NULL DEFAULT '{}',

    -- Denormalized search surface
    search_text                 text          NOT NULL DEFAULT '',

    -- Housekeeping
    updated_at                  timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT customer_app_index_pkey            PRIMARY KEY (id),
    CONSTRAINT customer_app_index_tenant_cus_uq   UNIQUE      (tenant_id, customer_id),
    CONSTRAINT customer_app_index_customer_fk     FOREIGN KEY (id)
        REFERENCES master.customer(id) ON DELETE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cai_tenant_idx         ON master.customer_app_index (tenant_id);
CREATE INDEX IF NOT EXISTS cai_customer_code_idx  ON master.customer_app_index (tenant_id, customer_code);
CREATE INDEX IF NOT EXISTS cai_bp_idx             ON master.customer_app_index (tenant_id, business_partner_id);
CREATE INDEX IF NOT EXISTS cai_search_text_gin    ON master.customer_app_index USING GIN (search_text gin_trgm_ops);

-- ── Row-level security ────────────────────────────────────────────────────────
ALTER TABLE master.customer_app_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.customer_app_index FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS tenant_read   ON master.customer_app_index;
    DROP POLICY IF EXISTS admin_read    ON master.customer_app_index;
    DROP POLICY IF EXISTS admin_write   ON master.customer_app_index;
END $$;

CREATE POLICY tenant_read  ON master.customer_app_index FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY admin_read   ON master.customer_app_index FOR SELECT  TO athyperadmin USING (true);
CREATE POLICY admin_write  ON master.customer_app_index FOR ALL     TO athyperadmin USING (true) WITH CHECK (true);

-- ── Column additions (idempotent — safe when table already exists) ────────────
ALTER TABLE master.customer_app_index
    ADD COLUMN IF NOT EXISTS legal_form     text,
    ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Trigger: supplier → supplier_app_index
-- ═══════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_supplier_app_index_sync ON master.supplier;
DROP FUNCTION IF EXISTS master.trg_supplier_app_index_sync();

CREATE OR REPLACE FUNCTION master.trg_supplier_app_index_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_bp  record;
    v_row record;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM master.supplier_app_index
        WHERE supplier_id = OLD.id AND tenant_id = OLD.tenant_id;
        RETURN OLD;
    END IF;

    v_row := NEW;

    SELECT * INTO v_bp
    FROM master.business_partner
    WHERE id = v_row.business_partner_id AND tenant_id = v_row.tenant_id;

    INSERT INTO master.supplier_app_index (
        id, tenant_id, supplier_id, business_partner_id,
        supplier_code, supplier_type, supplier_status, is_payment_ready,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code, tax_residence_country_code,
        partner_category, aliases, business_types, search_text, updated_at
    ) VALUES (
        v_row.id,
        v_row.tenant_id,
        v_row.id,
        v_row.business_partner_id,
        v_row.supplier_code,
        v_row.supplier_type,
        v_row.status,
        coalesce(v_row.is_payment_ready, false),
        v_bp.code,
        v_bp.name,
        coalesce(v_bp.display_name, v_bp.name),
        v_bp.legal_name,
        v_bp.legal_form,
        v_bp.registration_no,
        v_bp.registration_country_code,
        v_bp.tax_residence_country_code,
        v_bp.partner_category,
        v_bp.aliases,
        coalesce(v_bp.business_types, '{}'),
        lower(
            coalesce(v_row.supplier_code, '')                         || ' ' ||
            coalesce(v_bp.code, '')                                   || ' ' ||
            coalesce(v_bp.name, '')                                   || ' ' ||
            coalesce(v_bp.display_name, '')                           || ' ' ||
            coalesce(v_bp.legal_name, '')                             || ' ' ||
            coalesce(v_bp.registration_no, '')                        || ' ' ||
            coalesce(array_to_string(v_bp.aliases, ' '), '')          || ' ' ||
            coalesce(array_to_string(v_bp.business_types, ' '), '')
        ),
        now()
    )
    ON CONFLICT (tenant_id, supplier_id) DO UPDATE SET
        supplier_code              = EXCLUDED.supplier_code,
        supplier_type              = EXCLUDED.supplier_type,
        supplier_status            = EXCLUDED.supplier_status,
        is_payment_ready           = EXCLUDED.is_payment_ready,
        business_partner_code      = EXCLUDED.business_partner_code,
        name                       = EXCLUDED.name,
        display_name               = EXCLUDED.display_name,
        legal_name                 = EXCLUDED.legal_name,
        legal_form                 = EXCLUDED.legal_form,
        registration_no            = EXCLUDED.registration_no,
        registration_country_code  = EXCLUDED.registration_country_code,
        tax_residence_country_code = EXCLUDED.tax_residence_country_code,
        partner_category           = EXCLUDED.partner_category,
        aliases                    = EXCLUDED.aliases,
        business_types             = EXCLUDED.business_types,
        search_text                = EXCLUDED.search_text,
        updated_at                 = now();

    RETURN NEW;
END;
$$;

ALTER FUNCTION master.trg_supplier_app_index_sync() OWNER TO athyperadmin;

CREATE TRIGGER trg_supplier_app_index_sync
AFTER INSERT OR UPDATE OR DELETE ON master.supplier
FOR EACH ROW EXECUTE FUNCTION master.trg_supplier_app_index_sync();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Trigger: customer → customer_app_index
-- ═══════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_customer_app_index_sync ON master.customer;
DROP FUNCTION IF EXISTS master.trg_customer_app_index_sync();

CREATE OR REPLACE FUNCTION master.trg_customer_app_index_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_bp  record;
    v_row record;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM master.customer_app_index
        WHERE customer_id = OLD.id AND tenant_id = OLD.tenant_id;
        RETURN OLD;
    END IF;

    v_row := NEW;

    SELECT * INTO v_bp
    FROM master.business_partner
    WHERE id = v_row.business_partner_id AND tenant_id = v_row.tenant_id;

    INSERT INTO master.customer_app_index (
        id, tenant_id, customer_id, business_partner_id,
        customer_code, customer_type, customer_status, is_key_account, risk_rating,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code, aliases, business_types,
        search_text, updated_at
    ) VALUES (
        v_row.id,
        v_row.tenant_id,
        v_row.id,
        v_row.business_partner_id,
        v_row.customer_code,
        v_row.customer_type,
        v_row.status,
        coalesce(v_row.is_key_account, false),
        v_row.risk_rating,
        v_bp.code,
        v_bp.name,
        coalesce(v_bp.display_name, v_bp.name),
        v_bp.legal_name,
        v_bp.legal_form,
        v_bp.registration_no,
        v_bp.registration_country_code,
        v_bp.aliases,
        coalesce(v_bp.business_types, '{}'),
        lower(
            coalesce(v_row.customer_code, '')                         || ' ' ||
            coalesce(v_bp.code, '')                                   || ' ' ||
            coalesce(v_bp.name, '')                                   || ' ' ||
            coalesce(v_bp.display_name, '')                           || ' ' ||
            coalesce(v_bp.legal_name, '')                             || ' ' ||
            coalesce(v_bp.registration_no, '')                        || ' ' ||
            coalesce(array_to_string(v_bp.aliases, ' '), '')          || ' ' ||
            coalesce(array_to_string(v_bp.business_types, ' '), '')
        ),
        now()
    )
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        customer_code             = EXCLUDED.customer_code,
        customer_type             = EXCLUDED.customer_type,
        customer_status           = EXCLUDED.customer_status,
        is_key_account            = EXCLUDED.is_key_account,
        risk_rating               = EXCLUDED.risk_rating,
        business_partner_code     = EXCLUDED.business_partner_code,
        name                      = EXCLUDED.name,
        display_name              = EXCLUDED.display_name,
        legal_name                = EXCLUDED.legal_name,
        legal_form                = EXCLUDED.legal_form,
        registration_no           = EXCLUDED.registration_no,
        registration_country_code = EXCLUDED.registration_country_code,
        aliases                   = EXCLUDED.aliases,
        business_types            = EXCLUDED.business_types,
        search_text               = EXCLUDED.search_text,
        updated_at                = now();

    RETURN NEW;
END;
$$;

ALTER FUNCTION master.trg_customer_app_index_sync() OWNER TO athyperadmin;

CREATE TRIGGER trg_customer_app_index_sync
AFTER INSERT OR UPDATE OR DELETE ON master.customer
FOR EACH ROW EXECUTE FUNCTION master.trg_customer_app_index_sync();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Trigger: business_partner → propagate identity changes to both indexes
-- ═══════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_bp_app_index_sync ON master.business_partner;
DROP FUNCTION IF EXISTS master.trg_bp_app_index_sync();

CREATE OR REPLACE FUNCTION master.trg_bp_app_index_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
BEGIN
    -- Propagate identity changes to supplier_app_index
    UPDATE master.supplier_app_index
    SET business_partner_code      = NEW.code,
        name                       = NEW.name,
        display_name               = coalesce(NEW.display_name, NEW.name),
        legal_name                 = NEW.legal_name,
        legal_form                 = NEW.legal_form,
        registration_no            = NEW.registration_no,
        registration_country_code  = NEW.registration_country_code,
        tax_residence_country_code = NEW.tax_residence_country_code,
        partner_category           = NEW.partner_category,
        aliases                    = NEW.aliases,
        business_types             = coalesce(NEW.business_types, '{}'),
        search_text = lower(
            coalesce(supplier_code, '')                                   || ' ' ||
            coalesce(NEW.code, '')                                        || ' ' ||
            coalesce(NEW.name, '')                                        || ' ' ||
            coalesce(NEW.display_name, '')                                || ' ' ||
            coalesce(NEW.legal_name, '')                                  || ' ' ||
            coalesce(NEW.registration_no, '')                             || ' ' ||
            coalesce(array_to_string(NEW.aliases, ' '), '')               || ' ' ||
            coalesce(array_to_string(NEW.business_types, ' '), '')
        ),
        updated_at = now()
    WHERE business_partner_id = NEW.id AND tenant_id = NEW.tenant_id;

    -- Propagate identity changes to customer_app_index
    UPDATE master.customer_app_index
    SET business_partner_code     = NEW.code,
        name                      = NEW.name,
        display_name              = coalesce(NEW.display_name, NEW.name),
        legal_name                = NEW.legal_name,
        legal_form                = NEW.legal_form,
        registration_no           = NEW.registration_no,
        registration_country_code = NEW.registration_country_code,
        aliases                   = NEW.aliases,
        business_types            = coalesce(NEW.business_types, '{}'),
        search_text = lower(
            coalesce(customer_code, '')                                   || ' ' ||
            coalesce(NEW.code, '')                                        || ' ' ||
            coalesce(NEW.name, '')                                        || ' ' ||
            coalesce(NEW.display_name, '')                                || ' ' ||
            coalesce(NEW.legal_name, '')                                  || ' ' ||
            coalesce(NEW.registration_no, '')                             || ' ' ||
            coalesce(array_to_string(NEW.aliases, ' '), '')               || ' ' ||
            coalesce(array_to_string(NEW.business_types, ' '), '')
        ),
        updated_at = now()
    WHERE business_partner_id = NEW.id AND tenant_id = NEW.tenant_id;

    RETURN NEW;
END;
$$;

ALTER FUNCTION master.trg_bp_app_index_sync() OWNER TO athyperadmin;

-- Fire on UPDATE only — INSERT is handled by the supplier/customer triggers
-- (supplier/customer always comes after business_partner in onboarding flow)
CREATE TRIGGER trg_bp_app_index_sync
AFTER UPDATE ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION master.trg_bp_app_index_sync();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Backfill: populate indexes from existing data
-- ═══════════════════════════════════════════════════════════════════════════════
-- Runs idempotently: ON CONFLICT DO UPDATE re-syncs all fields.
-- Stale rows (supplier/customer deleted) are cleaned up by ON DELETE CASCADE.

-- Remove any stale index rows whose canonical row no longer exists
DELETE FROM master.supplier_app_index i
WHERE NOT EXISTS (
    SELECT 1 FROM master.supplier s
    WHERE s.id = i.supplier_id AND s.tenant_id = i.tenant_id
);
DELETE FROM master.customer_app_index i
WHERE NOT EXISTS (
    SELECT 1 FROM master.customer c
    WHERE c.id = i.customer_id AND c.tenant_id = i.tenant_id
);

INSERT INTO master.supplier_app_index (
    id, tenant_id, supplier_id, business_partner_id,
    supplier_code, supplier_type, supplier_status, is_payment_ready,
    business_partner_code, name, display_name, legal_name, legal_form,
    registration_no, registration_country_code, tax_residence_country_code,
    partner_category, aliases, search_text, updated_at
)
SELECT
    s.id,
    s.tenant_id,
    s.id,
    s.business_partner_id,
    s.supplier_code,
    s.supplier_type,
    s.status,
    coalesce(s.is_payment_ready, false),
    bp.code,
    bp.name,
    coalesce(bp.display_name, bp.name),
    bp.legal_name,
    bp.legal_form,
    bp.registration_no,
    bp.registration_country_code,
    bp.tax_residence_country_code,
    bp.partner_category,
    bp.aliases,
    lower(
        coalesce(s.supplier_code, '')                         || ' ' ||
        coalesce(bp.code, '')                                 || ' ' ||
        coalesce(bp.name, '')                                 || ' ' ||
        coalesce(bp.display_name, '')                         || ' ' ||
        coalesce(bp.legal_name, '')                           || ' ' ||
        coalesce(bp.registration_no, '')                      || ' ' ||
        coalesce(array_to_string(bp.aliases, ' '), '')        || ' ' ||
        coalesce(array_to_string(bp.business_types, ' '), '')
    ),
    now()
FROM master.supplier s
JOIN master.business_partner bp
    ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
ON CONFLICT (tenant_id, supplier_id) DO UPDATE SET
    id                         = EXCLUDED.id,
    supplier_code              = EXCLUDED.supplier_code,
    supplier_type              = EXCLUDED.supplier_type,
    supplier_status            = EXCLUDED.supplier_status,
    is_payment_ready           = EXCLUDED.is_payment_ready,
    business_partner_code      = EXCLUDED.business_partner_code,
    name                       = EXCLUDED.name,
    display_name               = EXCLUDED.display_name,
    legal_name                 = EXCLUDED.legal_name,
    legal_form                 = EXCLUDED.legal_form,
    registration_no            = EXCLUDED.registration_no,
    registration_country_code  = EXCLUDED.registration_country_code,
    tax_residence_country_code = EXCLUDED.tax_residence_country_code,
    partner_category           = EXCLUDED.partner_category,
    aliases                    = EXCLUDED.aliases,
    search_text                = EXCLUDED.search_text,
    updated_at                 = now();

-- Backfill business_types via PL/pgSQL so the column reference is compiled at
-- execution time (after ALTER TABLE ADD COLUMN has committed), not at parse time.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'master' AND table_name = 'supplier_app_index'
          AND column_name = 'business_types'
    ) THEN
        UPDATE master.supplier_app_index sai
        SET business_types = coalesce(bp.business_types, '{}')
        FROM master.business_partner bp
        WHERE bp.id = sai.business_partner_id AND bp.tenant_id = sai.tenant_id;
    END IF;
END $$;

INSERT INTO master.customer_app_index (
    id, tenant_id, customer_id, business_partner_id,
    customer_code, customer_type, customer_status, is_key_account, risk_rating,
    business_partner_code, name, display_name, legal_name,
    registration_no, registration_country_code, aliases, search_text, updated_at
)
SELECT
    c.id,
    c.tenant_id,
    c.id,
    c.business_partner_id,
    c.customer_code,
    c.customer_type,
    c.status,
    coalesce(c.is_key_account, false),
    c.risk_rating,
    bp.code,
    bp.name,
    coalesce(bp.display_name, bp.name),
    bp.legal_name,
    bp.registration_no,
    bp.registration_country_code,
    bp.aliases,
    lower(
        coalesce(c.customer_code, '')                         || ' ' ||
        coalesce(bp.code, '')                                 || ' ' ||
        coalesce(bp.name, '')                                 || ' ' ||
        coalesce(bp.display_name, '')                         || ' ' ||
        coalesce(bp.legal_name, '')                           || ' ' ||
        coalesce(bp.registration_no, '')                      || ' ' ||
        coalesce(array_to_string(bp.aliases, ' '), '')        || ' ' ||
        coalesce(array_to_string(bp.business_types, ' '), '')
    ),
    now()
FROM master.customer c
JOIN master.business_partner bp
    ON bp.id = c.business_partner_id AND bp.tenant_id = c.tenant_id
ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
    id                        = EXCLUDED.id,
    customer_code             = EXCLUDED.customer_code,
    customer_type             = EXCLUDED.customer_type,
    customer_status           = EXCLUDED.customer_status,
    is_key_account            = EXCLUDED.is_key_account,
    risk_rating               = EXCLUDED.risk_rating,
    business_partner_code     = EXCLUDED.business_partner_code,
    name                      = EXCLUDED.name,
    display_name              = EXCLUDED.display_name,
    legal_name                = EXCLUDED.legal_name,
    registration_no           = EXCLUDED.registration_no,
    registration_country_code = EXCLUDED.registration_country_code,
    aliases                   = EXCLUDED.aliases,
    search_text               = EXCLUDED.search_text,
    updated_at                = now();

-- Backfill legal_form and business_types via PL/pgSQL so column references are
-- compiled at execution time (after ALTER TABLE ADD COLUMN has committed).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'master' AND table_name = 'customer_app_index'
          AND column_name = 'business_types'
    ) THEN
        UPDATE master.customer_app_index cai
        SET legal_form     = bp.legal_form,
            business_types = coalesce(bp.business_types, '{}')
        FROM master.business_partner bp
        WHERE bp.id = cai.business_partner_id AND bp.tenant_id = cai.tenant_id;
    END IF;
END $$;
