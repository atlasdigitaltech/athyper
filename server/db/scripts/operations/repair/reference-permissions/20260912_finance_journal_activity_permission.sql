-- NEON Finance-owned read reference only. No memberships, assignments or grants.
-- Required by the BP Finance journal activity provider. Exact company scope.
DO $guard$
BEGIN
  IF current_database() <> 'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' THEN
    RAISE EXCEPTION 'Finance journal reference requires the NEON database/plane';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM control.module WHERE code='acc' AND status='active') THEN
    RAISE EXCEPTION 'Active Accounting module is required';
  END IF;
  IF EXISTS(SELECT 1 FROM authz.permission p JOIN control.module m ON m.id=p.module_id
    WHERE p.canonical_code='finance.ledger.business_partner_activity.read' AND (m.code<>'acc' OR p.risk_tier<>'medium' OR p.status<>'published' OR p.requires_mfa OR p.requires_sod)) THEN
    RAISE EXCEPTION 'Existing Finance BP activity read reference differs; review required';
  END IF;
END
$guard$;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT 'b19c9b40-398c-4b73-a5c4-e2d13f541521','finance.ledger.business_partner_activity.read','entity_operation',id,'medium',false,false,false,false,false,
'{"_seed":{"pack":"neon.finance-journal-activity-reference","version":"1.0.0"},"owningContract":"@athyper/server-contract-finance","qualification":"BP journal activity pilot"}'::jsonb,'published','00000000-0000-0000-0000-000000000000'
FROM control.module WHERE code='acc' AND status='active'
ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'company_code','exact','active','00000000-0000-0000-0000-000000000000'
FROM authz.permission WHERE canonical_code='finance.ledger.business_partner_activity.read'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
