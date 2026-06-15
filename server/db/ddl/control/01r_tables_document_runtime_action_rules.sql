-- ============================================================================
-- control/01r_tables_document_runtime_action_rules.sql
--
-- Concept: control.entity_action_rule — descriptor-driven action capabilities
-- per (entity, status) tuple. Consumed by the `useDocumentAffordance` resolver
-- to decide whether a UI action should render allowed / denied / requires-
-- permission per cleanup plan v5 §3.7 + amendment 9.
--
-- Action codes follow the convention <SURFACE>.<VERB>:
--   PC.ADD, PC.REPLACE, PC.OVERRIDE, PC.DELETE
--   AD.ADD, AD.EDIT, AD.DELETE
--   HEADER.SUBMIT, HEADER.APPROVE, HEADER.REJECT, HEADER.HOLD, HEADER.RESUME
--   POSTINGS_PREVIEW.OPEN
--   …
--
-- Resolution semantics (amendment 9 — deny by default):
--   - Missing row for (entity, status, action_code) → denied
--   - capability='denied' → denied (with optional reason)
--   - capability='allowed' → allowed
--   - capability='requires_permission' → caller must hold required_permission
--
-- Combined client-side with:
--   - lifecycle state mask (`control.entity_lifecycle_state_mask`)
--   - RBAC permission set
--   The three gates are AND-combined — any denial wins.
--
-- Depends on: control schema bootstrap
-- Spec: cleanup-plan v5 §3.7 / §5.7 / amendment 9
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.entity_action_rule (
    -- Identity
    entity_code         text          NOT NULL,
    status              text          NOT NULL,
    action_code         text          NOT NULL,

    -- Capability
    capability          text          NOT NULL,
    required_permission text,

    -- Reason surfaced when the affordance is denied (powers tooltips +
    -- right-rail validation hints in the document drawer).
    reason              text,

    -- Free-form context
    description         text,

    -- Standard envelope
    metadata            jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    created_by          uuid          NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ear_pkey                   PRIMARY KEY (entity_code, status, action_code),
    CONSTRAINT ear_capability_chk         CHECK (capability IN (
        'allowed', 'denied', 'requires_permission')),

    -- requires_permission rows must specify which permission; other rows
    -- must NOT specify one.
    CONSTRAINT ear_permission_consistency_chk CHECK (
        (capability = 'requires_permission' AND required_permission IS NOT NULL)
        OR
        (capability <> 'requires_permission' AND required_permission IS NULL)
    ),
    CONSTRAINT ear_action_code_chk        CHECK (btrim(action_code) <> ''),
    CONSTRAINT ear_metadata_chk           CHECK (jsonb_typeof(metadata) = 'object')
);

-- Resolution lookup by (entity, status). The client typically fetches
-- ALL rules for an entity once and reads them by status + action code.
CREATE INDEX IF NOT EXISTS ix_ear_entity_status
    ON control.entity_action_rule (entity_code, status);

-- Faster "what statuses allow this action?" queries (used by descriptor
-- compile-time integrity scans).
CREATE INDEX IF NOT EXISTS ix_ear_entity_action
    ON control.entity_action_rule (entity_code, action_code);

COMMENT ON TABLE control.entity_action_rule IS
    'ARCHETYPE=B;SCOPE=N. Document-runtime action capability registry. Deny-by-'
    'default per amendment 9: missing row for (entity, status, action_code) '
    'is rejected at affordance resolution. Combined client-side with '
    'lifecycle state mask + RBAC; ANY denial wins. Cleanup-plan v5 §3.7.';

COMMENT ON COLUMN control.entity_action_rule.action_code IS
    'Convention <SURFACE>.<VERB>. PC.ADD, PC.REPLACE, PC.OVERRIDE, PC.DELETE, '
    'AD.ADD, AD.EDIT, AD.DELETE, HEADER.SUBMIT, HEADER.APPROVE, …';

COMMENT ON COLUMN control.entity_action_rule.capability IS
    '''allowed'': UI shows the affordance enabled. '
    '''denied'': UI shows the affordance disabled (with `reason` tooltip when set). '
    '''requires_permission'': caller must hold `required_permission` in their session.';

COMMENT ON COLUMN control.entity_action_rule.reason IS
    'Tooltip text rendered alongside the disabled affordance. Free-form, '
    'short enough to fit a tooltip (e.g. "Action denied in approval status").';
