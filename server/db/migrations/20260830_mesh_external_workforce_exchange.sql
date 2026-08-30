BEGIN;

DO $guard$ BEGIN
  IF current_database()<>'athyper_mesh' OR current_setting('app.database_plane',true)<>'mesh' THEN
    RAISE EXCEPTION 'External-workforce exchange migration requires the MESH plane';
  END IF;
END $guard$;

CREATE TABLE mesh.document_business_status_projection (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    source_envelope_id uuid NOT NULL,
    network_relationship_id uuid NOT NULL,
    resource_kind text NOT NULL,
    resource_ref text NOT NULL,
    lifecycle_version bigint NOT NULL,
    business_status text NOT NULL,
    safe_reason_code text,
    submitted_at timestamptz,
    decided_at timestamptz,
    last_event_id uuid NOT NULL,
    last_event_hash char(64) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT document_business_status_projection_pkey PRIMARY KEY(id),
    CONSTRAINT document_business_status_projection_resource_uq UNIQUE(network_relationship_id,resource_kind,resource_ref),
    CONSTRAINT document_business_status_projection_envelope_uq UNIQUE(source_envelope_id,resource_kind,resource_ref),
    CONSTRAINT document_business_status_projection_envelope_fk FOREIGN KEY(source_envelope_id) REFERENCES mesh.document_envelope(id) ON DELETE RESTRICT,
    CONSTRAINT document_business_status_projection_relationship_fk FOREIGN KEY(network_relationship_id) REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
    CONSTRAINT document_business_status_projection_event_fk FOREIGN KEY(last_event_id) REFERENCES mesh.document_event(id) ON DELETE RESTRICT,
    CONSTRAINT document_business_status_projection_version_chk CHECK(lifecycle_version>=1),
    CONSTRAINT document_business_status_projection_kind_chk CHECK(resource_kind IN('external_time_sheet','external_expense_sheet','service_sheet','supplier_invoice','invoice_match')),
    CONSTRAINT document_business_status_projection_ref_chk CHECK(btrim(resource_ref)<>'' AND length(resource_ref)<=256),
    CONSTRAINT document_business_status_projection_status_chk CHECK(business_status IN('received','accepted_for_processing','submitted','pending_approval','approved','rejected','reversed','matched','exception','posted','paid','cancelled')),
    CONSTRAINT document_business_status_projection_reason_chk CHECK(safe_reason_code IS NULL OR safe_reason_code~'^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT document_business_status_projection_hash_chk CHECK(last_event_hash~'^[a-f0-9]{64}$'),
    CONSTRAINT document_business_status_projection_dates_chk CHECK(decided_at IS NULL OR submitted_at IS NULL OR decided_at>=submitted_at)
);
COMMENT ON TABLE mesh.document_business_status_projection IS
  'Rebuildable participant-safe status head with opaque references and safe reason codes only; person, rate, receipt, accounting and unrestricted payload fields are prohibited.';
CREATE INDEX document_business_status_projection_envelope_idx ON mesh.document_business_status_projection(source_envelope_id,lifecycle_version DESC);
CREATE INDEX document_business_status_projection_relationship_idx ON mesh.document_business_status_projection(network_relationship_id,resource_kind,business_status,updated_at DESC);

CREATE FUNCTION mesh.trg_guard_document_business_status_projection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_envelope mesh.document_envelope%ROWTYPE;v_event_envelope_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Document business-status projections are rebuilt, not deleted directly' USING ERRCODE='restrict_violation';END IF;
 SELECT * INTO v_envelope FROM mesh.document_envelope WHERE id=NEW.source_envelope_id;
 SELECT envelope_id INTO v_event_envelope_id FROM mesh.document_event WHERE id=NEW.last_event_id;
 IF v_envelope.id IS NULL OR v_envelope.network_relationship_id IS DISTINCT FROM NEW.network_relationship_id OR v_event_envelope_id IS DISTINCT FROM NEW.source_envelope_id THEN
   RAISE EXCEPTION 'Business-status projection must match its envelope, relationship and last event' USING ERRCODE='integrity_constraint_violation';
 END IF;
 IF TG_OP='UPDATE' THEN
   IF (NEW.id,NEW.source_envelope_id,NEW.network_relationship_id,NEW.resource_kind,NEW.resource_ref) IS DISTINCT FROM (OLD.id,OLD.source_envelope_id,OLD.network_relationship_id,OLD.resource_kind,OLD.resource_ref) THEN RAISE EXCEPTION 'Business-status projection coordinates are immutable' USING ERRCODE='restrict_violation';END IF;
   IF NEW.lifecycle_version<=OLD.lifecycle_version THEN RAISE EXCEPTION 'Business-status projection lifecycle version must increase' USING ERRCODE='integrity_constraint_violation';END IF;
   NEW.updated_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_document_business_status_projection_guard BEFORE INSERT OR UPDATE OR DELETE ON mesh.document_business_status_projection FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_business_status_projection();

ALTER TABLE mesh.document_business_status_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_business_status_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY participant_access ON mesh.document_business_status_projection FOR ALL
 USING(EXISTS(SELECT 1 FROM mesh.document_envelope e WHERE e.id=document_business_status_projection.source_envelope_id AND shared.current_tenant_id_soft() IN(e.sender_tenant_id,e.receiver_tenant_id)))
 WITH CHECK(EXISTS(SELECT 1 FROM mesh.document_envelope e WHERE e.id=document_business_status_projection.source_envelope_id AND shared.current_tenant_id() IN(e.sender_tenant_id,e.receiver_tenant_id)));
CREATE POLICY seed_write ON mesh.document_business_status_projection FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

-- Activation is intentionally explicit: Entity Studio must publish all listed
-- global contracts before a tenant account can provision the exchange routes.
CREATE FUNCTION control.fn_provision_external_workforce_exchange(p_tenant_id uuid,p_network_account_id uuid,p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,control,mesh,runtime_meta AS $$
DECLARE v_document record;v_contract runtime_meta.entity_contract%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mesh.network_account WHERE tenant_id=p_tenant_id AND id=p_network_account_id)
 OR NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=p_tenant_id AND id=p_actor_id) THEN
   RAISE EXCEPTION 'External-workforce exchange provisioning requires a tenant-local account and actor' USING ERRCODE='foreign_key_violation';
 END IF;
 FOR v_document IN SELECT * FROM(VALUES
  ('external_time_sheet.submit.v1','External time sheet submission','inbound'),('external_time_sheet.revise.v1','External time sheet revision','inbound'),('external_time_sheet.withdraw.v1','External time sheet withdrawal','inbound'),
  ('external_expense_sheet.submit.v1','External expense sheet submission','inbound'),('external_expense_sheet.revise.v1','External expense sheet revision','inbound'),('external_expense_sheet.withdraw.v1','External expense sheet withdrawal','inbound'),('supplier_invoice.submit.v1','Supplier invoice submission','inbound'),
  ('external_time_sheet.accepted.v1','External time sheet intake status','outbound'),('external_time_sheet.rejected.v1','External time sheet rejection','outbound'),('external_time_sheet.approved.v1','External time sheet approval','outbound'),
  ('external_expense_sheet.accepted.v1','External expense sheet intake status','outbound'),('external_expense_sheet.rejected.v1','External expense sheet rejection','outbound'),('external_expense_sheet.approved.v1','External expense sheet approval','outbound'),
  ('service_sheet.status.v1','Service sheet safe status','outbound'),('invoice_match.status.v1','Invoice match safe status','outbound')) required(code,name,direction_scope)
 LOOP
  SELECT * INTO v_contract FROM runtime_meta.entity_contract WHERE entity_code=v_document.code AND status='published' AND tenant_id IS NULL ORDER BY release_no DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published global Entity contract % is required before MESH document publication',v_document.code USING ERRCODE='object_not_in_prerequisite_state';END IF;
  INSERT INTO control.network_document_type(code,name,direction_scope,entity_id,entity_code,entity_version_policy,metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(v_document.code,v_document.name,v_document.direction_scope::control.network_document_direction_d,v_contract.entity_id,v_contract.entity_code,'latest_published','{"dataClass":"external_workforce","payloadPolicy":"governed_content_only","provisioner":"external_workforce_exchange_v1"}'::jsonb,'active',clock_timestamp(),p_actor_id,p_actor_id)
  ON CONFLICT(code) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM control.network_document_type WHERE code=v_document.code AND entity_id=v_contract.entity_id AND entity_code=v_contract.entity_code AND status='active') THEN RAISE EXCEPTION 'Existing MESH document publication % does not match its published Entity contract',v_document.code USING ERRCODE='integrity_constraint_violation';END IF;
 END LOOP;
 INSERT INTO control.delivery_policy(tenant_id,network_account_id,code,name,delivery_type,destination_type,max_attempts,initial_delay_seconds,max_delay_seconds,backoff_strategy,timeout_ms,dlq_enabled,redaction_policy,metadata,created_by) VALUES
 (p_tenant_id,p_network_account_id,'external_workforce.claim.inbound','External workforce claim intake','document','neon_workforce_claim_inbox',8,15,3600,'exponential',30000,true,'{"deny":["person","worker_name","email","phone","rate","merchant","receipt","accounting","budget","approver_comment"],"allowMetadata":["business_key","correlation_id","idempotency_key","payload_hash","contract_hash"]}'::jsonb,'{"handler":"neon.workforce_claim.intake","payloadMode":"governed_content"}'::jsonb,p_actor_id),
 (p_tenant_id,p_network_account_id,'external_workforce.status.outbound','External workforce safe status projection','event','mesh_business_status_projection',8,15,3600,'exponential',30000,true,'{"allow":["resource_kind","resource_ref","lifecycle_version","business_status","safe_reason_code","submitted_at","decided_at","event_hash"],"default":"deny"}'::jsonb,'{"handler":"mesh.workforce_status.project","payloadMode":"safe_projection"}'::jsonb,p_actor_id)
 ON CONFLICT(tenant_id,network_account_id,code) DO UPDATE SET redaction_policy=EXCLUDED.redaction_policy,metadata=EXCLUDED.metadata,is_enabled=true,updated_at=clock_timestamp(),updated_by=p_actor_id;
 INSERT INTO control.routing_rule(tenant_id,network_account_id,code,name,route_type,event_type,document_type_code,handler_key,condition_expr,metadata,status,status_changed_at,status_changed_by,created_by)
 SELECT p_tenant_id,p_network_account_id,'external_workforce.'||replace(required.code,'.','_')||'.route',required.name||' route','handler','document.delivered',required.code,CASE WHEN required.direction_scope='inbound' THEN 'neon.workforce_claim.intake' ELSE 'mesh.workforce_status.project' END,'{}'::jsonb,jsonb_build_object('deliveryPolicyCode',CASE WHEN required.direction_scope='inbound' THEN 'external_workforce.claim.inbound' ELSE 'external_workforce.status.outbound' END),'active',clock_timestamp(),p_actor_id,p_actor_id
 FROM(VALUES
  ('external_time_sheet.submit.v1','External time sheet submission','inbound'),('external_time_sheet.revise.v1','External time sheet revision','inbound'),('external_time_sheet.withdraw.v1','External time sheet withdrawal','inbound'),
  ('external_expense_sheet.submit.v1','External expense sheet submission','inbound'),('external_expense_sheet.revise.v1','External expense sheet revision','inbound'),('external_expense_sheet.withdraw.v1','External expense sheet withdrawal','inbound'),('supplier_invoice.submit.v1','Supplier invoice submission','inbound'),
  ('external_time_sheet.accepted.v1','External time sheet intake status','outbound'),('external_time_sheet.rejected.v1','External time sheet rejection','outbound'),('external_time_sheet.approved.v1','External time sheet approval','outbound'),
  ('external_expense_sheet.accepted.v1','External expense sheet intake status','outbound'),('external_expense_sheet.rejected.v1','External expense sheet rejection','outbound'),('external_expense_sheet.approved.v1','External expense sheet approval','outbound'),('service_sheet.status.v1','Service sheet safe status','outbound'),('invoice_match.status.v1','Invoice match safe status','outbound')) required(code,name,direction_scope)
 ON CONFLICT(tenant_id,network_account_id,code) DO UPDATE SET document_type_code=EXCLUDED.document_type_code,handler_key=EXCLUDED.handler_key,metadata=EXCLUDED.metadata,status='active',status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_at=clock_timestamp(),updated_by=p_actor_id;
END $$;

REVOKE ALL ON mesh.document_business_status_projection FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mesh.trg_guard_document_business_status_projection(),control.fn_provision_external_workforce_exchange(uuid,uuid,uuid) FROM PUBLIC;
DO $roles$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON mesh.document_business_status_projection TO athyperapp;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON mesh.document_business_status_projection TO athyperadmin;GRANT EXECUTE ON FUNCTION mesh.trg_guard_document_business_status_projection(),control.fn_provision_external_workforce_exchange(uuid,uuid,uuid) TO athyperadmin;END IF;
END $roles$;

COMMIT;
