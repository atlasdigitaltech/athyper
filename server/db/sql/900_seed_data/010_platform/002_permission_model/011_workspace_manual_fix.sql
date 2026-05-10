-- ============================================================================
-- 011_workspace_manual_fix.sql
-- Manual correction — run once on local DB to align the 7 user-facing
-- shared.workspace rows with the canonical set.
--
-- CORE and PTR are NOT touched.
-- Safe to re-run (all updates are idempotent).
-- ============================================================================

begin;

-- ── FIN — Finance ────────────────────────────────────────────────────────────
update shared.workspace set
    name        = 'Finance',
    description = 'Accounting, payments, treasury, and budgeting',
    sort_order  = 20,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'FIN';

-- ── SCM — Supply Chain ───────────────────────────────────────────────────────
update shared.workspace set
    name        = 'Supply Chain',
    description = 'Suppliers, sourcing, contracts, procurement, inventory, warehousing, quality, demand planning, and logistics',
    sort_order  = 30,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'SCM';

-- ── COM — Sales & CRM ────────────────────────────────────────────────────────
-- name: "Commercial" → "Sales & CRM"
update shared.workspace set
    name        = 'Sales & CRM',
    description = 'Customer relationships, opportunities, sales orders, and invoicing',
    sort_order  = 40,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'COM';

-- ── PPL — People ─────────────────────────────────────────────────────────────
update shared.workspace set
    name        = 'People',
    description = 'Employee lifecycle and payroll',
    sort_order  = 50,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'PPL';

-- ── PRS — Projects & Services ────────────────────────────────────────────────
update shared.workspace set
    name        = 'Projects & Services',
    description = 'Projects, costing, tasks, and service desk',
    sort_order  = 60,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'PRS';

-- ── OPS — Manufacturing & Maintenance ───────────────────────────────────────
-- name: "Operations" → "Manufacturing & Maintenance"
update shared.workspace set
    name        = 'Manufacturing & Maintenance',
    description = 'Production, BOMs, work orders, MRP, and maintenance',
    sort_order  = 70,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'OPS';

-- ── AST — Assets & Facilities ────────────────────────────────────────────────
update shared.workspace set
    name        = 'Assets & Facilities',
    description = 'Fixed assets, real estate, leases, and facilities',
    sort_order  = 80,
    updated_at  = now(),
    updated_by  = '00000000-0000-0000-0000-000000000000'
where code = 'AST';

-- ── Verification ─────────────────────────────────────────────────────────────
select code, name, description, sort_order, status
from shared.workspace
order by sort_order;

commit;
