CREATE INDEX entity_numbering_test_artifact_change_set_ix
    ON snapshot.entity_numbering_test_artifact (tenant_id, change_set_id, executed_at DESC);
CREATE INDEX entity_numbering_test_artifact_binding_ix
    ON snapshot.entity_numbering_test_artifact (tenant_id, numbering_binding_id, executed_at DESC);

