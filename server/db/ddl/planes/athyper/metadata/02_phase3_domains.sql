CREATE DOMAIN metadata.entity_surface_kind_d AS text
    CHECK (VALUE IN ('form', 'detail', 'list', 'lookup', 'embedded'));

CREATE DOMAIN metadata.entity_surface_layout_d AS text
    CHECK (VALUE IN ('flow', 'grid', 'stack', 'tabs'));

CREATE DOMAIN metadata.entity_surface_section_kind_d AS text
    CHECK (VALUE IN ('section', 'group', 'fieldset', 'tab', 'columns'));

CREATE DOMAIN metadata.entity_operation_kind_d AS text
    CHECK (VALUE IN ('create', 'read', 'update', 'delete', 'execute', 'transition', 'import', 'export'));

CREATE DOMAIN metadata.entity_operation_execution_d AS text
    CHECK (VALUE IN ('synchronous', 'asynchronous'));

CREATE DOMAIN metadata.entity_operation_idempotency_d AS text
    CHECK (VALUE IN ('none', 'optional', 'required'));
