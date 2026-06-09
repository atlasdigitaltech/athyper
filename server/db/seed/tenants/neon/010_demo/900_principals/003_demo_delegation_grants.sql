-- ============================================================================
-- SEED 003 — Demo Delegation Grants
-- ============================================================================
-- Idempotent: ON CONFLICT DO NOTHING on stable UUIDs.
--
-- Scenario A: athq.owner delegates to athq.manager (approve, create)
--   scoped to company_code ATHQ — expires 90 days from seed date.
--
-- Scenario B: athq.admin delegates to athq.cfo (export)
--   company_code ATHQ scope — expires 30 days from seed date.
--
-- These are pre-configured for demo users whose principals already exist via
-- seed 001_demo_principals.sql.
-- ============================================================================

-- ─── Scenario A ──────────────────────────────────────────────────────────────
-- Delegator : athq.owner   (aa001000-0000-0000-0000-000000000006)
-- Delegate  : athq.manager (aa001000-0000-0000-0000-000000000005)
-- Scope     : company_code → ATHQ
-- Permissions: approve, create
-- Purpose   : athq.manager can approve + create invoices on ATHQ while owner is away.

INSERT INTO master.delegation_grant (
  id,
  tenant_id,
  delegator_id,
  delegate_id,
  permissions,
  scope_type,
  scope_ref,
  expires_at,
  is_revoked,
  created_by
)
VALUES (
  'ff100001-0000-0000-0000-000000000001',
  (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
  'aa001000-0000-0000-0000-000000000006',  -- athq.owner (delegator)
  'aa001000-0000-0000-0000-000000000005',  -- athq.manager (delegate)
  ARRAY['approve', 'create'],
  'entity',
  'ATHQ',
  NOW() + INTERVAL '90 days',
  false,
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Scenario B ──────────────────────────────────────────────────────────────
-- Delegator : athq.admin (aa001000-0000-0000-0000-000000000007)
-- Delegate  : athq.cfo   (aa001000-0000-0000-0000-00000000000c)
-- Scope     : company_code → ATHQ
-- Permissions: export
-- Purpose   : athq.cfo can export reports on ATHQ entities (admin's privilege).

INSERT INTO master.delegation_grant (
  id,
  tenant_id,
  delegator_id,
  delegate_id,
  permissions,
  scope_type,
  scope_ref,
  expires_at,
  is_revoked,
  created_by
)
VALUES (
  'ff100002-0000-0000-0000-000000000001',
  (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
  'aa001000-0000-0000-0000-000000000007',  -- athq.admin (delegator)
  'aa001000-0000-0000-0000-00000000000c',  -- athq.cfo (delegate)
  ARRAY['export'],
  'entity',
  'ATHQ',
  NOW() + INTERVAL '30 days',
  false,
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;
