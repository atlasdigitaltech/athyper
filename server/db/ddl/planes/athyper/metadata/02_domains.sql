CREATE DOMAIN metadata.entity_class_d AS text
    CHECK (VALUE IN (
        'business',
        'configuration',
        'reference',
        'process',
        'projection',
        'technical'
    ));

CREATE DOMAIN metadata.entity_ownership_d AS text
    CHECK (VALUE IN ('system', 'package', 'tenant', 'overlay'));

CREATE DOMAIN metadata.entity_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'deprecated', 'retired'));

CREATE DOMAIN metadata.entity_change_set_status_d AS text
    CHECK (VALUE IN (
        'draft',
        'in_review',
        'approved',
        'rejected',
        'abandoned',
        'published'
    ));

CREATE DOMAIN metadata.compatibility_level_d AS text
    CHECK (VALUE IN ('backward_compatible', 'conditional', 'breaking'));

CREATE DOMAIN metadata.contract_validation_status_d AS text
    CHECK (VALUE IN ('pending', 'valid', 'invalid'));

CREATE DOMAIN metadata.entity_release_kind_d AS text
    CHECK (VALUE IN ('publish', 'rollback', 'retire'));
