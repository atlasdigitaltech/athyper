-- seed-pack-version: 2.0.0
-- disposition: retired-demo-workforce
-- Example positions and employee work assignments depend on retired demo people.

DO $seed$
DECLARE
    v_tid uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.company_code c
        WHERE c.tenant_id=v_tid AND c.code='catl' AND c.status='active'
    ) THEN
        RAISE EXCEPTION '[003_positions_work_assignments] active catl company required';
    END IF;
    RAISE NOTICE '[003_positions_work_assignments] retired demo positions and work assignments';
END $seed$;
