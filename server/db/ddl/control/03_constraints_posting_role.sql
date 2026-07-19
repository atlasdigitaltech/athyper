-- Stage 2 posting-role relational integrity.

DO $$ BEGIN ALTER TABLE control.posting_role_alias ADD CONSTRAINT posting_role_alias_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.posting_role_account_map ADD CONSTRAINT pram_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.posting_role_account_map ADD CONSTRAINT pram_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.posting_role_account_map ADD CONSTRAINT pram_book_fk
    FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.posting_role_account_map ADD CONSTRAINT pram_account_fk
    FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.posting_role_account_map ADD CONSTRAINT pram_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.posting_role_account_map ADD CONSTRAINT pram_supersedes_fk
    FOREIGN KEY (tenant_id, supersedes_id)
    REFERENCES control.posting_role_account_map(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.posting_role_account_map
      ADD CONSTRAINT pram_no_equal_priority_overlap
      EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        ledger_book_id WITH =,
        posting_role_code WITH =,
        priority WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
      ) WHERE (status = 'active');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
