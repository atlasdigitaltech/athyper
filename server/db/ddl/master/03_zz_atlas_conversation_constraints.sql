-- ============================================================================
-- Cross-schema and tenant-safe Atlas conversation foreign keys.
--
-- The message/run links are circular by design so all identifiers can be
-- allocated before provider streaming begins. They are DEFERRABLE INITIALLY
-- DEFERRED and must be created in one transaction.
-- ============================================================================

DO $$ BEGIN ALTER TABLE master.atlas_thread
    ADD CONSTRAINT atlas_thread_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_thread
    ADD CONSTRAINT atlas_thread_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES master.conversation (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_thread
    ADD CONSTRAINT atlas_thread_owner_fk
    FOREIGN KEY (tenant_id, owner_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_thread
    ADD CONSTRAINT atlas_thread_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_thread
    ADD CONSTRAINT atlas_thread_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


DO $$ BEGIN ALTER TABLE master.atlas_message
    ADD CONSTRAINT atlas_message_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_message
    ADD CONSTRAINT atlas_message_thread_fk
    FOREIGN KEY (tenant_id, conversation_id, plane)
    REFERENCES master.atlas_thread (tenant_id, conversation_id, plane)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_message
    ADD CONSTRAINT atlas_message_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_message
    ADD CONSTRAINT atlas_message_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_message
    ADD CONSTRAINT atlas_message_parent_fk
    FOREIGN KEY (tenant_id, conversation_id, plane, parent_message_id)
    REFERENCES master.atlas_message (tenant_id, conversation_id, plane, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_thread_fk
    FOREIGN KEY (tenant_id, conversation_id, plane)
    REFERENCES master.atlas_thread (tenant_id, conversation_id, plane)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_cancelled_by_fk
    FOREIGN KEY (tenant_id, cancellation_requested_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_input_message_fk
    FOREIGN KEY (tenant_id, conversation_id, plane, input_message_id)
    REFERENCES master.atlas_message (tenant_id, conversation_id, plane, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_output_message_fk
    FOREIGN KEY (tenant_id, conversation_id, plane, output_message_id)
    REFERENCES master.atlas_message (tenant_id, conversation_id, plane, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.atlas_message
    ADD CONSTRAINT atlas_message_run_fk
    FOREIGN KEY (tenant_id, conversation_id, plane, run_id)
    REFERENCES event.atlas_run (tenant_id, conversation_id, plane, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.atlas_run
    ADD CONSTRAINT atlas_run_metering_fk
    FOREIGN KEY (tenant_id, metering_run_id)
    REFERENCES log.ai_agent_run (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
