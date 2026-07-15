-- Canonical phase-1 DDL for the accounting profile identity table.
--
-- The AP blueprint keeps an idempotent compatibility CREATE TABLE for module
-- installs, but this table must exist before phase-2 control.entity discovery.
-- Otherwise 040/041/042 cannot register the entity, version, or fields and
-- company-code profile references fail graph preflight after a clean reset.

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
    CONSTRAINT ap_subledger_chk     CHECK (subledger_type IN ('AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE')),
    CONSTRAINT ap_status_chk        CHECK (status IN ('active','inactive','archived'))
);
