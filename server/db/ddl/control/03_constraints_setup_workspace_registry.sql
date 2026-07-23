DO $$ BEGIN
    ALTER TABLE control.setup_workspace
        ADD CONSTRAINT setup_workspace_workspace_fk
        FOREIGN KEY (workspace_id) REFERENCES shared.workspace(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.setup_domain
        ADD CONSTRAINT setup_domain_workspace_fk
        FOREIGN KEY (setup_workspace_id) REFERENCES control.setup_workspace(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.setup_domain
        ADD CONSTRAINT setup_domain_owner_module_fk
        FOREIGN KEY (owner_module_id) REFERENCES shared.module(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
