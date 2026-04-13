-- 900_seed_data/001_shared/019_permission_return.sql
-- Purpose: shared.permission "return" + persona_permission grants (manager, owner, agent)
-- Idempotent: yes — ON CONFLICT throughout

-- ── 1. shared.permission — return ────────────────────────────────────────
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT 'return', 'Return Document for Revision',
       id, 'record', 'low', 100, '00000000-0000-0000-0000-000000000000'
FROM   shared.permission_category
WHERE  code = 'workflow'
ON CONFLICT (code) DO NOTHING;

-- ── 2. shared.persona_permission — return grants ─────────────────────────
WITH grants AS (
    SELECT p.id AS pid, pm.id AS permid
    FROM   shared.persona p
    CROSS JOIN shared.permission pm
    WHERE  p.code IN ('manager','owner','agent')
    AND    pm.code = 'return'
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT pid, permid, true, '00000000-0000-0000-0000-000000000000'
FROM   grants
ON CONFLICT (persona_id, permission_id) DO UPDATE SET is_granted = true;
