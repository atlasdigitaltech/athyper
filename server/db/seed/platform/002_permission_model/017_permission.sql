-- All atomic permissions across categories. Depends on 015_permission_category.
-- Code conventions:
--   lowercase verbs (read, approve, post)         → atomic record-level CRUD/flow actions
--   dotted lowercase (supplier.tax.submit)        → domain-specific section/flow guards
--   CAPS MODULE.RESOURCE.ACTION (JOBS.BOARD.VIEW) → privileged capability for control-plane surfaces
-- All gating MUST flow through the persona → group → role → permission chain.
-- Never gate via isAdmin/role-claim shortcuts.
-- plane_eligibility computed below routes MESH.* to mesh, PLATFORM.*/JOBS.* to admin, rest to neon.

INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, plane_eligibility, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr,
       CASE
         WHEN v.code LIKE 'MESH.%' THEN ARRAY['mesh']::text[]
         WHEN v.code IN ('IAM.PARAMETER.MANAGE', 'PLATFORM.REFERENCE.VIEW', 'PLATFORM.REFERENCE.IMPORT',
                         'PLATFORM.TAXONOMY.VIEW', 'PLATFORM.TAXONOMY.IMPORT',
                         'PLATFORM.CATALOG.VIEW', 'PLATFORM.CATALOG.MANAGE',
                         'PLATFORM.SUBSCRIPTIONS.VIEW', 'PLATFORM.SUBSCRIPTIONS.MANAGE',
                         'JOBS.BOARD.VIEW', 'JOBS.QUEUE.MANAGE')
           OR v.code LIKE 'PLATFORM.%'
           THEN ARRAY['admin']::text[]
         WHEN v.code = 'IAM.SESSION.VIEW' THEN ARRAY['neon', 'admin']::text[]
         ELSE ARRAY['neon']::text[]
       END AS plane_eligibility,
       v.so,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM   shared.permission_category c
JOIN  (VALUES
    -- entity
    ('read',                        'Read',                              'entity',        'record',  'low',      false,  10),
    ('create',                      'Create',                            'entity',        'record',  'low',      false,  20),
    ('update',                      'Update',                            'entity',        'record',  'low',      false,  30),
    ('edit',                        'Edit',                              'entity',        'record',  'low',      false,  30),
    ('exit',                        'Exit',                              'entity',        'record',  'low',      false,  35),
    ('delete_draft',                'Delete Draft',                      'entity',        'record',  'low',      false,  40),
    ('delete',                      'Delete',                            'entity',        'record',  'high',     false,  50),
    -- line-level entity actions (Phase 1.2 — commitment_line ops)
    ('add_line',                    'Add Line',                          'entity',        'record',  'low',      false,  60),
    ('edit_line',                   'Edit Line',                         'entity',        'record',  'low',      false,  61),
    ('close_line',                  'Close Line',                        'entity',        'record',  'medium',   false,  62),
    ('cancel_line',                 'Cancel Line',                       'entity',        'record',  'medium',   false,  63),
    -- workflow
    ('submit',                      'Submit',                            'workflow',      'record',  'low',      false,  10),
    ('amend',                       'Amend',                             'workflow',      'record',  'low',      false,  20),
    ('revise',                      'Revise Document',                   'workflow',      'record',  'medium',   false,  25),
    ('cancel',                      'Cancel',                            'workflow',      'record',  'medium',   false,  30),
    ('close',                       'Close',                             'workflow',      'record',  'medium',   false,  40),
    ('reopen',                      'Reopen',                            'workflow',      'record',  'medium',   false,  50),
    ('withdraw',                    'Withdraw',                          'workflow',      'record',  'low',      false,  60),
    ('escalate',                    'Escalate',                          'workflow',      'record',  'low',      false,  70),
    ('approve',                     'Approve',                           'workflow',      'record',  'medium',   false,  80),
    ('deny',                        'Deny',                              'workflow',      'record',  'medium',   false,  90),
    ('void',                        'Void',                              'workflow',      'record',  'high',     false,  95),
    ('return',                      'Return Document for Revision',      'workflow',      'record',  'low',      false, 100),
    ('request_info',                'Request More Information',          'workflow',      'record',  'low',      false, 105),
    -- finance
    ('post',                        'Post',                              'finance',       'record',  'high',     false,  10),
    ('reverse',                     'Reverse',                           'finance',       'record',  'critical', true,   20),
    ('reconcile',                   'Reconcile',                         'finance',       'record',  'high',     false,  30),
    ('transmit',                    'Transmit Payment',                  'finance',       'record',  'high',     false,  31),
    ('clear',                       'Clear Payment',                     'finance',       'record',  'high',     false,  32),
    ('supplier.tax.submit',         'Submit Tax Profile',                'finance',       'record',  'low',      false,  40),
    ('supplier.tax.verify',         'Verify Tax Profile',                'finance',       'record',  'medium',   false,  50),
    ('supplier.tax.restricted',     'Restricted Tax Access',             'finance',       'record',  'high',     false,  60),
    ('supplier.banking.submit',     'Submit Bank Details',               'finance',       'record',  'medium',   false,  70),
    ('supplier.banking.verify',     'Verify Bank Account',               'finance',       'record',  'high',     false,  80),
    ('supplier.banking.admin',      'Administer Banking',                'finance',       'record',  'high',     false,  90),
    ('ap.override_tax_mode',        'Override Invoice Tax Mode',         'finance',       'record',  'medium',   false, 100),
    ('ap.promote_proforma',         'Promote Proforma Invoice to Draft', 'finance',       'record',  'medium',   false, 110),
    -- utility
    ('copy',                        'Copy',                              'utility',       'record',  'low',      false,  10),
    ('merge',                       'Merge',                             'utility',       'record',  'critical', true,   20),
    ('report',                      'Report',                            'utility',       'record',  'low',      false,  30),
    ('print',                       'Print',                             'utility',       'record',  'low',      false,  40),
    ('import',                      'Import',                            'utility',       'record',  'medium',   true,   50),
    ('export',                      'Export',                            'utility',       'record',  'low',      false,  60),
    ('view_je',                     'View Journal Entry',                'utility',       'record',  'low',      false,  70),
    -- bulk
    ('bulk_import',                 'Bulk Import',                       'bulk',          'tenant',  'high',     true,   10),
    ('bulk_export',                 'Bulk Export',                       'bulk',          'tenant',  'high',     true,   20),
    ('bulk_update',                 'Bulk Update',                       'bulk',          'tenant',  'critical', true,   30),
    ('bulk_delete',                 'Bulk Delete',                       'bulk',          'tenant',  'critical', true,   40),
    -- delegation
    ('delegate',                    'Delegate',                          'delegation',    'record',  'medium',   false,  10),
    ('share_read',                  'Share Read-Only',                   'delegation',    'record',  'low',      false,  20),
    ('share_edit',                  'Share Editable',                    'delegation',    'record',  'medium',   false,  30),
    -- collaboration
    ('add_comment',                 'Add Comment',                       'collaboration', 'record',  'low',      false,  10),
    ('add_attachment',              'Add Attachment',                    'collaboration', 'record',  'low',      false,  20),
    ('attachment.read',             'Read Attachments',                  'collaboration', 'record',  'low',      false,  21),
    ('attachment.create',           'Create Attachments',                'collaboration', 'record',  'low',      false,  22),
    ('attachment.update',           'Update Attachments',                'collaboration', 'record',  'medium',   false,  23),
    ('attachment.delete',           'Delete Attachments',                'collaboration', 'record',  'high',     false,  24),
    ('attachment.reindex',          'Reindex Attachment Content',        'collaboration', 'record',  'high',     true,   25),
    ('del_others_comment',          'Delete Others Comment',             'collaboration', 'record',  'medium',   false,  30),
    ('del_others_attach',           'Delete Others Attachment',          'collaboration', 'record',  'medium',   false,  40),
    ('follow',                      'Follow',                            'collaboration', 'record',  'low',      false,  50),
    ('tag',                         'Tag',                               'collaboration', 'record',  'low',      false,  60),
    ('records.lock.force_release',   'Force Release Record Lock',          'utility',       'tenant',  'high',     false,  70),
    -- special
    ('feature_diagnostic',          'Self Diagnostic Tool',              'special',       'special', 'critical', false,  10),
    ('feature_theme',               'Theme Change',                      'special',       'special', 'low',      false,  20),
    ('feature_view',                'View Access Features',              'special',       'special', 'low',      false,  30),
    ('feature_edit',                'Create/Edit Features',              'special',       'special', 'medium',   false,  40),
    ('JOBS.BOARD.VIEW',             'View Job Queues (BullBoard)',        'special',       'tenant',  'medium',   false, 110),
    ('JOBS.QUEUE.MANAGE',           'Manage Job Queues',                 'special',       'tenant',  'critical', true,  120),
    ('IAM.PARAMETER.MANAGE',        'Manage Tenant Parameter Overrides', 'special',       'tenant',  'high',     true,  130),
    ('supplier.governance.write',   'Write Governance Record',           'special',       'record',  'high',     false, 140),
    ('supplier.qualification.admin','Administer Qualification',          'special',       'record',  'critical', false, 150),
    -- Finance Setup Workbench (Phase 2) — tenant-scoped configure gate.
    ('FINANCE_SETUP.VIEW',          'View Finance Setup',                'special',       'tenant',  'low',      false, 160),
    ('FINANCE_SETUP.CONFIGURE',     'Configure Finance Setup',           'special',       'tenant',  'high',     false, 170),
    -- ai_governance — NOT granted to base personas; requires explicit tenant grant.
    ('ai.use_extraction',           'Use AI Extraction',                 'ai_governance',  'tenant',  'medium',   true,   10),
    ('ai.review_ai_output',         'Review AI Output',                  'ai_governance',  'tenant',  'low',      false,  20),
    ('ai.calibrate_thresholds',     'Calibrate AI Thresholds',           'ai_governance',  'tenant',  'high',     true,   30),
    -- platform_admin — control-plane only; NOT granted to any base persona.
    ('PLATFORM.REFERENCE.VIEW',     'View Reference Data',               'platform_admin', 'tenant',  'low',      false,  10),
    ('PLATFORM.REFERENCE.IMPORT',   'Import Reference Data',             'platform_admin', 'tenant',  'medium',   false,  20),
    ('PLATFORM.TAXONOMY.VIEW',      'View Taxonomy',                     'platform_admin', 'tenant',  'low',      false,  30),
    ('PLATFORM.TAXONOMY.IMPORT',    'Import Taxonomy Crosswalks',        'platform_admin', 'tenant',  'medium',   false,  40),
    ('PLATFORM.CATALOG.VIEW',       'View Platform Catalog',             'platform_admin', 'tenant',  'low',      false,  50),
    ('PLATFORM.CATALOG.MANAGE',     'Manage Platform Catalog',           'platform_admin', 'tenant',  'high',     false,  60),
    ('PLATFORM.SUBSCRIPTIONS.VIEW', 'View Subscription Plans',           'platform_admin', 'tenant',  'low',      false,  70),
    ('PLATFORM.SUBSCRIPTIONS.MANAGE','Manage Subscription Plans',        'platform_admin', 'tenant',  'critical', false,  80),
    -- P2P operation verbs — required by entity_operation FK (PR/POC/DN/receipt/service_sheet).
    -- Uppercase PR.APPROVE / RECEIPT.POST style codes live below in the P2P capability block.
    ('convert',                     'Convert',                           'workflow',      'record',  'low',      false, 115),  -- PR → PO
    ('confirm',                     'Confirm',                           'workflow',      'record',  'low',      false, 116),  -- POC supplier-confirm
    ('propose_changes',             'Propose Changes',                   'workflow',      'record',  'low',      false, 117),  -- POC supplier amend
    ('reject',                      'Reject',                            'workflow',      'record',  'medium',   false, 118),  -- POC reject
    ('accept_changes',              'Accept Changes',                    'workflow',      'record',  'medium',   false, 119),  -- POC buyer accept
    ('reject_changes',              'Reject Changes',                    'workflow',      'record',  'medium',   false, 120),  -- POC buyer reject
    ('dispatch',                    'Dispatch',                          'workflow',      'record',  'low',      false, 121),  -- DN dispatch
    ('mark_arrived',                'Mark Arrived',                      'workflow',      'record',  'low',      false, 122),  -- DN arrival
    ('receipt',                     'Open Receipt',                      'workflow',      'record',  'low',      false, 123),  -- DN → receipt nav
    ('submit_for_acceptance',       'Submit for Acceptance',             'workflow',      'record',  'low',      false, 124),  -- service_sheet step 1
    ('accept',                      'Accept',                            'workflow',      'record',  'low',      false, 125),  -- service_sheet acceptance
    ('reject_acceptance',           'Reject Acceptance',                 'workflow',      'record',  'low',      false, 126),  -- service_sheet acceptance reject
    -- P2P entity-action capabilities — referenced by entity_action_rule.required_permission.
    ('PR.APPROVE',                  'Approve Requisition',               'workflow',      'record',  'medium',   false, 200),
    ('PR.CONVERT',                  'Convert Requisition to PO',         'workflow',      'record',  'medium',   false, 201),
    ('PO.APPROVE',                  'Approve Purchase Order',            'workflow',      'record',  'medium',   false, 210),
    ('PO.PLACE_ORDER',              'Place Order with Supplier',         'workflow',      'record',  'medium',   false, 211),
    ('PO.RETRY_SEND',               'Retry Send Order',                  'workflow',      'record',  'low',      false, 212),
    ('PO.SHORT_CLOSE',              'Short-Close Open PO',               'workflow',      'record',  'high',     false, 213),
    ('PO.HOLD',                     'Place Purchase Order on Hold',       'workflow',      'record',  'high',     false, 214),
    ('PO.RELEASE_HOLD',             'Release Purchase Order Hold',       'workflow',      'record',  'high',     false, 215),
    ('PO.EXPIRE',                   'Expire Purchase Order',             'workflow',      'record',  'high',     false, 216),
    ('POC.ACCEPT',                  'Accept PO Confirmation',            'workflow',      'record',  'medium',   false, 220),
    ('POC.DISPUTE',                 'Dispute PO Confirmation',           'workflow',      'record',  'medium',   false, 221),
    ('DN.MARK_ARRIVED',             'Mark Delivery Note Arrived',        'workflow',      'record',  'low',      false, 230),
    ('RECEIPT.APPROVE',             'Approve Receipt',                   'workflow',      'record',  'medium',   false, 240),
    ('RECEIPT.POST',                'Post Receipt',                      'finance',       'record',  'high',     false, 241),
    ('RECEIPT.REVERSE',             'Reverse Posted Receipt',            'finance',       'record',  'critical', true,  242),
    ('RECEIPT.QUALITY_HOLD',        'Place Receipt on Quality Hold',     'workflow',      'record',  'medium',   false, 243),
    ('SERVICE_SHEET.APPROVE',       'Approve Service Sheet',             'workflow',      'record',  'medium',   false, 250),
    ('SERVICE_SHEET.POST',          'Post Service Sheet',                'finance',       'record',  'high',     false, 251),
    ('SERVICE_SHEET.REVERSE',       'Reverse Posted Service Sheet',      'finance',       'record',  'critical', true,  252),
    ('PI.APPROVE',                  'Approve Purchase Invoice',          'workflow',      'record',  'medium',   false, 260),
    ('PI.POST',                     'Post Purchase Invoice',             'finance',       'record',  'high',     false, 261),
    ('PI.REVERSE',                  'Reverse Posted Invoice',            'finance',       'record',  'critical', true,  262),
    ('PI.MATCH_OVERRIDE',           'Override Three-Way Match Exception','finance',       'record',  'high',     false, 263),
    -- Snapshot operations (Phase 9b + 12). Destructive replay of a prior
    -- document graph + session reset. Critical risk → granted to owner+admin
    -- only via 018_persona_permission. PI.DISCARD_SESSION is the lighter
    -- "revert to last submitted baseline" path; granted manager+ since it's
    -- a common draft revision operation.
    ('PI.SNAPSHOT_RESTORE',         'Restore Invoice From Snapshot',     'finance',       'record',  'critical', false, 264),
    ('PI.DISCARD_SESSION',          'Legacy Revert To Baseline Alias',   'workflow',      'record',  'medium',   false, 265),
    ('PI.REVERT_TO_BASELINE',       'Revert Invoice To Baseline',        'workflow',      'record',  'high',     false, 266)

) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO UPDATE SET
  name               = EXCLUDED.name,
  scope_type         = EXCLUDED.scope_type,
  risk_level         = EXCLUDED.risk_level,
  is_plan_restricted = EXCLUDED.is_plan_restricted,
  plane_eligibility  = EXCLUDED.plane_eligibility,
  sort_order         = EXCLUDED.sort_order,
  updated_at         = now(),
  updated_by         = EXCLUDED.created_by;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM shared.permission;
  RAISE NOTICE '[017_permission] shared.permission: % rows', cnt;
END $$;
