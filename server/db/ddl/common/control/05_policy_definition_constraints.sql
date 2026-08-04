ALTER TABLE control.policy_definition
    ADD CONSTRAINT pdef_effective_order_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    ADD CONSTRAINT pdef_entity_type_nonempty
        CHECK (btrim(entity_type) <> ''),
    ADD CONSTRAINT pdef_eval_mode_chk
        CHECK (evaluation_mode IN ('first_match', 'accumulate', 'all')),
    ADD CONSTRAINT pdef_name_nonempty
        CHECK (btrim(name) <> ''),
    ADD CONSTRAINT pdef_priority_pos
        CHECK (priority > 0),
    ADD CONSTRAINT pdef_status_chk
        CHECK (status IN ('active', 'inactive', 'deprecated')),
    ADD CONSTRAINT pdef_version_pos
        CHECK (version_no > 0),
    ADD CONSTRAINT pdef_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    ADD CONSTRAINT pdef_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT pdef_module_fk
        FOREIGN KEY (module_id) REFERENCES master.module(id) ON DELETE SET NULL,
    ADD CONSTRAINT pdef_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
