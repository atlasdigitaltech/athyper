CREATE DOMAIN document.catalog_import_status_d AS text
    CHECK (VALUE IN (
        'received', 'validating', 'matching', 'pending_review',
        'partially_approved', 'approved', 'rejected', 'published', 'failed'
    ));

CREATE DOMAIN document.item_match_status_d AS text
    CHECK (VALUE IN (
        'unmatched', 'candidate_found', 'matched', 'conflict',
        'new_item_required', 'ignored'
    ));

CREATE DOMAIN document.item_match_method_d AS text
    CHECK (VALUE IN (
        'external_reference', 'gtin', 'manufacturer_part_number',
        'supplier_item_mapping', 'exact_code', 'manual', 'future_algorithm'
    ));

CREATE DOMAIN document.catalog_review_decision_d AS text
    CHECK (VALUE IN (
        'map_existing_item', 'create_product_and_item',
        'reject', 'park'
    ));

CREATE DOMAIN document.punchout_cart_status_d AS text
    CHECK (VALUE IN (
        'returned', 'matching', 'ready', 'converted', 'expired', 'rejected'
    ));

CREATE DOMAIN document.production_order_status_d AS text
    CHECK (VALUE IN (
        'draft', 'released', 'in_progress', 'completed',
        'cancelled', 'closed'
    ));

CREATE DOMAIN document.sales_order_status_d AS text
    CHECK (VALUE IN (
        'draft', 'confirmed', 'partially_fulfilled',
        'fulfilled', 'cancelled', 'closed'
    ));
