CREATE DOMAIN authz.application_projection_status_d AS text CHECK(VALUE IN ('pending','active','suspended','retired','failed'));
CREATE DOMAIN authz.projection_provider_status_d AS text CHECK(VALUE IN ('pending','active','suspended','retired'));
CREATE DOMAIN authz.projection_ceiling_mode_d AS text CHECK(VALUE IN ('exact','subtree','member_companies'));

CREATE DOMAIN authz.operation_decision_mode_d AS text
    CHECK (VALUE IN ('entity_resource','collection'));

CREATE DOMAIN authz.scope_coordinate_source_d AS text
    CHECK (VALUE IN ('tenant_context','request_field','record_field','collection_field','relation_resolver'));

CREATE DOMAIN authz.operation_scope_binding_status_d AS text
    CHECK (VALUE IN ('draft','published','retired'));
