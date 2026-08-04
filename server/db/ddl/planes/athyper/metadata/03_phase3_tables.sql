-- Phase 3 presentation and operation graph. Rows remain mutable only inside an
-- Entity change set and become immutable through the existing revision/release model.
CREATE TABLE metadata.entity_surface (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    surface_key                text                           NOT NULL,
    surface_kind               metadata.entity_surface_kind_d NOT NULL,
    title                      text                           NOT NULL,
    description                text,
    layout_kind                metadata.entity_surface_layout_d NOT NULL DEFAULT 'flow',
    layout_config              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    is_default                 boolean                        NOT NULL DEFAULT false,
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    replacement_surface_key    text,
    deprecated_since_release_no bigint,
    planned_removal_release_no bigint,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_surface_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, surface_key),
    CONSTRAINT entity_surface_key_chk CHECK (surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_title_chk CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_surface_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_surface_layout_config_chk CHECK (jsonb_typeof(layout_config) = 'object'),
    CONSTRAINT entity_surface_replacement_chk CHECK (replacement_surface_key IS NULL OR replacement_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_deprecation_chk CHECK (
        (status = 'active' AND replacement_surface_key IS NULL AND deprecated_since_release_no IS NULL AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated' AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_surface_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_section (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    entity_surface_id          uuid                           NOT NULL,
    section_key                text                           NOT NULL,
    parent_section_id          uuid,
    section_kind               metadata.entity_surface_section_kind_d NOT NULL DEFAULT 'section',
    title                      text,
    description                text,
    position                   smallint                       NOT NULL,
    column_count               smallint                       NOT NULL DEFAULT 1,
    collapsible                boolean                        NOT NULL DEFAULT false,
    collapsed_by_default       boolean                        NOT NULL DEFAULT false,
    layout_config              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_surface_section_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_section_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_section_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, section_key),
    CONSTRAINT entity_surface_section_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, parent_section_id, position),
    CONSTRAINT entity_surface_section_key_chk CHECK (section_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_section_title_chk CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 256)),
    CONSTRAINT entity_surface_section_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_surface_section_position_chk CHECK (position >= 0),
    CONSTRAINT entity_surface_section_columns_chk CHECK (column_count BETWEEN 1 AND 12),
    CONSTRAINT entity_surface_section_collapse_chk CHECK (NOT collapsed_by_default OR collapsible),
    CONSTRAINT entity_surface_section_layout_config_chk CHECK (jsonb_typeof(layout_config) = 'object'),
    CONSTRAINT entity_surface_section_no_self_parent_chk CHECK (parent_section_id IS DISTINCT FROM id),
    CONSTRAINT entity_surface_section_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_field_binding (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    entity_surface_id          uuid                           NOT NULL,
    entity_surface_section_id  uuid,
    entity_field_id            uuid                           NOT NULL,
    binding_key                text                           NOT NULL,
    position                   smallint                       NOT NULL,
    label_override             text,
    help_text                  text,
    placeholder                text,
    widget_key                 text,
    column_span                smallint                       NOT NULL DEFAULT 12,
    show_required_indicator    boolean                        NOT NULL DEFAULT true,
    display_config             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    visibility_rule            jsonb,
    editability_rule           jsonb,
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_surface_field_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_field_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_field_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, binding_key),
    CONSTRAINT entity_surface_field_binding_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_surface_section_id, position),
    CONSTRAINT entity_surface_field_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_field_binding_position_chk CHECK (position >= 0),
    CONSTRAINT entity_surface_field_binding_label_chk CHECK (label_override IS NULL OR (btrim(label_override) <> '' AND length(label_override) <= 256)),
    CONSTRAINT entity_surface_field_binding_help_chk CHECK (help_text IS NULL OR length(help_text) <= 4000),
    CONSTRAINT entity_surface_field_binding_placeholder_chk CHECK (placeholder IS NULL OR length(placeholder) <= 512),
    CONSTRAINT entity_surface_field_binding_widget_chk CHECK (widget_key IS NULL OR widget_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_surface_field_binding_span_chk CHECK (column_span BETWEEN 1 AND 12),
    CONSTRAINT entity_surface_field_binding_display_chk CHECK (jsonb_typeof(display_config) = 'object'),
    CONSTRAINT entity_surface_field_binding_visibility_chk CHECK (visibility_rule IS NULL OR jsonb_typeof(visibility_rule) = 'object'),
    CONSTRAINT entity_surface_field_binding_editability_chk CHECK (editability_rule IS NULL OR jsonb_typeof(editability_rule) = 'object'),
    CONSTRAINT entity_surface_field_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_operation (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid,
    entity_id                  uuid                           NOT NULL,
    change_set_id              uuid                           NOT NULL,
    operation_key              text                           NOT NULL,
    operation_kind             metadata.entity_operation_kind_d NOT NULL,
    label                      text                           NOT NULL,
    description                text,
    handler_key                text,
    permission_code            text                           NOT NULL,
    execution_mode             metadata.entity_operation_execution_d NOT NULL DEFAULT 'synchronous',
    idempotency_mode           metadata.entity_operation_idempotency_d NOT NULL DEFAULT 'none',
    input_surface_key          text,
    confirmation_surface_key   text,
    result_surface_key         text,
    requires_mfa               boolean                        NOT NULL DEFAULT false,
    audit_event_code           text                           NOT NULL,
    status                     metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    replacement_operation_key  text,
    deprecated_since_release_no bigint,
    planned_removal_release_no bigint,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT entity_operation_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_operation_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, operation_key),
    CONSTRAINT entity_operation_key_chk CHECK (operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_label_chk CHECK (btrim(label) <> '' AND length(label) <= 256),
    CONSTRAINT entity_operation_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_operation_handler_chk CHECK (handler_key IS NULL OR handler_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_operation_permission_chk CHECK (permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'),
    CONSTRAINT entity_operation_surface_key_chk CHECK (
        (input_surface_key IS NULL OR input_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$')
        AND (confirmation_surface_key IS NULL OR confirmation_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$')
        AND (result_surface_key IS NULL OR result_surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$')
    ),
    CONSTRAINT entity_operation_audit_event_chk CHECK (audit_event_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'),
    CONSTRAINT entity_operation_handler_required_chk CHECK (operation_kind = 'read' OR handler_key IS NOT NULL),
    CONSTRAINT entity_operation_replacement_chk CHECK (replacement_operation_key IS NULL OR replacement_operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_deprecation_chk CHECK (
        (status = 'active' AND replacement_operation_key IS NULL AND deprecated_since_release_no IS NULL AND planned_removal_release_no IS NULL)
        OR (status = 'deprecated' AND deprecated_since_release_no >= 1
            AND (planned_removal_release_no IS NULL OR planned_removal_release_no > deprecated_since_release_no))
    ),
    CONSTRAINT entity_operation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_surface IS 'Change-set-owned named presentation surface. Field semantics remain in metadata.entity_field.';
COMMENT ON TABLE metadata.entity_surface_section IS 'Ordered and nestable layout region inside one Entity surface.';
COMMENT ON TABLE metadata.entity_surface_field_binding IS 'Presentation-only field binding; it cannot redefine type, validation, storage, default, computation, key, search, or relation semantics.';
COMMENT ON TABLE metadata.entity_operation IS 'Canonical operation identity and execution references. Permissions, handlers, lifecycle, audit contracts, and surfaces are referenced rather than embedded.';
