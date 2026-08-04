CREATE DOMAIN metadata.entity_backing_kind_d AS text
    CHECK (VALUE IN ('table', 'view', 'materialized_view', 'external', 'virtual'));

CREATE DOMAIN metadata.entity_api_exposure_d AS text
    CHECK (VALUE IN ('none', 'catalog_only', 'api'));

CREATE DOMAIN metadata.entity_read_mode_d AS text
    CHECK (VALUE IN ('none', 'generic', 'facade', 'projection'));

CREATE DOMAIN metadata.entity_write_mode_d AS text
    CHECK (VALUE IN ('none', 'generic', 'facade', 'append_only'));

CREATE DOMAIN metadata.entity_create_mode_d AS text
    CHECK (VALUE IN ('form_only', 'early_draft', 'direct', 'source_document'));

CREATE DOMAIN metadata.entity_concurrency_mode_d AS text
    CHECK (VALUE IN ('none', 'optimistic', 'append_only'));

CREATE DOMAIN metadata.entity_change_policy_d AS text
    CHECK (VALUE IN ('locked', 'controlled', 'extensible'));

CREATE DOMAIN metadata.entity_field_data_type_d AS text
    CHECK (VALUE IN (
        'string', 'text', 'integer', 'bigint', 'decimal', 'boolean', 'uuid',
        'date', 'datetime', 'json', 'enum', 'reference', 'money'
    ));

CREATE DOMAIN metadata.entity_field_cardinality_d AS text
    CHECK (VALUE IN ('one', 'zero_or_one', 'many'));

CREATE DOMAIN metadata.entity_field_value_origin_d AS text
    CHECK (VALUE IN ('stored', 'computed', 'projected', 'runtime'));

CREATE DOMAIN metadata.entity_field_write_mode_d AS text
    CHECK (VALUE IN ('mutable', 'write_once', 'read_only', 'computed'));

CREATE DOMAIN metadata.entity_member_status_d AS text
    CHECK (VALUE IN ('active', 'deprecated'));

CREATE DOMAIN metadata.entity_key_kind_d AS text
    CHECK (VALUE IN ('primary', 'natural', 'alternate', 'idempotency'));

CREATE DOMAIN metadata.entity_uniqueness_scope_d AS text
    CHECK (VALUE IN ('global', 'tenant'));

CREATE DOMAIN metadata.entity_null_semantics_d AS text
    CHECK (VALUE IN ('not_allowed', 'nulls_distinct', 'nulls_not_distinct'));

CREATE DOMAIN metadata.entity_search_kind_d AS text
    CHECK (VALUE IN ('keyword', 'full_text', 'hybrid'));

CREATE DOMAIN metadata.entity_search_operator_d AS text
    CHECK (VALUE IN ('and', 'or'));

CREATE DOMAIN metadata.entity_search_normalization_d AS text
    CHECK (VALUE IN ('none', 'casefold', 'casefold_unaccent'));

CREATE DOMAIN metadata.entity_search_match_mode_d AS text
    CHECK (VALUE IN ('exact', 'prefix', 'contains', 'full_text'));

CREATE DOMAIN metadata.entity_relation_kind_d AS text
    CHECK (VALUE IN ('one_to_one', 'many_to_one', 'one_to_many', 'many_to_many'));

CREATE DOMAIN metadata.entity_relation_resolution_d AS text
    CHECK (VALUE IN ('foreign_key', 'logical', 'polymorphic'));

CREATE DOMAIN metadata.entity_relation_ownership_d AS text
    CHECK (VALUE IN ('reference', 'aggregate_child', 'shared'));

CREATE DOMAIN metadata.entity_relation_mutation_d AS text
    CHECK (VALUE IN ('read_only', 'source_owned', 'target_owned', 'coordinated'));

CREATE DOMAIN metadata.entity_relation_delete_action_d AS text
    CHECK (VALUE IN ('restrict', 'cascade', 'set_null', 'no_action'));

CREATE DOMAIN metadata.entity_relation_update_action_d AS text
    CHECK (VALUE IN ('restrict', 'cascade', 'no_action'));
