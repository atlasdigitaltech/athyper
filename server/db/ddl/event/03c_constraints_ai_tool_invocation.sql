-- ============================================================================
-- Tenant-safe foreign keys for the Atlas governed-tool invocation ledger.
-- ============================================================================

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_thread_fk
    FOREIGN KEY (tenant_id, thread_id, plane)
    REFERENCES master.atlas_thread (tenant_id, conversation_id, plane)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_run_fk
    FOREIGN KEY (tenant_id, thread_id, plane, run_id)
    REFERENCES event.atlas_run (tenant_id, conversation_id, plane, id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_confirmation_actor_fk
    FOREIGN KEY (tenant_id, confirmation_actor_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
