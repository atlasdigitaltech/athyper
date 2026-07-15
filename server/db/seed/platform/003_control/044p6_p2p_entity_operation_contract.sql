-- ============================================================================
-- P6 â€” Register the 6 permission codes referenced below.
-- control.entity_operation.permission_code has FK eo_permission_fk into
-- shared.permission(code); each op code must exist as a permission first.
-- Kept in the P6 seed so the file is self-contained; upstream permission
-- taxonomy seeds (017_permission.sql) do not need editing.
-- ============================================================================

INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted,
     plane_eligibility, sort_order, created_by)
SELECT v.code, v.name, c.id, 'record', 'low', false,
       ARRAY['neon']::text[], v.so,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM   shared.permission_category c
JOIN  (VALUES
    ('commitment_from_requisition',    'Create Commitment from Requisition',    'workflow', 200),
    ('receipt_from_commitment',        'Create Receipt from Commitment',        'workflow', 210),
    ('service_sheet_from_commitment',  'Create Service Sheet from Commitment',  'workflow', 220),
    ('invoice_from_receipt',           'Create Invoice from Receipt',           'workflow', 230),
    ('invoice_from_service_sheet',     'Create Invoice from Service Sheet',     'workflow', 240),
    ('payment_from_invoice',           'Create Payment from Invoice',           'workflow', 250)
) AS v(code, name, category, so) ON c.code = v.category
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- P6 â€” Register P2P chain-transition ops in control.entity_operation.
--
-- The TS-side entity-op.registry.ts is the source of truth for DISPATCH
-- (URL â†’ handler). These rows exist so the ops are DISCOVERABLE â€” surfaced
-- in the entity's operation list for UI wiring, permission checks, and
-- future auto-emission of outbox events via a shared dispatcher.
--
-- handler_type='API' + handler_target=<op_code>: the records-route dispatcher
-- resolves this by calling POST /records/:entity/op/:handler_target.
--
-- surface='HIDDEN' + placement='COMMAND': the op is not surfaced as a UI
-- toolbar button; it's an inter-document operation invoked from a picker.
-- The picker page (e.g. /p2p/receipt-from-commitment/[commitmentId]/page.tsx)
-- calls the API path directly with a curated payload.
--
-- Adding a new op requires:
--   1. Register handler in entity-op.registry.ts
--   2. Add row here (permission_code = op_code)
--   3. Optionally add a permission row in shared.permission if RBAC needed
-- ============================================================================

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::smallint,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'purchase_order',   'commitment_from_requisition',   'HIDDEN', 'COMMAND', 'API', 'commitment_from_requisition',   false, 300, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt',          'receipt_from_commitment',       'HIDDEN', 'COMMAND', 'API', 'receipt_from_commitment',       false, 310, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet',    'service_sheet_from_commitment', 'HIDDEN', 'COMMAND', 'API', 'service_sheet_from_commitment', false, 320, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'invoice_from_receipt',          'HIDDEN', 'COMMAND', 'API', 'invoice_from_receipt',          false, 330, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'invoice_from_service_sheet',    'HIDDEN', 'COMMAND', 'API', 'invoice_from_service_sheet',    false, 340, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry',    'payment_from_invoice',          'HIDDEN', 'COMMAND', 'API', 'payment_from_invoice',          false, 350, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO UPDATE
   SET handler_type   = EXCLUDED.handler_type,
       handler_target = EXCLUDED.handler_target,
       surface        = EXCLUDED.surface,
       placement      = EXCLUDED.placement,
       updated_at     = now(),
       updated_by     = EXCLUDED.created_by;

