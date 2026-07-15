-- =============================================================================
-- 046i_po_state_mask_contract.sql â€” Purchase Order per-status record capability masks
--
-- Scope (F1, F2 audit resolutions):
--   can_edit   â€” field editing OR any lifecycle EDIT_VERB action may fire
--                (useDocumentAffordance blocks EDIT_VERBS when false).
--                EDIT_VERBS: ADD, REPLACE, OVERRIDE, DELETE, EDIT, SUBMIT,
--                APPROVE, REJECT, HOLD, RESUME, POST, REVERSE, CANCEL.
--   can_delete â€” record-level DELETE is permitted.
--
-- Per-action availability by status lives in control.entity_action_rule
-- (see 046j_po_action_rule_contract.sql). This file does NOT encode op whitelists;
-- can_transition_to is left NULL because the runtime does not enforce it
-- (see packages/shared/runtime-domain/runtime-canvas/src/document-runtime/useDocumentAffordance.ts).
--
-- Load order: after 045_control_entity_lifecycle_contract.sql, before 046j_po_action_rule_contract.sql.
-- =============================================================================
BEGIN;

DELETE FROM control.entity_lifecycle_state_mask
 WHERE tenant_id IS NULL AND entity_name = 'purchase_order';

INSERT INTO control.entity_lifecycle_state_mask
    (tenant_id, entity_name, record_status, can_edit, can_delete,
     can_transition_to, disabled_reason, applies_to_planes, created_by)
VALUES
    -- draft: authoring, delete allowed
    (NULL, 'purchase_order', 'draft',
     true, true, NULL, NULL, ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- pending_approval: EDIT_VERBS submit/approve/deny/cancel/amend need can_edit=true
    (NULL, 'purchase_order', 'pending_approval',
     true, false, NULL, 'Delete not permitted after submit', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- rejected: lifecycle revision is allowed; field editing begins only after
    -- the revise transition returns the PO to draft.
    (NULL, 'purchase_order', 'rejected',
     true, false, NULL, 'Rejected — revise to return to draft', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- approved: EDIT_VERBS cancel/hold need can_edit=true (F2 fix); field edits
    -- still gated per-field via entity_field.editability.editable_in_status.
    (NULL, 'purchase_order', 'approved',
     true, false, NULL, NULL, ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- active: cancel/hold/revise/amend + line edits
    (NULL, 'purchase_order', 'active',
     true, false, NULL, NULL, ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- partially_fulfilled: close/hold/revise/amend
    (NULL, 'purchase_order', 'partially_fulfilled',
     true, false, NULL, NULL, ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- suspended: resume is EDIT_VERB
    (NULL, 'purchase_order', 'suspended',
     true, false, NULL, 'PO on hold', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- fully_fulfilled: only close remains (EDIT_VERB) â†’ keep true
    (NULL, 'purchase_order', 'fully_fulfilled',
     true, false, NULL, 'Fully fulfilled â€” close only', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    -- Terminal frozen states: no EDIT_VERB should fire
    (NULL, 'purchase_order', 'closed',
     false, false, NULL, 'PO is closed', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_order', 'expired',
     false, false, NULL, 'PO expired', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_order', 'cancelled',
     false, false, NULL, 'PO is cancelled', ARRAY['neon'],
     '00000000-0000-0000-0000-000000000000');

COMMIT;




