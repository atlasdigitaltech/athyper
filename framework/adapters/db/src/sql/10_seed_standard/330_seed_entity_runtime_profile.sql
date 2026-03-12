/* ============================================================================
   Athyper — Comprehensive Entity Runtime Profile Seed
   Seeds feature_flags, identity_config, and data_policy for ALL registered
   entities based on their entity_class archetype.

   Best-practice defaults per entity_class:
     REFERENCE  → minimal flags, no soft-delete, locked
     MASTER     → rich flags (fields/relations/indexes/overlays), soft-delete
     CONTROL    → config flags (fields/relations/indexes), soft-delete
     DOCUMENT   → full flags (lifecycle/numbering/approvals/versioning), soft-delete + immutable-after-state
     LEDGER     → minimal flags + audit, append-only, immutable
     LOG        → audit only, append-only, immutable

   Dependencies: 067_entity_runtime_profile.sql, 303_seed_entity_identity.sql
   Must run AFTER entity_class is backfilled (303) and runtime_profile rows
   exist (067 backfill + trigger).

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- ── Disable guards on meta.entity during seeding ──
-- The dual-write trigger (trg_sync_entity_runtime_to_legacy) fires on every
-- UPDATE to entity_runtime_profile and propagates ALL columns back to
-- meta.entity. This can trip guards when pre-existing data has mismatches
-- (e.g. Commitment/WorkOrder classified as DOCUMENT with audit_only governance).
ALTER TABLE meta.entity DISABLE TRIGGER trg_class_governance_guard;
ALTER TABLE meta.entity DISABLE TRIGGER entity_evolution_guard;
ALTER TABLE meta.entity DISABLE TRIGGER entity_numbering_policy_check;

-- ============================================================================
-- §1  Feature Flags — Class-Based Defaults
-- ============================================================================
-- Sets comprehensive feature_flags based on entity_class archetype.
-- Only updates rows where feature_flags IS NULL (respects manual overrides).

-- ── REFERENCE: minimal — fields only, no governance features ──
UPDATE meta.entity_runtime_profile erp
SET feature_flags = '{
    "fields": true,
    "relations": false,
    "indexes": false,
    "compiledModel": false,
    "permissionPolicies": false,
    "fieldSecurity": false,
    "lifecycle": false,
    "overlays": false,
    "numbering": false,
    "approvals": false,
    "effectiveDating": false,
    "audit": false,
    "approval_required": false,
    "numbering_enabled": false,
    "effective_dating_enabled": false,
    "versioning_mode": "none"
}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'REFERENCE'
  AND erp.feature_flags IS NULL;

-- ── MASTER: rich — fields, relations, indexes, compiled model, security, overlays ──
UPDATE meta.entity_runtime_profile erp
SET feature_flags = '{
    "fields": true,
    "relations": true,
    "indexes": true,
    "compiledModel": true,
    "permissionPolicies": true,
    "fieldSecurity": true,
    "lifecycle": false,
    "overlays": true,
    "numbering": false,
    "approvals": false,
    "effectiveDating": false,
    "audit": true,
    "approval_required": false,
    "numbering_enabled": false,
    "effective_dating_enabled": false,
    "versioning_mode": "none"
}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'MASTER'
  AND erp.feature_flags IS NULL;

-- ── CONTROL: config — fields, relations, indexes, compiled model ──
UPDATE meta.entity_runtime_profile erp
SET feature_flags = '{
    "fields": true,
    "relations": true,
    "indexes": true,
    "compiledModel": true,
    "permissionPolicies": true,
    "fieldSecurity": false,
    "lifecycle": false,
    "overlays": false,
    "numbering": false,
    "approvals": false,
    "effectiveDating": false,
    "audit": true,
    "approval_required": false,
    "numbering_enabled": false,
    "effective_dating_enabled": false,
    "versioning_mode": "none"
}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'CONTROL'
  AND erp.feature_flags IS NULL;

-- ── DOCUMENT: full — all features enabled, sequential versioning ──
-- NOTE: numbering_enabled and approval_required are operational flags that
-- require corresponding configuration (naming_policy, approval definitions).
-- Set to false here; they get enabled per-entity when config is in place.
-- The UI tab flags (numbering, approvals) remain true for visibility.
UPDATE meta.entity_runtime_profile erp
SET feature_flags = '{
    "fields": true,
    "relations": true,
    "indexes": true,
    "compiledModel": true,
    "permissionPolicies": true,
    "fieldSecurity": true,
    "lifecycle": true,
    "overlays": true,
    "numbering": true,
    "approvals": true,
    "effectiveDating": true,
    "audit": true,
    "approval_required": false,
    "numbering_enabled": false,
    "effective_dating_enabled": false,
    "versioning_mode": "sequential"
}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'DOCUMENT'
  AND erp.feature_flags IS NULL;

-- ── LEDGER: immutable — fields, indexes, compiled model, audit only ──
UPDATE meta.entity_runtime_profile erp
SET feature_flags = '{
    "fields": true,
    "relations": true,
    "indexes": true,
    "compiledModel": true,
    "permissionPolicies": false,
    "fieldSecurity": false,
    "lifecycle": false,
    "overlays": false,
    "numbering": false,
    "approvals": false,
    "effectiveDating": false,
    "audit": true,
    "approval_required": false,
    "numbering_enabled": false,
    "effective_dating_enabled": false,
    "versioning_mode": "none"
}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'LEDGER'
  AND erp.feature_flags IS NULL;

-- ── LOG: minimal — audit only ──
UPDATE meta.entity_runtime_profile erp
SET feature_flags = '{
    "fields": true,
    "relations": false,
    "indexes": true,
    "compiledModel": false,
    "permissionPolicies": false,
    "fieldSecurity": false,
    "lifecycle": false,
    "overlays": false,
    "numbering": false,
    "approvals": false,
    "effectiveDating": false,
    "audit": true,
    "approval_required": false,
    "numbering_enabled": false,
    "effective_dating_enabled": false,
    "versioning_mode": "none"
}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'LOG'
  AND erp.feature_flags IS NULL;


-- ============================================================================
-- §2  Identity Config — Skipped (entity-specific)
-- ============================================================================
-- identity_config requires a 'primaryLabelField' key (per chk_entity_identity_label
-- CHECK constraint on meta.entity). Since primaryLabelField is entity-specific
-- (e.g. "name" for Customer, "invoice_number" for PurchaseInvoice), it cannot
-- be set via class-based defaults. Identity config should be seeded per-entity
-- in a dedicated script (e.g. 332_seed_entity_identity_config.sql).


-- ============================================================================
-- §3  Data Policy — Behavioral Defaults
-- ============================================================================
-- Sets data-layer behavioral policy based on entity_class archetype.
-- Only updates rows where data_policy IS NULL.

-- ── REFERENCE: no soft-delete, not append-only, not temporal ──
UPDATE meta.entity_runtime_profile erp
SET data_policy = '{"soft_delete": false, "append_only": false, "temporal": false}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'REFERENCE'
  AND erp.data_policy IS NULL;

-- ── MASTER: soft-delete enabled (preserve audit trail), not append-only ──
UPDATE meta.entity_runtime_profile erp
SET data_policy = '{"soft_delete": true, "append_only": false, "temporal": false}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'MASTER'
  AND erp.data_policy IS NULL;

-- ── CONTROL: soft-delete enabled (audit trail for config changes) ──
UPDATE meta.entity_runtime_profile erp
SET data_policy = '{"soft_delete": true, "append_only": false, "temporal": false}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'CONTROL'
  AND erp.data_policy IS NULL;

-- ── DOCUMENT: soft-delete, immutable after 'posted' state ──
UPDATE meta.entity_runtime_profile erp
SET data_policy = '{"soft_delete": true, "append_only": false, "temporal": false, "immutable_after_state": "posted"}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'DOCUMENT'
  AND erp.data_policy IS NULL;

-- ── LEDGER: append-only (immutable financial records) ──
UPDATE meta.entity_runtime_profile erp
SET data_policy = '{"soft_delete": false, "append_only": true, "temporal": false}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'LEDGER'
  AND erp.data_policy IS NULL;

-- ── LOG: append-only (immutable event streams) ──
UPDATE meta.entity_runtime_profile erp
SET data_policy = '{"soft_delete": false, "append_only": true, "temporal": false}'::jsonb,
    updated_at = now()
FROM meta.entity e
WHERE erp.entity_id = e.id
  AND e.entity_class = 'LOG'
  AND erp.data_policy IS NULL;


-- ============================================================================
-- §4  Re-enable guards
-- ============================================================================

ALTER TABLE meta.entity ENABLE TRIGGER trg_class_governance_guard;
ALTER TABLE meta.entity ENABLE TRIGGER entity_evolution_guard;
ALTER TABLE meta.entity ENABLE TRIGGER entity_numbering_policy_check;

COMMIT;
