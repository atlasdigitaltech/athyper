CREATE DOMAIN master.product_type_d AS text
    CHECK (VALUE IN ('good', 'service', 'digital', 'bundle'));

CREATE DOMAIN master.catalog_record_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN master.catalog_direction_d AS text
    CHECK (VALUE IN ('buy', 'sell', 'internal'));

CREATE DOMAIN master.bom_type_d AS text
    CHECK (VALUE IN ('production', 'assembly', 'sales_kit', 'engineering'));

CREATE DOMAIN master.bom_status_d AS text
    CHECK (VALUE IN ('draft', 'review', 'released', 'retired'));

CREATE DOMAIN master.classification_mapping_d AS text
    CHECK (VALUE IN ('exact', 'broader', 'narrower', 'related'));

CREATE DOMAIN master.classification_provenance_d AS text
    CHECK (VALUE IN ('manual', 'supplier', 'verified', 'inferred', 'imported'));
