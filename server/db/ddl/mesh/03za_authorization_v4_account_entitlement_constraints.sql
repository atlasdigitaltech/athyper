DO $$ BEGIN
    ALTER TABLE mesh.account_entitlement
        ADD CONSTRAINT mesh_account_entitlement_account_fk
        FOREIGN KEY (account_id)
        REFERENCES mesh.network_account (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
