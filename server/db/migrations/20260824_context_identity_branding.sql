-- Add governed presentation identity to tenant, Neon legal-entity, and Mesh
-- network-account contexts. Apply once to every plane database as schema owner.
-- The path is same-origin by construction; arbitrary remote URLs and traversal
-- are rejected at the database boundary.

BEGIN;

ALTER TABLE master.tenant_profile
    ADD COLUMN IF NOT EXISTS logo_asset_ref text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'master.tenant_profile'::regclass
           AND conname = 'tenant_profile_logo_asset_ref_chk'
    ) THEN
        ALTER TABLE master.tenant_profile
            ADD CONSTRAINT tenant_profile_logo_asset_ref_chk CHECK (
                logo_asset_ref IS NULL
                OR (
                    btrim(logo_asset_ref) = logo_asset_ref
                    AND length(logo_asset_ref) BETWEEN 2 AND 1024
                    AND logo_asset_ref ~ '^/[A-Za-z0-9][A-Za-z0-9_./-]*$'
                    AND logo_asset_ref !~ '(^|/)\.\.(/|$)'
                )
            );
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('master.legal_entity') IS NOT NULL THEN
        ALTER TABLE master.legal_entity
            ADD COLUMN IF NOT EXISTS logo_asset_ref text;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'master.legal_entity'::regclass
               AND conname = 'legal_entity_logo_asset_ref_chk'
        ) THEN
            ALTER TABLE master.legal_entity
                ADD CONSTRAINT legal_entity_logo_asset_ref_chk CHECK (
                    logo_asset_ref IS NULL
                    OR (
                        btrim(logo_asset_ref) = logo_asset_ref
                        AND length(logo_asset_ref) BETWEEN 2 AND 1024
                        AND logo_asset_ref ~ '^/[A-Za-z0-9][A-Za-z0-9_./-]*$'
                        AND logo_asset_ref !~ '(^|/)\.\.(/|$)'
                    )
                );
        END IF;
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('mesh.network_account') IS NOT NULL THEN
        ALTER TABLE mesh.network_account
            ADD COLUMN IF NOT EXISTS logo_asset_ref text;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'mesh.network_account'::regclass
               AND conname = 'network_account_logo_asset_ref_chk'
        ) THEN
            ALTER TABLE mesh.network_account
                ADD CONSTRAINT network_account_logo_asset_ref_chk CHECK (
                    logo_asset_ref IS NULL
                    OR (
                        btrim(logo_asset_ref) = logo_asset_ref
                        AND length(logo_asset_ref) BETWEEN 2 AND 1024
                        AND logo_asset_ref ~ '^/[A-Za-z0-9][A-Za-z0-9_./-]*$'
                        AND logo_asset_ref !~ '(^|/)\.\.(/|$)'
                    )
                );
        END IF;
    END IF;
END;
$$;

COMMENT ON COLUMN master.tenant_profile.logo_asset_ref IS
  'Optional same-origin managed logo path for tenant presentation. External URLs and traversal are prohibited.';

DO $$
BEGIN
    IF to_regclass('master.legal_entity') IS NOT NULL THEN
        COMMENT ON COLUMN master.legal_entity.logo_asset_ref IS
          'Optional same-origin managed logo path for legal-entity context presentation.';
    END IF;
    IF to_regclass('mesh.network_account') IS NOT NULL THEN
        COMMENT ON COLUMN mesh.network_account.logo_asset_ref IS
          'Optional same-origin managed logo path for buyer or supplier account presentation.';
    END IF;
END;
$$;

COMMIT;
