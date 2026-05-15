-- =============================================================================
-- control/01h_tables_composite_intake.sql
-- Purpose : Composite intake schema extensions
--           (1) Extend entity_flow_section with composite-intake metadata
--           (2) Create control.intake_idempotency for submit deduplication
-- Idempotent: yes — ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--             DO $$ pg_constraint checks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend control.entity_flow_section with composite-intake columns
--    These columns are NULL for standard collapsible sections; they are
--    populated only when config.persistence_mode = 'composite_*_intake'.
-- ---------------------------------------------------------------------------

ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS section_type       text    NOT NULL DEFAULT 'fields';

ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS entity_code        text;

ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS payload_key        text;

-- JSON array of field_name strings for the child entity (repeater/singleton)
ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS field_codes        jsonb;

ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS min_rows           smallint;

ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS max_rows           smallint;

-- Default values pre-filled into each new row in the repeater
ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS default_row        jsonb;

-- If set, user must hold this permission code to interact with the section
ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS permission_code    text;

-- Render section but disable all inputs (view-only regardless of permission)
ALTER TABLE control.entity_flow_section
  ADD COLUMN IF NOT EXISTS restricted_view_only boolean NOT NULL DEFAULT false;

-- Constraints (idempotent)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'efsec_section_type_chk'
       AND conrelid = 'control.entity_flow_section'::regclass
  ) THEN
    ALTER TABLE control.entity_flow_section
      ADD CONSTRAINT efsec_section_type_chk
        CHECK (section_type IN ('fields', 'repeater', 'singleton', 'summary'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'efsec_field_codes_chk'
       AND conrelid = 'control.entity_flow_section'::regclass
  ) THEN
    ALTER TABLE control.entity_flow_section
      ADD CONSTRAINT efsec_field_codes_chk
        CHECK (field_codes IS NULL OR jsonb_typeof(field_codes) = 'array');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'efsec_default_row_chk'
       AND conrelid = 'control.entity_flow_section'::regclass
  ) THEN
    ALTER TABLE control.entity_flow_section
      ADD CONSTRAINT efsec_default_row_chk
        CHECK (default_row IS NULL OR jsonb_typeof(default_row) = 'object');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'efsec_min_max_rows_chk'
       AND conrelid = 'control.entity_flow_section'::regclass
  ) THEN
    ALTER TABLE control.entity_flow_section
      ADD CONSTRAINT efsec_min_max_rows_chk
        CHECK (min_rows IS NULL OR max_rows IS NULL OR min_rows <= max_rows);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1b. Extend master.supplier with composite intake driver fields
--     These columns are populated by the supplier intake wizard and remain
--     NULL on suppliers created via other paths (inline edit, API, import).
--     is_payment_ready   — UI driver: whether the submitter intends payment setup
--     anticipated_risk_tier — compliance hint submitted during onboarding
-- ---------------------------------------------------------------------------

ALTER TABLE master.supplier
  ADD COLUMN IF NOT EXISTS is_payment_ready       boolean;

ALTER TABLE master.supplier
  ADD COLUMN IF NOT EXISTS anticipated_risk_tier  text;

-- ---------------------------------------------------------------------------
-- 2. Create control.intake_idempotency
--    Stores composite-submit fingerprints for 60 minutes.
--    A second POST with the same (tenant, entity_code, idempotency_key)
--    returns the cached result without re-running the transaction.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS control.intake_idempotency (
  id                uuid         NOT NULL DEFAULT shared.uuidv7(),
  tenant_id         uuid         NOT NULL,
  entity_code       text         NOT NULL,
  idempotency_key   text         NOT NULL,
  result_payload    jsonb        NOT NULL DEFAULT '{}',
  created_at        timestamptz  NOT NULL DEFAULT now(),
  expires_at        timestamptz  NOT NULL DEFAULT now() + interval '60 minutes',

  CONSTRAINT iidem_pkey    PRIMARY KEY (id),
  CONSTRAINT iidem_uq      UNIQUE (tenant_id, entity_code, idempotency_key),
  CONSTRAINT iidem_key_fmt CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT iidem_entity_fmt CHECK (entity_code ~ '^[a-z][a-z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS iidem_expires_idx
  ON control.intake_idempotency (expires_at);

COMMENT ON TABLE control.intake_idempotency IS
  'Composite intake submit fingerprints. Prevents duplicate records on network '
  'retries. Rows expire after 60 minutes and are pruned by the maintenance job.';
