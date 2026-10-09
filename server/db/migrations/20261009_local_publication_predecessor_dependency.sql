BEGIN;
GRANT EXECUTE ON FUNCTION publication.read_native_product_review_source(uuid,integer) TO athyper_definer_product_publication;
COMMIT;
