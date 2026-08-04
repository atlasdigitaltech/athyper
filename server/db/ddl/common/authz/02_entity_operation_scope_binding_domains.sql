CREATE DOMAIN authz.operation_decision_mode_d AS text
    CHECK (VALUE IN ('entity_resource','collection'));

CREATE DOMAIN authz.scope_coordinate_source_d AS text
    CHECK (VALUE IN ('tenant_context','request_field','record_field','collection_field','relation_resolver'));

CREATE DOMAIN authz.operation_scope_binding_status_d AS text
    CHECK (VALUE IN ('draft','published','retired'));

