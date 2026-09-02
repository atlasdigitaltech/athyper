BEGIN;

-- S5 refuses to certify historical maker/checker violations as governed evidence.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM control.business_partner_qualification WHERE reviewed_by=created_by)
     OR EXISTS(SELECT 1 FROM control.customer_credit_review WHERE reviewed_by=created_by) THEN
    RAISE EXCEPTION 'S5 preflight failed: self-approved Business Partner decisions require remediation';
  END IF;
END $$;

ALTER TABLE master.supplier ADD COLUMN record_version bigint NOT NULL DEFAULT 1;
ALTER TABLE master.supplier ADD CONSTRAINT supplier_record_version_chk CHECK(record_version>=1);
ALTER TABLE master.customer ADD COLUMN record_version bigint NOT NULL DEFAULT 1;
ALTER TABLE master.customer ADD CONSTRAINT customer_record_version_chk CHECK(record_version>=1);
ALTER TABLE master.business_partner_relationship ADD COLUMN record_version bigint NOT NULL DEFAULT 1;
ALTER TABLE master.business_partner_relationship ADD CONSTRAINT business_partner_relationship_record_version_chk CHECK(record_version>=1);
ALTER TABLE control.business_partner_qualification ADD CONSTRAINT business_partner_qualification_no_self_approval_chk CHECK(reviewed_by IS NULL OR reviewed_by<>created_by);
ALTER TABLE control.customer_credit_review ADD CONSTRAINT customer_credit_review_no_self_approval_chk CHECK(reviewed_by IS NULL OR reviewed_by<>created_by);

CREATE TABLE control.business_partner_mutation_evidence(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,aggregate_kind text NOT NULL,aggregate_id uuid NOT NULL,
 business_partner_id uuid,command_code text NOT NULL,from_state text NOT NULL,to_state text NOT NULL,expected_version bigint NOT NULL,
 resulting_version bigint NOT NULL,reason text NOT NULL,idempotency_key text NOT NULL,command_fingerprint text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),occurred_by uuid NOT NULL,
 CONSTRAINT business_partner_mutation_evidence_pkey PRIMARY KEY(id),
 CONSTRAINT business_partner_mutation_evidence_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT business_partner_mutation_evidence_kind_chk CHECK(aggregate_kind IN('business_partner','supplier','customer','business_partner_relationship','qualification','supplier_preference','customer_designation','customer_credit_review')),
 CONSTRAINT business_partner_mutation_evidence_code_chk CHECK(command_code~'^[a-z][a-z0-9_.-]{2,126}$'),
 CONSTRAINT business_partner_mutation_evidence_state_chk CHECK(from_state~'^[a-z][a-z0-9_.-]{1,62}$' AND to_state~'^[a-z][a-z0-9_.-]{1,62}$' AND from_state<>to_state),
 CONSTRAINT business_partner_mutation_evidence_version_chk CHECK(expected_version>=1 AND resulting_version=expected_version+1),
 CONSTRAINT business_partner_mutation_evidence_reason_chk CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),
 CONSTRAINT business_partner_mutation_evidence_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT business_partner_mutation_evidence_fingerprint_chk CHECK(command_fingerprint~'^[a-f0-9]{64}$'),
 CONSTRAINT business_partner_mutation_evidence_payload_chk CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=16384),
 CONSTRAINT business_partner_mutation_evidence_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_mutation_evidence_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT business_partner_mutation_evidence_actor_fk FOREIGN KEY(tenant_id,occurred_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
COMMENT ON TABLE control.business_partner_mutation_evidence IS 'S5 append-only evidence ledger for command-owned Business Partner lifecycle and governed decisions. Every accepted mutation is versioned, idempotent, actor-bound, and paired atomically with event.outbox.';
CREATE UNIQUE INDEX business_partner_mutation_evidence_idempotency_uq ON control.business_partner_mutation_evidence(tenant_id,idempotency_key);
CREATE UNIQUE INDEX business_partner_mutation_evidence_version_uq ON control.business_partner_mutation_evidence(tenant_id,aggregate_kind,aggregate_id,resulting_version);
CREATE INDEX business_partner_mutation_evidence_partner_idx ON control.business_partner_mutation_evidence(tenant_id,business_partner_id,occurred_at DESC);

ALTER TABLE control.business_partner_mutation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.business_partner_mutation_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.business_partner_mutation_evidence FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY seed_write ON control.business_partner_mutation_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

-- Preserve supported-baseline Customer lifecycle evidence in the unified S5 ledger.
WITH ordered AS(
 SELECT event.*,row_number() OVER(PARTITION BY event.tenant_id,event.customer_id ORDER BY event.occurred_at,event.id)::bigint AS version_no
 FROM control.customer_lifecycle_event event
)
INSERT INTO control.business_partner_mutation_evidence(tenant_id,aggregate_kind,aggregate_id,business_partner_id,command_code,from_state,to_state,expected_version,resulting_version,reason,idempotency_key,command_fingerprint,evidence,occurred_at,occurred_by)
SELECT tenant_id,'customer',customer_id,business_partner_id,'customer_'||action_code,from_status,to_status,version_no,version_no+1,reason_code,idempotency_key,command_fingerprint,readiness_evidence,occurred_at,occurred_by FROM ordered;
INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,payload,created_at,created_by)
SELECT evidence.tenant_id,'neon-business-partner','business_partner.customer.'||evidence.to_state,'bp-mutation:'||evidence.id::text,'customer',evidence.aggregate_id,'customer',evidence.aggregate_id,LEAST(evidence.resulting_version,2147483647)::integer,evidence.occurred_by,'neon.s5-migration',jsonb_build_object('evidenceId',evidence.id,'aggregateKind','customer','aggregateId',evidence.aggregate_id,'businessPartnerId',evidence.business_partner_id,'commandCode',evidence.command_code,'fromState',evidence.from_state,'toState',evidence.to_state,'recordVersion',evidence.resulting_version,'commandFingerprint',evidence.command_fingerprint,'occurredBy',evidence.occurred_by),evidence.occurred_at,evidence.occurred_by FROM control.business_partner_mutation_evidence evidence;
UPDATE master.customer customer SET record_version=history.version
FROM(SELECT tenant_id,aggregate_id,max(resulting_version) version FROM control.business_partner_mutation_evidence WHERE aggregate_kind='customer' GROUP BY tenant_id,aggregate_id) history
WHERE customer.tenant_id=history.tenant_id AND customer.id=history.aggregate_id;

CREATE OR REPLACE FUNCTION control.trg_reject_business_partner_mutation_evidence_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Business Partner mutation evidence is append-only' USING ERRCODE='restrict_violation';END $$;

CREATE OR REPLACE FUNCTION control.fn_record_business_partner_mutation(
 p_tenant_id uuid,p_aggregate_kind text,p_aggregate_id uuid,p_business_partner_id uuid,p_command_code text,p_from_state text,
 p_to_state text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_command_fingerprint text,p_evidence jsonb,p_actor_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,event,shared AS $$
DECLARE v_id uuid;BEGIN
 INSERT INTO control.business_partner_mutation_evidence(tenant_id,aggregate_kind,aggregate_id,business_partner_id,command_code,from_state,to_state,expected_version,resulting_version,reason,idempotency_key,command_fingerprint,evidence,occurred_by)
 VALUES(p_tenant_id,p_aggregate_kind,p_aggregate_id,p_business_partner_id,p_command_code,p_from_state,p_to_state,p_expected_version,p_expected_version+1,p_reason,p_idempotency_key,p_command_fingerprint,COALESCE(p_evidence,'{}'::jsonb),p_actor_id) RETURNING id INTO v_id;
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,payload,created_by)
 VALUES(p_tenant_id,'neon-business-partner','business_partner.'||p_aggregate_kind||'.'||p_to_state,'bp-mutation:'||v_id::text,p_aggregate_kind,p_aggregate_id,p_aggregate_kind,p_aggregate_id,LEAST(p_expected_version+1,2147483647)::integer,p_actor_id,'neon.ddl',jsonb_build_object('evidenceId',v_id,'aggregateKind',p_aggregate_kind,'aggregateId',p_aggregate_id,'businessPartnerId',p_business_partner_id,'commandCode',p_command_code,'fromState',p_from_state,'toState',p_to_state,'recordVersion',p_expected_version+1,'commandFingerprint',p_command_fingerprint,'occurredBy',p_actor_id),p_actor_id);
 RETURN v_id;END $$;

CREATE OR REPLACE FUNCTION control.trg_enforce_business_partner_mutation_authority() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
DECLARE v_evidence_id uuid;v_kind text;v_old_state text;v_new_state text;v_old_version bigint;v_new_version bigint;BEGIN
 v_old_state:=CASE WHEN TG_TABLE_NAME IN('business_partner_qualification','customer_credit_review') THEN to_jsonb(OLD)->>'decision' ELSE to_jsonb(OLD)->>'status' END;
 v_new_state:=CASE WHEN TG_TABLE_NAME IN('business_partner_qualification','customer_credit_review') THEN to_jsonb(NEW)->>'decision' ELSE to_jsonb(NEW)->>'status' END;
 IF v_new_state IS NOT DISTINCT FROM v_old_state THEN RETURN NEW;END IF;
 v_kind:=CASE TG_TABLE_NAME WHEN 'business_partner' THEN 'business_partner' WHEN 'supplier' THEN 'supplier' WHEN 'customer' THEN 'customer' WHEN 'business_partner_relationship' THEN 'business_partner_relationship' WHEN 'business_partner_qualification' THEN 'qualification' WHEN 'supplier_preference_designation' THEN 'supplier_preference' WHEN 'customer_account_designation' THEN 'customer_designation' WHEN 'customer_credit_review' THEN 'customer_credit_review' END;
 v_old_version:=COALESCE((to_jsonb(OLD)->>'record_version')::bigint,(to_jsonb(OLD)->>'row_version')::bigint);v_new_version:=COALESCE((to_jsonb(NEW)->>'record_version')::bigint,(to_jsonb(NEW)->>'row_version')::bigint);
 BEGIN v_evidence_id:=NULLIF(current_setting('app.business_partner_mutation_evidence_id',true),'')::uuid;EXCEPTION WHEN invalid_text_representation THEN v_evidence_id:=NULL;END;
 IF v_evidence_id IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_mutation_evidence evidence WHERE evidence.id=v_evidence_id AND evidence.tenant_id=NEW.tenant_id AND evidence.aggregate_kind=v_kind AND evidence.aggregate_id=NEW.id AND evidence.from_state=v_old_state AND evidence.to_state=v_new_state AND evidence.expected_version=v_old_version AND evidence.resulting_version=v_new_version AND evidence.occurred_by IS NOT DISTINCT FROM NEW.updated_by) THEN
 RAISE EXCEPTION '%.% lifecycle/decision mutation requires its S5 command function',TG_TABLE_SCHEMA,TG_TABLE_NAME USING ERRCODE='insufficient_privilege';END IF;RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION control.command_business_partner_lifecycle(
 p_tenant_id uuid,p_aggregate_kind text,p_aggregate_id uuid,p_to_state text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(aggregate_id uuid,state text,record_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,master,shared AS $$
DECLARE v_from text;v_version bigint;v_bp_id uuid;v_created_by uuid;v_existing control.business_partner_mutation_evidence%ROWTYPE;v_fingerprint text;v_evidence_id uuid;v_valid boolean:=false;BEGIN
 IF NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Business Partner lifecycle context does not match tenant and actor' USING ERRCODE='insufficient_privilege';END IF;
 IF p_aggregate_kind NOT IN('business_partner','supplier','business_partner_relationship') OR length(btrim(p_reason)) NOT BETWEEN 1 AND 4000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid Business Partner lifecycle command' USING ERRCODE='check_violation';END IF;
 v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('tenantId',p_tenant_id,'aggregateKind',p_aggregate_kind,'aggregateId',p_aggregate_id,'toState',p_to_state,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':bp-idempotency:'||p_idempotency_key,0));
 SELECT * INTO v_existing FROM control.business_partner_mutation_evidence WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'Business Partner lifecycle idempotency key was reused' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_aggregate_kind||':'||p_aggregate_id::text,0));
 IF p_aggregate_kind='business_partner' THEN SELECT value.status::text,value.record_version,value.id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM master.business_partner value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;v_valid:=(v_from='draft' AND p_to_state IN('active','archived')) OR(v_from='active' AND p_to_state IN('inactive','archived')) OR(v_from='inactive' AND p_to_state IN('active','archived'));
 ELSIF p_aggregate_kind='supplier' THEN SELECT value.status::text,value.record_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM master.supplier value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;v_valid:=(v_from='onboarding' AND p_to_state IN('active','inactive','archived')) OR(v_from='active' AND p_to_state IN('suspended','inactive','archived')) OR(v_from='suspended' AND p_to_state IN('active','inactive','archived')) OR(v_from='inactive' AND p_to_state IN('active','archived'));
 ELSE SELECT value.status::text,value.record_version,value.source_business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM master.business_partner_relationship value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;v_valid:=(v_from='draft' AND p_to_state IN('active','archived')) OR(v_from='active' AND p_to_state IN('inactive','archived')) OR(v_from='inactive' AND p_to_state IN('active','archived'));END IF;
 IF v_from IS NULL OR v_version<>p_expected_version THEN RETURN;END IF;IF NOT v_valid THEN RAISE EXCEPTION 'Invalid % lifecycle transition: % -> %',p_aggregate_kind,v_from,p_to_state USING ERRCODE='check_violation';END IF;
 v_evidence_id:=control.fn_record_business_partner_mutation(p_tenant_id,p_aggregate_kind,p_aggregate_id,v_bp_id,'transition_'||p_to_state,v_from,p_to_state,p_expected_version,p_reason,p_idempotency_key,v_fingerprint,'{}'::jsonb,p_actor_id);
 PERFORM set_config('app.business_partner_mutation_evidence_id',v_evidence_id::text,true);
 IF p_aggregate_kind='business_partner' THEN UPDATE master.business_partner SET status=p_to_state::master.business_partner_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;ELSIF p_aggregate_kind='supplier' THEN UPDATE master.supplier SET status=p_to_state::master.supplier_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;ELSE UPDATE master.business_partner_relationship SET status=p_to_state::master.partner_extension_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;END IF;
 PERFORM set_config('app.business_partner_mutation_evidence_id','',true);RETURN QUERY SELECT p_aggregate_id,p_to_state,p_expected_version+1,v_evidence_id,false;END $$;

CREATE OR REPLACE FUNCTION control.command_business_partner_decision(
 p_tenant_id uuid,p_aggregate_kind text,p_aggregate_id uuid,p_to_state text,p_expected_version bigint,p_reason text,p_idempotency_key text,p_decision_fingerprint text,p_payload jsonb,p_actor_id uuid
) RETURNS TABLE(aggregate_id uuid,state text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,master,shared AS $$
DECLARE v_from text;v_version bigint;v_bp_id uuid;v_created_by uuid;v_existing control.business_partner_mutation_evidence%ROWTYPE;v_fingerprint text;v_evidence_id uuid;v_approved boolean;BEGIN
 IF NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Business Partner decision context does not match tenant and actor' USING ERRCODE='insufficient_privilege';END IF;
 IF p_aggregate_kind NOT IN('qualification','supplier_preference','customer_designation','customer_credit_review') OR p_decision_fingerprint!~'^[a-f0-9]{64}$' OR jsonb_typeof(COALESCE(p_payload,'{}'::jsonb))<>'object' OR octet_length(COALESCE(p_payload,'{}'::jsonb)::text)>16384 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 4000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid Business Partner decision command' USING ERRCODE='check_violation';END IF;
 v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('tenantId',p_tenant_id,'aggregateKind',p_aggregate_kind,'aggregateId',p_aggregate_id,'toState',p_to_state,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'decisionFingerprint',p_decision_fingerprint,'payload',COALESCE(p_payload,'{}'::jsonb),'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':bp-idempotency:'||p_idempotency_key,0));
 SELECT * INTO v_existing FROM control.business_partner_mutation_evidence WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'Business Partner decision idempotency key was reused' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_aggregate_kind||':'||p_aggregate_id::text,0));
 IF p_aggregate_kind='qualification' THEN SELECT value.decision::text,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.business_partner_qualification value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;IF NOT((v_from='pending' AND p_to_state IN('approved','conditional','rejected','suspended')) OR(v_from IN('approved','conditional') AND p_to_state='expired')) THEN RAISE EXCEPTION 'Invalid qualification decision transition' USING ERRCODE='check_violation';END IF;
 ELSIF p_aggregate_kind='supplier_preference' THEN SELECT value.status::text,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.supplier_preference_designation value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;IF NOT((v_from='pending' AND p_to_state IN('approved','rejected')) OR(v_from='approved' AND p_to_state='revoked')) THEN RAISE EXCEPTION 'Invalid supplier preference transition' USING ERRCODE='check_violation';END IF;
 ELSIF p_aggregate_kind='customer_designation' THEN SELECT value.status::text,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.customer_account_designation value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;IF NOT((v_from='pending' AND p_to_state IN('approved','rejected')) OR(v_from='approved' AND p_to_state='revoked')) THEN RAISE EXCEPTION 'Invalid customer designation transition' USING ERRCODE='check_violation';END IF;
 ELSE SELECT value.decision,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.customer_credit_review value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;IF NOT(v_from='pending' AND p_to_state IN('approved','conditional','rejected')) THEN RAISE EXCEPTION 'Invalid customer credit decision transition' USING ERRCODE='check_violation';END IF;END IF;
 IF v_from IS NULL OR v_version<>p_expected_version THEN RETURN;END IF;IF p_to_state<>'expired' AND v_created_by=p_actor_id THEN RAISE EXCEPTION 'Maker cannot approve or decide their own Business Partner record' USING ERRCODE='insufficient_privilege';END IF;
 v_evidence_id:=control.fn_record_business_partner_mutation(p_tenant_id,p_aggregate_kind,p_aggregate_id,v_bp_id,'decide_'||p_to_state,v_from,p_to_state,p_expected_version,p_reason,p_idempotency_key,v_fingerprint,COALESCE(p_payload,'{}'::jsonb)||jsonb_build_object('decisionFingerprint',p_decision_fingerprint),p_actor_id);
 PERFORM set_config('app.business_partner_mutation_evidence_id',v_evidence_id::text,true);v_approved:=p_to_state IN('approved','conditional');
 IF p_aggregate_kind='qualification' THEN IF v_from='pending' THEN UPDATE control.business_partner_qualification SET decision=p_to_state::control.qualification_decision_d,decision_reason=p_reason,reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;ELSE UPDATE control.business_partner_qualification SET decision='expired',decision_reason=p_reason,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;END IF;
 ELSIF p_aggregate_kind='supplier_preference' THEN IF p_to_state='revoked' THEN UPDATE control.supplier_preference_designation SET status='revoked',revocation_reason=p_reason,revoked_at=clock_timestamp(),revoked_by=p_actor_id,revocation_idempotency_key=p_idempotency_key,revocation_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;ELSE UPDATE control.supplier_preference_designation SET status=p_to_state::control.supplier_preference_status_d,decision_reason=p_reason,reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;END IF;
 ELSIF p_aggregate_kind='customer_designation' THEN IF p_to_state='revoked' THEN UPDATE control.customer_account_designation SET status='revoked',revocation_reason=p_reason,revoked_at=clock_timestamp(),revoked_by=p_actor_id,revocation_idempotency_key=p_idempotency_key,revocation_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;ELSE UPDATE control.customer_account_designation SET status=p_to_state::control.customer_account_designation_status_d,decision_reason=p_reason,reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;END IF;
 ELSE UPDATE control.customer_credit_review SET decision=p_to_state,decision_reason=p_reason,approved_credit_limit=CASE WHEN v_approved THEN COALESCE((p_payload->>'approvedCreditLimit')::numeric,requested_credit_limit) END,approved_currency_code=CASE WHEN v_approved THEN COALESCE(p_payload->>'approvedCurrencyCode',requested_currency_code::text)::character(3) END,conditions=COALESCE(p_payload->'conditions','[]'::jsonb),reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;END IF;
 PERFORM set_config('app.business_partner_mutation_evidence_id','',true);RETURN QUERY SELECT p_aggregate_id,p_to_state,p_expected_version+1,v_evidence_id,false;END $$;
ALTER FUNCTION control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid) SET plpgsql.variable_conflict='use_column';

CREATE OR REPLACE FUNCTION master.trg_guard_business_partner_relationship_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner relationships are archived, not deleted' USING ERRCODE='restrict_violation';END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.source_business_partner_id IS DISTINCT FROM OLD.source_business_partner_id OR NEW.target_business_partner_id IS DISTINCT FROM OLD.target_business_partner_id OR NEW.relationship_type_code IS DISTINCT FROM OLD.relationship_type_code OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Business Partner relationship identity and provenance are immutable' USING ERRCODE='check_violation';END IF;
 NEW.record_version:=OLD.record_version+1;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION master.trg_bump_business_partner_record_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.record_version:=OLD.record_version+1;RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION control.trg_record_customer_lifecycle_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,master,shared AS $$
DECLARE v_version bigint;BEGIN
 SELECT customer.record_version INTO v_version FROM master.customer customer WHERE customer.tenant_id=NEW.tenant_id AND customer.id=NEW.customer_id;
 PERFORM control.fn_record_business_partner_mutation(NEW.tenant_id,'customer',NEW.customer_id,NEW.business_partner_id,'customer_'||NEW.action_code,NEW.from_status,NEW.to_status,v_version,NEW.reason_code,NEW.idempotency_key,NEW.command_fingerprint,NEW.readiness_evidence,NEW.occurred_by);
 RETURN NEW;END $$;

CREATE TRIGGER trg_business_partner_mutation_evidence_immutable BEFORE UPDATE OR DELETE ON control.business_partner_mutation_evidence FOR EACH ROW EXECUTE FUNCTION control.trg_reject_business_partner_mutation_evidence_change();
CREATE TRIGGER trg_business_partner_19_mutation_authority BEFORE UPDATE OF status ON master.business_partner FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_supplier_09_record_version BEFORE UPDATE ON master.supplier FOR EACH ROW EXECUTE FUNCTION master.trg_bump_business_partner_record_version();
CREATE TRIGGER trg_supplier_19_mutation_authority BEFORE UPDATE OF status ON master.supplier FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_customer_07_record_version BEFORE UPDATE ON master.customer FOR EACH ROW EXECUTE FUNCTION master.trg_bump_business_partner_record_version();
CREATE TRIGGER trg_business_partner_relationship_08_delete_guard BEFORE DELETE ON master.business_partner_relationship FOR EACH ROW EXECUTE FUNCTION master.trg_guard_business_partner_relationship_mutation();
CREATE TRIGGER trg_business_partner_relationship_09_record_version BEFORE UPDATE ON master.business_partner_relationship FOR EACH ROW EXECUTE FUNCTION master.trg_bump_business_partner_record_version();
CREATE TRIGGER trg_business_partner_relationship_19_mutation_authority BEFORE UPDATE OF status ON master.business_partner_relationship FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_business_partner_qualification_35_mutation_authority BEFORE UPDATE OF decision ON control.business_partner_qualification FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_supplier_preference_designation_25_mutation_authority BEFORE UPDATE OF status ON control.supplier_preference_designation FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_customer_account_designation_25_mutation_authority BEFORE UPDATE OF status ON control.customer_account_designation FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_customer_credit_review_25_mutation_authority BEFORE UPDATE OF decision ON control.customer_credit_review FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_business_partner_mutation_authority();
CREATE TRIGGER trg_customer_lifecycle_event_s5_evidence AFTER INSERT ON control.customer_lifecycle_event FOR EACH ROW EXECUTE FUNCTION control.trg_record_customer_lifecycle_mutation();

REVOKE ALL ON control.business_partner_mutation_evidence FROM PUBLIC;
REVOKE ALL ON FUNCTION control.fn_record_business_partner_mutation(uuid,text,uuid,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid),control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid),control.trg_reject_business_partner_mutation_evidence_change(),control.trg_enforce_business_partner_mutation_authority(),control.trg_record_customer_lifecycle_mutation() FROM PUBLIC;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  REVOKE ALL ON FUNCTION control.fn_record_business_partner_mutation(uuid,text,uuid,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),control.trg_reject_business_partner_mutation_evidence_change(),control.trg_enforce_business_partner_mutation_authority(),control.trg_record_customer_lifecycle_mutation() FROM athyperapp;
  REVOKE UPDATE ON control.business_partner_qualification,control.supplier_preference_designation,control.customer_account_designation,control.customer_credit_review FROM athyperapp;
  GRANT SELECT,INSERT ON control.business_partner_qualification,control.supplier_preference_designation,control.customer_account_designation,control.customer_credit_review TO athyperapp;
  GRANT SELECT ON control.business_partner_mutation_evidence TO athyperapp;
  GRANT EXECUTE ON FUNCTION control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid),control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid) TO athyperapp;
  REVOKE UPDATE ON master.business_partner,master.supplier,master.customer,master.business_partner_relationship FROM athyperapp;
  GRANT UPDATE(name,display_name,legal_name,legal_form,registration_country_code,incorporation_date,website_url,parent_business_partner_id,description,metadata,updated_at,updated_by) ON master.business_partner TO athyperapp;
  GRANT UPDATE(supplier_type,metadata,updated_at,updated_by) ON master.supplier TO athyperapp;GRANT UPDATE(customer_type,metadata,updated_at,updated_by) ON master.customer TO athyperapp;
  GRANT UPDATE(country_code,effective_from,effective_until,notes,metadata,updated_at,updated_by) ON master.business_partner_relationship TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  REVOKE ALL ON FUNCTION control.fn_record_business_partner_mutation(uuid,text,uuid,uuid,text,text,text,bigint,text,text,text,jsonb,uuid),control.trg_reject_business_partner_mutation_evidence_change(),control.trg_enforce_business_partner_mutation_authority(),control.trg_record_customer_lifecycle_mutation() FROM athyperadmin;
  REVOKE ALL ON control.business_partner_mutation_evidence FROM athyperadmin;REVOKE UPDATE ON control.business_partner_qualification,control.supplier_preference_designation,control.customer_account_designation,control.customer_credit_review FROM athyperadmin;
  GRANT SELECT,INSERT ON control.business_partner_qualification,control.supplier_preference_designation,control.customer_account_designation,control.customer_credit_review TO athyperadmin;GRANT SELECT ON control.business_partner_mutation_evidence TO athyperadmin;
  GRANT EXECUTE ON FUNCTION control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid),control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid) TO athyperadmin;
  REVOKE UPDATE ON master.business_partner,master.supplier,master.customer,master.business_partner_relationship FROM athyperadmin;
  GRANT UPDATE(name,display_name,legal_name,legal_form,registration_country_code,incorporation_date,website_url,parent_business_partner_id,description,metadata,updated_at,updated_by) ON master.business_partner TO athyperadmin;
  GRANT UPDATE(supplier_type,metadata,updated_at,updated_by) ON master.supplier TO athyperadmin;GRANT UPDATE(customer_type,metadata,updated_at,updated_by) ON master.customer TO athyperadmin;
  GRANT UPDATE(country_code,effective_from,effective_until,notes,metadata,updated_at,updated_by) ON master.business_partner_relationship TO athyperadmin;
 END IF;
END $$;

COMMIT;
