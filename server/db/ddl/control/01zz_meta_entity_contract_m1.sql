-- ============================================================================
-- Meta Entity Contract M1: canonical document storage and version ownership.
--
-- This is deliberately additive. Legacy behaviors.studio_contract_v2 remains a
-- read-only compatibility source during the M1 rollout; all new Studio writes
-- target the dedicated columns below.
-- ============================================================================

ALTER TABLE control.entity_version
    ADD COLUMN IF NOT EXISTS contract_schema_version text,
    ADD COLUMN IF NOT EXISTS contract_document jsonb,
    ADD COLUMN IF NOT EXISTS contract_hash text,
    ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'NOT_VALIDATED',
    ADD COLUMN IF NOT EXISTS validation_diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS validated_at timestamptz,
    ADD COLUMN IF NOT EXISTS validated_by uuid,
    ADD COLUMN IF NOT EXISTS base_version_id uuid,
    ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
    ADD COLUMN IF NOT EXISTS submitted_by uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_by uuid,
    ADD COLUMN IF NOT EXISTS published_at timestamptz,
    ADD COLUMN IF NOT EXISTS published_by uuid,
    ADD COLUMN IF NOT EXISTS approval_break_glass boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS approval_break_glass_reason text,
    ADD COLUMN IF NOT EXISTS approval_break_glass_ticket text;

-- One-time compatibility conversion. The generic behaviors member is retained
-- temporarily so pre-M1 compilers can continue reading during a rolling deploy.
UPDATE control.entity_version
   SET contract_document = behaviors -> 'studio_contract_v2',
       contract_schema_version = COALESCE(
           behaviors #>> '{studio_contract_v2,contract_schema_version}',
           CASE WHEN behaviors ? 'studio_contract_v2' THEN '2.0' END
       ),
       contract_hash = COALESCE(
           behaviors #>> '{studio_contract_v2,version_contract,contract_hash}',
           version_hash
       ),
       validation_status = CASE
           WHEN behaviors ? 'studio_contract_v2' THEN 'VALID'
           ELSE validation_status
       END,
       validation_diagnostics = CASE
           WHEN behaviors ? 'studio_contract_v2' THEN '[]'::jsonb
           ELSE validation_diagnostics
       END,
       validated_at = CASE
           WHEN behaviors ? 'studio_contract_v2' THEN COALESCE(updated_at, created_at)
           ELSE validated_at
       END,
       validated_by = CASE
           WHEN behaviors ? 'studio_contract_v2' THEN COALESCE(updated_by, created_by)
           ELSE validated_by
       END
 WHERE contract_document IS NULL
   AND jsonb_typeof(behaviors -> 'studio_contract_v2') = 'object';

-- contract_v2 was incorrectly used as a business change category. Convert it
-- after extracting the document; contract format now lives in
-- contract_schema_version.
UPDATE control.entity_version
   SET change_type = 'behavioral'
 WHERE change_type = 'contract_v2';

ALTER TABLE control.entity_numbering_config
    ADD COLUMN IF NOT EXISTS entity_version_id uuid;

ALTER TABLE control.entity_lifecycle
    ADD COLUMN IF NOT EXISTS entity_version_id uuid;

ALTER TABLE control.entity_lifecycle_state_mask
    ADD COLUMN IF NOT EXISTS entity_version_id uuid,
    ADD COLUMN IF NOT EXISTS lifecycle_state_id uuid;

ALTER TABLE control.entity_action_rule
    ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT shared.uuidv7(),
    ADD COLUMN IF NOT EXISTS tenant_id uuid,
    ADD COLUMN IF NOT EXISTS entity_version_id uuid;

COMMENT ON COLUMN control.entity_version.contract_document IS
    'Immutable canonical Contract JSON for this entity version. Studio authors this column; projections are generated.';
COMMENT ON COLUMN control.entity_version.contract_hash IS
    'SHA-256 of canonical Contract JSON. Used with lock_version for optimistic concurrency and publication identity.';
COMMENT ON COLUMN control.entity_version.validation_diagnostics IS
    'Machine-readable validation diagnostics; an array of path/code/message objects.';
COMMENT ON COLUMN control.entity_version.change_type IS
    'Business change category only: structural, behavioral, governance, label, or fix.';
COMMENT ON COLUMN control.entity_numbering_counter.last_value IS
    'Runtime-only state. Metadata publication, clone, import, and rollback must never modify this value.';
