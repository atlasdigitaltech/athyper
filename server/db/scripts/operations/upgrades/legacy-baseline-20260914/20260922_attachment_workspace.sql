-- Additive local upgrade for the canonical record-scoped folder revision token.
-- Prerequisite: canonical document schema; run with psql -v apply=false first.
\if :{?apply}
\else
\set apply false
\endif
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('document.attachment_workspace.upgrade',0));
SELECT to_regclass('document.attachment_workspace') IS NULL AS needs_workspace \gset
\if :needs_workspace
CREATE TABLE document.attachment_workspace (
    tenant_id     uuid        NOT NULL,
    entity_type   text        NOT NULL,
    entity_id     text        NOT NULL,
    revision_no   integer     NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz,
    updated_by    uuid,

    CONSTRAINT attachment_workspace_pkey PRIMARY KEY (tenant_id, entity_type, entity_id),
    CONSTRAINT attachment_workspace_owner_chk
        CHECK (
            entity_type ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)?$'
            AND btrim(entity_id) <> ''
            AND length(entity_id) <= 512
        ),
    CONSTRAINT attachment_workspace_revision_chk CHECK (revision_no > 0),
    CONSTRAINT attachment_workspace_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

ALTER TABLE document.attachment_workspace
    ADD CONSTRAINT attachment_workspace_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_workspace
    ADD CONSTRAINT attachment_workspace_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_workspace
    ADD CONSTRAINT attachment_workspace_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_workspace FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.attachment_workspace FOR ALL
 USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_workspace FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON document.attachment_workspace FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON document.attachment_workspace TO athyperapp;
GRANT ALL ON document.attachment_workspace TO athyperadmin;
\endif
SELECT count(*) AS workspace_rows FROM document.attachment_workspace;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
