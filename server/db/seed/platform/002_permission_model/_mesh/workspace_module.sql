-- ============================================================================
-- MESH DB — WORKSPACE + MODULE CATALOG
-- ============================================================================
-- File:    _mesh/workspace_module.sql  (parent directory prefixed with `_` so
--          both provisioners' collectSqlFiles() walker skips it — this file is
--          loaded ONLY by provision-mesh.ts via an explicit hardcoded path).
-- Schemas: shared.workspace, shared.module
-- Purpose: Seed the athyper_mesh catalog with exactly the 2 workspaces + 20
--          modules that the mesh app runs. The neon catalog (011_workspace.sql
--          + 012_module.sql) intentionally excludes PTR — PTR lives here only.
--
-- Target row counts:
--   shared.workspace = 2  (CORE, PTR)
--   shared.module    = 20 (13 CORE + 7 PTR)
--
-- CORE is duplicated across neon and mesh catalogs on purpose — the Core
-- Platform modules (IAM, AUD, WFL, JOB, NTF, INT, CMS, ACT, REL, etc.) run
-- in both apps because both need auth, audit, workflows, and notifications.
-- META is NOT included here — Metadata Studio is neon-only (admin-plane UI).
--
-- Idempotent: ON CONFLICT (code) DO UPDATE throughout.
-- ============================================================================

INSERT INTO shared.workspace (code, name, description, sort_order, is_shared_infrastructure, created_by)
VALUES
  ('CORE', 'Core Platform',         'Meta-driven runtime, authentication, and platform services',                          10, true,  '00000000-0000-0000-0000-000000000000'),
  ('PTR',  'Partner Collaboration', 'Partner-facing collaboration: proposals, orders, invoices, contracts, and logistics', 90, false, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE SET
  name                     = excluded.name,
  description              = excluded.description,
  sort_order               = excluded.sort_order,
  is_shared_infrastructure = excluded.is_shared_infrastructure,
  updated_at               = now(),
  updated_by               = excluded.created_by;

INSERT INTO shared.module (code, name, description, config, created_by)
VALUES
    -- ── CORE (13) ────────────────────────────────────────────────────────────
    ('FND',  'Foundation Runtime',           'Meta-driven runtime engine',                 '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('IAM',  'Identity & Access Management', 'Authentication and authorization',           '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('AUD',  'Audit & Governance',           'Audit trails and compliance',                '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('POL',  'Policy & Rules Engine',        'Business rules and validations',             '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('WFL',  'Workflow Engine',              'State machines and approvals',               '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('JOB',  'Automation & Jobs',            'Schedulers and background tasks',            '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('DOC',  'Document Services',            'PDF/HTML generation',                        '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('NTF',  'Notification Services',        'Email and alerts',                           '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('INT',  'Integration Hub',              'API gateway and webhooks',                   '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('CMS',  'Content Services',             'Document storage',                           '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('ACT',  'Activity & Commentary',        'Comments and timelines',                     '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('REL',  'Reference & Shared Data',      'Reference & Shared Data',                    '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- ── PTR (7) ─────────────────────────────────────────────────────────────
    -- Dependency codes on the right (CONTRACT/BUY/ACC/SALE/CRM/LOGISTICS) live
    -- in the neon catalog, not here. Kept as documentation of the cross-plane
    -- data contract — not enforced by an FK.
    ('PCON', 'Proposal & Contract Collaboration', 'Partner-facing collaboration for proposals, commercial terms, and contract exchange',    '{"tier":"Base","dependencies":["CONTRACT","REL"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    ('OMI',  'Order Intake',                      'Inbound partner orders and order acknowledgements received from external parties',       '{"tier":"Base","dependencies":["BUY","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    ('IMO',  'Invoice Delivery',                  'Outbound invoices and invoice delivery to customers or partner channels',                '{"tier":"Base","dependencies":["ACC","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    ('CCON', 'Customer Contract Portal',          'Customer-visible contract access, commercial documents, and renewal interaction',        '{"tier":"Base","dependencies":["CONTRACT","CRM"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    ('SOO',  'Sales Order Delivery',              'Outbound sales orders sent to fulfillment, distributors, or trading partners',           '{"tier":"Base","dependencies":["SALE","REL"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('SII',  'Sales Invoice Intake',              'Inbound customer-side sales invoice intake and validation from connected channels',      '{"tier":"Base","dependencies":["ACC","SALE"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('LOGX', 'Logistics Collaboration',           'Shipment visibility, transport milestone exchange, and logistics partner coordination',  '{"tier":"Base","dependencies":["LOGISTICS","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) DO UPDATE SET
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- Workspace linkage
UPDATE shared.module m
SET    workspace_id = w.id,
       updated_at   = now(),
       updated_by   = '00000000-0000-0000-0000-000000000000'
FROM   shared.workspace w
JOIN  (VALUES
    ('CORE', ARRAY['FND','IAM','AUD','POL','WFL','JOB','DOC','NTF','INT','CMS','ACT','REL']),
    ('PTR',  ARRAY['PCON','OMI','IMO','CCON','SOO','SII','LOGX'])
) AS wm(wcode, mcodes) ON w.code = wm.wcode
WHERE  m.code = ANY(wm.mcodes);

DO $$ DECLARE w int; m int; BEGIN
  SELECT count(*) INTO w FROM shared.workspace;
  SELECT count(*) INTO m FROM shared.module;
  RAISE NOTICE '[_mesh/workspace_module] shared.workspace: % rows | shared.module: % rows (mesh expected: 2 / 19)', w, m;
  IF w <> 2 OR m <> 19 THEN
    RAISE EXCEPTION '[_mesh/workspace_module] mesh catalog mismatch — expected 2 workspaces + 19 modules, got % / %', w, m;
  END IF;
END $$;
