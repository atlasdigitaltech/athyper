-- 06_constraints/007_event.sql
-- Depends on: 04_tables/007_event.sql
-- FK constraints for event schema tables.

-- outbox.tenant_id → master.tenant
DO $$ BEGIN
    ALTER TABLE event.outbox
        ADD CONSTRAINT outbox_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ————————————————————————————————————————————————————————————————————————————
-- NOTIFICATION TABLES
-- ————————————————————————————————————————————————————————————————————————————

-- —— notification_message —————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE event.notification_message ADD CONSTRAINT nmsg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.notification_message ADD CONSTRAINT nmsg_rule_fk
    FOREIGN KEY (rule_id) REFERENCES control.notification_routing_rule (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.notification_message ADD CONSTRAINT nmsg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— notification_delivery ———————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE event.notification_delivery ADD CONSTRAINT ndlv_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.notification_delivery ADD CONSTRAINT ndlv_message_fk
    FOREIGN KEY (message_id) REFERENCES event.notification_message (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.notification_delivery ADD CONSTRAINT ndlv_recipient_fk
    FOREIGN KEY (recipient_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.notification_delivery ADD CONSTRAINT ndlv_provider_fk
    FOREIGN KEY (provider_id) REFERENCES control.notification_provider (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.notification_delivery ADD CONSTRAINT ndlv_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— digest_staging ——————————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE event.digest_staging ADD CONSTRAINT ds_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.digest_staging ADD CONSTRAINT ds_recipient_fk
    FOREIGN KEY (recipient_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.digest_staging ADD CONSTRAINT ds_message_fk
    FOREIGN KEY (message_id) REFERENCES event.notification_message (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.digest_staging ADD CONSTRAINT ds_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— §10  event.comment_flag ————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE event.comment_flag ADD CONSTRAINT cf_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.comment_flag ADD CONSTRAINT cf_flagged_by_fk
    FOREIGN KEY (flagged_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.comment_flag ADD CONSTRAINT cf_reviewed_by_fk
    FOREIGN KEY (reviewed_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.comment_flag ADD CONSTRAINT cf_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— §9  event.lifecycle_timer_schedule ——————————————————————————————————
DO $$ BEGIN ALTER TABLE event.lifecycle_timer_schedule ADD CONSTRAINT lts_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.lifecycle_timer_schedule ADD CONSTRAINT lts_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.lifecycle_timer_schedule ADD CONSTRAINT lts_state_fk
    FOREIGN KEY (state_id) REFERENCES control.lifecycle_state (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.lifecycle_timer_schedule ADD CONSTRAINT lts_policy_fk
    FOREIGN KEY (policy_id) REFERENCES control.lifecycle_timer_policy (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §10  master.lifecycle_instance ───────────────────────────────────────────


-- ── §8  event.work_item ─────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_request_fk
    FOREIGN KEY (tenant_id, workflow_request_id)
    REFERENCES document.workflow_request (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_stage_fk
    FOREIGN KEY (tenant_id, workflow_stage_id)
    REFERENCES document.workflow_stage (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_designated_fk
    FOREIGN KEY (designated_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_designated_group_fk
    FOREIGN KEY (designated_group_id) REFERENCES master.auth_group (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_assignee_fk
    FOREIGN KEY (assignee_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_assignee_group_fk
    FOREIGN KEY (assignee_group_id) REFERENCES master.auth_group (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_assignee_team_fk
    FOREIGN KEY (assignee_team_id) REFERENCES master.team (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event.work_item ADD CONSTRAINT wi_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
