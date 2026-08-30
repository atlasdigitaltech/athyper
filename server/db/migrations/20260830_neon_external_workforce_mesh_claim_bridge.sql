BEGIN;

DO $guard$ BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
  RAISE EXCEPTION 'External-workforce MESH claim bridge migration requires the NEON plane';
 END IF;
END $guard$;

CREATE TABLE control.mesh_workforce_claim_inbox(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,envelope_id uuid NOT NULL,event_id uuid NOT NULL,
 document_kind text NOT NULL,operation_kind text NOT NULL,source_tenant_id uuid NOT NULL,source_network_account_id uuid NOT NULL,
 recipient_network_account_id uuid NOT NULL,network_relationship_id uuid NOT NULL,source_principal_id uuid,
 entity_id uuid NOT NULL,entity_version_id uuid NOT NULL,entity_contract_hash char(64) NOT NULL,business_key text,correlation_id text,
 idempotency_key text NOT NULL,payload_hash char(64) NOT NULL,occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),received_by uuid NOT NULL,
 CONSTRAINT mesh_workforce_claim_inbox_pkey PRIMARY KEY(id),CONSTRAINT mesh_workforce_claim_inbox_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT mesh_workforce_claim_inbox_envelope_uq UNIQUE(tenant_id,envelope_id),CONSTRAINT mesh_workforce_claim_inbox_event_uq UNIQUE(tenant_id,event_id),
 CONSTRAINT mesh_workforce_claim_inbox_idempotency_uq UNIQUE(tenant_id,source_network_account_id,idempotency_key),
 CONSTRAINT mesh_workforce_claim_inbox_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT mesh_workforce_claim_inbox_received_by_fk FOREIGN KEY(tenant_id,received_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT mesh_workforce_claim_inbox_document_chk CHECK(document_kind IN('external_time_sheet','external_expense_sheet','supplier_invoice')),
 CONSTRAINT mesh_workforce_claim_inbox_operation_chk CHECK(operation_kind IN('submit','revise','withdraw')),
 CONSTRAINT mesh_workforce_claim_inbox_participant_chk CHECK(tenant_id<>source_tenant_id),
 CONSTRAINT mesh_workforce_claim_inbox_hash_chk CHECK(entity_contract_hash~'^[a-f0-9]{64}$' AND payload_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT mesh_workforce_claim_inbox_business_key_chk CHECK(business_key IS NULL OR btrim(business_key)<>''),
 CONSTRAINT mesh_workforce_claim_inbox_correlation_chk CHECK(correlation_id IS NULL OR btrim(correlation_id)<>''),
 CONSTRAINT mesh_workforce_claim_inbox_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT mesh_workforce_claim_inbox_time_chk CHECK(occurred_at<=received_at)
);
CREATE TABLE control.mesh_workforce_claim_processing_attempt(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,inbox_id uuid NOT NULL,attempt_no integer NOT NULL,
 trigger_kind text NOT NULL,disposition text NOT NULL,aggregate_kind text,aggregate_id uuid,safe_reason_code text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),processed_by uuid NOT NULL,
 CONSTRAINT mesh_workforce_claim_attempt_pkey PRIMARY KEY(id),CONSTRAINT mesh_workforce_claim_attempt_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT mesh_workforce_claim_attempt_no_uq UNIQUE(tenant_id,inbox_id,attempt_no),
 CONSTRAINT mesh_workforce_claim_attempt_inbox_fk FOREIGN KEY(tenant_id,inbox_id) REFERENCES control.mesh_workforce_claim_inbox(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT mesh_workforce_claim_attempt_processed_by_fk FOREIGN KEY(tenant_id,processed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT mesh_workforce_claim_attempt_no_chk CHECK(attempt_no>=1),CONSTRAINT mesh_workforce_claim_attempt_trigger_chk CHECK(trigger_kind IN('delivery','replay','manual_reprocess')),
 CONSTRAINT mesh_workforce_claim_attempt_disposition_chk CHECK(disposition IN('materialized','duplicate','rejected','quarantined','failed')),
 CONSTRAINT mesh_workforce_claim_attempt_target_chk CHECK((disposition='materialized' AND aggregate_kind IN('external_time_sheet','external_expense_sheet','purchase_invoice') AND aggregate_id IS NOT NULL AND safe_reason_code IS NULL) OR(disposition<>'materialized' AND aggregate_kind IS NULL AND aggregate_id IS NULL)),
 CONSTRAINT mesh_workforce_claim_attempt_reason_chk CHECK(safe_reason_code IS NULL OR safe_reason_code~'^[A-Z][A-Z0-9_.-]{1,126}$'),
 CONSTRAINT mesh_workforce_claim_attempt_json_chk CHECK(jsonb_typeof(details)='object' AND pg_column_size(details)<=32768)
);
COMMENT ON TABLE control.mesh_workforce_claim_inbox IS 'Append-only NEON receipt of MESH workforce claim coordinates and hashes; unrestricted payload and receipt content are excluded.';
COMMENT ON TABLE control.mesh_workforce_claim_processing_attempt IS 'Append-only replay and materialization evidence for a workforce-claim receipt.';
CREATE INDEX mesh_workforce_claim_inbox_relationship_idx ON control.mesh_workforce_claim_inbox(tenant_id,network_relationship_id,received_at DESC);
CREATE INDEX mesh_workforce_claim_inbox_business_key_idx ON control.mesh_workforce_claim_inbox(tenant_id,document_kind,business_key) WHERE business_key IS NOT NULL;
CREATE INDEX mesh_workforce_claim_attempt_retry_idx ON control.mesh_workforce_claim_processing_attempt(tenant_id,inbox_id,processed_at DESC);

ALTER TABLE document.external_time_sheet ADD COLUMN source_inbox_id uuid;
ALTER TABLE document.external_expense_sheet ADD COLUMN source_inbox_id uuid;
UPDATE document.external_time_sheet SET status='approved' WHERE status='invoiced';
UPDATE document.external_expense_sheet SET status='approved' WHERE status='invoiced';
ALTER TABLE document.external_time_sheet DROP CONSTRAINT external_time_sheet_submit_pair_chk,DROP CONSTRAINT external_time_sheet_approval_state_chk,DROP CONSTRAINT external_time_sheet_status_chk,
 ADD CONSTRAINT external_time_sheet_source_inbox_uq UNIQUE(tenant_id,source_inbox_id),
 ADD CONSTRAINT external_time_sheet_source_inbox_fk FOREIGN KEY(tenant_id,source_inbox_id) REFERENCES control.mesh_workforce_claim_inbox(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT external_time_sheet_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT external_time_sheet_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT external_time_sheet_submit_source_chk CHECK((submitted_at IS NULL AND submitted_by IS NULL AND source_inbox_id IS NULL) OR(submitted_at IS NOT NULL AND num_nonnulls(submitted_by,source_inbox_id)=1)),
 ADD CONSTRAINT external_time_sheet_submit_state_chk CHECK(status IN('draft','cancelled') OR submitted_at IS NOT NULL),
 ADD CONSTRAINT external_time_sheet_approval_state_chk CHECK(status NOT IN('approved','reversed') OR approved_at IS NOT NULL),
 ADD CONSTRAINT external_time_sheet_status_chk CHECK(status IN('draft','submitted','pending_approval','approved','rejected','reversed','cancelled'));
ALTER TABLE document.external_expense_sheet DROP CONSTRAINT external_expense_sheet_submit_pair_chk,DROP CONSTRAINT external_expense_sheet_approval_state_chk,DROP CONSTRAINT external_expense_sheet_status_chk,
 ADD CONSTRAINT external_expense_sheet_source_inbox_uq UNIQUE(tenant_id,source_inbox_id),
 ADD CONSTRAINT external_expense_sheet_source_inbox_fk FOREIGN KEY(tenant_id,source_inbox_id) REFERENCES control.mesh_workforce_claim_inbox(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT external_expense_sheet_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT external_expense_sheet_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT external_expense_sheet_submit_source_chk CHECK((submitted_at IS NULL AND submitted_by IS NULL AND source_inbox_id IS NULL) OR(submitted_at IS NOT NULL AND num_nonnulls(submitted_by,source_inbox_id)=1)),
 ADD CONSTRAINT external_expense_sheet_submit_state_chk CHECK(status IN('draft','cancelled') OR submitted_at IS NOT NULL),
 ADD CONSTRAINT external_expense_sheet_approval_state_chk CHECK(status NOT IN('approved','reversed') OR approved_at IS NOT NULL),
 ADD CONSTRAINT external_expense_sheet_status_chk CHECK(status IN('draft','submitted','pending_approval','approved','rejected','reversed','cancelled'));
CREATE INDEX external_time_sheet_source_inbox_idx ON document.external_time_sheet(tenant_id,source_inbox_id) WHERE source_inbox_id IS NOT NULL;
CREATE INDEX external_expense_sheet_source_inbox_idx ON document.external_expense_sheet(tenant_id,source_inbox_id) WHERE source_inbox_id IS NOT NULL;

CREATE TABLE document.service_sheet_source_allocation(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,service_sheet_line_id uuid NOT NULL,
 external_time_sheet_id uuid,external_expense_sheet_id uuid,statement_of_work_item_id uuid,
 allocation_kind text NOT NULL DEFAULT 'acceptance',accepted_quantity numeric(18,4),accepted_amount numeric(18,4) NOT NULL,currency_code char(3) NOT NULL,
 reverses_allocation_id uuid,source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,source_snapshot_hash char(64) NOT NULL,idempotency_key text NOT NULL,
 allocated_at timestamptz NOT NULL DEFAULT now(),allocated_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
 CONSTRAINT service_sheet_source_allocation_pkey PRIMARY KEY(id),CONSTRAINT service_sheet_source_allocation_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT service_sheet_source_allocation_idempotency_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT service_sheet_source_allocation_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_line_fk FOREIGN KEY(tenant_id,service_sheet_line_id) REFERENCES document.service_sheet_line(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_time_fk FOREIGN KEY(tenant_id,external_time_sheet_id) REFERENCES document.external_time_sheet(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_expense_fk FOREIGN KEY(tenant_id,external_expense_sheet_id) REFERENCES document.external_expense_sheet(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_sow_item_fk FOREIGN KEY(tenant_id,statement_of_work_item_id) REFERENCES document.statement_of_work_item(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_reverses_fk FOREIGN KEY(tenant_id,reverses_allocation_id) REFERENCES document.service_sheet_source_allocation(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_allocated_by_fk FOREIGN KEY(tenant_id,allocated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT service_sheet_source_allocation_source_chk CHECK(num_nonnulls(external_time_sheet_id,external_expense_sheet_id,statement_of_work_item_id)=1),
 CONSTRAINT service_sheet_source_allocation_kind_chk CHECK(allocation_kind IN('acceptance','reversal')),
 CONSTRAINT service_sheet_source_allocation_amount_chk CHECK(accepted_amount>0 AND(accepted_quantity IS NULL OR accepted_quantity>0)),
 CONSTRAINT service_sheet_source_allocation_reversal_chk CHECK((allocation_kind='reversal')=(reverses_allocation_id IS NOT NULL)),
 CONSTRAINT service_sheet_source_allocation_hash_chk CHECK(source_snapshot_hash~'^[a-f0-9]{64}$' AND jsonb_typeof(source_snapshot)='object'),
 CONSTRAINT service_sheet_source_allocation_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200)
);
CREATE INDEX service_sheet_source_allocation_line_idx ON document.service_sheet_source_allocation(tenant_id,service_sheet_line_id,allocated_at);
CREATE INDEX service_sheet_source_allocation_time_idx ON document.service_sheet_source_allocation(tenant_id,external_time_sheet_id) WHERE external_time_sheet_id IS NOT NULL;
CREATE INDEX service_sheet_source_allocation_expense_idx ON document.service_sheet_source_allocation(tenant_id,external_expense_sheet_id) WHERE external_expense_sheet_id IS NOT NULL;
CREATE UNIQUE INDEX service_sheet_source_allocation_one_reversal_uq ON document.service_sheet_source_allocation(tenant_id,reverses_allocation_id) WHERE allocation_kind='reversal';

-- Fail before moving history when mandatory P2P coordinates cannot be inferred.
DO $backfill_readiness$ DECLARE v_count bigint;
BEGIN
 SELECT count(*) INTO v_count FROM document.external_service_entry e
 WHERE e.commitment_id IS NULL
    OR e.currency_code IS DISTINCT FROM(SELECT c.functional_currency FROM master.company_code c WHERE c.tenant_id=e.tenant_id AND c.id=e.company_code_id)
    OR 1<>(SELECT count(*) FROM master.fiscal_period p WHERE p.tenant_id=e.tenant_id AND p.company_code_id=e.company_code_id AND e.service_period_end BETWEEN p.start_date AND p.end_date);
 IF v_count>0 THEN RAISE EXCEPTION 'Legacy external service-entry backfill has % header(s) without one commitment, functional currency, or fiscal period; resolve mappings before retry',v_count USING ERRCODE='integrity_constraint_violation';END IF;
 SELECT count(*) INTO v_count FROM document.external_service_entry_line l JOIN document.external_service_entry e ON e.tenant_id=l.tenant_id AND e.id=l.service_entry_id
 WHERE 1<>(SELECT count(*) FROM document.commitment_line cl WHERE cl.tenant_id=e.tenant_id AND cl.commitment_id=e.commitment_id AND cl.procurement_type='services' AND cl.currency_code=l.currency_code AND(l.statement_of_work_item_id IS NULL OR cl.source_line_id=l.statement_of_work_item_id OR cl.source_entity_id=l.statement_of_work_item_id));
 IF v_count>0 THEN RAISE EXCEPTION 'Legacy external service-entry backfill has % line(s) without exactly one service commitment-line mapping; resolve mappings before retry',v_count USING ERRCODE='integrity_constraint_violation';END IF;
END $backfill_readiness$;

INSERT INTO document.service_sheet(id,tenant_id,company_code_id,code,name,requested_by,commitment_id,supplier_id,service_date,posting_date,service_period_from,service_period_to,currency_code,base_currency_code,exchange_rate,total_amount,fiscal_period_id,metadata,status,created_at,created_by)
SELECT e.id,e.tenant_id,e.company_code_id,e.code,e.name,COALESCE(e.submitted_by,e.created_by),e.commitment_id,e.supplier_id,e.service_period_end,e.service_period_end,e.service_period_start,e.service_period_end,e.currency_code,c.functional_currency,1,
 COALESCE((SELECT sum(l.accepted_amount) FROM document.external_service_entry_line l WHERE l.tenant_id=e.tenant_id AND l.service_entry_id=e.id),0),p.id,
 jsonb_build_object('legacyExternalServiceEntryId',e.id,'legacyStatus',e.status,'backfilledAt',clock_timestamp()),'draft',e.created_at,e.created_by
FROM document.external_service_entry e JOIN master.company_code c ON c.tenant_id=e.tenant_id AND c.id=e.company_code_id
JOIN master.fiscal_period p ON p.tenant_id=e.tenant_id AND p.company_code_id=e.company_code_id AND e.service_period_end BETWEEN p.start_date AND p.end_date;

INSERT INTO document.service_sheet_line(id,tenant_id,company_code_id,service_sheet_id,line_no,commitment_line_id,item_description,procurement_type,line_type,uom_code,quantity,unit_price,price_unit,currency_code,service_period_start,service_period_end,metadata,created_at,created_by)
SELECT l.id,l.tenant_id,e.company_code_id,e.id,l.line_no,cl.id,l.description,'services','noncatalog',cl.uom_code,l.quantity,l.unit_price,1,l.currency_code,e.service_period_start,e.service_period_end,
 jsonb_build_object('legacyExternalServiceEntryLineId',l.id,'acceptanceSnapshot',l.acceptance_snapshot,'acceptanceHash',l.acceptance_hash),l.created_at,l.created_by
FROM document.external_service_entry_line l JOIN document.external_service_entry e ON e.tenant_id=l.tenant_id AND e.id=l.service_entry_id
JOIN LATERAL(SELECT candidate.id,candidate.uom_code FROM document.commitment_line candidate WHERE candidate.tenant_id=e.tenant_id AND candidate.commitment_id=e.commitment_id AND candidate.procurement_type='services' AND candidate.currency_code=l.currency_code AND(l.statement_of_work_item_id IS NULL OR candidate.source_line_id=l.statement_of_work_item_id OR candidate.source_entity_id=l.statement_of_work_item_id) LIMIT 1)cl ON true;

INSERT INTO document.service_sheet_source_allocation(tenant_id,service_sheet_line_id,external_time_sheet_id,external_expense_sheet_id,statement_of_work_item_id,allocation_kind,accepted_quantity,accepted_amount,currency_code,source_snapshot,source_snapshot_hash,idempotency_key,allocated_at,allocated_by,created_at,created_by)
SELECT l.tenant_id,l.id,l.time_sheet_id,l.expense_sheet_id,l.statement_of_work_item_id,'acceptance',l.quantity,l.accepted_amount,l.currency_code,l.acceptance_snapshot,l.acceptance_hash,'legacy-service-entry-line:'||l.id::text,COALESCE(e.approved_at,e.submitted_at,e.created_at),COALESCE(e.approved_by,e.submitted_by,e.created_by),l.created_at,l.created_by
FROM document.external_service_entry_line l JOIN document.external_service_entry e ON e.tenant_id=l.tenant_id AND e.id=l.service_entry_id
WHERE e.status IN('pending_approval','approved','invoiced','reversed');
INSERT INTO document.service_sheet_source_allocation(tenant_id,service_sheet_line_id,external_time_sheet_id,external_expense_sheet_id,statement_of_work_item_id,allocation_kind,accepted_quantity,accepted_amount,currency_code,reverses_allocation_id,source_snapshot,source_snapshot_hash,idempotency_key,allocated_at,allocated_by,created_by)
SELECT a.tenant_id,a.service_sheet_line_id,a.external_time_sheet_id,a.external_expense_sheet_id,a.statement_of_work_item_id,'reversal',a.accepted_quantity,a.accepted_amount,a.currency_code,a.id,a.source_snapshot,a.source_snapshot_hash,'legacy-service-entry-reversal:'||a.service_sheet_line_id::text,COALESCE(e.approved_at,e.submitted_at,e.created_at),COALESCE(e.approved_by,e.submitted_by,e.created_by),COALESCE(e.approved_by,e.submitted_by,e.created_by)
FROM document.service_sheet_source_allocation a JOIN document.external_service_entry_line l ON l.tenant_id=a.tenant_id AND l.id=a.service_sheet_line_id JOIN document.external_service_entry e ON e.tenant_id=l.tenant_id AND e.id=l.service_entry_id WHERE e.status='reversed';

UPDATE document.service_sheet s SET
 status=CASE e.status WHEN 'submitted' THEN 'pending_acceptance' WHEN 'invoiced' THEN 'approved' ELSE e.status END,
 accepted_at=CASE WHEN e.status IN('pending_approval','approved','invoiced','reversed') THEN COALESCE(e.approved_at,e.submitted_at,e.created_at) END,
 accepted_by=CASE WHEN e.status IN('pending_approval','approved','invoiced','reversed') THEN COALESCE(e.approved_by,e.submitted_by,e.created_by) END,
 approved_at=CASE WHEN e.status IN('approved','invoiced','reversed') THEN COALESCE(e.approved_at,e.submitted_at,e.created_at) END,
 approved_by=CASE WHEN e.status IN('approved','invoiced','reversed') THEN COALESCE(e.approved_by,e.submitted_by,e.created_by) END,
 status_changed_at=e.status_changed_at,status_changed_by=e.status_changed_by
FROM document.external_service_entry e WHERE s.tenant_id=e.tenant_id AND s.id=e.id;

DO $invoice_backfill$ DECLARE v_count bigint;
BEGIN
 SELECT count(*) INTO v_count FROM(
  SELECT a.tenant_id,a.purchase_invoice_line_id,count(DISTINCT l.id) FILTER(WHERE net_amount>0) source_count
  FROM(SELECT x.tenant_id,x.purchase_invoice_line_id,x.service_entry_line_id,sum(CASE WHEN x.allocation_kind='invoice' THEN x.allocated_amount ELSE -x.allocated_amount END)net_amount FROM document.external_workforce_invoice_allocation x GROUP BY x.tenant_id,x.purchase_invoice_line_id,x.service_entry_line_id)a
  JOIN document.external_service_entry_line l ON l.tenant_id=a.tenant_id AND l.id=a.service_entry_line_id GROUP BY a.tenant_id,a.purchase_invoice_line_id HAVING count(DISTINCT l.id) FILTER(WHERE net_amount>0)>1
 ) ambiguous;
 IF v_count>0 THEN RAISE EXCEPTION 'Legacy invoice backfill has % invoice line(s) allocated to multiple service lines; split those invoice lines before retry',v_count USING ERRCODE='integrity_constraint_violation';END IF;
END $invoice_backfill$;
WITH net AS(SELECT tenant_id,purchase_invoice_line_id,service_entry_line_id,sum(CASE WHEN allocation_kind='invoice' THEN allocated_amount ELSE -allocated_amount END)amount FROM document.external_workforce_invoice_allocation GROUP BY tenant_id,purchase_invoice_line_id,service_entry_line_id),chosen AS(SELECT n.tenant_id,n.purchase_invoice_line_id,n.service_entry_line_id,l.service_entry_id FROM net n JOIN document.external_service_entry_line l ON l.tenant_id=n.tenant_id AND l.id=n.service_entry_line_id WHERE n.amount>0)
UPDATE document.purchase_invoice_line i SET source_entity_type='document.service_sheet',source_entity_id=c.service_entry_id,source_line_id=c.service_entry_line_id,source_binding=i.source_binding||jsonb_build_object('legacyExternalWorkforceAllocation',true)
FROM chosen c WHERE i.tenant_id=c.tenant_id AND i.id=c.purchase_invoice_line_id;

CREATE FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'MESH workforce claim inbox and processing evidence is append-only' USING ERRCODE='restrict_violation';END $$;
CREATE TRIGGER trg_mesh_workforce_claim_inbox_immutable BEFORE UPDATE OR DELETE ON control.mesh_workforce_claim_inbox FOR EACH ROW EXECUTE FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation();
CREATE TRIGGER trg_mesh_workforce_claim_attempt_immutable BEFORE UPDATE OR DELETE ON control.mesh_workforce_claim_processing_attempt FOR EACH ROW EXECUTE FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation();

CREATE FUNCTION document.trg_guard_external_claim_header() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,control AS $$
DECLARE v_engagement document.worker_engagement%ROWTYPE;v_inbox_kind text;
BEGIN
 SELECT * INTO v_engagement FROM document.worker_engagement WHERE tenant_id=NEW.tenant_id AND id=NEW.worker_engagement_id;
 IF NOT FOUND OR NEW.period_start<v_engagement.start_date OR NEW.period_end>=v_engagement.end_date THEN RAISE EXCEPTION 'External claim period must be contained by the worker engagement' USING ERRCODE='integrity_constraint_violation';END IF;
 IF NEW.source_inbox_id IS NOT NULL THEN SELECT document_kind INTO v_inbox_kind FROM control.mesh_workforce_claim_inbox WHERE tenant_id=NEW.tenant_id AND id=NEW.source_inbox_id;IF v_inbox_kind IS DISTINCT FROM TG_TABLE_NAME THEN RAISE EXCEPTION 'MESH inbox document kind does not match external claim aggregate' USING ERRCODE='integrity_constraint_violation';END IF;END IF;
 IF TG_OP='UPDATE' THEN
  IF(NEW.id,NEW.tenant_id,NEW.created_at,NEW.created_by)IS DISTINCT FROM(OLD.id,OLD.tenant_id,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'External claim identity and creation evidence are immutable' USING ERRCODE='restrict_violation';END IF;
  IF OLD.status<>'draft' AND(NEW.worker_engagement_id,NEW.period_start,NEW.period_end)IS DISTINCT FROM(OLD.worker_engagement_id,OLD.period_start,OLD.period_end) THEN RAISE EXCEPTION 'Submitted external claim engagement and period are immutable' USING ERRCODE='restrict_violation';END IF;
  IF NEW.source_inbox_id IS DISTINCT FROM OLD.source_inbox_id THEN RAISE EXCEPTION 'External claim ingress evidence is immutable' USING ERRCODE='restrict_violation';END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT((OLD.status='draft' AND NEW.status IN('submitted','cancelled'))OR(OLD.status='submitted' AND NEW.status IN('pending_approval','rejected','cancelled'))OR(OLD.status='pending_approval' AND NEW.status IN('approved','rejected','cancelled'))OR(OLD.status='rejected' AND NEW.status IN('draft','cancelled'))OR(OLD.status='approved' AND NEW.status='reversed')) THEN RAISE EXCEPTION 'Invalid external claim status transition from % to %',OLD.status,NEW.status USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF OLD.status IN('approved','reversed','cancelled') AND(to_jsonb(NEW)-ARRAY['status','status_changed_at','status_changed_by','row_version','updated_at','updated_by'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','status_changed_at','status_changed_by','row_version','updated_at','updated_by']) THEN RAISE EXCEPTION 'Approved or terminal external claim evidence is immutable' USING ERRCODE='restrict_violation';END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION document.trg_guard_external_claim_line() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_parent_id uuid;v_line_date date;v_start date;v_end date;v_status text;v_tenant uuid;
BEGIN
 IF TG_OP='UPDATE' AND(NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.line_no IS DISTINCT FROM OLD.line_no OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR(TG_TABLE_NAME='external_time_entry' AND NEW.time_sheet_id IS DISTINCT FROM OLD.time_sheet_id)OR(TG_TABLE_NAME='external_expense_item' AND NEW.expense_sheet_id IS DISTINCT FROM OLD.expense_sheet_id)) THEN RAISE EXCEPTION 'External claim line identity and parent are immutable' USING ERRCODE='restrict_violation';END IF;
 v_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
 IF TG_TABLE_NAME='external_time_entry' THEN v_parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.time_sheet_id ELSE NEW.time_sheet_id END;v_line_date:=CASE WHEN TG_OP='DELETE' THEN OLD.work_date ELSE NEW.work_date END;SELECT period_start,period_end,status INTO v_start,v_end,v_status FROM document.external_time_sheet WHERE tenant_id=v_tenant AND id=v_parent_id FOR SHARE;
 ELSE v_parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.expense_sheet_id ELSE NEW.expense_sheet_id END;v_line_date:=CASE WHEN TG_OP='DELETE' THEN OLD.expense_date ELSE NEW.expense_date END;SELECT period_start,period_end,status INTO v_start,v_end,v_status FROM document.external_expense_sheet WHERE tenant_id=v_tenant AND id=v_parent_id FOR SHARE;END IF;
 IF v_status IS NULL THEN RAISE EXCEPTION 'External claim line requires an existing parent' USING ERRCODE='foreign_key_violation';END IF;
 IF v_status NOT IN('draft','rejected') THEN RAISE EXCEPTION 'External claim lines are mutable only while the parent is draft or rejected' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 IF TG_OP<>'DELETE' AND(v_line_date<v_start OR v_line_date>v_end) THEN RAISE EXCEPTION 'External claim line date must fall inside the claim period' USING ERRCODE='integrity_constraint_violation';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE FUNCTION document.trg_guard_service_sheet_source_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_line document.service_sheet_line%ROWTYPE;v_sheet document.service_sheet%ROWTYPE;v_original document.service_sheet_source_allocation%ROWTYPE;
 v_status text;v_supplier uuid;v_company uuid;v_commitment uuid;v_start date;v_end date;v_amount numeric(18,4);v_quantity numeric(18,4);v_currency_min char(3);v_currency_max char(3);v_source_net numeric(18,4);v_line_net numeric(18,4);v_delta numeric(18,4);v_source_q_net numeric(18,4);v_line_q_net numeric(18,4);v_q_delta numeric(18,4);
BEGIN
 SELECT * INTO v_line FROM document.service_sheet_line WHERE tenant_id=NEW.tenant_id AND id=NEW.service_sheet_line_id FOR UPDATE;
 SELECT * INTO v_sheet FROM document.service_sheet WHERE tenant_id=NEW.tenant_id AND id=v_line.service_sheet_id FOR UPDATE;
 IF v_line.id IS NULL OR v_sheet.id IS NULL OR v_sheet.status NOT IN('draft','pending_acceptance','rejected') THEN RAISE EXCEPTION 'External claim allocation requires a mutable canonical service sheet line' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 IF NEW.external_time_sheet_id IS NOT NULL THEN
  SELECT s.status,e.supplier_id,e.company_code_id,COALESCE(c.commitment_id,w.commitment_id),s.period_start,s.period_end INTO v_status,v_supplier,v_company,v_commitment,v_start,v_end FROM document.external_time_sheet s JOIN document.worker_engagement e ON e.tenant_id=s.tenant_id AND e.id=s.worker_engagement_id LEFT JOIN document.contingent_work_order c ON c.tenant_id=e.tenant_id AND c.id=e.contingent_work_order_id LEFT JOIN document.statement_of_work w ON w.tenant_id=e.tenant_id AND w.id=e.statement_of_work_id WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.external_time_sheet_id FOR UPDATE OF s;
  SELECT COALESCE(sum(amount),0),COALESCE(sum(hours),0),min(currency_code),max(currency_code) INTO v_amount,v_quantity,v_currency_min,v_currency_max FROM document.external_time_entry WHERE tenant_id=NEW.tenant_id AND time_sheet_id=NEW.external_time_sheet_id;
 ELSIF NEW.external_expense_sheet_id IS NOT NULL THEN
  SELECT s.status,e.supplier_id,e.company_code_id,COALESCE(c.commitment_id,w.commitment_id),s.period_start,s.period_end INTO v_status,v_supplier,v_company,v_commitment,v_start,v_end FROM document.external_expense_sheet s JOIN document.worker_engagement e ON e.tenant_id=s.tenant_id AND e.id=s.worker_engagement_id LEFT JOIN document.contingent_work_order c ON c.tenant_id=e.tenant_id AND c.id=e.contingent_work_order_id LEFT JOIN document.statement_of_work w ON w.tenant_id=e.tenant_id AND w.id=e.statement_of_work_id WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.external_expense_sheet_id FOR UPDATE OF s;
  SELECT COALESCE(sum(amount),0),NULL::numeric,min(currency_code),max(currency_code) INTO v_amount,v_quantity,v_currency_min,v_currency_max FROM document.external_expense_item WHERE tenant_id=NEW.tenant_id AND expense_sheet_id=NEW.external_expense_sheet_id;
 ELSE
  SELECT i.status,w.supplier_id,w.company_code_id,w.commitment_id,r.start_date,r.end_date,i.amount,i.quantity,r.currency_code,r.currency_code INTO v_status,v_supplier,v_company,v_commitment,v_start,v_end,v_amount,v_quantity,v_currency_min,v_currency_max FROM document.statement_of_work_item i JOIN document.statement_of_work_revision r ON r.tenant_id=i.tenant_id AND r.id=i.statement_of_work_revision_id JOIN document.statement_of_work w ON w.tenant_id=r.tenant_id AND w.id=r.statement_of_work_id WHERE i.tenant_id=NEW.tenant_id AND i.id=NEW.statement_of_work_item_id FOR UPDATE OF i;
 END IF;
 IF v_status IS NULL OR(NEW.allocation_kind='acceptance' AND v_status NOT IN('approved','accepted')) THEN RAISE EXCEPTION 'Only approved external claims or accepted SOW items may be allocated' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 IF v_supplier IS DISTINCT FROM v_sheet.supplier_id OR v_company IS DISTINCT FROM v_sheet.company_code_id OR v_commitment IS DISTINCT FROM v_sheet.commitment_id OR v_currency_min IS DISTINCT FROM v_currency_max OR v_currency_min IS DISTINCT FROM NEW.currency_code OR v_line.currency_code IS DISTINCT FROM NEW.currency_code OR v_sheet.currency_code IS DISTINCT FROM NEW.currency_code OR v_start<v_sheet.service_period_from OR v_end>v_sheet.service_period_to THEN RAISE EXCEPTION 'External claim, commitment, supplier, company, period and currency must match the service sheet' USING ERRCODE='integrity_constraint_violation';END IF;
 IF NEW.allocation_kind='reversal' THEN SELECT * INTO v_original FROM document.service_sheet_source_allocation WHERE tenant_id=NEW.tenant_id AND id=NEW.reverses_allocation_id FOR UPDATE;IF v_original.id IS NULL OR v_original.allocation_kind<>'acceptance' OR(NEW.service_sheet_line_id,NEW.external_time_sheet_id,NEW.external_expense_sheet_id,NEW.statement_of_work_item_id,NEW.accepted_quantity,NEW.accepted_amount,NEW.currency_code)IS DISTINCT FROM(v_original.service_sheet_line_id,v_original.external_time_sheet_id,v_original.external_expense_sheet_id,v_original.statement_of_work_item_id,v_original.accepted_quantity,v_original.accepted_amount,v_original.currency_code) THEN RAISE EXCEPTION 'Service-sheet allocation reversal must exactly match one original acceptance' USING ERRCODE='integrity_constraint_violation';END IF;v_delta:=-NEW.accepted_amount;v_q_delta:=-COALESCE(NEW.accepted_quantity,0);ELSE v_delta:=NEW.accepted_amount;v_q_delta:=COALESCE(NEW.accepted_quantity,0);END IF;
 SELECT COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN accepted_amount ELSE -accepted_amount END),0),COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN COALESCE(accepted_quantity,0) ELSE -COALESCE(accepted_quantity,0) END),0) INTO v_source_net,v_source_q_net FROM document.service_sheet_source_allocation WHERE tenant_id=NEW.tenant_id AND external_time_sheet_id IS NOT DISTINCT FROM NEW.external_time_sheet_id AND external_expense_sheet_id IS NOT DISTINCT FROM NEW.external_expense_sheet_id AND statement_of_work_item_id IS NOT DISTINCT FROM NEW.statement_of_work_item_id;
 SELECT COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN accepted_amount ELSE -accepted_amount END),0),COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN COALESCE(accepted_quantity,0) ELSE -COALESCE(accepted_quantity,0) END),0) INTO v_line_net,v_line_q_net FROM document.service_sheet_source_allocation WHERE tenant_id=NEW.tenant_id AND service_sheet_line_id=NEW.service_sheet_line_id;
 IF v_source_net+v_delta<0 OR v_source_net+v_delta>v_amount OR v_line_net+v_delta<0 OR v_line_net+v_delta>v_line.net_amount THEN RAISE EXCEPTION 'Service-sheet allocation would over-accept or over-reverse source or line value' USING ERRCODE='integrity_constraint_violation';END IF;
 IF NEW.accepted_quantity IS NOT NULL AND((v_quantity IS NOT NULL AND(v_source_q_net+v_q_delta<0 OR v_source_q_net+v_q_delta>v_quantity))OR v_line_q_net+v_q_delta<0 OR v_line_q_net+v_q_delta>v_line.quantity) THEN RAISE EXCEPTION 'Service-sheet allocation would over-accept or over-reverse source or line quantity' USING ERRCODE='integrity_constraint_violation';END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION document.trg_validate_canonical_service_sheet_invoice_source() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_header document.purchase_invoice%ROWTYPE;v_sheet document.service_sheet%ROWTYPE;v_line document.service_sheet_line%ROWTYPE;
BEGIN
 IF NEW.source_entity_type IN('service_sheet','external_service_entry','document.external_service_entry') THEN RAISE EXCEPTION 'Legacy service matching is disabled; bind the invoice to document.service_sheet and service_sheet_line' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 IF NEW.source_entity_type='document.service_sheet' THEN
  SELECT * INTO v_header FROM document.purchase_invoice WHERE tenant_id=NEW.tenant_id AND id=NEW.purchase_invoice_id;
  SELECT * INTO v_sheet FROM document.service_sheet WHERE tenant_id=NEW.tenant_id AND id=NEW.source_entity_id;
  SELECT * INTO v_line FROM document.service_sheet_line WHERE tenant_id=NEW.tenant_id AND id=NEW.source_line_id;
  IF v_line.id IS NULL OR v_sheet.id IS NULL OR v_line.service_sheet_id<>v_sheet.id OR v_sheet.status NOT IN('accepted','pending_approval','approved','posted') OR v_sheet.company_code_id<>v_header.company_code_id OR v_sheet.supplier_id<>v_header.supplier_id OR v_sheet.commitment_id IS DISTINCT FROM v_header.commitment_id OR v_line.currency_code<>NEW.currency_code OR(NEW.commitment_line_id IS NOT NULL AND v_line.commitment_line_id<>NEW.commitment_line_id) THEN RAISE EXCEPTION 'Invoice source must identify an accepted canonical service-sheet line for the same company, supplier, commitment and currency' USING ERRCODE='integrity_constraint_violation';END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION document.trg_reject_deprecated_external_acceptance_write() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Legacy external service-entry path is read-only; use document.service_sheet and service_sheet_source_allocation' USING ERRCODE='object_not_in_prerequisite_state';END $$;

CREATE TRIGGER trg_external_time_sheet_10_guard BEFORE INSERT OR UPDATE ON document.external_time_sheet FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_claim_header();
CREATE TRIGGER trg_external_expense_sheet_10_guard BEFORE INSERT OR UPDATE ON document.external_expense_sheet FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_claim_header();
CREATE TRIGGER trg_external_time_entry_10_guard BEFORE INSERT OR UPDATE OR DELETE ON document.external_time_entry FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_claim_line();
CREATE TRIGGER trg_external_expense_item_10_guard BEFORE INSERT OR UPDATE OR DELETE ON document.external_expense_item FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_claim_line();
CREATE TRIGGER trg_service_sheet_source_allocation_10_guard BEFORE INSERT ON document.service_sheet_source_allocation FOR EACH ROW EXECUTE FUNCTION document.trg_guard_service_sheet_source_allocation();
CREATE TRIGGER trg_service_sheet_source_allocation_immutable BEFORE UPDATE OR DELETE ON document.service_sheet_source_allocation FOR EACH ROW EXECUTE FUNCTION document.trg_reject_external_workforce_history_mutation();
CREATE TRIGGER purchase_invoice_line_service_sheet_source_guard BEFORE INSERT OR UPDATE OF source_entity_type,source_entity_id,source_line_id,commitment_line_id,currency_code ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.trg_validate_canonical_service_sheet_invoice_source();
CREATE TRIGGER trg_external_service_entry_deprecated_write BEFORE INSERT OR UPDATE OR DELETE ON document.external_service_entry FOR EACH ROW EXECUTE FUNCTION document.trg_reject_deprecated_external_acceptance_write();
CREATE TRIGGER trg_external_service_entry_line_deprecated_write BEFORE INSERT OR UPDATE OR DELETE ON document.external_service_entry_line FOR EACH ROW EXECUTE FUNCTION document.trg_reject_deprecated_external_acceptance_write();
CREATE TRIGGER trg_external_workforce_invoice_allocation_deprecated_write BEFORE INSERT ON document.external_workforce_invoice_allocation FOR EACH ROW EXECUTE FUNCTION document.trg_reject_deprecated_external_acceptance_write();

CREATE VIEW document.external_claim_reconciliation_v WITH(security_invoker=true) AS
WITH source AS(
 SELECT s.tenant_id,'external_time_sheet'::text source_kind,s.id source_id,s.worker_engagement_id,s.code,s.status,COALESCE(sum(e.amount),0)::numeric(18,4) approved_amount FROM document.external_time_sheet s LEFT JOIN document.external_time_entry e ON e.tenant_id=s.tenant_id AND e.time_sheet_id=s.id GROUP BY s.tenant_id,s.id,s.worker_engagement_id,s.code,s.status
 UNION ALL SELECT s.tenant_id,'external_expense_sheet',s.id,s.worker_engagement_id,s.code,s.status,COALESCE(sum(i.amount),0)::numeric(18,4) FROM document.external_expense_sheet s LEFT JOIN document.external_expense_item i ON i.tenant_id=s.tenant_id AND i.expense_sheet_id=s.id GROUP BY s.tenant_id,s.id,s.worker_engagement_id,s.code,s.status
),alloc AS(SELECT a.tenant_id,CASE WHEN a.external_time_sheet_id IS NOT NULL THEN 'external_time_sheet' ELSE 'external_expense_sheet' END source_kind,COALESCE(a.external_time_sheet_id,a.external_expense_sheet_id)source_id,a.service_sheet_line_id,sum(CASE WHEN a.allocation_kind='acceptance' THEN a.accepted_amount ELSE -a.accepted_amount END)::numeric(18,4)accepted_amount FROM document.service_sheet_source_allocation a WHERE a.external_time_sheet_id IS NOT NULL OR a.external_expense_sheet_id IS NOT NULL GROUP BY a.tenant_id,source_kind,source_id,a.service_sheet_line_id),invoice AS(SELECT l.tenant_id,l.source_line_id service_sheet_line_id,sum(l.net_amount)::numeric(18,4)invoiced_amount FROM document.purchase_invoice_line l JOIN document.purchase_invoice h ON h.tenant_id=l.tenant_id AND h.id=l.purchase_invoice_id WHERE l.source_entity_type='document.service_sheet' AND l.source_line_id IS NOT NULL AND h.status NOT IN('cancelled','reversed') GROUP BY l.tenant_id,l.source_line_id),totals AS(SELECT a.tenant_id,a.source_kind,a.source_id,sum(a.accepted_amount)::numeric(18,4)accepted_amount,COALESCE(sum(CASE WHEN sl.net_amount>0 THEN a.accepted_amount*COALESCE(i.invoiced_amount,0)/sl.net_amount ELSE 0 END),0)::numeric(18,4)invoiced_amount FROM alloc a JOIN document.service_sheet_line sl ON sl.tenant_id=a.tenant_id AND sl.id=a.service_sheet_line_id LEFT JOIN invoice i ON i.tenant_id=a.tenant_id AND i.service_sheet_line_id=a.service_sheet_line_id GROUP BY a.tenant_id,a.source_kind,a.source_id)
SELECT s.tenant_id,s.source_kind,s.source_id,s.worker_engagement_id,s.code,s.status claim_status,s.approved_amount,COALESCE(t.accepted_amount,0)::numeric(18,4)accepted_amount,COALESCE(t.invoiced_amount,0)::numeric(18,4)invoiced_amount,(s.approved_amount-COALESCE(t.accepted_amount,0))::numeric(18,4)unaccepted_amount,(COALESCE(t.accepted_amount,0)-COALESCE(t.invoiced_amount,0))::numeric(18,4)uninvoiced_amount,CASE WHEN s.status='reversed' THEN 'reversed' WHEN COALESCE(t.invoiced_amount,0)>=s.approved_amount AND s.approved_amount>0 THEN 'invoiced' WHEN COALESCE(t.invoiced_amount,0)>0 THEN 'partially_invoiced' WHEN COALESCE(t.accepted_amount,0)>=s.approved_amount AND s.approved_amount>0 THEN 'accepted' WHEN COALESCE(t.accepted_amount,0)>0 THEN 'partially_accepted' ELSE 'not_accepted' END financial_status,COALESCE(t.accepted_amount,0)>s.approved_amount over_accepted,COALESCE(t.invoiced_amount,0)>COALESCE(t.accepted_amount,0)over_invoiced FROM source s LEFT JOIN totals t ON t.tenant_id=s.tenant_id AND t.source_kind=s.source_kind AND t.source_id=s.source_id;

DO $reconcile$ DECLARE v_over bigint;
BEGIN SELECT count(*) INTO v_over FROM document.external_claim_reconciliation_v WHERE over_accepted OR over_invoiced;IF v_over>0 THEN RAISE EXCEPTION 'External-workforce migration reconciliation found % over-accepted or over-invoiced claims',v_over USING ERRCODE='integrity_constraint_violation';END IF;END $reconcile$;

ALTER TABLE control.mesh_workforce_claim_inbox ENABLE ROW LEVEL SECURITY;ALTER TABLE control.mesh_workforce_claim_inbox FORCE ROW LEVEL SECURITY;
ALTER TABLE control.mesh_workforce_claim_processing_attempt ENABLE ROW LEVEL SECURITY;ALTER TABLE control.mesh_workforce_claim_processing_attempt FORCE ROW LEVEL SECURITY;
ALTER TABLE document.service_sheet_source_allocation ENABLE ROW LEVEL SECURITY;ALTER TABLE document.service_sheet_source_allocation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.mesh_workforce_claim_inbox FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());CREATE POLICY seed_write ON control.mesh_workforce_claim_inbox FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY tenant_access ON control.mesh_workforce_claim_processing_attempt FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());CREATE POLICY seed_write ON control.mesh_workforce_claim_processing_attempt FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY tenant_access ON document.service_sheet_source_allocation FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());CREATE POLICY seed_write ON document.service_sheet_source_allocation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

REVOKE ALL ON control.mesh_workforce_claim_inbox,control.mesh_workforce_claim_processing_attempt,document.service_sheet_source_allocation FROM PUBLIC;
REVOKE ALL ON FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation(),document.trg_guard_external_claim_header(),document.trg_guard_external_claim_line(),document.trg_guard_service_sheet_source_allocation(),document.trg_validate_canonical_service_sheet_invoice_source(),document.trg_reject_deprecated_external_acceptance_write() FROM PUBLIC;
DO $roles$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  REVOKE INSERT,UPDATE,DELETE ON document.external_service_entry,document.external_service_entry_line,document.external_workforce_invoice_allocation FROM athyperapp;
  GRANT SELECT,INSERT ON control.mesh_workforce_claim_inbox,control.mesh_workforce_claim_processing_attempt,document.service_sheet_source_allocation TO athyperapp;
  GRANT SELECT ON document.external_service_entry,document.external_service_entry_line,document.external_workforce_invoice_allocation,document.external_claim_reconciliation_v TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON control.mesh_workforce_claim_inbox,control.mesh_workforce_claim_processing_attempt,document.service_sheet_source_allocation TO athyperadmin;GRANT SELECT ON document.external_claim_reconciliation_v TO athyperadmin;END IF;
END $roles$;

COMMENT ON TABLE document.external_service_entry IS 'DEPRECATED compatibility aggregate retained read-only until reconciliation and retention approval; use document.service_sheet.';
COMMENT ON TABLE document.external_service_entry_line IS 'DEPRECATED compatibility lines retained read-only until reconciliation and retention approval; use document.service_sheet_line and service_sheet_source_allocation.';
COMMENT ON TABLE document.external_workforce_invoice_allocation IS 'DEPRECATED compatibility allocation retained read-only until reconciliation and retention approval; invoice source is document.service_sheet_line.';

COMMIT;
