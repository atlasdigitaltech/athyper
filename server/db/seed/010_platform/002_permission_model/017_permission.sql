-- seed/010_platform/002_permission_model/017_permission.sql
-- Seed: All atomic permissions across all categories
-- Schema: shared | Table: permission
-- Depends on: 015_permission_category.sql
-- Idempotent: ON CONFLICT (code) DO NOTHING
--
-- Code convention:
--   Lowercase short verbs (read, create, approve, post) — atomic record-level
--   actions composing CRUD verbs; used in grant matrices.
--
--   Dotted namespaced codes (supplier.tax.submit, ap.override_tax_mode) —
--   domain-specific guards for section-level or flow-engine checks.
--
--   CAPS MODULE.RESOURCE.ACTION (JOBS.BOARD.VIEW, IAM.PARAMETER.MANAGE) —
--   platform-admin permissions gating control-plane surfaces (UIs, batch ops,
--   operator endpoints). Caps signals "privileged capability, not a verb".
--   Never gate with a hardcoded role claim or isAdmin boolean — these go
--   through the normal persona → group → role → permission chain.

INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM   shared.permission_category c
JOIN  (VALUES
    -- ── entity ───────────────────────────────────────────────────────────────
    ('read',                        'Read',                              'entity',        'record',  'low',      false,  10),
    ('create',                      'Create',                            'entity',        'record',  'low',      false,  20),
    ('update',                      'Update',                            'entity',        'record',  'low',      false,  30),
    ('edit',                        'Edit',                              'entity',        'record',  'low',      false,  30),
    ('exit',                        'Exit',                              'entity',        'record',  'low',      false,  35),
    ('delete_draft',                'Delete Draft',                      'entity',        'record',  'low',      false,  40),
    ('delete',                      'Delete',                            'entity',        'record',  'high',     false,  50),
    -- ── workflow ─────────────────────────────────────────────────────────────
    ('submit',                      'Submit',                            'workflow',      'record',  'low',      false,  10),
    ('amend',                       'Amend',                             'workflow',      'record',  'low',      false,  20),
    ('cancel',                      'Cancel',                            'workflow',      'record',  'medium',   false,  30),
    ('close',                       'Close',                             'workflow',      'record',  'medium',   false,  40),
    ('reopen',                      'Reopen',                            'workflow',      'record',  'medium',   false,  50),
    ('withdraw',                    'Withdraw',                          'workflow',      'record',  'low',      false,  60),
    ('escalate',                    'Escalate',                          'workflow',      'record',  'low',      false,  70),
    ('approve',                     'Approve',                           'workflow',      'record',  'medium',   false,  80),
    ('deny',                        'Deny',                              'workflow',      'record',  'medium',   false,  90),
    ('void',                        'Void',                              'workflow',      'record',  'high',     false,  95),
    ('return',                      'Return Document for Revision',      'workflow',      'record',  'low',      false, 100),
    -- ── finance ──────────────────────────────────────────────────────────────
    ('post',                        'Post',                              'finance',       'record',  'high',     false,  10),
    ('reverse',                     'Reverse',                           'finance',       'record',  'critical', true,   20),
    ('reconcile',                   'Reconcile',                         'finance',       'record',  'high',     false,  30),
    ('supplier.tax.submit',         'Submit Tax Profile',                'finance',       'record',  'low',      false,  40),
    ('supplier.tax.verify',         'Verify Tax Profile',                'finance',       'record',  'medium',   false,  50),
    ('supplier.tax.restricted',     'Restricted Tax Access',             'finance',       'record',  'high',     false,  60),
    ('supplier.banking.submit',     'Submit Bank Details',               'finance',       'record',  'medium',   false,  70),
    ('supplier.banking.verify',     'Verify Bank Account',               'finance',       'record',  'high',     false,  80),
    ('supplier.banking.admin',      'Administer Banking',                'finance',       'record',  'high',     false,  90),
    ('ap.override_tax_mode',        'Override Invoice Tax Mode',         'finance',       'record',  'medium',   false, 100),
    ('ap.promote_proforma',         'Promote Proforma Invoice to Draft', 'finance',       'record',  'medium',   false, 110),
    -- ── utility ──────────────────────────────────────────────────────────────
    ('copy',                        'Copy',                              'utility',       'record',  'low',      false,  10),
    ('merge',                       'Merge',                             'utility',       'record',  'critical', true,   20),
    ('report',                      'Report',                            'utility',       'record',  'low',      false,  30),
    ('print',                       'Print',                             'utility',       'record',  'low',      false,  40),
    ('import',                      'Import',                            'utility',       'record',  'medium',   true,   50),
    ('export',                      'Export',                            'utility',       'record',  'low',      false,  60),
    ('view_je',                     'View Journal Entry',                'utility',       'record',  'low',      false,  70),
    -- ── bulk ─────────────────────────────────────────────────────────────────
    ('bulk_import',                 'Bulk Import',                       'bulk',          'tenant',  'high',     true,   10),
    ('bulk_export',                 'Bulk Export',                       'bulk',          'tenant',  'high',     true,   20),
    ('bulk_update',                 'Bulk Update',                       'bulk',          'tenant',  'critical', true,   30),
    ('bulk_delete',                 'Bulk Delete',                       'bulk',          'tenant',  'critical', true,   40),
    -- ── delegation ───────────────────────────────────────────────────────────
    ('delegate',                    'Delegate',                          'delegation',    'record',  'medium',   false,  10),
    ('share_read',                  'Share Read-Only',                   'delegation',    'record',  'low',      false,  20),
    ('share_edit',                  'Share Editable',                    'delegation',    'record',  'medium',   false,  30),
    -- ── collaboration ────────────────────────────────────────────────────────
    ('add_comment',                 'Add Comment',                       'collaboration', 'record',  'low',      false,  10),
    ('add_attachment',              'Add Attachment',                    'collaboration', 'record',  'low',      false,  20),
    ('del_others_comment',          'Delete Others Comment',             'collaboration', 'record',  'medium',   false,  30),
    ('del_others_attach',           'Delete Others Attachment',          'collaboration', 'record',  'medium',   false,  40),
    ('follow',                      'Follow',                            'collaboration', 'record',  'low',      false,  50),
    ('tag',                         'Tag',                               'collaboration', 'record',  'low',      false,  60),
    -- ── special ──────────────────────────────────────────────────────────────
    ('feature_diagnostic',          'Self Diagnostic Tool',              'special',       'special', 'critical', false,  10),
    ('feature_theme',               'Theme Change',                      'special',       'special', 'low',      false,  20),
    ('feature_view',                'View Access Features',              'special',       'special', 'low',      false,  30),
    ('feature_edit',                'Create/Edit Features',              'special',       'special', 'medium',   false,  40),
    ('JOBS.BOARD.VIEW',             'View Job Queues (BullBoard)',        'special',       'tenant',  'medium',   false, 110),
    ('JOBS.QUEUE.MANAGE',           'Manage Job Queues',                 'special',       'tenant',  'critical', true,  120),
    ('IAM.PARAMETER.MANAGE',        'Manage Tenant Parameter Overrides', 'special',       'tenant',  'high',     true,  130),
    ('supplier.governance.write',   'Write Governance Record',           'special',       'record',  'high',     false, 140),
    ('supplier.qualification.admin','Administer Qualification',          'special',       'record',  'critical', false, 150),
    -- ── ai_governance ────────────────────────────────────────────────────────
    -- Not granted to any base persona — requires explicit tenant configuration.
    ('ai.use_extraction',           'Use AI Extraction',                 'ai_governance',  'tenant',  'medium',   true,   10),
    ('ai.review_ai_output',         'Review AI Output',                  'ai_governance',  'tenant',  'low',      false,  20),
    ('ai.calibrate_thresholds',     'Calibrate AI Thresholds',           'ai_governance',  'tenant',  'high',     true,   30),
    -- ── platform_admin ───────────────────────────────────────────────────────
    -- Control-plane permissions for platform operators (not tenant admins).
    -- Must be granted via explicit role assignment; no base persona receives these.
    ('PLATFORM.REFERENCE.VIEW',     'View Reference Data',               'platform_admin', 'tenant',  'low',      false,  10),
    ('PLATFORM.REFERENCE.IMPORT',   'Import Reference Data',             'platform_admin', 'tenant',  'medium',   false,  20),
    ('PLATFORM.TAXONOMY.VIEW',      'View Taxonomy',                     'platform_admin', 'tenant',  'low',      false,  30),
    ('PLATFORM.TAXONOMY.IMPORT',    'Import Taxonomy Crosswalks',        'platform_admin', 'tenant',  'medium',   false,  40),
    ('PLATFORM.CATALOG.VIEW',       'View Platform Catalog',             'platform_admin', 'tenant',  'low',      false,  50),
    ('PLATFORM.CATALOG.MANAGE',     'Manage Platform Catalog',           'platform_admin', 'tenant',  'high',     false,  60),
    ('PLATFORM.SUBSCRIPTIONS.VIEW', 'View Subscription Plans',           'platform_admin', 'tenant',  'low',      false,  70),
    ('PLATFORM.SUBSCRIPTIONS.MANAGE','Manage Subscription Plans',        'platform_admin', 'tenant',  'critical', false,  80)

) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM shared.permission;
  RAISE NOTICE '[017_permission] shared.permission: % rows', cnt;
END $$;
