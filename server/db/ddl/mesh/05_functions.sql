-- ============================================================================
-- mesh/05_functions.sql
-- Mesh helper functions for RLS and audit maintenance.
-- ============================================================================

CREATE OR REPLACE FUNCTION mesh.current_account_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.account_code', true), '')
$$;

CREATE OR REPLACE FUNCTION mesh.current_tenant_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.tenant_code', true), '')
$$;

CREATE OR REPLACE FUNCTION mesh.current_subject_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.subject_id', true), '')
$$;

CREATE OR REPLACE FUNCTION mesh.is_mesh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT current_user = 'athyperadmin'
        OR lower(COALESCE(current_setting('app.mesh_admin', true), '')) IN ('1', 'true', 'on', 'yes')
$$;

-- Stamps updated_at on every UPDATE. When the target table also carries
-- updated_by (audit-pair invariant), stamps that column too — sourced from the
-- session GUC app.subject_id, else the caller-supplied value, else the prior
-- row's value, else the 'system' sentinel. The final fallback keeps
-- (updated_at IS NULL) = (updated_by IS NULL) intact even when the GUC is
-- unset. The jsonb column-existence check keeps the trigger safe for tables
-- that don't have updated_by.
CREATE OR REPLACE FUNCTION mesh.trg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_new jsonb;
BEGIN
    NEW.updated_at := now();
    v_new := to_jsonb(NEW);
    IF v_new ? 'updated_by' THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object(
            'updated_by', COALESCE(
                NULLIF(current_setting('app.subject_id', true), ''),
                v_new->>'updated_by',
                to_jsonb(OLD)->>'updated_by',
                'system'
            )
        ));
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mesh.current_account_code IS
    'Returns the Mesh account code set by the API/BFF for RLS scoping.';
COMMENT ON FUNCTION mesh.current_tenant_code IS
    'Returns the tenant code set by the API/BFF for RLS scoping.';
COMMENT ON FUNCTION mesh.current_subject_id IS
    'Returns the external subject id set by the API/BFF for subject-scoped RLS.';
COMMENT ON FUNCTION mesh.is_mesh_admin IS
    'True for provisioning/admin contexts. Application requests should prefer account-scoped GUCs.';
