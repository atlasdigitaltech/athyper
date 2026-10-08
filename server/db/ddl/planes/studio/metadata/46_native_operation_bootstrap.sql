-- Installed bootstrap evidence is private operational authority, not authoring
-- metadata or a publication-review receipt. No evidence is seeded here.
-- Populate only from a specific owner-approved manifest and server-allocated
-- fresh target drafts. No application/issuer role may author this evidence.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_product_command_app'
   AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole)
 OR pg_has_role('athyper_product_command_app','athyper_product_command_owner','MEMBER')
 OR pg_has_role('athyper_product_command_app','athyper_product_command_issuer','MEMBER') THEN
  RAISE EXCEPTION 'OPERATION_BOOTSTRAP_ROLE_UNSAFE';
 END IF;
END $$;
CREATE TABLE entity_command_private.operation_bootstrap_source (
 target_change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id),
 source_rows_hash text NOT NULL CHECK(source_rows_hash ~ '^[a-f0-9]{64}$'),
 entity_id uuid NOT NULL REFERENCES metadata.entity(id),
 entity_code text NOT NULL,
 source_change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id),
 source_revision bigint NOT NULL CHECK(source_revision>0),
 source_operation_id uuid NOT NULL REFERENCES metadata.entity_operation(id),
 operation_key text NOT NULL,
 requires_mfa boolean NOT NULL,
 approval_reference text NOT NULL CHECK(length(approval_reference)>0),
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(target_change_set_id,source_operation_id),
 UNIQUE(target_change_set_id,operation_key),
 CHECK(target_change_set_id<>source_change_set_id)
);
REVOKE ALL ON entity_command_private.operation_bootstrap_source FROM PUBLIC,
 athyper_product_command_app,athyper_product_command_issuer;
CREATE FUNCTION entity_command_private.read_operation_bootstrap_source(
 p_target uuid,p_hash text,p_source_operation uuid)
RETURNS TABLE(entity_id uuid,entity_code text,source_change_set_id uuid,
 source_revision bigint,source_operation_id uuid,operation_key text,requires_mfa boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_target IS NULL OR p_hash IS NULL OR p_source_operation IS NULL
 OR NOT entity_command_private.admitted(p_target) THEN
  RAISE EXCEPTION 'OPERATION_BOOTSTRAP_ADMISSION_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Locks protect both the trusted mapping and exact source through the outer
 -- command commit. The application receives no cross-draft table privileges.
 RETURN QUERY SELECT e.id,e.entity_code,s.id,s.lock_version::bigint,
   o.id,o.operation_key::text,o.requires_mfa
 FROM entity_command_private.operation_bootstrap_source b
 JOIN metadata.entity_change_set t ON t.id=b.target_change_set_id
 JOIN metadata.entity_change_set s ON s.id=b.source_change_set_id
 JOIN metadata.entity e ON e.id=b.entity_id
 JOIN metadata.entity_operation o ON o.id=b.source_operation_id
 WHERE b.target_change_set_id=p_target AND b.source_rows_hash=p_hash
 AND b.source_operation_id=p_source_operation
 AND t.entity_id=b.entity_id AND t.tenant_id IS NULL AND t.status='draft'
 AND t.source_kind='product' AND t.native_core_layout_version=2
 AND s.entity_id=b.entity_id AND s.tenant_id IS NULL AND s.status='draft'
 AND s.source_kind='product' AND s.native_core_layout_version IS NULL
 AND s.lock_version=b.source_revision AND e.tenant_id IS NULL AND e.entity_code=b.entity_code
 AND o.change_set_id=s.id AND o.entity_id=e.id AND o.tenant_id IS NULL
 AND o.operation_key=b.operation_key AND o.operation_kind='read'
 AND o.requires_mfa=b.requires_mfa
 AND NOT EXISTS(SELECT 1 FROM metadata.entity_operation existing WHERE existing.change_set_id=t.id)
 FOR SHARE OF b,t,s,e,o;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.read_operation_bootstrap_source(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.read_operation_bootstrap_source(uuid,text,uuid) TO athyper_product_command_app;
