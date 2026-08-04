CREATE DOMAIN mesh.network_account_role_d AS text
    CHECK (VALUE IN ('buyer', 'supplier', 'both'));

CREATE DOMAIN mesh.network_account_status_d AS text
    CHECK (VALUE IN ('pending', 'active', 'suspended', 'retired'));

CREATE DOMAIN mesh.network_relationship_status_d AS text
    CHECK (VALUE IN ('requested', 'active', 'suspended', 'terminated'));

CREATE DOMAIN mesh.network_reference_status_d AS text
    CHECK (VALUE IN ('active', 'inactive', 'archived'));

CREATE DOMAIN mesh.catalog_kind_d AS text
    CHECK (VALUE IN ('product', 'service', 'mixed'));

CREATE DOMAIN mesh.catalog_visibility_d AS text
    CHECK (VALUE IN ('private', 'relationship', 'connected', 'public'));

CREATE DOMAIN mesh.catalog_status_d AS text
    CHECK (VALUE IN (
        'draft',
        'pending_review',
        'published',
        'unpublished',
        'archived'
    ));

CREATE DOMAIN mesh.catalog_item_kind_d AS text
    CHECK (VALUE IN ('good', 'service', 'digital', 'bundle'));

CREATE DOMAIN mesh.catalog_item_status_d AS text
    CHECK (VALUE IN ('draft', 'published', 'unpublished', 'archived'));

CREATE DOMAIN mesh.catalog_identifier_scheme_d AS text
    CHECK (VALUE IN (
        'supplier_part_number',
        'manufacturer_part_number',
        'gtin',
        'ean',
        'upc',
        'isbn',
        'sku',
        'custom'
    ));

CREATE DOMAIN mesh.catalog_audience_access_d AS text
    CHECK (VALUE IN ('view', 'purchase', 'contract'));

CREATE DOMAIN mesh.catalog_price_type_d AS text
    CHECK (VALUE IN ('list', 'relationship', 'contract', 'tier', 'promotional'));
