CREATE DOMAIN control.network_document_direction_d AS text
    CHECK (VALUE IN ('buyer_to_supplier', 'supplier_to_buyer', 'both'));

CREATE DOMAIN control.entity_version_policy_d AS text
    CHECK (VALUE IN ('latest_published', 'pinned'));

CREATE DOMAIN control.network_document_type_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'retired'));
