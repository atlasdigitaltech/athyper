-- Cluster roles used by the Trust & Onboarding control plane and its
-- plane-local projection appliers. Login identities are provisioned outside
-- DDL and receive only the required NOLOGIN role membership.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        CREATE ROLE athyperapp
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_trustiam_service') THEN
        CREATE ROLE athyper_trustiam_service
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_onboarding_service') THEN
        CREATE ROLE athyper_onboarding_service
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_publication_service') THEN
        CREATE ROLE athyper_publication_service
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_applier') THEN
        CREATE ROLE athyper_projection_applier
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_reconciler') THEN
        CREATE ROLE athyper_projection_reconciler
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_owner') THEN
        CREATE ROLE athyper_projection_owner
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_breakglass') THEN
        CREATE ROLE athyper_projection_breakglass
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
        CREATE ROLE athyper_jobs_service
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin_atlas_maintenance') THEN
        CREATE ROLE athyperadmin_atlas_maintenance
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
END;
$$;

COMMENT ON ROLE athyperapp IS
  'NOLOGIN least-privilege role inherited by application login identities; row-level security remains enforced.';
COMMENT ON ROLE athyper_trustiam_service IS
  'NOLOGIN privilege role for TrustIAM desired-state and reconciliation services.';
COMMENT ON ROLE athyper_onboarding_service IS
  'NOLOGIN privilege role for guest-safe onboarding orchestration services.';
COMMENT ON ROLE athyper_publication_service IS
  'NOLOGIN privilege role for compiling, signing, and dispatching approved releases.';
COMMENT ON ROLE athyper_projection_applier IS
  'NOLOGIN privilege role for verified, idempotent plane-local projection application.';
COMMENT ON ROLE athyper_projection_reconciler IS
  'NOLOGIN privilege role for Studio-owned desired-state claims, fenced observations, dead letters, and alerts.';
COMMENT ON ROLE athyper_projection_owner IS
  'NOLOGIN owner of SECURITY DEFINER projection mutation APIs. It is not granted to runtime or admin roles.';
COMMENT ON ROLE athyper_projection_breakglass IS
  'NOLOGIN emergency projection repair role. Membership is assigned externally only for an approved, audited repair window.';
COMMENT ON ROLE athyper_jobs_service IS
  'NOLOGIN least-privilege role for plane-global scheduling and durable Jobs execution evidence.';
COMMENT ON ROLE athyperadmin_atlas_maintenance IS
  'NOLOGIN least-privilege role for explicitly assigned Atlas maintenance operations.';
