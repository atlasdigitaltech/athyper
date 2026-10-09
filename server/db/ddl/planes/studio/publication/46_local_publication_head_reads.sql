-- Control admission reads only current activation coordinates, never manifests,
-- payloads or historical applied rows. Existing head visibility bounds the rows.
GRANT SELECT(id,source_release_id,source_release_no,publication_key,artifact_hash,status)
ON runtime_meta.applied_release TO athyper_control_api;
CREATE POLICY applied_release_control_current_head ON runtime_meta.applied_release
FOR SELECT TO athyper_control_api USING (
 status='active' AND EXISTS (
  SELECT 1 FROM runtime_meta.release_activation_head h
  WHERE h.applied_release_id=applied_release.id
    AND h.publication_key=applied_release.publication_key
    AND h.artifact_hash=applied_release.artifact_hash
    AND h.source_release_no=applied_release.source_release_no
 )
);
