-- Owner-approved source-free initialization, exact member identities only.
-- Private installation data is supplied separately from the approved declaration.
-- This adds no default and preserves the existing source-copy path/enforcement.
CREATE TABLE entity_command_private.declared_operation_initialization (
 target_change_set_id uuid NOT NULL, entity_id uuid NOT NULL REFERENCES metadata.entity(id),
 operation_id uuid PRIMARY KEY, operation_key text NOT NULL,
 requires_mfa boolean NOT NULL CHECK(requires_mfa=false),
 declaration_hash text NOT NULL CHECK(declaration_hash ~ '^[a-f0-9]{64}$'),
 operation_hash text NOT NULL CHECK(operation_hash ~ '^[a-f0-9]{64}$'),
 UNIQUE(target_change_set_id,operation_key)
);
REVOKE ALL ON entity_command_private.declared_operation_initialization FROM PUBLIC;
CREATE OR REPLACE FUNCTION entity_command_private.guard_native_operation_initialization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE approved boolean;
BEGIN
 IF NOT entity_command_private.native_bootstrap_writable(NEW.change_set_id,NEW.entity_id) THEN
  RAISE EXCEPTION 'NATIVE_OPERATION_INITIALIZER_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Exact privately installed declaration; ordinary command roles cannot write it.
 SELECT true INTO approved FROM entity_command_private.declared_operation_initialization d
 JOIN metadata.entity_change_set c ON c.id=d.target_change_set_id
 WHERE d.target_change_set_id=NEW.change_set_id AND d.entity_id=NEW.entity_id
 AND d.operation_id=NEW.id AND d.operation_key=NEW.operation_key
 AND d.requires_mfa=NEW.requires_mfa AND NEW.operation_kind='read'
 AND NEW.authorization_effect='read' AND NEW.tenant_id IS NULL
 AND c.entity_id=d.entity_id AND c.source_kind='product' AND c.tenant_id IS NULL
 AND c.native_core_layout_version=2 AND c.lock_version=1 AND c.status='draft'
 AND entity_command_private.admitted_creation(c.id,c.entity_id)
 FOR SHARE OF d,c;
 IF FOUND THEN RETURN NEW; END IF;
 SELECT true INTO approved FROM entity_command_private.operation_bootstrap_source b
 JOIN metadata.entity_change_set s ON s.id=b.source_change_set_id
 JOIN metadata.entity e ON e.id=b.entity_id
 JOIN metadata.entity_operation o ON o.id=b.source_operation_id
 WHERE b.target_change_set_id=NEW.change_set_id AND b.entity_id=NEW.entity_id AND b.operation_key=NEW.operation_key
 AND NEW.id<>b.source_operation_id AND NEW.operation_kind='read' AND NEW.requires_mfa=b.requires_mfa
 AND s.entity_id=e.id AND s.tenant_id IS NULL AND s.status='draft' AND s.source_kind='product'
 AND s.native_core_layout_version IS NULL AND s.lock_version=b.source_revision
 AND e.tenant_id IS NULL AND e.entity_code=b.entity_code
 AND o.change_set_id=s.id AND o.entity_id=e.id AND o.tenant_id IS NULL
 AND o.operation_key=b.operation_key AND o.operation_kind='read' AND o.requires_mfa=b.requires_mfa
 FOR SHARE OF b,s,e,o;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_OPERATION_INITIALIZER_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.guard_native_operation_initialization() FROM PUBLIC;
