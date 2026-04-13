-- ============================================================
-- 002_rename_tables.sql
-- Comprehensive rename of 5 RBAC-adjacent tables in master schema
--
-- Tables renamed:
--   principal_auth_binding  → principal_identity_binding
--   principal_group         → auth_group
--   group_member            → auth_group_member
--   group_role              → auth_group_role
--   team_principal          → team_member
--
-- Also renames all associated constraints, indexes, and triggers
-- to match the new table names.
-- ============================================================

-- ── §1  Rename tables ─────────────────────────────────────────────────────────

ALTER TABLE master.principal_auth_binding  RENAME TO principal_identity_binding;
ALTER TABLE master.principal_group         RENAME TO auth_group;
ALTER TABLE master.group_member            RENAME TO auth_group_member;
ALTER TABLE master.group_role              RENAME TO auth_group_role;
ALTER TABLE master.team_principal          RENAME TO team_member;

-- ── §2  Rename constraints ────────────────────────────────────────────────────
-- PostgreSQL keeps old constraint names after a table rename; rename them to
-- stay coherent with the new table names.

-- principal_identity_binding (was principal_auth_binding)
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_pkey                  TO pib_pkey;                  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_principal_provider_uq TO pib_principal_provider_uq;  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_subject_provider_uq   TO pib_subject_provider_uq;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_provider_code_chk     TO pib_provider_code_chk;      EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_sync_status_chk       TO pib_sync_status_chk;        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_subject_nonempty      TO pib_subject_nonempty;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_sync_retry_chk        TO pib_sync_retry_chk;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_tenant_fk             TO pib_tenant_fk;              EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_principal_fk          TO pib_principal_fk;           EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_audit_pair_chk        TO pib_audit_pair_chk;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.principal_identity_binding RENAME CONSTRAINT pab_tenant_id_uq          TO pib_tenant_id_uq;           EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_group (was principal_group)
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_pkey            TO auth_group_pkey;             EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_tenant_id_uq    TO auth_group_tenant_id_uq;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_tenant_code_uq  TO auth_group_tenant_code_uq;   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_code_nonempty   TO auth_group_code_nonempty;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_name_nonempty   TO auth_group_name_nonempty;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_status_chk      TO auth_group_status_chk;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group RENAME CONSTRAINT principal_group_tenant_fk       TO auth_group_tenant_fk;        EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_group_member (was group_member)
DO $$ BEGIN ALTER TABLE master.auth_group_member RENAME CONSTRAINT group_member_pkey TO auth_group_member_pkey;   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_member RENAME CONSTRAINT group_member_uq   TO auth_group_member_uq;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_member RENAME CONSTRAINT pgm_tenant_fk     TO agm_tenant_fk;            EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_member RENAME CONSTRAINT pgm_principal_fk  TO agm_principal_fk;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_member RENAME CONSTRAINT pgm_group_fk      TO agm_group_fk;             EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_group_role (was group_role)
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT group_role_pkey            TO auth_group_role_pkey;            EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT group_role_uq              TO auth_group_role_uq;              EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT group_role_tenant_fk       TO auth_group_role_tenant_fk;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT group_role_group_fk        TO auth_group_role_group_fk;        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT group_role_role_fk         TO auth_group_role_role_fk;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT gr_visibility_scope_chk    TO agr_visibility_scope_chk;        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT gr_assignment_scope_chk    TO agr_assignment_scope_chk;        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT gr_assignment_ref_chk      TO agr_assignment_ref_chk;          EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT gr_descendants_chk         TO agr_descendants_chk;             EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.auth_group_role RENAME CONSTRAINT gr_status_chk              TO agr_status_chk;                  EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- team_member (was team_principal)
DO $$ BEGIN ALTER TABLE master.team_member RENAME CONSTRAINT team_principal_pkey TO team_member_pkey; EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- tp_tenant_fk is shared with tenant_profile — rename only the one on team_member
DO $$ BEGIN ALTER TABLE master.team_member RENAME CONSTRAINT tp_tenant_fk    TO tm_tenant_fk;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.team_member RENAME CONSTRAINT tp_team_fk      TO tm_team_fk;      EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.team_member RENAME CONSTRAINT tp_principal_fk  TO tm_principal_fk; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── §3  Rename triggers ───────────────────────────────────────────────────────
DO $$ BEGIN ALTER TRIGGER trg_principal_group_updated_at          ON master.auth_group            RENAME TO trg_auth_group_updated_at;              EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_principal_group_status_changed      ON master.auth_group            RENAME TO trg_auth_group_status_changed;          EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_principal_group_iam_outbox_insert   ON master.auth_group            RENAME TO trg_auth_group_iam_outbox_insert;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_principal_group_iam_outbox_update   ON master.auth_group            RENAME TO trg_auth_group_iam_outbox_update;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_group_role_updated_at               ON master.auth_group_role       RENAME TO trg_auth_group_role_updated_at;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_group_role_iam_outbox               ON master.auth_group_role       RENAME TO trg_auth_group_role_iam_outbox;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_pgm_iam_outbox                      ON master.auth_group_member     RENAME TO trg_agm_iam_outbox;                     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_pab_updated_at                      ON master.principal_identity_binding RENAME TO trg_pib_updated_at;                EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TRIGGER trg_pab_service_client                  ON master.principal_identity_binding RENAME TO trg_pib_service_client;            EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── §4  Rename indexes ────────────────────────────────────────────────────────
-- principal_identity_binding
DO $$ BEGIN ALTER INDEX master.pab_principal_idx      RENAME TO pib_principal_idx;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.pab_sync_status_pidx   RENAME TO pib_sync_status_pidx;      EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_group (was principal_group)
DO $$ BEGIN ALTER INDEX master.pg_tenant_active_pidx         RENAME TO aug_tenant_active_pidx;        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.ix_pg_self_service_eligible   RENAME TO ix_aug_self_service_eligible;  EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_group_member (was group_member)
DO $$ BEGIN ALTER INDEX master.pgm_principal_idx  RENAME TO agm_principal_idx; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.pgm_group_idx      RENAME TO agm_group_idx;     EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_group_role (was group_role)
DO $$ BEGIN ALTER INDEX master.gr_group_active_pidx    RENAME TO agr_group_active_pidx;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.gr_role_idx             RENAME TO agr_role_idx;             EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.gr_assignment_scope_idx RENAME TO agr_assignment_scope_idx; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.gr_assignment_le_idx    RENAME TO agr_assignment_le_idx;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.gr_assignment_cc_idx    RENAME TO agr_assignment_cc_idx;    EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- team_member (was team_principal)
DO $$ BEGIN ALTER INDEX master.team_principal_active_uidx RENAME TO team_member_active_uidx; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX master.tp_team_idx               RENAME TO tm_team_idx;              EXCEPTION WHEN OTHERS THEN NULL; END $$;
