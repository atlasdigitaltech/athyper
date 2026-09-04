BEGIN;

DO $$ BEGIN
  IF current_database() NOT IN('athyper_studio','athyper_neon','athyper_mesh')
     OR current_setting('app.database_plane',true) NOT IN('studio','neon','mesh')
     OR current_database()<>'athyper_'||current_setting('app.database_plane',true) THEN
    RAISE EXCEPTION 'Governed entity case foundation requires a supported matching plane';
  END IF;
END $$;

CREATE TABLE document.entity_case (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,case_code text NOT NULL,entity_code text NOT NULL,operation_code text NOT NULL,
 target_entity_id uuid,pre_materialization_ref text,entity_contract_id uuid NOT NULL,entity_contract_hash char(64) NOT NULL,
 form_template_release_id uuid,form_template_release_no bigint,form_template_hash char(64),current_snapshot_id uuid NOT NULL,submitted_snapshot_id uuid,decision_snapshot_id uuid,result_snapshot_id uuid,
 status text NOT NULL DEFAULT 'draft',row_version bigint NOT NULL DEFAULT 1,idempotency_key text NOT NULL,status_changed_at timestamptz,status_changed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_case_pkey PRIMARY KEY(id),CONSTRAINT entity_case_tenant_id_uq UNIQUE(tenant_id,id),CONSTRAINT entity_case_code_uq UNIQUE(tenant_id,case_code),CONSTRAINT entity_case_idempotency_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT entity_case_code_chk CHECK(case_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),CONSTRAINT entity_case_entity_chk CHECK(entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND operation_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
 CONSTRAINT entity_case_target_chk CHECK(target_entity_id IS NOT NULL OR pre_materialization_ref IS NOT NULL AND btrim(pre_materialization_ref)<>'' AND length(pre_materialization_ref)<=256),
 CONSTRAINT entity_case_contract_hash_chk CHECK(entity_contract_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT entity_case_form_release_chk CHECK(form_template_release_id IS NULL AND form_template_release_no IS NULL AND form_template_hash IS NULL OR form_template_release_id IS NOT NULL AND form_template_release_no>=1 AND form_template_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT entity_case_status_chk CHECK(status IN('draft','submitted','in_review','approved','rejected','materializing','materialized','cancelled','conflicted')),CONSTRAINT entity_case_version_chk CHECK(row_version>=1),
 CONSTRAINT entity_case_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),CONSTRAINT entity_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),CONSTRAINT entity_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
 CONSTRAINT entity_case_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id),CONSTRAINT entity_case_contract_fk FOREIGN KEY(tenant_id,entity_contract_id) REFERENCES runtime_meta.entity_contract(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT entity_case_current_snapshot_fk FOREIGN KEY(tenant_id,current_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_submitted_snapshot_fk FOREIGN KEY(tenant_id,submitted_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT entity_case_decision_snapshot_fk FOREIGN KEY(tenant_id,decision_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_result_snapshot_fk FOREIGN KEY(tenant_id,result_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT entity_case_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id),CONSTRAINT entity_case_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id),CONSTRAINT entity_case_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE document.entity_case_command_evidence (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,entity_case_id uuid NOT NULL,command_code text NOT NULL,idempotency_key text NOT NULL,request_fingerprint char(64) NOT NULL,
 expected_version bigint NOT NULL,before_version bigint NOT NULL,after_version bigint NOT NULL,before_status text NOT NULL,after_status text NOT NULL,outcome text NOT NULL,result_code text NOT NULL,
 result_snapshot_id uuid,result_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,recorded_at timestamptz NOT NULL DEFAULT now(),recorded_by uuid NOT NULL,
 CONSTRAINT entity_case_command_evidence_pkey PRIMARY KEY(id),CONSTRAINT entity_case_command_evidence_tenant_uq UNIQUE(tenant_id,id),CONSTRAINT entity_case_command_evidence_idem_uq UNIQUE(tenant_id,entity_case_id,command_code,idempotency_key),
 CONSTRAINT entity_case_command_evidence_code_chk CHECK(command_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND result_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),CONSTRAINT entity_case_command_evidence_hash_chk CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 CONSTRAINT entity_case_command_evidence_version_chk CHECK(expected_version>=0 AND before_version>=0 AND after_version>=before_version),CONSTRAINT entity_case_command_evidence_outcome_chk CHECK(outcome IN('accepted','rejected','replayed','conflict')),
 CONSTRAINT entity_case_command_evidence_json_chk CHECK(jsonb_typeof(result_evidence)='object' AND pg_column_size(result_evidence)<=16384),CONSTRAINT entity_case_command_evidence_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT entity_case_command_evidence_snapshot_fk FOREIGN KEY(tenant_id,result_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_command_evidence_actor_fk FOREIGN KEY(tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE document.entity_case_validation (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,entity_case_id uuid NOT NULL,evaluation_id uuid NOT NULL,ordinal integer NOT NULL,evaluated_snapshot_id uuid NOT NULL,
 ruleset_code text NOT NULL,ruleset_release text NOT NULL,ruleset_hash char(64) NOT NULL,finding_code text NOT NULL,field_path text,severity text NOT NULL,message text NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,evaluated_at timestamptz NOT NULL DEFAULT now(),evaluated_by uuid NOT NULL,
 CONSTRAINT entity_case_validation_pkey PRIMARY KEY(id),CONSTRAINT entity_case_validation_tenant_uq UNIQUE(tenant_id,id),CONSTRAINT entity_case_validation_ordinal_uq UNIQUE(tenant_id,entity_case_id,evaluation_id,ordinal),
 CONSTRAINT entity_case_validation_code_chk CHECK(ruleset_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND finding_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),CONSTRAINT entity_case_validation_release_chk CHECK(btrim(ruleset_release)<>'' AND length(ruleset_release)<=64 AND ruleset_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT entity_case_validation_finding_chk CHECK(ordinal>=0 AND severity IN('info','warning','error') AND length(message) BETWEEN 1 AND 2000 AND (field_path IS NULL OR length(field_path)<=512)),CONSTRAINT entity_case_validation_details_chk CHECK(jsonb_typeof(details)='object' AND pg_column_size(details)<=16384),
 CONSTRAINT entity_case_validation_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_validation_snapshot_fk FOREIGN KEY(tenant_id,evaluated_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_validation_actor_fk FOREIGN KEY(tenant_id,evaluated_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE document.entity_case_materialization (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,entity_case_id uuid NOT NULL,attempt_no integer NOT NULL,source_snapshot_id uuid NOT NULL,result_snapshot_id uuid,
 materializer_code text NOT NULL,materializer_version text NOT NULL,request_fingerprint char(64) NOT NULL,expected_target_version bigint,status text NOT NULL DEFAULT 'requested',result_code text,
 requested_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,requested_by uuid NOT NULL,completed_by uuid,
 CONSTRAINT entity_case_materialization_pkey PRIMARY KEY(id),CONSTRAINT entity_case_materialization_tenant_uq UNIQUE(tenant_id,id),CONSTRAINT entity_case_materialization_attempt_uq UNIQUE(tenant_id,entity_case_id,attempt_no),CONSTRAINT entity_case_materialization_fingerprint_uq UNIQUE(tenant_id,entity_case_id,request_fingerprint),
 CONSTRAINT entity_case_materialization_code_chk CHECK(materializer_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND btrim(materializer_version)<>'' AND length(materializer_version)<=64),CONSTRAINT entity_case_materialization_hash_chk CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 CONSTRAINT entity_case_materialization_state_chk CHECK(attempt_no>=1 AND (expected_target_version IS NULL OR expected_target_version>=1) AND status IN('requested','running','succeeded','failed','conflict')),CONSTRAINT entity_case_materialization_completion_chk CHECK((status IN('succeeded','failed','conflict'))=(completed_at IS NOT NULL) AND (completed_at IS NULL)=(completed_by IS NULL) AND (status<>'succeeded' OR result_snapshot_id IS NOT NULL)),
 CONSTRAINT entity_case_materialization_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_materialization_source_fk FOREIGN KEY(tenant_id,source_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_materialization_result_fk FOREIGN KEY(tenant_id,result_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT entity_case_materialization_requested_by_fk FOREIGN KEY(tenant_id,requested_by) REFERENCES master.principal(tenant_id,id),CONSTRAINT entity_case_materialization_completed_by_fk FOREIGN KEY(tenant_id,completed_by) REFERENCES master.principal(tenant_id,id)
);

CREATE TABLE governance.cycle_subject (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,cycle_run_id uuid NOT NULL,cycle_task_id uuid,subject_role text NOT NULL,entity_case_id uuid,entity_code text,entity_id uuid,snapshot_id uuid,external_reference text,is_primary boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
 CONSTRAINT cycle_subject_pkey PRIMARY KEY(id),CONSTRAINT cycle_subject_tenant_id_uq UNIQUE(tenant_id,id),CONSTRAINT cycle_subject_coordinate_uq UNIQUE NULLS NOT DISTINCT(tenant_id,cycle_run_id,subject_role,entity_case_id,entity_code,entity_id,snapshot_id,external_reference),
 CONSTRAINT cycle_subject_role_chk CHECK(subject_role ~ '^[a-z][a-z0-9_.:-]{1,62}$'),CONSTRAINT cycle_subject_one_coordinate_chk CHECK(num_nonnulls(entity_case_id,snapshot_id,external_reference,(CASE WHEN entity_code IS NOT NULL AND entity_id IS NOT NULL THEN entity_id END))=1 AND (entity_code IS NULL)=(entity_id IS NULL)),CONSTRAINT cycle_subject_entity_code_chk CHECK(entity_code IS NULL OR entity_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),CONSTRAINT cycle_subject_external_chk CHECK(external_reference IS NULL OR btrim(external_reference)<>'' AND length(external_reference)<=256),
 CONSTRAINT cycle_subject_run_fk FOREIGN KEY(tenant_id,cycle_run_id) REFERENCES governance.cycle_run(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT cycle_subject_task_fk FOREIGN KEY(tenant_id,cycle_task_id) REFERENCES governance.cycle_task(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT cycle_subject_snapshot_fk FOREIGN KEY(tenant_id,snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT cycle_subject_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id),CONSTRAINT cycle_subject_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE snapshot.entity_case_snapshot_lineage (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,entity_case_id uuid NOT NULL,source_snapshot_id uuid NOT NULL,target_snapshot_id uuid NOT NULL,lineage_role text NOT NULL,source_member_path text,target_authority_type text,target_authority_id uuid,transformation_code text NOT NULL,transformation_version text NOT NULL,evidence_hash char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
 CONSTRAINT entity_case_snapshot_lineage_pkey PRIMARY KEY(id),CONSTRAINT entity_case_snapshot_lineage_tenant_uq UNIQUE(tenant_id,id),CONSTRAINT entity_case_snapshot_lineage_edge_uq UNIQUE NULLS NOT DISTINCT(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,source_member_path,target_authority_type,target_authority_id),
 CONSTRAINT entity_case_snapshot_lineage_role_chk CHECK(lineage_role IN('submitted_from','validated_from','decided_from','materialized_from','merged_from','authority_projection')),CONSTRAINT entity_case_snapshot_lineage_path_chk CHECK(source_member_path IS NULL OR length(source_member_path)<=512),CONSTRAINT entity_case_snapshot_lineage_target_chk CHECK((target_authority_type IS NULL)=(target_authority_id IS NULL) AND (target_authority_type IS NULL OR target_authority_type ~ '^[a-z][a-z0-9_.:-]{1,126}$')),CONSTRAINT entity_case_snapshot_lineage_transform_chk CHECK(transformation_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND btrim(transformation_version)<>'' AND length(transformation_version)<=64),CONSTRAINT entity_case_snapshot_lineage_hash_chk CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT entity_case_snapshot_lineage_source_fk FOREIGN KEY(tenant_id,source_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_snapshot_lineage_target_fk FOREIGN KEY(tenant_id,target_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,CONSTRAINT entity_case_snapshot_lineage_actor_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id),CONSTRAINT entity_case_snapshot_lineage_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX entity_case_queue_idx ON document.entity_case(tenant_id,status,updated_at,created_at);
CREATE INDEX entity_case_target_idx ON document.entity_case(tenant_id,entity_code,target_entity_id) WHERE target_entity_id IS NOT NULL;
CREATE INDEX entity_case_validation_lookup_idx ON document.entity_case_validation(tenant_id,entity_case_id,evaluated_at DESC);
CREATE INDEX entity_case_materialization_queue_idx ON document.entity_case_materialization(tenant_id,status,requested_at) WHERE status IN('requested','running');
CREATE UNIQUE INDEX cycle_subject_primary_uq ON governance.cycle_subject(tenant_id,cycle_run_id) WHERE is_primary;
CREATE INDEX cycle_subject_case_idx ON governance.cycle_subject(tenant_id,entity_case_id) WHERE entity_case_id IS NOT NULL;
CREATE INDEX entity_case_snapshot_lineage_case_idx ON snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,created_at);
CREATE INDEX entity_case_snapshot_lineage_target_idx ON snapshot.entity_case_snapshot_lineage(tenant_id,target_authority_type,target_authority_id) WHERE target_authority_id IS NOT NULL;

CREATE TRIGGER entity_case_status_changed BEFORE UPDATE OF status ON document.entity_case FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER entity_case_updated_at BEFORE UPDATE ON document.entity_case FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER entity_case_command_evidence_immutable BEFORE UPDATE OR DELETE ON document.entity_case_command_evidence FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
CREATE TRIGGER entity_case_validation_immutable BEFORE UPDATE OR DELETE ON document.entity_case_validation FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
CREATE TRIGGER entity_case_snapshot_lineage_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_case_snapshot_lineage FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();

DO $$ DECLARE v_schema text;v_table text; BEGIN
 FOR v_schema,v_table IN SELECT * FROM (VALUES('document','entity_case'),('document','entity_case_command_evidence'),('document','entity_case_validation'),('document','entity_case_materialization'),('governance','cycle_subject')) value(schema_name,table_name) LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',v_schema,v_table);EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',v_schema,v_table);
  EXECUTE format('CREATE POLICY tenant_access ON %I.%I FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id())',v_schema,v_table);
  EXECUTE format('CREATE POLICY seed_write ON %I.%I FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true)',v_schema,v_table);
 END LOOP;
END $$;
ALTER TABLE snapshot.entity_case_snapshot_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_case_snapshot_lineage FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_case_snapshot_lineage_tenant_read ON snapshot.entity_case_snapshot_lineage FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY seed_write ON snapshot.entity_case_snapshot_lineage FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN CREATE POLICY admin_access ON snapshot.entity_case_snapshot_lineage FOR ALL TO athyperadmin USING(true) WITH CHECK(true); END IF; END $$;
REVOKE ALL ON document.entity_case,document.entity_case_command_evidence,document.entity_case_validation,document.entity_case_materialization,governance.cycle_subject,snapshot.entity_case_snapshot_lineage FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON document.entity_case,document.entity_case_command_evidence,document.entity_case_validation,document.entity_case_materialization,governance.cycle_subject,snapshot.entity_case_snapshot_lineage TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON document.entity_case,document.entity_case_command_evidence,document.entity_case_validation,document.entity_case_materialization,governance.cycle_subject,snapshot.entity_case_snapshot_lineage TO athyperadmin; END IF;
END $$;

COMMIT;
