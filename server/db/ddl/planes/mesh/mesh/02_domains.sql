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

CREATE DOMAIN mesh.document_direction_d AS text
    CHECK (VALUE IN ('buyer_to_supplier', 'supplier_to_buyer'));

CREATE DOMAIN mesh.document_envelope_status_d AS text
    CHECK (VALUE IN (
        'received', 'validating', 'validated', 'accepted', 'rejected',
        'routing', 'routed', 'failed', 'archived'
    ));

CREATE DOMAIN mesh.document_payload_role_d AS text
    CHECK (VALUE IN ('primary', 'attachment', 'manifest'));

CREATE DOMAIN mesh.document_payload_scan_status_d AS text
    CHECK (VALUE IN ('pending', 'clean', 'quarantined', 'error'));

CREATE DOMAIN mesh.document_payload_status_d AS text
    CHECK (VALUE IN ('active', 'archived', 'deleted'));

CREATE DOMAIN mesh.document_ack_type_d AS text
    CHECK (VALUE IN ('technical', 'functional', 'business', 'delivery', 'final'));

CREATE DOMAIN mesh.document_ack_status_d AS text
    CHECK (VALUE IN ('accepted', 'rejected', 'partial', 'failed', 'delivered'));

CREATE DOMAIN mesh.network_profile_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'suspended', 'retired'));

CREATE DOMAIN mesh.trade_role_d AS text
    CHECK (VALUE IN ('supplier', 'customer'));

CREATE DOMAIN mesh.profile_record_status_d AS text
    CHECK (VALUE IN ('active', 'inactive', 'revoked'));

CREATE DOMAIN mesh.profile_publication_event_d AS text
    CHECK (VALUE IN ('published', 'withdrawn'));

CREATE DOMAIN mesh.bank_institution_type_d AS text
    CHECK (VALUE IN (
        'bank', 'correspondent_bank', 'central_bank', 'credit_union',
        'neobank', 'payment_provider', 'wallet_provider', 'fx_broker'
    ));

CREATE DOMAIN mesh.bank_account_id_type_d AS text
    CHECK (VALUE IN ('iban', 'local'));

CREATE DOMAIN mesh.bank_account_status_d AS text
    CHECK (VALUE IN (
        'draft', 'pending_verification', 'active',
        'suspended', 'closed', 'retired'
    ));

CREATE DOMAIN mesh.bank_verification_method_d AS text
    CHECK (VALUE IN (
        'micro_deposit', 'bank_letter', 'cancelled_cheque',
        'supplier_portal', 'manual', 'api_validation'
    ));

CREATE DOMAIN mesh.bank_disclosure_status_d AS text
    CHECK (VALUE IN ('pending_approval', 'active', 'rejected', 'expired', 'revoked', 'superseded'));
