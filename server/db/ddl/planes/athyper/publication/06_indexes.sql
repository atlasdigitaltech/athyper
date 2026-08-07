CREATE INDEX publication_release_status_idx ON publication.release(status, created_at DESC);
CREATE INDEX publication_artifact_release_idx ON publication.artifact(publication_release_id, plane_code);
CREATE INDEX publication_deployment_target_idx ON publication.deployment(target_plane, target_environment, status, created_at);
CREATE INDEX publication_deployment_event_timeline_idx ON publication.deployment_event(deployment_id, occurred_at, id);
CREATE INDEX publication_ack_release_hash_idx ON publication.deployment_acknowledgement(active_release_hash);
