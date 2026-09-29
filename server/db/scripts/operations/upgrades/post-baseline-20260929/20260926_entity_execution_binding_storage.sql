-- Add normalized execution-binding storage needed by the graph repository.
-- Application writes remain ungranted pending the governed-command rollout.
-- No approvals, runtime release rows, or entity data are modified.
DO $$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
END $$;

CREATE TABLE metadata.entity_change_case_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_operation_id uuid NOT NULL, binding_key text NOT NULL,
    case_kind text NOT NULL, case_entity_code text NOT NULL DEFAULT 'entity_case', workflow_key text,
    materialization_binding_key text, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_change_case_binding_pkey PRIMARY KEY(id),
    CONSTRAINT entity_change_case_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT(tenant_id,id),
    CONSTRAINT entity_change_case_binding_key_uq UNIQUE NULLS NOT DISTINCT(tenant_id,change_set_id,binding_key),
    CONSTRAINT entity_change_case_binding_operation_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_operation_id),
    CONSTRAINT entity_change_case_binding_key_chk CHECK(binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_change_case_binding_kind_chk CHECK(case_kind IN ('governed_change','direct_change')),
    CONSTRAINT entity_change_case_binding_entity_chk CHECK(case_entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_change_case_binding_workflow_chk CHECK(workflow_key IS NULL OR workflow_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_change_case_binding_materialization_chk CHECK(materialization_binding_key IS NULL OR materialization_binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_change_case_binding_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE metadata.entity_change_case_binding
    ADD CONSTRAINT entity_change_case_binding_entity_fk FOREIGN KEY(entity_id) REFERENCES metadata.entity(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_change_case_binding_change_set_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_change_case_binding_operation_fk FOREIGN KEY(entity_operation_id) REFERENCES metadata.entity_operation(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_change_case_binding_created_by_fk FOREIGN KEY(created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_change_case_binding_updated_by_fk FOREIGN KEY(updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE metadata.entity_change_case_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_change_case_binding FORCE ROW LEVEL SECURITY;
REVOKE ALL ON metadata.entity_change_case_binding FROM PUBLIC,athyperapp;
GRANT SELECT ON metadata.entity_change_case_binding TO athyperapp;
GRANT ALL ON metadata.entity_change_case_binding TO athyperadmin;
CREATE POLICY application_read ON metadata.entity_change_case_binding FOR SELECT TO athyperapp
 USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY administrator_access ON metadata.entity_change_case_binding FOR ALL TO athyperadmin USING(true) WITH CHECK(true);

CREATE TABLE metadata.entity_operation_context_requirement (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_operation_id uuid NOT NULL, coordinate_key text NOT NULL,
    source_kind text NOT NULL, source_field_key text, required boolean NOT NULL DEFAULT true,
    status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_operation_context_requirement_pkey PRIMARY KEY(id),
    CONSTRAINT entity_operation_context_requirement_tenant_id_uq UNIQUE NULLS NOT DISTINCT(tenant_id,id),
    CONSTRAINT entity_operation_context_requirement_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_operation_id,coordinate_key),
    CONSTRAINT entity_operation_context_requirement_key_chk CHECK(coordinate_key ~ '^[a-z][a-zA-Z0-9_]{0,126}$'),
    CONSTRAINT entity_operation_context_requirement_source_chk CHECK(source_kind IN ('tenant_context','request_field','record_field')),
    CONSTRAINT entity_operation_context_requirement_source_field_chk CHECK((source_kind='tenant_context')=(source_field_key IS NULL)),
    CONSTRAINT entity_operation_context_requirement_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE metadata.entity_operation_context_requirement
    ADD CONSTRAINT entity_operation_context_requirement_entity_fk FOREIGN KEY(entity_id) REFERENCES metadata.entity(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_context_requirement_change_set_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_context_requirement_operation_fk FOREIGN KEY(entity_operation_id) REFERENCES metadata.entity_operation(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_context_requirement_created_by_fk FOREIGN KEY(created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_context_requirement_updated_by_fk FOREIGN KEY(updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE metadata.entity_operation_context_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_operation_context_requirement FORCE ROW LEVEL SECURITY;
REVOKE ALL ON metadata.entity_operation_context_requirement FROM PUBLIC,athyperapp;
GRANT SELECT ON metadata.entity_operation_context_requirement TO athyperapp;
GRANT ALL ON metadata.entity_operation_context_requirement TO athyperadmin;
CREATE POLICY application_read ON metadata.entity_operation_context_requirement FOR SELECT TO athyperapp
 USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY administrator_access ON metadata.entity_operation_context_requirement FOR ALL TO athyperadmin USING(true) WITH CHECK(true);

CREATE TABLE metadata.entity_field_reference_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_field_id uuid NOT NULL, binding_key text NOT NULL,
    reference_kind text NOT NULL, target_entity_code text, lookup_domain text, resolver_key text,
    require_active boolean NOT NULL DEFAULT true, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_field_reference_binding_pkey PRIMARY KEY(id),
    CONSTRAINT entity_field_reference_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT(tenant_id,id),
    CONSTRAINT entity_field_reference_binding_key_uq UNIQUE NULLS NOT DISTINCT(tenant_id,change_set_id,binding_key),
    CONSTRAINT entity_field_reference_binding_field_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_field_id),
    CONSTRAINT entity_field_reference_binding_kind_chk CHECK(reference_kind IN ('entity_relation','lookup_domain','resolver')),
    CONSTRAINT entity_field_reference_binding_target_chk CHECK(target_entity_code IS NULL OR target_entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_field_reference_binding_lookup_chk CHECK(lookup_domain IS NULL OR lookup_domain ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_field_reference_binding_resolver_chk CHECK(resolver_key IS NULL OR resolver_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_field_reference_binding_kind_target_chk CHECK((reference_kind='entity_relation')=(target_entity_code IS NOT NULL) AND (reference_kind='lookup_domain')=(lookup_domain IS NOT NULL) AND (reference_kind='resolver')=(resolver_key IS NOT NULL)),
    CONSTRAINT entity_field_reference_binding_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE metadata.entity_field_reference_binding
    ADD CONSTRAINT entity_field_reference_binding_entity_fk FOREIGN KEY(entity_id) REFERENCES metadata.entity(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_reference_binding_change_set_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_reference_binding_field_fk FOREIGN KEY(entity_field_id) REFERENCES metadata.entity_field(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_reference_binding_created_by_fk FOREIGN KEY(created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_reference_binding_updated_by_fk FOREIGN KEY(updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE metadata.entity_field_reference_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_field_reference_binding FORCE ROW LEVEL SECURITY;
REVOKE ALL ON metadata.entity_field_reference_binding FROM PUBLIC,athyperapp;
GRANT SELECT ON metadata.entity_field_reference_binding TO athyperapp;
GRANT ALL ON metadata.entity_field_reference_binding TO athyperadmin;
CREATE POLICY application_read ON metadata.entity_field_reference_binding FOR SELECT TO athyperapp
 USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY administrator_access ON metadata.entity_field_reference_binding FOR ALL TO athyperadmin USING(true) WITH CHECK(true);

CREATE TABLE metadata.entity_materialization_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, binding_key text NOT NULL, target_entity_code text NOT NULL,
    materializer_key text NOT NULL, target_collection_key text, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_materialization_binding_pkey PRIMARY KEY(id),
    CONSTRAINT entity_materialization_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT(tenant_id,id),
    CONSTRAINT entity_materialization_binding_key_uq UNIQUE NULLS NOT DISTINCT(tenant_id,change_set_id,binding_key),
    CONSTRAINT entity_materialization_binding_target_chk CHECK(target_entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_materialization_binding_handler_chk CHECK(materializer_key ~ '^[a-z][a-z0-9_.:-]{1,126}\\.v[1-9][0-9]*$'),
    CONSTRAINT entity_materialization_binding_collection_chk CHECK(target_collection_key IS NULL OR target_collection_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_materialization_binding_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE metadata.entity_materialization_binding
    ADD CONSTRAINT entity_materialization_binding_entity_fk FOREIGN KEY(entity_id) REFERENCES metadata.entity(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_materialization_binding_change_set_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_materialization_binding_created_by_fk FOREIGN KEY(created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_materialization_binding_updated_by_fk FOREIGN KEY(updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE metadata.entity_materialization_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_materialization_binding FORCE ROW LEVEL SECURITY;
REVOKE ALL ON metadata.entity_materialization_binding FROM PUBLIC,athyperapp;
GRANT SELECT ON metadata.entity_materialization_binding TO athyperapp;
GRANT ALL ON metadata.entity_materialization_binding TO athyperadmin;
CREATE POLICY application_read ON metadata.entity_materialization_binding FOR SELECT TO athyperapp
 USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY administrator_access ON metadata.entity_materialization_binding FOR ALL TO athyperadmin USING(true) WITH CHECK(true);

CREATE TABLE metadata.entity_materialization_field_mapping (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_materialization_binding_id uuid NOT NULL,
    source_field_key text NOT NULL, target_field_key text NOT NULL, transform_key text, required boolean NOT NULL DEFAULT false,
    position smallint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_materialization_field_mapping_pkey PRIMARY KEY(id),
    CONSTRAINT entity_materialization_field_mapping_tenant_id_uq UNIQUE NULLS NOT DISTINCT(tenant_id,id),
    CONSTRAINT entity_materialization_field_mapping_position_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_materialization_binding_id,position),
    CONSTRAINT entity_materialization_field_mapping_source_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_materialization_binding_id,source_field_key),
    CONSTRAINT entity_materialization_field_mapping_field_chk CHECK(source_field_key ~ '^[a-z][a-z0-9_]{0,62}$' AND target_field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT entity_materialization_field_mapping_transform_chk CHECK(transform_key IS NULL OR transform_key ~ '^[a-z][a-z0-9_.:-]{1,126}\\.v[1-9][0-9]*$'),
    CONSTRAINT entity_materialization_field_mapping_position_chk CHECK(position>=0),
    CONSTRAINT entity_materialization_field_mapping_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE metadata.entity_materialization_field_mapping
    ADD CONSTRAINT entity_materialization_field_mapping_binding_fk FOREIGN KEY(entity_materialization_binding_id) REFERENCES metadata.entity_materialization_binding(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_materialization_field_mapping_created_by_fk FOREIGN KEY(created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_materialization_field_mapping_updated_by_fk FOREIGN KEY(updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE metadata.entity_materialization_field_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_materialization_field_mapping FORCE ROW LEVEL SECURITY;
REVOKE ALL ON metadata.entity_materialization_field_mapping FROM PUBLIC,athyperapp;
GRANT SELECT ON metadata.entity_materialization_field_mapping TO athyperapp;
GRANT ALL ON metadata.entity_materialization_field_mapping TO athyperadmin;
CREATE POLICY application_read ON metadata.entity_materialization_field_mapping FOR SELECT TO athyperapp
 USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY administrator_access ON metadata.entity_materialization_field_mapping FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
