-- 06_constraints/011_cms.sql
-- Depends on: 04_tables/003f_master_cms.sql, 04_tables/009a_snapshot_cms.sql
-- FK constraints for CMS tables.
--
-- Notes:
--   content_item.parent_id    — self-referential within master (same schema)
--   content_item.current_version_id → snapshot.content_item_version
--       DEFERRABLE INITIALLY DEFERRED: item + first version inserted atomically.
--   snapshot.content_item_version.content_item_id → master.content_item
--       non-deferrable; snapshot inserted after item exists.

-- ── master.content_item ──────────────────────────────────────────────────────
ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_tenant_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_parent_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.content_item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_created_by_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Circular FK: master.content_item → snapshot.content_item_version
-- DEFERRABLE INITIALLY DEFERRED allows inserting item + first version atomically.
ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_current_version_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_current_version_fk
    FOREIGN KEY (current_version_id)
    REFERENCES snapshot.content_item_version (id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit pair: updated_at and updated_by must both be set or both be NULL.
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_audit_pair_chk
    CHECK ((updated_at IS NULL) = (updated_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── snapshot.content_item_version ───────────────────────────────────────────
ALTER TABLE snapshot.content_item_version DROP CONSTRAINT IF EXISTS civ_tenant_fk;
DO $$ BEGIN ALTER TABLE snapshot.content_item_version ADD CONSTRAINT civ_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE snapshot.content_item_version DROP CONSTRAINT IF EXISTS civ_content_item_fk;
DO $$ BEGIN ALTER TABLE snapshot.content_item_version ADD CONSTRAINT civ_content_item_fk
    FOREIGN KEY (tenant_id, content_item_id)
    REFERENCES master.content_item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE snapshot.content_item_version DROP CONSTRAINT IF EXISTS civ_created_by_fk;
DO $$ BEGIN ALTER TABLE snapshot.content_item_version ADD CONSTRAINT civ_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.content_item_link ─────────────────────────────────────────────────
ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_tenant_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_source_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_source_fk
    FOREIGN KEY (tenant_id, source_content_item_id)
    REFERENCES master.content_item (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_target_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_target_fk
    FOREIGN KEY (tenant_id, target_content_item_id)
    REFERENCES master.content_item (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_created_by_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.content_item_access_grant ────────────────────────────────────────
ALTER TABLE master.content_item_access_grant DROP CONSTRAINT IF EXISTS ciag_tenant_fk;
DO $$ BEGIN ALTER TABLE master.content_item_access_grant ADD CONSTRAINT ciag_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_access_grant DROP CONSTRAINT IF EXISTS ciag_content_item_fk;
DO $$ BEGIN ALTER TABLE master.content_item_access_grant ADD CONSTRAINT ciag_content_item_fk
    FOREIGN KEY (tenant_id, content_item_id)
    REFERENCES master.content_item (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_access_grant DROP CONSTRAINT IF EXISTS ciag_created_by_fk;
DO $$ BEGIN ALTER TABLE master.content_item_access_grant ADD CONSTRAINT ciag_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
