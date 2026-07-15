-- =============================================================================
-- 046j_po_action_rule_contract.sql â€” Purchase Order per-status action affordance rules
--
-- Consumed by packages/shared/runtime-domain/runtime-canvas/src/document-runtime/
-- useDocumentAffordance.ts (Gate 1). Deny-by-default per amendment 9:
-- missing (entity_code, status, action_code) row = denied.
--
--   capability='allowed'              â†’ UI shows enabled (no permission gate here)
--   capability='requires_permission'  â†’ runtime enforces required_permission
--   capability='denied'               â†’ explicitly denied with tooltip reason
--
-- Action codes follow <SURFACE>.<VERB> convention (DDL comment ln 86):
--   HEADER.<VERB>  â†’ header-level lifecycle/print/copy actions
--   LINE.<VERB>    â†’ line-level add/edit/delete/close/cancel
--
-- Load order: after 046i_po_state_mask_contract.sql.
-- =============================================================================
BEGIN;

DELETE FROM control.entity_action_rule WHERE entity_code = 'purchase_order';

INSERT INTO control.entity_action_rule
    (entity_code, status, action_code, capability, required_permission, reason, description, created_by)
VALUES
    -- â”€â”€ draft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'draft', 'HEADER.SUBMIT',  'requires_permission', 'submit', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'HEADER.CANCEL',  'requires_permission', 'cancel', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'HEADER.EXPORT',  'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'HEADER.COPY',    'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'HEADER.IMPORT',  'requires_permission', 'import', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'HEADER.PRINT',   'denied',              NULL,     'Print blocked pre-approval', NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'LINE.ADD',       'requires_permission', 'add_line',    NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'LINE.EDIT',      'requires_permission', 'edit_line',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'draft', 'LINE.DELETE',    'requires_permission', 'delete',      NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ pending_approval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'pending_approval', 'HEADER.APPROVE', 'requires_permission', 'approve', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.REJECT',  'requires_permission', 'reject',  NULL, 'Reject purchase order.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.RETURN',  'requires_permission', 'return',  NULL, 'Return purchase order for revision.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.WITHDRAW','requires_permission', 'withdraw',NULL, 'Withdraw the approval request.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.CANCEL',  'requires_permission', 'cancel',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.EXPORT',  'requires_permission', 'export',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.COPY',    'requires_permission', 'copy',    NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'pending_approval', 'HEADER.PRINT',   'denied',              NULL,      'Print blocked pre-approval', NULL, '00000000-0000-0000-0000-000000000000'),

    -- rejected remains revisable but cannot transact
    ('purchase_order', 'rejected', 'HEADER.REVISE', 'requires_permission', 'revise', NULL, 'Revise and resubmit rejected purchase order.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'rejected', 'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'rejected', 'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ approved â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'approved', 'HEADER.PLACE_ORDER', 'requires_permission', 'PO.PLACE_ORDER', NULL, 'Place order with supplier.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.CANCEL',  'requires_permission', 'cancel', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.SHORT_CLOSE', 'requires_permission', 'PO.SHORT_CLOSE', NULL, 'Short-close approved purchase order.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.HOLD',    'requires_permission', 'PO.HOLD', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.EXPIRE',  'requires_permission', 'PO.EXPIRE', NULL, 'Expire under the configured business-date policy.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.REVISE',  'requires_permission', 'revise', 'Approved PO edits require revise', NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.AMEND',   'requires_permission', 'amend',  'Supplier-facing amendment',        NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.PRINT',   'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.EXPORT',  'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'HEADER.COPY',    'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'LINE.CLOSE',     'requires_permission', 'close_line',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'approved', 'LINE.CANCEL',    'requires_permission', 'cancel_line', NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ active â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'active', 'HEADER.CANCEL', 'requires_permission', 'cancel', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.SHORT_CLOSE', 'requires_permission', 'PO.SHORT_CLOSE', NULL, 'Short-close remaining commitment.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.HOLD',   'requires_permission', 'PO.HOLD', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.EXPIRE', 'requires_permission', 'PO.EXPIRE', NULL, 'Expire under the configured business-date policy.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.CREATE_RECEIPT', 'requires_permission', 'create_receipt', NULL, 'Create receipt from purchase order.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.CREATE_SERVICE_SHEET', 'requires_permission', 'create_service_sheet', NULL, 'Create service sheet from purchase order.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.REVISE', 'requires_permission', 'revise', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.AMEND',  'requires_permission', 'amend',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'LINE.EDIT',     'requires_permission', 'edit_line',   'Only fields whose editable_in_status contains active', NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'LINE.CLOSE',    'requires_permission', 'close_line',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'active', 'LINE.CANCEL',   'requires_permission', 'cancel_line', NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ partially_fulfilled â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'partially_fulfilled', 'HEADER.SHORT_CLOSE', 'requires_permission', 'PO.SHORT_CLOSE', NULL, 'Short-close remaining commitment.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.HOLD',   'requires_permission', 'PO.HOLD', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.CANCEL', 'requires_permission', 'cancel', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.CREATE_RECEIPT', 'requires_permission', 'create_receipt', NULL, 'Receive remaining goods.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.CREATE_SERVICE_SHEET', 'requires_permission', 'create_service_sheet', NULL, 'Accept remaining services.', '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.REVISE', 'requires_permission', 'revise', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.AMEND',  'requires_permission', 'amend',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'LINE.EDIT',     'requires_permission', 'edit_line',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'partially_fulfilled', 'LINE.CLOSE',    'requires_permission', 'close_line', NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ suspended â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'suspended', 'HEADER.RELEASE_HOLD', 'requires_permission', 'PO.RELEASE_HOLD', 'Release hold', NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'suspended', 'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'suspended', 'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'suspended', 'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ fully_fulfilled â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'fully_fulfilled', 'HEADER.CLOSE',  'requires_permission', 'close',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'fully_fulfilled', 'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'fully_fulfilled', 'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'fully_fulfilled', 'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ closed / expired / cancelled: read-only surfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_order', 'closed',    'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'closed',    'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'closed',    'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    ('purchase_order', 'expired',   'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'expired',   'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'expired',   'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000'),

    ('purchase_order', 'cancelled', 'HEADER.PRINT',  'requires_permission', 'print',  NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'cancelled', 'HEADER.EXPORT', 'requires_permission', 'export', NULL, NULL, '00000000-0000-0000-0000-000000000000'),
    ('purchase_order', 'cancelled', 'HEADER.COPY',   'requires_permission', 'copy',   NULL, NULL, '00000000-0000-0000-0000-000000000000');

COMMIT;


