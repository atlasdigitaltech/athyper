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
