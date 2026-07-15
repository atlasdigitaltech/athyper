-- ============================================================================
-- event/03b_constraints_document_runtime.sql
-- Concept: Foreign keys for document runtime correctness primitives
-- ============================================================================

DO $$ BEGIN ALTER TABLE event.document_runtime_idempotency
    ADD CONSTRAINT dri_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.document_runtime_idempotency
    ADD CONSTRAINT dri_principal_fk FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.document_runtime_idempotency
    ADD CONSTRAINT dri_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.document_runtime_idempotency
    ADD CONSTRAINT dri_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.document_runtime_document_version
    ADD CONSTRAINT drdv_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.document_runtime_document_version
    ADD CONSTRAINT drdv_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.document_runtime_node_version
    ADD CONSTRAINT drnv_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.document_runtime_node_version
    ADD CONSTRAINT drnv_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.document_runtime_event
    ADD CONSTRAINT dre_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.document_runtime_event
    ADD CONSTRAINT dre_actor_fk FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
