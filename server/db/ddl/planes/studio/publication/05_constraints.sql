ALTER TABLE publication.entity_release_link
    ADD CONSTRAINT publication_entity_release_link_release_fk FOREIGN KEY (publication_release_id) REFERENCES publication.release(id) ON DELETE RESTRICT,
    ADD CONSTRAINT publication_entity_release_link_entity_fk FOREIGN KEY (entity_release_id) REFERENCES metadata.entity_release(id) ON DELETE RESTRICT;
ALTER TABLE publication.business_partner_definition_release_link
    ADD CONSTRAINT publication_bp_definition_release_link_release_fk FOREIGN KEY (publication_release_id) REFERENCES publication.release(id) ON DELETE RESTRICT,
    ADD CONSTRAINT publication_bp_definition_release_link_revision_fk FOREIGN KEY (definition_revision_id) REFERENCES snapshot.business_partner_definition_revision(id) ON DELETE RESTRICT;
ALTER TABLE publication.release
    ADD CONSTRAINT publication_release_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE publication.artifact
    ADD CONSTRAINT publication_artifact_release_fk FOREIGN KEY (publication_release_id) REFERENCES publication.release(id) ON DELETE RESTRICT;
ALTER TABLE publication.artifact_compilation
    ADD CONSTRAINT publication_artifact_compilation_release_fk FOREIGN KEY (publication_release_id) REFERENCES publication.release(id) ON DELETE RESTRICT;
ALTER TABLE publication.deployment
    ADD CONSTRAINT publication_deployment_artifact_fk FOREIGN KEY (artifact_id) REFERENCES publication.artifact(id) ON DELETE RESTRICT;
ALTER TABLE publication.deployment_event
    ADD CONSTRAINT publication_deployment_event_deployment_fk FOREIGN KEY (deployment_id) REFERENCES publication.deployment(id) ON DELETE RESTRICT;
ALTER TABLE publication.deployment_acknowledgement
    ADD CONSTRAINT publication_deployment_ack_deployment_fk FOREIGN KEY (deployment_id) REFERENCES publication.deployment(id) ON DELETE RESTRICT;
