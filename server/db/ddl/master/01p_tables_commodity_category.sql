-- server/db/ddl/master/01p_tables_commodity_category.sql
-- Standalone DDL for master.commodity_category unified taxonomy model.
-- Supersedes the three split profile tables which are dropped below.
-- Idempotent: safe to re-run on a database that already has the table.
--
-- Depends on:
--   shared.uuidv7()
--   shared.trg_set_updated_at()
--   shared.trg_set_status_changed()
--   shared.current_tenant_id_soft()
--   shared.current_tenant_id()
--   master.trg_ccat_maintain_root_category()   (function in 05_functions.sql)
--   control.trg_validate_lookup_columns()      (function in control DDL)
--   athyperadmin role

-- =============================================================================
-- § Drop obsolete profile tables
-- =============================================================================
DROP TABLE IF EXISTS master.commodity_category_spend_profile CASCADE;
DROP TABLE IF EXISTS master.commodity_category_sales_profile CASCADE;
DROP TABLE IF EXISTS master.commodity_category_inventory_profile CASCADE;


-- =============================================================================
-- § master.commodity_category — shared commodity taxonomy
-- =============================================================================
CREATE TABLE IF NOT EXISTS master.commodity_category (
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL,
    name             text         NOT NULL,
    description      text,
    parent_id        uuid,
    root_category_id uuid         NOT NULL,
    level_no         smallint,
    sort_order       smallint     NOT NULL DEFAULT 0,
    buy_allowed      boolean      NOT NULL DEFAULT false,
    sell_allowed     boolean      NOT NULL DEFAULT false,
    inventory_allowed boolean     NOT NULL DEFAULT false,
    is_classification_required boolean NOT NULL DEFAULT false,
    is_hs_required   boolean      NOT NULL DEFAULT false,
    is_regulated     boolean      NOT NULL DEFAULT false,
    allowed_classification_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
    uom_code         text,
    sales_revenue_recognition_method text NOT NULL DEFAULT 'POINT_IN_TIME',
    sales_variable_consideration text,
    sales_standalone_selling_price_method text,
    is_stockable     boolean      NOT NULL DEFAULT false,
    is_consumable    boolean      NOT NULL DEFAULT false,
    default_valuation_method text,
    is_lot_tracking_allowed  boolean NOT NULL DEFAULT false,
    is_lot_tracking_required boolean NOT NULL DEFAULT false,
    is_serial_tracking_allowed  boolean NOT NULL DEFAULT false,
    is_serial_tracking_required boolean NOT NULL DEFAULT false,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    status           text         NOT NULL DEFAULT 'active',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT commodity_category_pkey                   PRIMARY KEY (id),
    CONSTRAINT commodity_category_tenant_id_uq           UNIQUE (tenant_id, id),
    CONSTRAINT commodity_category_tenant_code_uq         UNIQUE (tenant_id, code),
    CONSTRAINT commodity_category_code_nonempty          CHECK (btrim(code) <> ''),
    CONSTRAINT commodity_category_name_nonempty          CHECK (btrim(name) <> ''),
    CONSTRAINT commodity_category_no_self_parent         CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT commodity_category_root_is_self           CHECK (parent_id IS NOT NULL OR root_category_id = id),
    CONSTRAINT commodity_category_domains_array_chk      CHECK (jsonb_typeof(allowed_classification_domains) = 'array'),
    CONSTRAINT commodity_category_hs_domain_chk          CHECK (NOT is_hs_required OR allowed_classification_domains ? 'hs'),
    CONSTRAINT commodity_category_rev_method_chk         CHECK (sales_revenue_recognition_method IN (
        'POINT_IN_TIME','OVER_TIME','PCT_COMPLETION','INPUT_METHOD','OUTPUT_METHOD')),
    CONSTRAINT commodity_category_inventory_gate_chk     CHECK (inventory_allowed OR (NOT is_stockable AND NOT is_consumable)),
    CONSTRAINT commodity_category_lot_req_allowed_chk    CHECK (NOT is_lot_tracking_required OR is_lot_tracking_allowed),
    CONSTRAINT commodity_category_serial_req_allowed_chk CHECK (NOT is_serial_tracking_required OR is_serial_tracking_allowed),
    CONSTRAINT commodity_category_status_chk             CHECK (status IN ('active', 'inactive', 'archived'))
);

COMMENT ON TABLE master.commodity_category IS
    'ARCHETYPE=B;SCOPE=T. Shared commodity taxonomy: what the product/item/service is. '
    'Base buy, sell, inventory, classification, sales, and stock behavior lives on this table. '
    'Scoped intent, GL, asset, tax, revenue, and warehouse overrides live in control.commodity_category_*_policy tables. '
    'External standards such as UNSPSC, HS, and NAICS are linked through master.commodity_classification '
    'with owner_type=commodity_category.';


-- =============================================================================
-- § Idempotent column additions (safe for existing databases)
-- =============================================================================
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS buy_allowed      boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS sell_allowed     boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS inventory_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_classification_required boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_hs_required   boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_regulated     boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS allowed_classification_domains jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS uom_code         text;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS sales_revenue_recognition_method text NOT NULL DEFAULT 'POINT_IN_TIME';
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS sales_variable_consideration text;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS sales_standalone_selling_price_method text;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_stockable     boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_consumable    boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS default_valuation_method text;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_lot_tracking_allowed  boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_lot_tracking_required boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_serial_tracking_allowed  boolean NOT NULL DEFAULT false;
ALTER TABLE master.commodity_category ADD COLUMN IF NOT EXISTS is_serial_tracking_required boolean NOT NULL DEFAULT false;


-- =============================================================================
-- § Idempotent constraint refresh
-- =============================================================================
ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS commodity_category_domains_array_chk;
ALTER TABLE master.commodity_category ADD  CONSTRAINT commodity_category_domains_array_chk
    CHECK (jsonb_typeof(allowed_classification_domains) = 'array');

ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS commodity_category_hs_domain_chk;
ALTER TABLE master.commodity_category ADD  CONSTRAINT commodity_category_hs_domain_chk
    CHECK (NOT is_hs_required OR allowed_classification_domains ? 'hs');

ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS commodity_category_rev_method_chk;
ALTER TABLE master.commodity_category ADD  CONSTRAINT commodity_category_rev_method_chk
    CHECK (sales_revenue_recognition_method IN (
        'POINT_IN_TIME','OVER_TIME','PCT_COMPLETION','INPUT_METHOD','OUTPUT_METHOD'));

ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS commodity_category_inventory_gate_chk;
ALTER TABLE master.commodity_category ADD  CONSTRAINT commodity_category_inventory_gate_chk
    CHECK (inventory_allowed OR (NOT is_stockable AND NOT is_consumable));

ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS commodity_category_lot_req_allowed_chk;
ALTER TABLE master.commodity_category ADD  CONSTRAINT commodity_category_lot_req_allowed_chk
    CHECK (NOT is_lot_tracking_required OR is_lot_tracking_allowed);

ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS commodity_category_serial_req_allowed_chk;
ALTER TABLE master.commodity_category ADD  CONSTRAINT commodity_category_serial_req_allowed_chk
    CHECK (NOT is_serial_tracking_required OR is_serial_tracking_allowed);


-- =============================================================================
-- § Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS ccat_tenant_idx             ON master.commodity_category (tenant_id);
CREATE INDEX IF NOT EXISTS ccat_parent_idx             ON master.commodity_category (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ccat_root_idx               ON master.commodity_category (tenant_id, root_category_id);
CREATE INDEX IF NOT EXISTS ccat_active_pidx            ON master.commodity_category (tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ccat_buy_allowed_pidx       ON master.commodity_category (tenant_id, code) WHERE buy_allowed = true;
CREATE INDEX IF NOT EXISTS ccat_sell_allowed_pidx      ON master.commodity_category (tenant_id, code) WHERE sell_allowed = true;
CREATE INDEX IF NOT EXISTS ccat_inventory_allowed_pidx ON master.commodity_category (tenant_id, code) WHERE inventory_allowed = true;


-- =============================================================================
-- § Row-Level Security
-- =============================================================================
ALTER TABLE master.commodity_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.commodity_category FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.commodity_category;
DROP POLICY IF EXISTS tenant_insert ON master.commodity_category;
DROP POLICY IF EXISTS tenant_update ON master.commodity_category;
DROP POLICY IF EXISTS tenant_delete ON master.commodity_category;
DROP POLICY IF EXISTS admin_read    ON master.commodity_category;
DROP POLICY IF EXISTS admin_write   ON master.commodity_category;
CREATE POLICY tenant_read   ON master.commodity_category FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.commodity_category FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.commodity_category FOR UPDATE
    USING     (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.commodity_category FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.commodity_category FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.commodity_category FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- =============================================================================
-- § Triggers
-- =============================================================================
DROP TRIGGER IF EXISTS trg_ccat_updated_at ON master.commodity_category;
CREATE TRIGGER trg_ccat_updated_at
    BEFORE UPDATE ON master.commodity_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccat_status_changed ON master.commodity_category;
CREATE TRIGGER trg_ccat_status_changed
    BEFORE UPDATE ON master.commodity_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_ccat_maintain_root_category ON master.commodity_category;
CREATE TRIGGER trg_ccat_maintain_root_category
    BEFORE INSERT OR UPDATE OF parent_id ON master.commodity_category
    FOR EACH ROW EXECUTE FUNCTION master.trg_ccat_maintain_root_category();

DROP TRIGGER IF EXISTS trg_ccat_valuation_lookup ON master.commodity_category;
CREATE TRIGGER trg_ccat_valuation_lookup
    BEFORE INSERT OR UPDATE OF default_valuation_method ON master.commodity_category
    FOR EACH ROW
    WHEN (NEW.default_valuation_method IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns('master.valuation_method', 'default_valuation_method');
