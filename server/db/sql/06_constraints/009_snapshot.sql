-- 06_constraints/009_snapshot.sql

DO $$ BEGIN ALTER TABLE snapshot.lifecycle_route ADD CONSTRAINT lr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE snapshot.lifecycle_route ADD CONSTRAINT lr_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE snapshot.status_route ADD CONSTRAINT sr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- snapshot.entity_compiled
DO $$ BEGIN ALTER TABLE snapshot.entity_compiled ADD CONSTRAINT ec_version_fk
    FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- snapshot.entity_compiled_overlay
DO $$ BEGIN ALTER TABLE snapshot.entity_compiled_overlay ADD CONSTRAINT eco_version_fk
    FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE snapshot.entity_compiled_overlay ADD CONSTRAINT eco_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §6  DOCUMENT · PRINT · BRANDING  —  snapshot FK constraints
-- =============================================================================

-- ── snapshot.template_version ──────────────────────────────────────────────
ALTER TABLE snapshot.template_version DROP CONSTRAINT IF EXISTS template_version_tenant_fk;
DO $$ BEGIN ALTER TABLE snapshot.template_version ADD CONSTRAINT template_version_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE snapshot.template_version ADD CONSTRAINT template_version_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES master.template (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE snapshot.template_version ADD CONSTRAINT template_version_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── log.render_dlq ─────────────────────────────────────────────────────────
ALTER TABLE log.render_dlq DROP CONSTRAINT IF EXISTS render_dlq_tenant_fk;
DO $$ BEGIN ALTER TABLE log.render_dlq ADD CONSTRAINT render_dlq_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
