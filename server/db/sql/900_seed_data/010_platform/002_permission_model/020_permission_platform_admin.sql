-- 900_seed_data/001_shared/020_permission_platform_admin.sql
-- Seed: platform-admin capability permissions (queue control plane, etc.)
-- Schema: shared | Table: permission
-- Depends on: 015_permission_category.sql (category='special')
-- Idempotent: on conflict (code) do nothing
--
-- Naming convention (CANONICAL for platform-admin permissions):
--   {MODULE}.{RESOURCE}.{ACTION}  — uppercase, dot-separated, three segments.
--
-- Examples: JOBS.BOARD.VIEW, JOBS.QUEUE.MANAGE, IAM.GROUP.MANAGE,
-- FIN.JOURNALS.CREATE (the last two already referenced in runtime code).
--
-- Why caps here but lowercase in 016_permission.sql:
--   016 seeds atomic record-level actions (read, create, update, approve)
--   that compose into CRUD verbs — their codes are short, enum-like, and
--   plural use in user-facing strings reads naturally in lowercase.
--   This file (and every future platform-admin seed) gates control-plane
--   surfaces (UIs, batch ops, ops endpoints) — the caps form signals
--   "privileged capability, not a verb", matches the Phase 3 IAM code
--   style already written into operator.routes.ts, and parallels how
--   entity status enums are spelled (QUEUED, RENDERED, DELIVERED).
--
--   When adding a new caps-style permission, use this file's VALUES block
--   as the template and create a matching binding in 021 (or a successor).
--
-- Binding: granted through the normal persona → group → role → permission
-- chain. Bindings for the codes defined in this file live in
-- 021_persona_permission_platform_admin.sql — operators earn access by
-- being placed in a group whose role holds these permissions, same contract
-- as every other permission. Never gate these by a hardcoded role claim
-- or an `isAdmin` boolean.
--
-- Split rationale:
--   JOBS.BOARD.VIEW      — read-only BullBoard access (inspect queues, DLQ)
--   JOBS.QUEUE.MANAGE    — mutation (pause/resume/retry/clean) — critical risk
-- Kept separate so SRE read-only can view queue state without authorising
-- destructive mutations.

INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('JOBS.BOARD.VIEW',   'View job queues (BullBoard)', 'special', 'tenant', 'medium',   false, 110),
    ('JOBS.QUEUE.MANAGE', 'Manage job queues',            'special', 'tenant', 'critical', true,  120)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;
