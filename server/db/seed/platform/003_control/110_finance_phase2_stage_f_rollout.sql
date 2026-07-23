-- Activate the posting-gate capability while keeping every existing tenant in
-- observation mode. Production enforcement is an explicit tenant/company
-- rollout decision, never an accidental global default.
UPDATE control.feature_flag
   SET is_enabled=true,
       metadata=metadata || '{"stage_f":{"default_mode":"observe","enforcement_requires":"current_four_domain_certification"}}'::jsonb,
       updated_at=now(),
       updated_by='00000000-0000-0000-0000-000000000000'::uuid
 WHERE code='finance.posting_readiness_gate';

INSERT INTO control.finance_posting_rollout_policy(
  tenant_id,company_code_id,rollout_mode,effective_from,reason,metadata,status,created_by
)
SELECT tenant.id,NULL,'observe',CURRENT_DATE,
       'Stage F safe default for an existing tenant',
       '{"_seed":{"pack":"finance_phase2_stage_f","version":"1.0.0"}}'::jsonb,
       'active','00000000-0000-0000-0000-000000000000'::uuid
  FROM master.tenant tenant
 WHERE tenant.status='active'
ON CONFLICT (tenant_id,company_code_id) DO NOTHING;

