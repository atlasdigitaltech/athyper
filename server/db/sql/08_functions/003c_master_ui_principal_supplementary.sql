-- 08_functions/003c_master_ui_principal_supplementary.sql
-- Depends on: 04_tables/003e_master_ui_principal.sql (saved_view, dashboard)
--             08_functions/003b_master_ui_principal.sql
-- Execution order: after 003b, before 09_triggers/003c.
-- Ownership + REVOKE: 12_function_security/001_security_hardening.sql
--
-- Contains trigger functions for:
--   §1  trg_guard_scope_owner_immutable — blocks scope / owner_principal_id mutation
--   §2  trg_sync_deleted_at_with_status — syncs deleted_at with status lifecycle


-- ════════════════════════════════════════════════════════════════════════════
-- §1  trg_guard_scope_owner_immutable
-- ════════════════════════════════════════════════════════════════════════════
-- Blocks any UPDATE that changes scope or owner_principal_id after initial INSERT.
-- Scope and owner are assigned at creation time and must never change because:
--   • scope is used in RLS SELECT policies — a mid-flight change would
--     silently widen or narrow visibility for other principals.
--   • owner_principal_id is used in RLS UPDATE/DELETE policies — a change
--     would transfer write-authority without an explicit ownership-transfer workflow.
--
-- Fires BEFORE UPDATE only (INSERT path does not apply).
-- Attach to: master.saved_view, master.dashboard.

CREATE OR REPLACE FUNCTION master.trg_guard_scope_owner_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master
AS $$
BEGIN
    IF NEW.scope IS DISTINCT FROM OLD.scope THEN
        RAISE EXCEPTION '%.%: scope is immutable after insert (cannot change "%" to "%")',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.scope, NEW.scope
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id THEN
        RAISE EXCEPTION '%.%: owner_principal_id is immutable after insert (cannot change "%" to "%")',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.owner_principal_id, NEW.owner_principal_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_guard_scope_owner_immutable IS
    'Blocks UPDATE changes to scope and owner_principal_id on saved_view and dashboard. '
    'scope is immutable: mid-flight changes would silently alter RLS visibility. '
    'owner_principal_id is immutable: changes would transfer write-authority without a workflow. '
    'To change scope/owner: archive the old artifact and create a new one. '
    'Fires BEFORE UPDATE on master.saved_view and master.dashboard.';


-- ════════════════════════════════════════════════════════════════════════════
-- §2  trg_sync_deleted_at_with_status
-- ════════════════════════════════════════════════════════════════════════════
-- Synchronises deleted_at with the status lifecycle column.
-- Rules:
--   status → 'archived' : stamps deleted_at = now() if not already set.
--   status → 'active'   : clears deleted_at (un-archive / restore).
--   direct deleted_at change without status change : blocked (check_violation).
--
-- Rationale: deleted_at must track status, not be set arbitrarily.
-- Application code must change status — this trigger follows automatically.
--
-- Fires BEFORE UPDATE only.
-- Attach to: master.saved_view, master.dashboard.

CREATE OR REPLACE FUNCTION master.trg_sync_deleted_at_with_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master
AS $$
BEGIN
    -- Status changed: sync deleted_at accordingly
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'archived' AND NEW.deleted_at IS NULL THEN
            NEW.deleted_at := now();
        ELSIF NEW.status = 'active' THEN
            NEW.deleted_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- Status unchanged but deleted_at was directly modified: block it
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION
            '%.%: deleted_at cannot be set directly — change status to ''archived'' instead',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_sync_deleted_at_with_status IS
    'Synchronises deleted_at with status lifecycle for saved_view and dashboard. '
    'status → ''archived'': stamps deleted_at = now(). '
    'status → ''active'': clears deleted_at (restore / un-archive). '
    'Blocks direct deleted_at manipulation when status is unchanged. '
    'Fires BEFORE UPDATE on master.saved_view and master.dashboard.';
