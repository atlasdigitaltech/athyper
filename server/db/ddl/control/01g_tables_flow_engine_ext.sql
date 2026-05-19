-- =============================================================================
-- control/01g_tables_flow_engine_ext.sql
-- Purpose : Flow engine schema extensions — new entity_flow_section table,
--           additional columns on entity_flow_field (section_key, display_size),
--           associated inline constraints.
-- Tables  : control.entity_flow_section  (CREATE)
--           control.entity_flow_field    (ALTER — columns + constraints)
-- Idempotent: yes — uses CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--             and DO $$ pg_constraint checks.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New table: control.entity_flow_section
--    Collapsible / conditional section groupings within a flow step.
--    Fields bind to a section via entity_flow_field.section_key.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS control.entity_flow_section (
  id                uuid        NOT NULL DEFAULT shared.uuidv7(),
  tenant_id         uuid,                                          -- NULL = platform-level
  flow_step_id      uuid        NOT NULL,                          -- FK in 03_constraints.sql
  section_key       text        NOT NULL,
  label             text        NOT NULL,
  description       text,
  sort_order        smallint    NOT NULL DEFAULT 0,
  collapse_default  boolean     NOT NULL DEFAULT false,
  visible_when      jsonb,                                         -- NULL or JSON object
  reveal_behavior   text        NOT NULL DEFAULT 'honor_default',
  icon_key          text,
  help_text         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        NOT NULL,
  updated_at        timestamptz,
  updated_by        uuid,

  CONSTRAINT efsec_pkey          PRIMARY KEY (id),
  CONSTRAINT efsec_tenant_id_uq  UNIQUE NULLS NOT DISTINCT (tenant_id, id),
  CONSTRAINT efsec_step_key_uq   UNIQUE (flow_step_id, section_key),
  CONSTRAINT efsec_step_order_uq UNIQUE (flow_step_id, sort_order) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT efsec_section_key_fmt
    CHECK (section_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT efsec_label_nonempty
    CHECK (btrim(label) <> ''),
  CONSTRAINT efsec_visible_when_chk
    CHECK (visible_when IS NULL OR jsonb_typeof(visible_when) = 'object'),
  CONSTRAINT efsec_reveal_chk
    CHECK (reveal_behavior IN ('auto_expand', 'honor_default'))
);

COMMENT ON TABLE control.entity_flow_section IS
  'Collapsible/conditional section groupings within a flow step. Each section '
  'has a label, collapse default, optional visibility rule, and reveal behavior. '
  'Fields bind to sections via entity_flow_field.section_key.';

-- ---------------------------------------------------------------------------
-- 2. New columns on control.entity_flow_field
-- ---------------------------------------------------------------------------

ALTER TABLE control.entity_flow_field
  ADD COLUMN IF NOT EXISTS section_key  text;

ALTER TABLE control.entity_flow_field
  ADD COLUMN IF NOT EXISTS display_size text;

-- ---------------------------------------------------------------------------
-- 3. Idempotent constraints on control.entity_flow_field
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eff_section_key_fmt'
       AND conrelid = 'control.entity_flow_field'::regclass
  ) THEN
    ALTER TABLE control.entity_flow_field
      ADD CONSTRAINT eff_section_key_fmt
        CHECK (section_key IS NULL OR section_key ~ '^[a-z][a-z0-9_]*$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eff_display_size_chk'
       AND conrelid = 'control.entity_flow_field'::regclass
  ) THEN
    ALTER TABLE control.entity_flow_field
      ADD CONSTRAINT eff_display_size_chk
        CHECK (display_size IS NULL OR display_size IN ('prominent', 'standard', 'compact'));
  END IF;
END $$;
