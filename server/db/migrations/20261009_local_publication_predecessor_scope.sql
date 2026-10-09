BEGIN;
-- Non-login function owner can read lifecycle coordinates, not payloads or manifests.
GRANT USAGE ON SCHEMA runtime_meta TO athyper_definer_product_publication;
GRANT SELECT(publication_key,artifact_hash,applied_release_id,source_release_no,row_version)
ON runtime_meta.release_activation_head TO athyper_definer_product_publication;
CREATE POLICY applied_release_local_predecessor_owner ON runtime_meta.applied_release FOR SELECT TO athyper_definer_product_publication USING(true);
CREATE POLICY activation_head_local_predecessor_owner ON runtime_meta.release_activation_head FOR SELECT TO athyper_definer_product_publication USING(true);
COMMIT;
