-- seed-pack-version: 2.0.0
-- disposition: retired-demo-people
-- Named employee, address, phone, and email fixtures are intentionally omitted.

DO $seed$
DECLARE
    v_tid uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.tenant t
        WHERE t.id=v_tid AND t.code='cirrusatlantic' AND t.status='active'
    ) THEN
        RAISE EXCEPTION '[002_people] active CirrusAtlantic tenant scope required';
    END IF;
    RAISE NOTICE '[002_people] retired named employee and personal-contact fixtures';
END $seed$;
