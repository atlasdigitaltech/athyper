-- ============================================================================
-- DEMO PRINCIPALS — PERSONA ASSIGNMENTS
-- ============================================================================
-- File:     002_demo_principal_personas.sql
-- Schema:   master.principal_persona
-- Purpose:  Assign one persona per demo principal (17 rows).
--           Constraint: UNIQUE (tenant_id, principal_id) — one persona per user.
-- Depends:  001_demo_principals.sql, 010_persona.sql (shared.persona seeded)
-- Idempotent: ON CONFLICT (tenant_id, principal_id) DO UPDATE persona_id
--
-- ── Persona policy ──────────────────────────────────────────────────────────
-- Two tiers: owner (full operational access) and admin (restricted access).
--
--   owner  → athq.owner, athq.cfo, athq.manager,
--             aqtu.manager, asac.manager, auic.manager, asgf.manager,
--             partner.owner, partner.manager, karim.dual
--
--   admin  → athq.admin, athq.viewer, athq.reporter,
--             athq.requester, athq.agent,
--             partner.viewer, partner.agent
-- ============================================================================

DO $demo_personas$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    ALTER TABLE master.principal_persona
        DISABLE TRIGGER trg_principal_persona_iam_outbox;

    INSERT INTO master.principal_persona (
        tenant_id, principal_id, persona_id,
        assigned_by, created_by
    )
    SELECT
        p.tenant_id,
        p.id        AS principal_id,
        per.id      AS persona_id,
        v_su        AS assigned_by,
        v_su        AS created_by
    FROM (VALUES
        -- (principal_uuid, persona_code)
        ('aa001000-0000-0000-0000-000000000001'::uuid, 'admin'),   -- athq.viewer
        ('aa001000-0000-0000-0000-000000000002'::uuid, 'admin'),   -- athq.reporter
        ('aa001000-0000-0000-0000-000000000003'::uuid, 'admin'),   -- athq.requester
        ('aa001000-0000-0000-0000-000000000004'::uuid, 'admin'),   -- athq.agent
        ('aa001000-0000-0000-0000-000000000005'::uuid, 'owner'),   -- athq.manager
        ('aa001000-0000-0000-0000-000000000006'::uuid, 'owner'),   -- athq.owner
        ('aa001000-0000-0000-0000-000000000007'::uuid, 'admin'),   -- athq.admin
        ('aa001000-0000-0000-0000-000000000008'::uuid, 'owner'),   -- aqtu.manager
        ('aa001000-0000-0000-0000-000000000009'::uuid, 'owner'),   -- asac.manager
        ('aa001000-0000-0000-0000-00000000000a'::uuid, 'owner'),   -- auic.manager
        ('aa001000-0000-0000-0000-00000000000b'::uuid, 'owner'),   -- asgf.manager
        ('aa001000-0000-0000-0000-00000000000c'::uuid, 'owner'),   -- athq.cfo
        ('aa001000-0000-0000-0000-00000000000d'::uuid, 'admin'),   -- partner.viewer
        ('aa001000-0000-0000-0000-00000000000e'::uuid, 'admin'),   -- partner.agent
        ('aa001000-0000-0000-0000-00000000000f'::uuid, 'owner'),   -- partner.manager
        ('aa001000-0000-0000-0000-000000000010'::uuid, 'owner'),   -- partner.owner
        ('aa001000-0000-0000-0000-000000000011'::uuid, 'owner')    -- karim.dual
    ) AS v(principal_uuid, persona_code)
    JOIN master.principal p  ON p.id = v.principal_uuid
    JOIN shared.persona per  ON per.code = v.persona_code
    ON CONFLICT (tenant_id, principal_id)
        DO UPDATE SET persona_id = excluded.persona_id;

    ALTER TABLE master.principal_persona
        ENABLE TRIGGER trg_principal_persona_iam_outbox;

    RAISE NOTICE '[002_demo_principal_personas] 17 persona assignments seeded (owner/admin)';

END $demo_personas$;
