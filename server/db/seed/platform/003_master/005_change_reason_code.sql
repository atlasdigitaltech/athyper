-- System change-reason codes for high-risk audit-log entries (tenant_id=NULL, is_system=true).
-- Each of the six codes below is referenced by a specific service path — tenants must NOT shadow them:
--   request_revision        — workflow.route (approver sends back)
--   approver_correction     — approver-side patch on pending_approval
--   manual_account_override — AD route when client sets gl_account_id (account_source=OVERRIDE)
--   tax_recalculation       — tax service re-running on a finalised doc
--   posting_adjustment      — invoice-posting.service post-time tweaks (triggers re-approval)
--   restore_snapshot        — discard-session / version-restore endpoints

INSERT INTO master.change_reason_code
    (tenant_id, code, name, description,
     category, severity, is_system, sort_order, status, created_by)
VALUES

-- workflow
(NULL, 'request_revision',
 'Request Revision',
 'Approver sent the document back to draft for the originator to amend.',
 'workflow', 'normal', true, 10, 'active',
 '00000000-0000-0000-0000-000000000000'),

(NULL, 'approver_correction',
 'Approver Correction',
 'Approver patched the document in place (typically a minor header field) instead of sending back.',
 'workflow', 'elevated', true, 20, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- accounting
(NULL, 'manual_account_override',
 'Manual Account Override',
 'User picked a specific GL account on an accounting_distribution row, '
 'bypassing the profile-resolution engine. Stamps account_source=OVERRIDE.',
 'accounting', 'elevated', true, 30, 'active',
 '00000000-0000-0000-0000-000000000000'),

(NULL, 'tax_recalculation',
 'Tax Recalculation',
 'Tax engine re-ran for a previously-finalised document (rate change, '
 'jurisdiction reclassification, withholding correction).',
 'accounting', 'normal', true, 40, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- financial
(NULL, 'posting_adjustment',
 'Posting Adjustment',
 'Posted-time adjustment to AD values (typically by finance after a budget '
 'override or fund-centre reassignment). Triggers re-approval workflow.',
 'financial', 'critical', true, 50, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- snapshot
(NULL, 'restore_snapshot',
 'Restore From Snapshot',
 'Document graph reverted to a prior snapshot via discard-session or '
 'version-restore. The audit entry captures the snapshot id in new_values.',
 'snapshot', 'elevated', true, 60, 'active',
 '00000000-0000-0000-0000-000000000000')

ON CONFLICT (tenant_id, code) DO NOTHING;
