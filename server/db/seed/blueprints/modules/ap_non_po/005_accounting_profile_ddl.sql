-- Creates master.accounting_profile. Base DDL never creates this table, but
-- master.company_code_{supplier,customer}_profile carry FK stubs (undefined_table
-- guards) that activate as soon as this file runs.

CREATE TABLE IF NOT EXISTS master.accounting_profile (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    code                text            NOT NULL,
    name                text            NOT NULL,
    description         text,

    direction           text            NOT NULL DEFAULT 'INBOUND',
    subledger_type      text            NOT NULL DEFAULT 'AP',
    domain_hint         text,

    icon_key            text,
    color_token         text,
    sort_order          smallint        NOT NULL DEFAULT 0,

    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    status              text            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ap_pkey              PRIMARY KEY (id),
    CONSTRAINT ap_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ap_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT ap_code_nonempty     CHECK (btrim(code) <> ''),
    CONSTRAINT ap_code_fmt          CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT ap_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT ap_direction_chk     CHECK (direction IN ('INBOUND','OUTBOUND','BILATERAL')),
    CONSTRAINT ap_subledger_chk     CHECK (subledger_type IN (
        'AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE')),
    CONSTRAINT ap_status_chk        CHECK (status IN ('active','inactive','archived'))
);

COMMENT ON TABLE master.accounting_profile IS
    'Identity table for accounting profiles. '
    '1:N with control.acct_profile_config (versioned configuration). '
    'Referenced by master.company_code_supplier_profile.default_accounting_profile_id '
    'and master.company_code_customer_profile.default_accounting_profile_id. '
    'Engine 4.13 resolves profile_config at runtime via intent_to_accounting_profile_rule.';

COMMENT ON COLUMN master.accounting_profile.direction IS
    'INBOUND=AP (supplier-facing), OUTBOUND=AR (customer-facing), BILATERAL=both sides.';
COMMENT ON COLUMN master.accounting_profile.subledger_type IS
    'Must match the subledger_type on the corresponding acct_profile_config. '
    'AP for supplier flows, AR for customer flows, ASSET for fixed-asset profiles.';
COMMENT ON COLUMN master.accounting_profile.domain_hint IS
    'Optional classification hint (OPEX/CAPEX/ADMIN/...). Informational only; '
    'actual routing is driven by business_intent via Engine 4.13 rules.';


DO $$ BEGIN
    ALTER TABLE master.accounting_profile
        ADD CONSTRAINT ap_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.accounting_profile
        ADD CONSTRAINT ap_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.accounting_profile
        ADD CONSTRAINT ap_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;


CREATE INDEX IF NOT EXISTS ap_tenant_status_idx
    ON master.accounting_profile (tenant_id, status)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ap_subledger_idx
    ON master.accounting_profile (tenant_id, subledger_type, direction)
    WHERE is_active = true;


ALTER TABLE master.accounting_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ap_tenant_isolation ON master.accounting_profile;
CREATE POLICY ap_tenant_isolation ON master.accounting_profile
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


DROP TRIGGER IF EXISTS trg_ap_updated_at ON master.accounting_profile;
CREATE TRIGGER trg_ap_updated_at
    BEFORE UPDATE ON master.accounting_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ap_status_changed ON master.accounting_profile;
CREATE TRIGGER trg_ap_status_changed
    BEFORE UPDATE ON master.accounting_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
