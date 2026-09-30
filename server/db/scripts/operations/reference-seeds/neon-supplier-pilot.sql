-- Explicit local pilot data, excluded from canonical foundation.
-- Retained for the original tenant only; does not change existing deployments.
BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'athyper_neon' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id='44444444-4444-4444-8444-444444444444') THEN
  RAISE EXCEPTION 'Existing local Neon pilot tenant required';
 END IF;
END $guard$;
-- Local Increment A purchasing activation policy; payment readiness remains independently enforceable.
INSERT INTO control.supplier_activation_policy(id,tenant_id,operating_organization_id,company_code_id,version,operation_code,rationale,effective_from,published_by)
VALUES('e008eb56-7d4a-47f6-a122-b66149330d71','44444444-4444-4444-8444-444444444444','a478f9c0-8226-5d22-9599-b8fb27a45180','793b6cb3-3c61-57c0-9562-2cbc288bd4cf',1,'purchasing','Local supplier pilot activates purchasing eligibility. Payment use independently requires approved commercial setup and a verified remittance bank.','2026-09-14','cca94907-7519-5871-8e3c-6b11aa545c93')
ON CONFLICT (id) DO NOTHING;

COMMIT;
