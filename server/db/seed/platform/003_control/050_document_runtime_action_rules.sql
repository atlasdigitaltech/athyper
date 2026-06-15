-- ============================================================================
-- Document-Runtime Action Rules Seeds (Cleanup Plan v5 — Sprint 4 / P4a)
--
-- Seeds `control.entity_action_rule` for the Purchase Invoice document.
--
-- Resolution semantics (amendment 9 — deny by default):
--   - Missing row → denied
--   - Explicit 'denied' rows below carry a tooltip reason for the UI
--
-- Maps to the design plan §7 state matrix:
--
--   Status              PC.ADD  PC.REPL  PC.DEL  AD.ADD  AD.EDIT  AD.DEL  HEADER.SUBMIT  HEADER.APPROVE
--   ─────────────────── ─────── ──────── ─────── ─────── ──────── ─────── ────────────── ──────────────
--   draft               allow   allow    allow   allow   allow    allow   allow          denied
--   rejected            allow   allow    allow   allow   allow    allow   allow          denied
--   pending_approval    denied  allow    denied  allow   allow    denied  denied         allow
--   approved            denied  allow    denied  allow   allow    denied  denied         denied
--   posted              denied  denied   denied  denied  denied   denied  denied         denied
--   partially_paid      denied  denied   denied  denied  denied   denied  denied         denied
--   fully_paid          denied  denied   denied  denied  denied   denied  denied         denied
--   on_hold             denied  denied   denied  denied  denied   denied  denied         denied
--   reversed            denied  denied   denied  denied  denied   denied  denied         denied
--   cancelled           denied  denied   denied  denied  denied   denied  denied         denied
--
-- Allowed rows are seeded explicitly. Denied rows are seeded only when
-- a clear UI tooltip reason exists; otherwise the client falls back to
-- deny-by-default with a generic "denied in <status>" message.
--
-- Universal HEADER.POSTINGS_PREVIEW.OPEN = allowed in EVERY status — the
-- preview is read-only and always visible per design plan §A5.
--
-- Depends on: control.entity_action_rule (01r_tables_document_runtime_action_rules.sql)
-- Run after: 040_entity.sql
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- ────────────────────────────────────────────────────────────────────────────
-- PI action rules — explicit allowed entries.
-- Anything not listed is denied by default per amendment 9.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO control.entity_action_rule (
    entity_code,
    status,
    action_code,
    capability,
    required_permission,
    reason,
    description,
    metadata,
    created_by
)
VALUES
    -- ── draft / rejected: full edit ─────────────────────────────────
    ('purchase_invoice', 'draft', 'PC.ADD',       'allowed', NULL, NULL, 'Add component in draft.',          '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'PC.REPLACE',   'allowed', NULL, NULL, 'Edit/replace existing component.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'PC.OVERRIDE',  'allowed', NULL, NULL, 'Override inherited component.',    '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'PC.DELETE',    'allowed', NULL, NULL, 'Delete component in draft.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'AD.ADD',       'allowed', NULL, NULL, 'Add distribution split.',          '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'AD.EDIT',      'allowed', NULL, NULL, 'Edit distribution split.',         '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'AD.DELETE',    'allowed', NULL, NULL, 'Delete distribution split.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'HEADER.SUBMIT','allowed', NULL, NULL, 'Submit invoice for approval.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    ('purchase_invoice', 'rejected', 'PC.ADD',       'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'PC.REPLACE',   'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'PC.OVERRIDE',  'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'PC.DELETE',    'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'AD.ADD',       'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'AD.EDIT',      'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'AD.DELETE',    'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'HEADER.SUBMIT','allowed', NULL, NULL, 'Resubmit after rejection.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- ── pending_approval: supersede only on PC; AD remains editable pre-post ─
    ('purchase_invoice', 'pending_approval', 'PC.REPLACE',     'allowed', NULL, NULL, 'Supersede via fn_pc_supersede_only_update.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'PC.OVERRIDE',    'allowed', NULL, NULL, 'Override an inherited row (writes a new manual PC).', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'AD.ADD',         'allowed', NULL, NULL, 'AD remains editable pre-post.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'AD.EDIT',        'allowed', NULL, NULL, 'AD remains editable pre-post.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'HEADER.APPROVE', 'requires_permission', 'PI.APPROVE', NULL, 'Approve the invoice.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'HEADER.REJECT',  'requires_permission', 'PI.APPROVE', NULL, 'Reject + return to draft.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'PC.ADD',         'denied',  NULL, 'Adds frozen in approval; use Replace.',  NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'PC.DELETE',      'denied',  NULL, 'Hard delete forbidden in approval; use Replace with amount_value=0.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'AD.DELETE',      'denied',  NULL, 'Distribution deletion frozen in approval.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- ── approved: same as pending_approval but cannot re-approve ────
    ('purchase_invoice', 'approved', 'PC.REPLACE', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'PC.OVERRIDE','allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'AD.ADD',     'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'AD.EDIT',    'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- ── posted / paid / reversed / cancelled / on_hold: explicit denied
    --     rows with reason text drive the affordance tooltips so users
    --     don't see "denied in posted" with no context.
    ('purchase_invoice', 'posted',           'PC.REPLACE',    'denied', NULL, 'Posted invoices are read-only. Use a credit note to adjust.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'posted',           'AD.EDIT',       'denied', NULL, 'Posted invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'partially_paid',   'PC.REPLACE',    'denied', NULL, 'Paid invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'fully_paid',       'PC.REPLACE',    'denied', NULL, 'Paid invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'reversed',         'PC.REPLACE',    'denied', NULL, 'Reversed invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'cancelled',        'PC.REPLACE',    'denied', NULL, 'Cancelled invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'on_hold',          'PC.REPLACE',    'denied', NULL, 'Invoice is on hold; release before editing.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- ── Postings Preview: always read-only, always allowed (§A5) ─────
    ('purchase_invoice', 'draft',            'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, 'Postings preview is read-only and always available.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved',         'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected',         'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'posted',           'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, 'Frozen with JE link post-posting.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'partially_paid',   'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'fully_paid',       'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'on_hold',          'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'reversed',         'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'cancelled',        'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000')

ON CONFLICT (entity_code, status, action_code) DO UPDATE
SET capability          = EXCLUDED.capability,
    required_permission = EXCLUDED.required_permission,
    reason              = EXCLUDED.reason,
    description         = EXCLUDED.description,
    metadata            = EXCLUDED.metadata,
    updated_at          = now();

COMMIT;
