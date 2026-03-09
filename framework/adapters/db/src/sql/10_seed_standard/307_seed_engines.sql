/* ============================================================================
   Athyper — Seed meta.engine Registry
   Populates the engine reference table with all known engine codes.
   Must run BEFORE 060_module_engine_fk.sql FK constraint is enforced
   on existing data.

   Dependencies: 060_module_engine_fk.sql (meta.engine table)
   ============================================================================ */

INSERT INTO meta.engine (code, name, description)
VALUES
    ('posting-engine',      'Posting Engine',       'General ledger posting, journal entries, and GL balance management'),
    ('decision-grid',       'Decision Grid',        'Operating unit structure, business intent rules, smart defaults, and policy evaluation'),
    ('budget-engine',       'Budget Engine',        'Funding profiles, budget transactions, and funding transfers'),
    ('inventory-engine',    'Inventory Engine',     'Warehouse management, item master, inventory balances, movements, and valuation'),
    ('asset-engine',        'Asset Engine',         'Fixed asset lifecycle, depreciation runs, and asset book management'),
    ('commission-engine',   'Commission Engine',    'Commission plans, assignments, calculations, and statements'),
    ('federation-engine',   'Federation Engine',    'Multi-entity federation, intercompany transactions, consolidation, FX, and netting'),
    ('tax-engine',          'Tax Engine',           'Tax jurisdiction management, tax rate lookups, and tax calculations'),
    ('production-engine',   'Production Engine',    'Bill of materials, routing, work orders, and production variance tracking'),
    ('atlas-ai',            'Atlas AI',             'AI model registry, predictions, actions, and drift monitoring'),
    ('bank-reconciliation', 'Bank Reconciliation',  'Bank statement processing, statement line matching, and reconciliation sessions'),
    ('commitment-engine',   'Commitment Engine',    'Purchase commitments, commitment schedules, and fulfillment tracking')
ON CONFLICT (code) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description;
