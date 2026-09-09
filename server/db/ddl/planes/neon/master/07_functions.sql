CREATE OR REPLACE FUNCTION master.trg_guard_tenant_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.realm_key IS DISTINCT FROM OLD.realm_key THEN
        RAISE EXCEPTION
            'master.tenant identity fields id, code, and realm_key are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.command_materialize_internal_business_partner_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,result_snapshot_id uuid,row_version bigint,case_status text,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared SET row_security=on AS $$
DECLARE fingerprint text;prior event.command_execution%ROWTYPE;execution uuid;current document.entity_case%ROWTYPE;payload jsonb;canonical_payload jsonb;bp_id uuid:=shared.uuidv7();bp master.business_partner%ROWTYPE;lifecycle record;result_snapshot uuid;next_version bigint;attempt_no integer;materialization_id uuid;outbox uuid;result jsonb;lineage_hash text;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Internal Business Partner materialization context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN RAISE EXCEPTION 'Internal Business Partner materialization arguments are invalid' USING ERRCODE='check_violation';END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.internal_business_partner' AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Internal Business Partner materialization idempotency conflict' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,(prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'resultSnapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid;RETURN;END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'entity.case.materialize.internal_business_partner',p_idempotency_key,fingerprint,'processing',p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current FROM document.entity_case c WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Approved entity case was not found' USING ERRCODE='no_data_found';END IF;
 IF current.row_version<>p_expected_case_version THEN RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';END IF;
 IF current.status<>'approved' OR current.entity_code<>'master.business_partner' OR current.operation_code<>'register' OR current.target_entity_id IS NOT NULL OR current.decision_snapshot_id IS NULL THEN RAISE EXCEPTION 'Entity case is not an approved internal Business Partner registration' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current.decision_snapshot_id;IF NOT FOUND THEN RAISE EXCEPTION 'Decision snapshot was not found' USING ERRCODE='data_corrupted';END IF;
 IF NOT(payload?'businessPartnerCode' AND payload?'name') OR payload->>'ownershipClass'<>'internal' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN('businessPartnerCode','name','displayName','legalName','legalForm','registrationCountryCode','incorporationDate','description','ownershipClass')) THEN RAISE EXCEPTION 'Internal Business Partner payload is outside the materializer contract' USING ERRCODE='check_violation';END IF;
 INSERT INTO master.business_partner(id,tenant_id,code,name,display_name,legal_name,partner_category,ownership_class,category_locked_by,legal_form,registration_country_code,incorporation_date,description,status,created_by) VALUES(bp_id,p_tenant_id,payload->>'businessPartnerCode',payload->>'name',payload->>'displayName',payload->>'legalName','organization','internal',p_actor_id,payload->>'legalForm',NULLIF(payload->>'registrationCountryCode','')::character(2),NULLIF(payload->>'incorporationDate','')::date,payload->>'description','draft',p_actor_id) RETURNING * INTO bp;
 SELECT * INTO lifecycle FROM control.command_business_partner_lifecycle(p_tenant_id,'business_partner',bp_id,'active',1,'approved governed internal registration','case-bp-activate:'||p_case_id::text,p_actor_id);IF lifecycle.aggregate_id IS NULL OR lifecycle.record_version<>2 THEN RAISE EXCEPTION 'Business Partner authority did not acknowledge materialization' USING ERRCODE='data_exception';END IF;
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id;
 canonical_payload:=payload||jsonb_build_object('businessPartnerCode',bp.code,'name',bp.name,'ownershipClass',bp.ownership_class);IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c WHERE c.tenant_id=p_tenant_id AND c.id=current.entity_contract_id AND c.entity_contract_hash=current.entity_contract_hash AND c.status IN('published','superseded')),canonical_payload))>0 THEN RAISE EXCEPTION 'Materialized Business Partner snapshot violates the pinned contract' USING ERRCODE='check_violation';END IF;
 result_snapshot:=snapshot.fn_capture_entity('master.business_partner',bp_id,bp.code,1,current.entity_contract_hash,bp.record_version,'entity.case.materialized','create',canonical_payload,p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current.row_version+1;SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,result_snapshot_id,materializer_code,materializer_version,request_fingerprint,expected_target_version,status,result_code,started_at,completed_at,requested_by,completed_by) VALUES(p_tenant_id,p_case_id,attempt_no,current.decision_snapshot_id,result_snapshot,'neon.internal_business_partner','1',fingerprint,NULL,'succeeded','BUSINESS_PARTNER_CREATED',clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'sourceSnapshotId',current.decision_snapshot_id,'targetSnapshotId',result_snapshot,'businessPartnerId',bp_id,'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by) VALUES(p_tenant_id,p_case_id,current.decision_snapshot_id,result_snapshot,'materialized_from','master.business_partner',bp_id,'neon.internal_business_partner','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET target_entity_id=bp_id,result_snapshot_id=result_snapshot,status='materialized',row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,current.row_version,next_version,'approved','materialized','accepted','BUSINESS_PARTNER_CREATED',result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'materializationId',materialization_id,'authorityEvidenceId',lifecycle.evidence_id),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,'status','materialized','materializer','neon.internal_business_partner'),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,'status','materialized','outboxId',outbox);UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,result_snapshot,next_version,'materialized',false,outbox;
END $$;


CREATE OR REPLACE FUNCTION master.trg_guard_master_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_old_status text := to_jsonb(OLD) ->> 'status';
    v_new_status text := to_jsonb(NEW) ->> 'status';
BEGIN
    IF to_jsonb(NEW) -> 'created_at'
           IS DISTINCT FROM to_jsonb(OLD) -> 'created_at'
       OR to_jsonb(NEW) -> 'created_by'
           IS DISTINCT FROM to_jsonb(OLD) -> 'created_by' THEN
        RAISE EXCEPTION '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_old_status = 'deprecated'
       AND v_new_status IS DISTINCT FROM 'deprecated' THEN
        RAISE EXCEPTION 'Deprecated %.% rows cannot be reactivated',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_set_master_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.created_by := v_actor;
    ELSIF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
    END IF;

    IF TG_TABLE_NAME = 'business_partner' THEN
        NEW.category_locked_by := NEW.created_by;
        NEW.category_locked_at := COALESCE(NEW.category_locked_at, now());
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_catalog_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION '%.% id and code are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'module'
       AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
        RAISE EXCEPTION 'master.module workspace assignment is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'provisioning' AND NEW.status IN ('active', 'terminated'))
        OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'terminated'))
        OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'terminated'))
    ) THEN
        RAISE EXCEPTION
            'Invalid tenant status transition: % -> % (tenant %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            'master.tenant_profile identity fields id and tenant_id are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_tenant_weekend_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.weekend_days IS NOT NULL THEN
        SELECT array_agg(day_value ORDER BY day_value)
          INTO NEW.weekend_days
          FROM (
              SELECT DISTINCT unnest(NEW.weekend_days) AS day_value
          ) AS normalized_days;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_relationship_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.from_tenant_id IS DISTINCT FROM OLD.from_tenant_id
       OR NEW.to_tenant_id IS DISTINCT FROM OLD.to_tenant_id
       OR NEW.relationship_type IS DISTINCT FROM OLD.relationship_type THEN
        RAISE EXCEPTION
            'master.tenant_relationship identity fields are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.activated_at IS NOT NULL
       AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
        RAISE EXCEPTION
            'master.tenant_relationship activated_at is immutable after activation'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_relationship_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'pending' AND NEW.status IN ('active', 'revoked'))
        OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'revoked'))
        OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'revoked'))
    ) THEN
        RAISE EXCEPTION
            'Invalid tenant relationship status transition: % -> % (relationship %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'active' THEN
        NEW.activated_at := COALESCE(OLD.activated_at, NEW.activated_at, clock_timestamp());
        NEW.effective_from := COALESCE(NEW.effective_from, clock_timestamp());
    END IF;

    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_owner_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_capability       text;
    v_target_schema    text;
    v_target_table     text;
    v_pk_column        text;
    v_is_tenant_scoped boolean;
    v_tenant_column    text;
    v_exists           boolean;
BEGIN
    v_capability := CASE TG_TABLE_NAME
        WHEN 'address_link' THEN 'address'
        WHEN 'contact_link' THEN 'contact'
        WHEN 'bank_account_link' THEN 'bank_account'
        ELSE NULL
    END;

    IF v_capability IS NULL THEN
        RAISE EXCEPTION 'Unsupported owner-reference table %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME;
    END IF;

    SELECT target_schema, target_table, pk_column,
           is_tenant_scoped, tenant_column
      INTO v_target_schema, v_target_table, v_pk_column,
           v_is_tenant_scoped, v_tenant_column
      FROM control.owner_type
     WHERE id = NEW.owner_type_id
       AND status = 'active'
       AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
       AND (
           (v_capability = 'address' AND supports_address)
           OR (v_capability = 'contact' AND supports_contact)
           OR (v_capability = 'bank_account' AND supports_bank_account)
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Owner type % is not active, accessible, or enabled for %',
            NEW.owner_type_id, v_capability
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM control.owner_type_purpose
         WHERE owner_type_id = NEW.owner_type_id
           AND capability = v_capability
           AND purpose_code = NEW.purpose
    ) THEN
        RAISE EXCEPTION
            'Purpose % is not allowed for owner type % and capability %',
            NEW.purpose, NEW.owner_type_id, v_capability
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I
                  WHERE %I = $1 AND %I = $2
             )',
            v_target_schema, v_target_table,
            v_pk_column, v_tenant_column
        )
        INTO v_exists
        USING NEW.owner_id, NEW.tenant_id;
    ELSE
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I WHERE %I = $1
             )',
            v_target_schema, v_target_table, v_pk_column
        )
        INTO v_exists
        USING NEW.owner_id;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION
            'Owner % does not exist in %.% for owner type % and tenant %',
            NEW.owner_id, v_target_schema, v_target_table,
            NEW.owner_type_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_contact_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.value := btrim(NEW.value);
    NEW.purpose := lower(btrim(NEW.purpose));
    NEW.role_qualifier := nullif(btrim(NEW.role_qualifier), '');

    IF NEW.channel_type = 'email' THEN
        NEW.value := lower(NEW.value);
        IF NEW.value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
            RAISE EXCEPTION 'Invalid email contact value'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.channel_type IN ('phone', 'fax', 'sms', 'whatsapp') THEN
        IF NEW.value !~ '^\+[1-9][0-9]{1,14}$' THEN
            RAISE EXCEPTION 'Phone-family contact values must use E.164'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.channel_type = 'website' THEN
        IF length(NEW.value)>2048
           OR NEW.value ~ '[[:space:][:cntrl:]@]'
           OR NEW.value !~* '^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?][^[:space:][:cntrl:]]*)?$' THEN
            RAISE EXCEPTION 'Website contact value must be a credential-free absolute HTTPS URL with a valid DNS host'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_require_contact_verification_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        IF NEW.verification_provider IS NULL
           OR btrim(NEW.verification_provider) = ''
           OR NEW.verification_signature IS NULL
           OR btrim(NEW.verification_signature) = ''
           OR NEW.verification_evidence = '{}'::jsonb
           OR NEW.verification_evidence IS NOT DISTINCT FROM OLD.verification_evidence
           OR NEW.verification_signature IS NOT DISTINCT FROM OLD.verification_signature THEN
            RAISE EXCEPTION 'Verification changes require new signed provider evidence'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_external_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.source_system_code := lower(btrim(NEW.source_system_code));
    NEW.external_entity_code := lower(btrim(NEW.external_entity_code));
    NEW.external_id := btrim(NEW.external_id);
    NEW.external_code := nullif(btrim(NEW.external_code), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_external_reference_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.owner_type_id IS DISTINCT FROM OLD.owner_type_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.source_system_code IS DISTINCT FROM OLD.source_system_code
       OR NEW.external_entity_code IS DISTINCT FROM OLD.external_entity_code
       OR NEW.external_id IS DISTINCT FROM OLD.external_id THEN
        RAISE EXCEPTION
            'master.external_reference mapping coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_external_reference_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_target_schema      text;
    v_target_table       text;
    v_pk_column          text;
    v_is_tenant_scoped   boolean;
    v_tenant_column      text;
    v_exists             boolean;
BEGIN
    SELECT target_schema, target_table, pk_column,
           is_tenant_scoped, tenant_column
      INTO v_target_schema, v_target_table, v_pk_column,
           v_is_tenant_scoped, v_tenant_column
      FROM control.owner_type
     WHERE id = NEW.owner_type_id
       AND status = 'active'
       AND supports_external_reference
       AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Owner type % is not active, accessible, or enabled for external references',
            NEW.owner_type_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I
                  WHERE %I = $1 AND %I = $2
             )',
            v_target_schema, v_target_table,
            v_pk_column, v_tenant_column
        )
        INTO v_exists
        USING NEW.owner_id, NEW.tenant_id;
    ELSE
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I WHERE %I = $1
             )',
            v_target_schema, v_target_table, v_pk_column
        )
        INTO v_exists
        USING NEW.owner_id;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION
            'External-reference owner % does not exist in %.% for tenant %',
            NEW.owner_id, v_target_schema, v_target_table, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_team()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.team_type := lower(btrim(NEW.team_type));
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_team_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION
            'master.team identity fields id, tenant_id, and code are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
        RAISE EXCEPTION 'Archived teams cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_team_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.role_code := lower(btrim(NEW.role_code));
    NEW.leave_reason := nullif(btrim(NEW.leave_reason), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_team_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.role_code IS DISTINCT FROM OLD.role_code
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'master.team_member identity, role, join time, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.left_at IS NOT NULL
       AND (
           NEW.left_at IS DISTINCT FROM OLD.left_at
           OR NEW.left_by IS DISTINCT FROM OLD.left_by
           OR NEW.leave_reason IS DISTINCT FROM OLD.leave_reason
       ) THEN
        RAISE EXCEPTION 'Ended team memberships are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.left_at IS NULL
       AND NEW.left_at IS NULL
       AND (
           NEW.left_by IS DISTINCT FROM OLD.left_by
           OR NEW.leave_reason IS DISTINCT FROM OLD.leave_reason
       ) THEN
        RAISE EXCEPTION
            'Team membership exit evidence requires left_at'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_link_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.owner_type_id IS DISTINCT FROM OLD.owner_type_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION
            'master.contact_link identity and owner coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.channel_type IS DISTINCT FROM OLD.channel_type THEN
        IF OLD.channel_type = 'email'
           AND EXISTS (
               SELECT 1 FROM master.contact_email
                WHERE contact_link_id = OLD.id
           ) THEN
            RAISE EXCEPTION
                'Email contact channel cannot change while contact_email exists'
                USING ERRCODE = 'check_violation';
        END IF;

        IF OLD.channel_type IN ('phone', 'fax', 'sms', 'whatsapp')
           AND NEW.channel_type NOT IN ('phone', 'fax', 'sms', 'whatsapp')
           AND EXISTS (
               SELECT 1 FROM master.contact_phone
                WHERE contact_link_id = OLD.id
           ) THEN
            RAISE EXCEPTION
                'Phone-family contact channel cannot change families while contact_phone exists'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_extension_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_channel_type text;
BEGIN
    SELECT channel_type
      INTO v_channel_type
      FROM master.contact_link
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.contact_link_id;

    IF TG_TABLE_NAME = 'contact_email' AND v_channel_type <> 'email' THEN
        RAISE EXCEPTION 'contact_email requires an email contact_link'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'contact_phone'
       AND v_channel_type NOT IN ('phone', 'fax', 'sms', 'whatsapp') THEN
        RAISE EXCEPTION
            'contact_phone requires a phone-family contact_link'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.current_principal_id_soft()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT nullif(current_setting('app.current_principal_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
       OR NEW.provisioning_source IS DISTINCT FROM OLD.provisioning_source THEN
        RAISE EXCEPTION
            'master.principal identity, type, and provisioning source are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.auth_epoch IS DISTINCT FROM OLD.auth_epoch
       AND NEW.auth_epoch <> OLD.auth_epoch + 1 THEN
        RAISE EXCEPTION
            'master.principal auth_epoch must increment by exactly one'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'active' AND NEW.status IN ('suspended', 'deactivated'))
        OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'deactivated'))
    ) THEN
        RAISE EXCEPTION
            'Invalid principal status transition: % -> % (principal %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.auth_epoch := OLD.auth_epoch + 1;
    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_child_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id THEN
        RAISE EXCEPTION
            '%.% identity fields id, tenant_id, and principal_id are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_principal_identity_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    NEW.realm_key := lower(btrim(NEW.realm_key));
    NEW.subject_id := btrim(NEW.subject_id);
    NEW.issuer := nullif(btrim(NEW.issuer), '');
    NEW.audience := nullif(btrim(NEW.audience), '');
    NEW.username := nullif(btrim(NEW.username), '');
    NEW.service_client_id := nullif(btrim(NEW.service_client_id), '');
    NEW.sync_error_message := nullif(btrim(NEW.sync_error_message), '');

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_identity_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.provider_code IS DISTINCT FROM OLD.provider_code
       OR NEW.realm_key IS DISTINCT FROM OLD.realm_key
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
        RAISE EXCEPTION
            'master.principal_identity_binding provider identity coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_identity_binding_principal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_principal_type master.principal_type_d;
BEGIN
    SELECT principal_type
      INTO v_principal_type
      FROM master.principal
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.principal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'principal_identity_binding principal % does not exist in tenant %',
            NEW.principal_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.service_client_id IS NOT NULL
       AND v_principal_type NOT IN ('service_account', 'integration') THEN
        RAISE EXCEPTION
            'service_client_id requires a service_account or integration principal'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_identity_binding_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'active' AND NEW.status IN ('disabled', 'revoked'))
        OR (OLD.status = 'disabled' AND NEW.status IN ('active', 'revoked'))
    ) THEN
        RAISE EXCEPTION
            'Invalid identity-binding status transition: % -> % (binding %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status <> 'active' THEN
        NEW.is_primary := false;
    END IF;

    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_principal_registry_codes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF TG_TABLE_NAME = 'principal_ui_preference' THEN
        NEW.preference_code := lower(btrim(NEW.preference_code));
        NEW.surface_code := nullif(lower(btrim(NEW.surface_code)), '');
    ELSIF TG_TABLE_NAME = 'principal_notification_preference' THEN
        NEW.event_code := lower(btrim(NEW.event_code));
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.fn_resolve_principal_identity(
    p_tenant_id     uuid,
    p_provider_code master.identity_provider_d,
    p_realm_key     text,
    p_subject_id    text
)
RETURNS TABLE (
    principal_id   uuid,
    principal_type master.principal_type_d,
    auth_epoch     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, master, shared
AS $$
    SELECT p.id, p.principal_type, p.auth_epoch
      FROM master.principal_identity_binding AS b
      JOIN master.principal AS p
        ON p.tenant_id = b.tenant_id
       AND p.id = b.principal_id
     WHERE p_tenant_id = shared.current_tenant_id_soft()
       AND b.tenant_id = p_tenant_id
       AND b.provider_code = p_provider_code
       AND b.realm_key = lower(btrim(p_realm_key))
       AND b.subject_id = btrim(p_subject_id)
       AND b.status = 'active'
       AND p.status = 'active';
$$;

COMMENT ON FUNCTION master.fn_resolve_principal_identity(
    uuid, master.identity_provider_d, text, text
) IS
  'Resolves a validated external IAM subject inside the already-established tenant context. Returns only active binding/principal data.';

CREATE OR REPLACE FUNCTION master.trg_normalize_saved_view()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    NEW.surface_code := lower(btrim(NEW.surface_code));
    NEW.entity_code := lower(btrim(NEW.entity_code));
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_saved_view_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.surface_code IS DISTINCT FROM OLD.surface_code
       OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION
            'master.saved_view identity fields id, tenant_id, surface_code, entity_code, and code are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_render_registry_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION '%.% id and tenant_id are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF to_jsonb(NEW) ? 'code'
       AND to_jsonb(NEW) -> 'code' IS DISTINCT FROM to_jsonb(OLD) -> 'code' THEN
        RAISE EXCEPTION '%.% code is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'template_binding'
       AND (
           NEW.template_id IS DISTINCT FROM OLD.template_id
           OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
           OR NEW.operation_code IS DISTINCT FROM OLD.operation_code
           OR NEW.variant_code IS DISTINCT FROM OLD.variant_code
           OR NEW.locale_code IS DISTINCT FROM OLD.locale_code
       ) THEN
        RAISE EXCEPTION 'master.template_binding resolution coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_organization_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF (to_jsonb(NEW) -> 'tenant_id') IS DISTINCT FROM (to_jsonb(OLD) -> 'tenant_id')
       OR (
           to_jsonb(NEW) ? 'id'
           AND (to_jsonb(NEW) -> 'id') IS DISTINCT FROM (to_jsonb(OLD) -> 'id')
       )
       OR (
           to_jsonb(NEW) ? 'code'
           AND (to_jsonb(NEW) -> 'code') IS DISTINCT FROM (to_jsonb(OLD) -> 'code')
       ) THEN
        RAISE EXCEPTION '%.% tenant and identity coordinates are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_organization_hierarchy_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_id uuid := nullif(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
    v_cycle boolean;
    v_depth integer;
    v_max_depth integer := CASE
        WHEN array_length(TG_ARGV, 1) > 1 THEN TG_ARGV[1]::integer
        ELSE NULL
    END;
BEGIN
    IF v_parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE format(
        'WITH RECURSIVE ancestors AS (
             SELECT id, %1$I AS parent_id, 1 AS depth, ARRAY[id] AS visited
               FROM master.%2$I
              WHERE tenant_id = $1 AND id = $2
             UNION ALL
             SELECT parent.id, parent.%1$I, ancestors.depth + 1, ancestors.visited || parent.id
               FROM master.%2$I AS parent
               JOIN ancestors ON parent.id = ancestors.parent_id
              WHERE parent.tenant_id = $1
                AND NOT parent.id = ANY(ancestors.visited)
         )
         SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = $3),
                COALESCE(MAX(depth), 0)
           FROM ancestors',
        TG_ARGV[0], TG_TABLE_NAME
    )
    INTO v_cycle, v_depth
    USING NEW.tenant_id, v_parent_id, NEW.id;

    IF v_cycle THEN
        RAISE EXCEPTION '%.% hierarchy cycle detected',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_max_depth IS NOT NULL AND v_depth >= v_max_depth THEN
        RAISE EXCEPTION '%.% hierarchy exceeds maximum depth %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_max_depth
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_operating_organization_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_domain master.operating_organization_domain_d;
    v_company_ids uuid[];
    v_company_id uuid;
BEGIN
    SELECT organization.domain
      INTO v_domain
      FROM master.operating_organization AS organization
     WHERE organization.tenant_id = NEW.tenant_id
       AND organization.id = NEW.operating_organization_id;

    IF v_domain IS NULL THEN
        RAISE EXCEPTION 'Operating organization does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF TG_TABLE_NAME = 'procurement_organization_profile'
       AND v_domain NOT IN ('procurement', 'both') THEN
        RAISE EXCEPTION 'Procurement profile requires procurement or both domain'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'sales_organization_profile'
       AND v_domain NOT IN ('sales', 'both') THEN
        RAISE EXCEPTION 'Sales profile requires sales or both domain'
            USING ERRCODE = 'check_violation';
    END IF;

    v_company_ids := CASE TG_TABLE_NAME
        WHEN 'procurement_organization_profile' THEN ARRAY[
            nullif(to_jsonb(NEW) ->> 'lead_company_code_id', '')::uuid
        ]
        WHEN 'sales_organization_profile' THEN ARRAY[
            nullif(to_jsonb(NEW) ->> 'booking_company_code_id', '')::uuid,
            nullif(to_jsonb(NEW) ->> 'invoicing_company_code_id', '')::uuid
        ]
        ELSE ARRAY[]::uuid[]
    END;

    FOREACH v_company_id IN ARRAY v_company_ids LOOP
        IF v_company_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
              FROM master.operating_organization_company_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.operating_organization_id = NEW.operating_organization_id
               AND assignment.company_code_id = v_company_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= CURRENT_DATE
               AND (assignment.effective_until IS NULL OR assignment.effective_until > CURRENT_DATE)
        ) THEN
            RAISE EXCEPTION 'Operating organization profile default company is not an effective member'
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_switch_render_registry_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.is_default
       AND NEW.status = 'active'
       AND (
           TG_OP = 'INSERT'
           OR OLD.is_default IS DISTINCT FROM NEW.is_default
           OR OLD.status IS DISTINCT FROM NEW.status
       ) THEN
        EXECUTE format(
            'UPDATE master.%I
                SET is_default = false
              WHERE tenant_id = $1
                AND id <> $2
                AND is_default
                AND status = ''active''',
            TG_TABLE_NAME
        )
        USING NEW.tenant_id, NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_dimension_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_scope master.dimension_scope_d;
    v_hierarchical boolean;
    v_max_depth smallint;
    v_parent_company_id uuid;
    v_depth integer;
BEGIN
    SELECT dimension.scope_mode,
           dimension.is_hierarchical,
           dimension.max_depth
      INTO v_scope, v_hierarchical, v_max_depth
      FROM master.dimension_type AS dimension
     WHERE dimension.tenant_id = NEW.tenant_id
       AND dimension.id = NEW.dimension_type_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dimension type does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_scope = 'tenant' AND NEW.company_code_id IS NOT NULL THEN
        RAISE EXCEPTION 'Tenant-scoped dimension values cannot specify company_code_id'
            USING ERRCODE = 'check_violation';
    ELSIF v_scope = 'company_code' AND NEW.company_code_id IS NULL THEN
        RAISE EXCEPTION 'Company-code-scoped dimension values require company_code_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT v_hierarchical THEN
        RAISE EXCEPTION 'Non-hierarchical dimension types cannot have parent values'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT parent.company_code_id
      INTO v_parent_company_id
      FROM master.dimension_value AS parent
     WHERE parent.tenant_id = NEW.tenant_id
       AND parent.dimension_type_id = NEW.dimension_type_id
       AND parent.id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dimension parent does not exist in the same tenant and type'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent_company_id IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION 'Dimension parent and child must have the same company scope'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_max_depth IS NOT NULL THEN
        WITH RECURSIVE ancestors AS (
            SELECT parent.id, parent.parent_id
              FROM master.dimension_value AS parent
             WHERE parent.tenant_id = NEW.tenant_id
               AND parent.dimension_type_id = NEW.dimension_type_id
               AND parent.id = NEW.parent_id
            UNION ALL
            SELECT parent.id, parent.parent_id
              FROM master.dimension_value AS parent
              JOIN ancestors ON parent.id = ancestors.parent_id
             WHERE parent.tenant_id = NEW.tenant_id
               AND parent.dimension_type_id = NEW.dimension_type_id
        )
        SELECT count(*) + 1 INTO v_depth FROM ancestors;

        IF v_depth > v_max_depth THEN
            RAISE EXCEPTION 'Dimension hierarchy exceeds configured max_depth %',
                v_max_depth
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_management_center_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION
            '%.% tenant, company, and identity coordinates are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_dimension_value_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.dimension_type_id IS DISTINCT FROM OLD.dimension_type_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION
            'Dimension value tenant, type, company, and identity coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_dimension_type_structure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF (
        NEW.scope_mode IS DISTINCT FROM OLD.scope_mode
        OR NEW.is_hierarchical IS DISTINCT FROM OLD.is_hierarchical
        OR NEW.max_depth IS DISTINCT FROM OLD.max_depth
    ) AND EXISTS (
        SELECT 1
          FROM master.dimension_value AS value
         WHERE value.tenant_id = OLD.tenant_id
           AND value.dimension_type_id = OLD.id
    ) THEN
        RAISE EXCEPTION
            'Dimension scope and hierarchy settings are immutable after values exist'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_dimension_set_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    RAISE EXCEPTION '%.% rows are immutable; resolve a new dimension set instead',
        TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION master.fn_resolve_dimension_set(
    p_pairs jsonb,
    p_company_code_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master, shared
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_actor_id uuid := master.current_principal_id_soft();
    v_pair jsonb;
    v_type_id uuid;
    v_value_id uuid;
    v_value_company_id uuid;
    v_seen_types uuid[] := ARRAY[]::uuid[];
    v_parts text[] := ARRAY[]::text[];
    v_signature text;
    v_hash bytea;
    v_count integer;
    v_set_id uuid;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_pairs IS NULL OR jsonb_typeof(p_pairs) <> 'array' THEN
        RAISE EXCEPTION 'Dimension pairs must be a JSON array'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_count := jsonb_array_length(p_pairs);
    IF v_count = 0 THEN
        RETURN NULL;
    END IF;
    IF v_count > 64 THEN
        RAISE EXCEPTION 'A dimension set cannot contain more than 64 values'
            USING ERRCODE = 'program_limit_exceeded';
    END IF;

    IF p_company_code_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.company_code AS company
            WHERE company.tenant_id = v_tenant_id
              AND company.id = p_company_code_id
       ) THEN
        RAISE EXCEPTION 'Company code does not exist in current tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs)
    LOOP
        IF jsonb_typeof(v_pair) <> 'object'
           OR NOT (v_pair ? 'type_id')
           OR NOT (v_pair ? 'value_id') THEN
            RAISE EXCEPTION
                'Every dimension pair must contain type_id and value_id'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        BEGIN
            v_type_id := (v_pair ->> 'type_id')::uuid;
            v_value_id := (v_pair ->> 'value_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Dimension pair identifiers must be UUID values'
                USING ERRCODE = 'invalid_parameter_value';
        END;

        IF v_type_id = ANY (v_seen_types) THEN
            RAISE EXCEPTION 'Dimension type % occurs more than once', v_type_id
                USING ERRCODE = 'unique_violation';
        END IF;

        SELECT value.company_code_id
          INTO v_value_company_id
          FROM master.dimension_type AS dimension
          JOIN master.dimension_value AS value
            ON value.tenant_id = dimension.tenant_id
           AND value.dimension_type_id = dimension.id
         WHERE dimension.tenant_id = v_tenant_id
           AND dimension.id = v_type_id
           AND value.id = v_value_id
           AND dimension.status = 'active'
           AND value.status = 'active'
           AND (value.effective_from IS NULL OR value.effective_from <= CURRENT_DATE)
           AND (value.effective_to IS NULL OR value.effective_to >= CURRENT_DATE);

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Dimension type/value pair is missing, inactive, or outside its effective dates'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_value_company_id IS NOT NULL
           AND (
               p_company_code_id IS NULL
               OR v_value_company_id <> p_company_code_id
           ) THEN
            RAISE EXCEPTION
                'Company-scoped dimension value does not match requested company code'
                USING ERRCODE = 'check_violation';
        END IF;

        v_seen_types := array_append(v_seen_types, v_type_id);
        v_parts := array_append(
            v_parts,
            v_type_id::text || ':' || v_value_id::text
        );
    END LOOP;

    SELECT string_agg(part, '|' ORDER BY part COLLATE "C")
      INTO v_signature
      FROM unnest(v_parts) AS part;
    v_hash := public.digest(convert_to(v_signature, 'UTF8'), 'sha256');

    INSERT INTO master.dimension_set (
        tenant_id, set_hash, dimension_count, created_by
    )
    VALUES (
        v_tenant_id, v_hash, v_count::smallint, v_actor_id
    )
    ON CONFLICT (tenant_id, set_hash) DO NOTHING
    RETURNING id INTO v_set_id;

    IF v_set_id IS NULL THEN
        SELECT dimension_set.id
          INTO v_set_id
          FROM master.dimension_set AS dimension_set
         WHERE dimension_set.tenant_id = v_tenant_id
           AND dimension_set.set_hash = v_hash;
        RETURN v_set_id;
    END IF;

    FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs)
    LOOP
        INSERT INTO master.dimension_set_item (
            tenant_id,
            dimension_set_id,
            dimension_type_id,
            dimension_value_id,
            created_by
        )
        VALUES (
            v_tenant_id,
            v_set_id,
            (v_pair ->> 'type_id')::uuid,
            (v_pair ->> 'value_id')::uuid,
            v_actor_id
        );
    END LOOP;

    RETURN v_set_id;
END;
$$;

COMMENT ON FUNCTION master.fn_resolve_dimension_set(jsonb, uuid) IS
  'Tenant-context-bound resolver for immutable additional-dimension combinations. Validates active/effective values and optional company scope before content-addressed creation.';

-- ============================================================================
-- Neon accounting-foundation guards
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_guard_gl_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_class master.gl_account_class_d;
    v_chart_locked boolean;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT chart.is_locked
          INTO v_chart_locked
          FROM master.chart_of_account AS chart
         WHERE chart.tenant_id = OLD.tenant_id
           AND chart.id = OLD.chart_of_account_id;
        IF v_chart_locked THEN
            RAISE EXCEPTION 'Chart of account % is locked', OLD.chart_of_account_id
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;

    SELECT chart.is_locked
      INTO v_chart_locked
      FROM master.chart_of_account AS chart
     WHERE chart.tenant_id = NEW.tenant_id
       AND chart.id = NEW.chart_of_account_id;

    IF v_chart_locked
       AND (
           TG_OP = 'INSERT'
           OR ROW(NEW.parent_id, NEW.code, NEW.account_class, NEW.node_type,
                  NEW.normal_balance, NEW.subledger_type, NEW.currency_code)
              IS DISTINCT FROM
              ROW(OLD.parent_id, OLD.code, OLD.account_class, OLD.node_type,
                  OLD.normal_balance, OLD.subledger_type, OLD.currency_code)
       ) THEN
        RAISE EXCEPTION 'Chart of account % is locked', NEW.chart_of_account_id
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.parent_id IS NOT NULL THEN
        SELECT parent.account_class
          INTO v_parent_class
          FROM master.gl_account AS parent
         WHERE parent.tenant_id = NEW.tenant_id
           AND parent.chart_of_account_id = NEW.chart_of_account_id
           AND parent.id = NEW.parent_id;

        IF FOUND AND NOT (
            NEW.account_class = v_parent_class
            OR (NEW.account_class = 'contra_asset' AND v_parent_class = 'asset')
            OR (NEW.account_class = 'contra_liability' AND v_parent_class = 'liability')
            OR (NEW.account_class = 'contra_equity' AND v_parent_class = 'equity')
            OR (NEW.account_class = 'contra_revenue' AND v_parent_class = 'income')
            OR (NEW.account_class = 'contra_expense' AND v_parent_class = 'expense')
        ) THEN
            RAISE EXCEPTION
                'GL account class % is incompatible with parent class %',
                NEW.account_class, v_parent_class
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_derive_gl_account_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_level smallint;
    v_parent_path text;
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path := NEW.code;
    ELSE
        SELECT parent.level_no, parent.path
          INTO v_parent_level, v_parent_path
          FROM master.gl_account AS parent
         WHERE parent.tenant_id = NEW.tenant_id
           AND parent.chart_of_account_id = NEW.chart_of_account_id
           AND parent.id = NEW.parent_id;
        IF FOUND THEN
            NEW.level_no := v_parent_level + 1;
            NEW.path := COALESCE(v_parent_path, NEW.parent_id::text) || '/' || NEW.code;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_rebuild_gl_account_descendants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF ROW(NEW.parent_id, NEW.code) IS NOT DISTINCT FROM ROW(OLD.parent_id, OLD.code) THEN
        RETURN NULL;
    END IF;

    WITH RECURSIVE descendants AS (
        SELECT
            child.id,
            NEW.level_no + 1 AS level_no,
            NEW.path || '/' || child.code AS path
        FROM master.gl_account AS child
        WHERE child.tenant_id = NEW.tenant_id
          AND child.chart_of_account_id = NEW.chart_of_account_id
          AND child.parent_id = NEW.id

        UNION ALL

        SELECT
            child.id,
            parent.level_no + 1,
            parent.path || '/' || child.code
        FROM master.gl_account AS child
        JOIN descendants AS parent
          ON child.parent_id = parent.id
        WHERE child.tenant_id = NEW.tenant_id
          AND child.chart_of_account_id = NEW.chart_of_account_id
    )
    UPDATE master.gl_account AS account
       SET level_no = descendants.level_no,
           path = descendants.path
      FROM descendants
     WHERE account.tenant_id = NEW.tenant_id
       AND account.id = descendants.id;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_accounting_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_column text;
BEGIN
    FOREACH v_column IN ARRAY TG_ARGV
    LOOP
        IF to_jsonb(NEW) -> v_column IS DISTINCT FROM to_jsonb(OLD) -> v_column THEN
            RAISE EXCEPTION '%.% is immutable', TG_TABLE_NAME, v_column
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_company_dimension_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_scope master.dimension_scope_d;
    v_value_company uuid;
BEGIN
    SELECT dimension.scope_mode, value.company_code_id
      INTO v_scope, v_value_company
      FROM master.dimension_type AS dimension
      JOIN master.dimension_value AS value
        ON value.tenant_id = dimension.tenant_id
       AND value.dimension_type_id = dimension.id
     WHERE dimension.tenant_id = NEW.tenant_id
       AND dimension.id = NEW.dimension_type_id
       AND value.id = NEW.dimension_value_id;

    IF FOUND AND (
        (v_scope = 'company_code' AND v_value_company <> NEW.company_code_id)
        OR (v_scope = 'tenant' AND v_value_company IS NOT NULL)
    ) THEN
        RAISE EXCEPTION
            'Dimension default value does not match its dimension scope/company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_company_gl_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.gl_account AS account
          JOIN master.company_code_chart_assignment AS assignment
            ON assignment.tenant_id = account.tenant_id
           AND assignment.chart_of_account_id = account.chart_of_account_id
         WHERE account.tenant_id = NEW.tenant_id
           AND account.id = NEW.gl_account_id
           AND assignment.company_code_id = NEW.company_code_id
    ) THEN
        RAISE EXCEPTION
            'GL account is not part of a chart assigned to the company code'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_fx_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_predecessor master.fx_rate%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'FX rates are append-only'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status <> 'active' OR NEW.status <> 'superseded'
           OR (to_jsonb(NEW) - ARRAY[
                 'status', 'status_changed_at', 'status_changed_by',
                 'updated_at', 'updated_by'
              ]) IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY[
                 'status', 'status_changed_at', 'status_changed_by',
                 'updated_at', 'updated_by'
              ]) THEN
            RAISE EXCEPTION
                'FX rates are immutable; only active to superseded is permitted'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.supersedes_id IS NOT NULL THEN
        SELECT *
          INTO v_predecessor
          FROM master.fx_rate
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF FOUND AND ROW(
            NEW.from_currency, NEW.to_currency, NEW.rate_type,
            NEW.source, NEW.effective_date, NEW.version_no
        ) IS DISTINCT FROM ROW(
            v_predecessor.from_currency, v_predecessor.to_currency,
            v_predecessor.rate_type, v_predecessor.source,
            v_predecessor.effective_date, v_predecessor.version_no + 1
        ) THEN
            RAISE EXCEPTION
                'FX successor must remain in the same series and increment version'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.version_no <> 1 THEN
        RAISE EXCEPTION 'FX version greater than one requires supersedes_id'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_set_fiscal_period_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, shared
AS $$
DECLARE
    v_actor uuid;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'future' AND NEW.status = 'open')
        OR (OLD.status = 'open' AND NEW.status = 'soft_close')
        OR (OLD.status = 'soft_close' AND NEW.status IN ('open', 'hard_close'))
    ) THEN
        RAISE EXCEPTION 'Invalid fiscal-period transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    v_actor := master.current_principal_id_soft();
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Fiscal-period transition requires principal context'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status = 'open' THEN
        NEW.opened_at := now();
        NEW.opened_by := v_actor;
    ELSIF NEW.status = 'soft_close' THEN
        NEW.soft_closed_at := now();
        NEW.soft_closed_by := v_actor;
    ELSIF NEW.status = 'hard_close' THEN
        NEW.hard_closed_at := now();
        NEW.hard_closed_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.fn_refresh_mv_cpa()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master, shared
AS $$
BEGIN
    IF shared.current_tenant_id_soft() IS NULL THEN
        RAISE EXCEPTION 'Tenant context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    REFRESH MATERIALIZED VIEW CONCURRENTLY master.mv_company_postable_account;
END;
$$;

REVOKE ALL ON FUNCTION master.fn_refresh_mv_cpa() FROM PUBLIC;

COMMENT ON FUNCTION master.fn_refresh_mv_cpa() IS
  'Context-gated refresh for the company postable-account cache used by finance setup mutations.';

-- ============================================================================
-- Neon operational-banking guards and commands
-- ============================================================================


CREATE OR REPLACE FUNCTION master.trg_normalize_bank_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := nullif(lower(btrim(NEW.code)), '');
    NEW.name := nullif(btrim(NEW.name), '');
    NEW.account_holder_name := btrim(NEW.account_holder_name);
    NEW.account_id_value :=
        upper(regexp_replace(NEW.account_id_value, '[^A-Za-z0-9]', '', 'g'));
    NEW.account_last4 := right(NEW.account_id_value, 4);
    NEW.currency_code := upper(btrim(NEW.currency_code::text));
    NEW.bic_override :=
        nullif(upper(regexp_replace(NEW.bic_override, '\s+', '', 'g')), '');
    NEW.bank_name_override := nullif(btrim(NEW.bank_name_override), '');
    IF NEW.bank_country_override IS NOT NULL THEN
        NEW.bank_country_override :=
            upper(btrim(NEW.bank_country_override::text));
    END IF;
    NEW.provider_account_ref := nullif(btrim(NEW.provider_account_ref), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_bank_account_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'Bank-account identity is immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF (
        OLD.is_verified
        OR EXISTS (
            SELECT 1
              FROM master.bank_account_link AS link
             WHERE link.tenant_id = OLD.tenant_id
               AND link.bank_account_id = OLD.id
        )
    ) AND ROW(
        NEW.bank_institution_id, NEW.bank_branch_id, NEW.provisional_bank_reference_id, NEW.account_holder_name, NEW.account_id_type,
        NEW.account_id_value, NEW.currency_code, NEW.bank_country_override,
        NEW.account_nature, NEW.provider_account_ref,
        NEW.correspondent_bank_institution_id
    ) IS DISTINCT FROM ROW(
        OLD.bank_institution_id, OLD.bank_branch_id, OLD.provisional_bank_reference_id, OLD.account_holder_name, OLD.account_id_type,
        OLD.account_id_value, OLD.currency_code, OLD.bank_country_override,
        OLD.account_nature, OLD.provider_account_ref,
        OLD.correspondent_bank_institution_id
    ) THEN
        RAISE EXCEPTION
            'Verified or linked bank-account coordinates are immutable; create a replacement account'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_bank_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF ROW(
        NEW.is_verified, NEW.verified_at, NEW.verified_by,
        NEW.verification_method
    ) IS NOT DISTINCT FROM ROW(
        OLD.is_verified, OLD.verified_at, OLD.verified_by,
        OLD.verification_method
    ) THEN
        RETURN NEW;
    END IF;

    IF current_user = 'athyperapp' AND v_actor IS NULL THEN
        RAISE EXCEPTION 'Bank verification requires principal context'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF current_user = 'athyperapp'
       AND NEW.verified_by IS NOT NULL
       AND NEW.verified_by IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION
            'Bank verification actor does not match principal context'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_verified THEN
        NEW.verified_at := clock_timestamp();
        NEW.verified_by := COALESCE(v_actor, NEW.verified_by);
        IF NEW.verification_method IS NULL THEN
            RAISE EXCEPTION 'Verification method is required'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        NEW.verified_at := NULL;
        NEW.verified_by := NULL;
        NEW.verification_method := NULL;
        IF NEW.status = 'active' THEN
            NEW.status := 'pending_verification';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_resolve_bank_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_owner control.owner_type%ROWTYPE;
    v_expected_role master.bank_relationship_role_d;
BEGIN
    IF NEW.owner_type_id IS NOT NULL THEN
        SELECT *
          INTO v_owner
          FROM control.owner_type
         WHERE id = NEW.owner_type_id
           AND status = 'active'
           AND supports_bank_account
           AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id);
    ELSE
        SELECT *
          INTO v_owner
          FROM control.owner_type
         WHERE code = lower(btrim(NEW.owner_type))
           AND status = 'active'
           AND supports_bank_account
           AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
         ORDER BY tenant_id DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank-account owner type is not active or permitted'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.owner_type IS NOT NULL
       AND lower(btrim(NEW.owner_type)) <> v_owner.code THEN
        RAISE EXCEPTION 'owner_type code does not match owner_type_id'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.owner_type_id := v_owner.id;
    NEW.owner_type := v_owner.code;
    NEW.purpose := lower(btrim(NEW.purpose));

    v_expected_role := CASE v_owner.code
        WHEN 'tenant' THEN 'holder'
        WHEN 'legal_entity' THEN 'holder'
        WHEN 'company_code' THEN 'operational'
        WHEN 'business_partner' THEN 'beneficiary'
        WHEN 'supplier' THEN 'beneficiary'
        WHEN 'customer' THEN
            CASE WHEN NEW.purpose = 'collection' THEN 'funding'
                 ELSE 'beneficiary' END
        WHEN 'employee' THEN 'beneficiary'
        ELSE NULL
    END;

    IF v_expected_role IS NULL THEN
        RAISE EXCEPTION 'Owner type % is not approved for operational banking',
            v_owner.code USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.relationship_role IS NULL THEN
        NEW.relationship_role := v_expected_role;
    ELSIF NEW.relationship_role <> v_expected_role THEN
        RAISE EXCEPTION 'Relationship role % is invalid for owner type %',
            NEW.relationship_role, v_owner.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_owner.code = 'company_code' THEN
        NEW.company_code_id := NEW.owner_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_bank_account_link_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF ROW(
        NEW.id, NEW.tenant_id, NEW.owner_type_id, NEW.owner_type,
        NEW.owner_id, NEW.relationship_role, NEW.bank_account_id,
        NEW.company_code_id, NEW.purpose, NEW.effective_from,
        NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.tenant_id, OLD.owner_type_id, OLD.owner_type,
        OLD.owner_id, OLD.relationship_role, OLD.bank_account_id,
        OLD.company_code_id, OLD.purpose, OLD.effective_from,
        OLD.created_at, OLD.created_by
    ) THEN
        RAISE EXCEPTION
            'Bank-account link identity and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.effective_until IS NOT NULL
       AND NEW.effective_until IS DISTINCT FROM OLD.effective_until THEN
        RAISE EXCEPTION 'An ended bank-account link cannot be reopened or extended'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_house_bank_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_company_id uuid;
    v_account_currency character(3);
    v_account_verified boolean;
    v_account_status master.bank_account_status_d;
BEGIN
    SELECT link.owner_id, account.currency_code,
           account.is_verified, account.status
      INTO v_company_id, v_account_currency,
           v_account_verified, v_account_status
      FROM master.bank_account_link AS link
      JOIN master.bank_account AS account
        ON account.tenant_id = link.tenant_id
       AND account.id = link.bank_account_id
     WHERE link.tenant_id = NEW.tenant_id
       AND link.id = NEW.bank_account_link_id
       AND link.owner_type = 'company_code'
       AND link.relationship_role = 'operational'
       AND link.company_code_id = link.owner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'House-bank configuration requires a company-code operational link'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.status = 'active'
       AND (NOT v_account_verified OR v_account_status <> 'active') THEN
        RAISE EXCEPTION
            'Active house-bank configuration requires an active verified bank account'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.gl_account AS account
          JOIN master.company_code_chart_assignment AS assignment
            ON assignment.tenant_id = account.tenant_id
           AND assignment.chart_of_account_id = account.chart_of_account_id
           AND assignment.company_code_id = v_company_id
           AND assignment.assignment_type = 'operating'
           AND assignment.status = 'active'
           AND (assignment.effective_from IS NULL
                OR assignment.effective_from <= CURRENT_DATE)
           AND (assignment.effective_to IS NULL
                OR assignment.effective_to >= CURRENT_DATE)
          LEFT JOIN master.company_code_gl_account AS company_control
            ON company_control.tenant_id = account.tenant_id
           AND company_control.company_code_id = v_company_id
           AND company_control.gl_account_id = account.id
           AND company_control.status = 'active'
         WHERE account.tenant_id = NEW.tenant_id
           AND account.id = NEW.gl_account_id
           AND account.status = 'active'
           AND account.node_type = 'posting'
           AND NOT account.is_blocked
           AND (account.currency_code IS NULL
                OR account.currency_code = v_account_currency)
           AND COALESCE(company_control.posting_allowed, true)
           AND NOT COALESCE(company_control.blocked_for_auto, false)
    ) THEN
        RAISE EXCEPTION
            'House-bank GL is not currently postable for the company and account currency'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_house_bank_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_company_id uuid;
    v_currency character(3);
    v_from date;
    v_until date;
BEGIN
    IF NEW.status <> 'active'
       OR (
           NOT NEW.is_default_disbursement
           AND NOT NEW.is_default_collection
       ) THEN
        RETURN NEW;
    END IF;

    SELECT link.owner_id, account.currency_code,
           link.effective_from, link.effective_until
      INTO v_company_id, v_currency, v_from, v_until
      FROM master.bank_account_link AS link
      JOIN master.bank_account AS account
        ON account.tenant_id = link.tenant_id
       AND account.id = link.bank_account_id
     WHERE link.tenant_id = NEW.tenant_id
       AND link.id = NEW.bank_account_link_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        hashtextextended(
            NEW.tenant_id::text || ':' || v_company_id::text || ':' ||
            v_currency::text,
            0
        )
    );

    IF EXISTS (
        SELECT 1
          FROM master.bank_account_house_config AS config
          JOIN master.bank_account_link AS link
            ON link.tenant_id = config.tenant_id
           AND link.id = config.bank_account_link_id
          JOIN master.bank_account AS account
            ON account.tenant_id = link.tenant_id
           AND account.id = link.bank_account_id
         WHERE config.tenant_id = NEW.tenant_id
           AND config.id <> NEW.id
           AND config.status = 'active'
           AND link.owner_id = v_company_id
           AND account.currency_code = v_currency
           AND daterange(
               link.effective_from,
               COALESCE(link.effective_until, 'infinity'::date),
               '[)'
           ) && daterange(v_from, COALESCE(v_until, 'infinity'::date), '[)')
           AND (
               (NEW.is_default_disbursement AND config.is_default_disbursement)
               OR (NEW.is_default_collection AND config.is_default_collection)
           )
    ) THEN
        RAISE EXCEPTION
            'Overlapping default house bank already exists for company and currency'
            USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.end_bank_account_link(
    p_tenant_id uuid,
    p_link_id uuid,
    p_effective_until date,
    p_actor_id uuid
)
RETURNS master.bank_account_link
LANGUAGE plpgsql
SET search_path = pg_catalog, master, shared, control, document
AS $$
DECLARE
    v_link master.bank_account_link;
    v_actor uuid := master.current_principal_id_soft();
    v_policy_conflict boolean := false;
BEGIN
    IF p_tenant_id <> shared.current_tenant_id()
       OR v_actor IS NULL
       OR p_actor_id <> v_actor THEN
        RAISE EXCEPTION 'Tenant or principal context does not match command'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT *
      INTO v_link
      FROM master.bank_account_link
     WHERE tenant_id = p_tenant_id
       AND id = p_link_id
       AND owner_type = 'company_code'
       AND relationship_role = 'operational'
       AND company_code_id = owner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company house-bank link not found'
            USING ERRCODE = 'no_data_found';
    END IF;
    IF p_effective_until <= v_link.effective_from
       OR (
           v_link.effective_until IS NOT NULL
           AND p_effective_until <> v_link.effective_until
       ) THEN
        RAISE EXCEPTION 'Invalid bank-account link end date'
            USING ERRCODE = 'invalid_datetime_format';
    END IF;

    IF to_regclass('control.payment_method_company_policy') IS NOT NULL THEN
        EXECUTE
            'SELECT EXISTS (
                 SELECT 1
                   FROM control.payment_method_company_policy AS policy
                  WHERE policy.tenant_id = $1
                    AND policy.bank_account_link_id = $2
                    AND policy.status = ''active''
                    AND (
                        policy.effective_until IS NULL
                        OR policy.effective_until > $3
                    )
             )'
          INTO v_policy_conflict
         USING p_tenant_id, p_link_id, p_effective_until;

        IF v_policy_conflict THEN
            RAISE EXCEPTION 'Active payment policy extends beyond requested end date'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    UPDATE master.bank_account_house_config
       SET status = 'retired',
           status_changed_at = clock_timestamp(),
           status_changed_by = v_actor,
           updated_at = clock_timestamp(),
           updated_by = v_actor
     WHERE tenant_id = p_tenant_id
       AND bank_account_link_id = p_link_id
       AND status <> 'retired';

    UPDATE master.bank_account_link
       SET effective_until = p_effective_until,
           updated_at = clock_timestamp(),
           updated_by = v_actor
     WHERE tenant_id = p_tenant_id
       AND id = p_link_id
    RETURNING * INTO v_link;

    RETURN v_link;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_block_operational_bank_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% rows cannot be deleted; end or retire them instead',
        TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;

-- ============================================================================
-- Payment-term aggregate lifecycle
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_normalize_payment_term()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := upper(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.term_category := lower(btrim(NEW.term_category));
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Payment terms must be created as draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_payment_term_clause()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.clause_code := upper(btrim(NEW.clause_code));
    NEW.settles_clause_code :=
        nullif(upper(btrim(NEW.settles_clause_code)), '');
    NEW.currency_code :=
        nullif(upper(btrim(NEW.currency_code::text)), '')::character(3);
    NEW.trigger_event := nullif(upper(btrim(NEW.trigger_event)), '');
    NEW.release_event := nullif(upper(btrim(NEW.release_event)), '');
    NEW.recovery_method := nullif(upper(btrim(NEW.recovery_method)), '');
    NEW.partial_release_event :=
        nullif(upper(btrim(NEW.partial_release_event)), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_payment_term_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.currency_code :=
        nullif(upper(btrim(NEW.currency_code::text)), '')::character(3);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.assert_payment_term_aggregate_valid(
    p_tenant_id uuid,
    p_payment_term_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_term master.payment_term%ROWTYPE;
    v_count integer;
    v_max_sequence integer;
BEGIN
    SELECT *
      INTO v_term
      FROM master.payment_term
     WHERE tenant_id = p_tenant_id
       AND id = p_payment_term_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment term not found'
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_term.replaces_payment_term_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.payment_term AS predecessor
            WHERE predecessor.tenant_id = p_tenant_id
              AND predecessor.id = v_term.replaces_payment_term_id
              AND predecessor.status IN ('active', 'retired')
       ) THEN
        RAISE EXCEPTION
            'A replacement must reference an active or retired payment term'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), max(sequence_no)
      INTO v_count, v_max_sequence
      FROM master.payment_term_clause
     WHERE tenant_id = p_tenant_id
       AND payment_term_id = p_payment_term_id;
    IF v_count > 0 AND v_max_sequence <> v_count THEN
        RAISE EXCEPTION 'Payment-term clause sequence must be contiguous from one'
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.payment_term_clause AS child
          JOIN master.payment_term_clause AS settled
            ON settled.tenant_id = child.tenant_id
           AND settled.payment_term_id = child.payment_term_id
           AND settled.clause_code = child.settles_clause_code
         WHERE child.tenant_id = p_tenant_id
           AND child.payment_term_id = p_payment_term_id
           AND (
               settled.sequence_no >= child.sequence_no
               OR (
                   child.clause_type = 'ADVANCE_RECOVERY'
                   AND settled.clause_type <> 'ADVANCE'
               )
               OR (
                   child.clause_type = 'RETENTION_RELEASE'
                   AND settled.clause_type <> 'RETENTION'
               )
           )
    ) THEN
        RAISE EXCEPTION
            'Recovery and release clauses must settle an earlier compatible clause'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), max(tier_no)
      INTO v_count, v_max_sequence
      FROM master.payment_term_discount_tier
     WHERE tenant_id = p_tenant_id
       AND payment_term_id = p_payment_term_id;
    IF v_count > 0 AND v_max_sequence <> v_count THEN
        RAISE EXCEPTION 'Discount-tier sequence must be contiguous from one'
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.payment_term_discount_tier
         WHERE tenant_id = p_tenant_id
           AND payment_term_id = p_payment_term_id
         GROUP BY payment_term_id
        HAVING bool_or(discount_pct IS NOT NULL)
           AND bool_or(discount_fixed IS NOT NULL)
    ) THEN
        RAISE EXCEPTION
            'A payment term cannot mix percentage and fixed discount tiers'
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
              SELECT qualify_within_days,
                     discount_pct,
                     discount_fixed,
                     lag(discount_pct) OVER (
                         ORDER BY qualify_within_days
                     ) AS prior_pct,
                     lag(discount_fixed) OVER (
                         ORDER BY qualify_within_days
                     ) AS prior_fixed
                FROM master.payment_term_discount_tier
               WHERE tenant_id = p_tenant_id
                 AND payment_term_id = p_payment_term_id
          ) AS tier
         WHERE tier.discount_pct > tier.prior_pct
            OR tier.discount_fixed > tier.prior_fixed
    ) THEN
        RAISE EXCEPTION
            'Discount value cannot increase as the qualification window grows'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_term.due_rule_type = 'NET_DAYS'
       AND EXISTS (
           SELECT 1
             FROM master.payment_term_discount_tier
            WHERE tenant_id = p_tenant_id
              AND payment_term_id = p_payment_term_id
              AND qualify_within_days >= v_term.due_days
       ) THEN
        RAISE EXCEPTION
            'Contractual discount must expire before the net due date'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_payment_term()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'Payment terms cannot be deleted; retire active definitions instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF ROW(NEW.id, NEW.tenant_id, NEW.code, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.tenant_id, OLD.code, OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION 'Payment-term identity and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.status <> 'draft' THEN
        IF ROW(
            NEW.name, NEW.description, NEW.applicable_to, NEW.base_event,
            NEW.due_rule_type, NEW.due_days, NEW.due_day_of_month,
            NEW.grace_days, NEW.due_date_flexibility,
            NEW.business_day_convention, NEW.holiday_calendar_id,
            NEW.month_offset, NEW.term_category, NEW.installment_count,
            NEW.discount_selection_mode, NEW.replaces_payment_term_id,
            NEW.sort_order, NEW.metadata
        ) IS DISTINCT FROM ROW(
            OLD.name, OLD.description, OLD.applicable_to, OLD.base_event,
            OLD.due_rule_type, OLD.due_days, OLD.due_day_of_month,
            OLD.grace_days, OLD.due_date_flexibility,
            OLD.business_day_convention, OLD.holiday_calendar_id,
            OLD.month_offset, OLD.term_category, OLD.installment_count,
            OLD.discount_selection_mode, OLD.replaces_payment_term_id,
            OLD.sort_order, OLD.metadata
        ) THEN
            RAISE EXCEPTION
                'Active or retired payment-term definitions are immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        IF OLD.status = 'active' AND NEW.status NOT IN ('active', 'retired') THEN
            RAISE EXCEPTION 'Active payment terms may only be retired'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
            RAISE EXCEPTION 'Retired payment terms cannot be reactivated'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    ELSIF NEW.status NOT IN ('draft', 'active') THEN
        RAISE EXCEPTION 'Draft payment terms may only remain draft or activate'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        PERFORM master.assert_payment_term_aggregate_valid(
            NEW.tenant_id, NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_payment_term_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_tenant_id uuid;
    v_term_id uuid;
    v_status master.payment_term_status_d;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_term_id := OLD.payment_term_id;
    ELSE
        v_tenant_id := NEW.tenant_id;
        v_term_id := NEW.payment_term_id;
    END IF;
    SELECT status
      INTO v_status
      FROM master.payment_term
     WHERE tenant_id = v_tenant_id
       AND id = v_term_id
     FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent payment term not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION
            'Payment-term children are immutable after activation'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'UPDATE'
       AND ROW(NEW.id, NEW.tenant_id, NEW.payment_term_id,
               NEW.created_at, NEW.created_by)
           IS DISTINCT FROM
           ROW(OLD.id, OLD.tenant_id, OLD.payment_term_id,
               OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION
            'Payment-term child ownership and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_payment_term_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_settled_type master.payment_term_clause_type_d;
    v_settled_sequence smallint;
BEGIN
    IF NEW.settles_clause_code IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT clause_type, sequence_no
      INTO v_settled_type, v_settled_sequence
      FROM master.payment_term_clause
     WHERE tenant_id = NEW.tenant_id
       AND payment_term_id = NEW.payment_term_id
       AND clause_code = NEW.settles_clause_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settled clause % was not found',
            NEW.settles_clause_code USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_settled_sequence >= NEW.sequence_no
       OR (NEW.clause_type = 'ADVANCE_RECOVERY'
           AND v_settled_type <> 'ADVANCE')
       OR (NEW.clause_type = 'RETENTION_RELEASE'
           AND v_settled_type <> 'RETENTION') THEN
        RAISE EXCEPTION
            'Clause % must settle an earlier compatible clause',
            NEW.clause_code USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.activate_payment_term(
    p_tenant_id uuid,
    p_payment_term_id uuid,
    p_actor_id uuid
)
RETURNS master.payment_term
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master, shared
AS $$
DECLARE
    v_actor uuid := master.current_principal_id_soft();
    v_term master.payment_term;
BEGIN
    IF p_tenant_id <> shared.current_tenant_id()
       OR v_actor IS NULL
       OR p_actor_id <> v_actor THEN
        RAISE EXCEPTION 'Tenant or principal context does not match command'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE master.payment_term
       SET status = 'active',
           updated_by = v_actor
     WHERE tenant_id = p_tenant_id
       AND id = p_payment_term_id
       AND status = 'draft'
    RETURNING * INTO v_term;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft payment term not found'
            USING ERRCODE = 'no_data_found';
    END IF;
    RETURN v_term;
END;
$$;

CREATE OR REPLACE FUNCTION master.retire_payment_term(
    p_tenant_id uuid,
    p_payment_term_id uuid,
    p_actor_id uuid
)
RETURNS master.payment_term
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master, shared
AS $$
DECLARE
    v_actor uuid := master.current_principal_id_soft();
    v_term master.payment_term;
BEGIN
    IF p_tenant_id <> shared.current_tenant_id()
       OR v_actor IS NULL
       OR p_actor_id <> v_actor THEN
        RAISE EXCEPTION 'Tenant or principal context does not match command'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE master.payment_term
       SET status = 'retired',
           updated_by = v_actor
     WHERE tenant_id = p_tenant_id
       AND id = p_payment_term_id
       AND status = 'active'
    RETURNING * INTO v_term;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active payment term not found'
            USING ERRCODE = 'no_data_found';
    END IF;
    RETURN v_term;
END;
$$;

-- ============================================================================
-- Tax-master identity lifecycle
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_normalize_condition_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := upper(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.default_posting_role_code :=
        nullif(lower(btrim(NEW.default_posting_role_code)), '');
    NEW.applies_to_classes := ARRAY(
        SELECT DISTINCT lower(btrim(v))
          FROM unnest(NEW.applies_to_classes) AS v
         WHERE nullif(btrim(v), '') IS NOT NULL
         ORDER BY 1
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_condition_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.origin = 'platform_seed'
           AND current_user <> (
               SELECT pg_get_userbyid(c.relowner)
                 FROM pg_class AS c
                 JOIN pg_namespace AS n ON n.oid = c.relnamespace
                WHERE n.nspname = TG_TABLE_SCHEMA
                  AND c.relname = TG_TABLE_NAME
           ) THEN
            RAISE EXCEPTION
                'Only tenant provisioning may create platform-seeded condition types'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION
                'Active or retired condition types cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF ROW(
        NEW.id, NEW.tenant_id, NEW.origin,
        NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.tenant_id, OLD.origin,
        OLD.created_at, OLD.created_by
    ) THEN
        RAISE EXCEPTION
            'Condition-type ownership, origin, and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND ROW(
           NEW.code, NEW.term_type, NEW.term_sub_type,
           NEW.default_basis, NEW.default_rate, NEW.default_amount,
           NEW.default_apportion_basis,
           NEW.is_subject_to_tax, NEW.is_apportionable,
           NEW.applies_to_classes,
           NEW.default_cost_effect, NEW.default_posting_pattern,
           NEW.default_distribution_policy,
           NEW.default_capitalization_policy,
           NEW.default_posting_role_code,
           NEW.replaces_condition_type_id
       ) IS DISTINCT FROM ROW(
           OLD.code, OLD.term_type, OLD.term_sub_type,
           OLD.default_basis, OLD.default_rate, OLD.default_amount,
           OLD.default_apportion_basis,
           OLD.is_subject_to_tax, OLD.is_apportionable,
           OLD.applies_to_classes,
           OLD.default_cost_effect, OLD.default_posting_pattern,
           OLD.default_distribution_policy,
           OLD.default_capitalization_policy,
           OLD.default_posting_role_code,
           OLD.replaces_condition_type_id
       ) THEN
        RAISE EXCEPTION
            'Active or retired condition-type semantics are immutable; create a replacement condition type'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (OLD.status = 'active' AND NEW.status NOT IN ('active', 'retired'))
       OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
        RAISE EXCEPTION 'Invalid condition-type lifecycle transition'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;

-- Tenant provisioning calls this after the tenant's provisioning principal
-- exists. The catalog is deliberately copied per tenant: no tenant-null rows
-- or cross-tenant fallback are permitted.
CREATE OR REPLACE FUNCTION master.seed_condition_type_catalog(
    p_tenant_id uuid,
    p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_inserted integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.principal
         WHERE tenant_id = p_tenant_id
           AND id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'Provisioning principal does not belong to tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO master.condition_type (
        tenant_id, code, name, description,
        term_type, term_sub_type,
        default_basis, default_rate, default_amount,
        default_apportion_basis,
        is_subject_to_tax, is_apportionable, applies_to_classes,
        default_cost_effect, default_posting_pattern,
        default_distribution_policy, default_capitalization_policy,
        default_posting_role_code,
        origin, sort_order, metadata, status, created_by
    )
    SELECT
        p_tenant_id,
        v.code, v.name, v.description,
        v.term_type::master.pricing_term_type_d,
        v.term_sub_type::master.pricing_term_sub_type_d,
        v.default_basis::master.pricing_basis_d,
        v.default_rate, v.default_amount,
        v.default_apportion_basis::master.pricing_apportion_basis_d,
        v.is_subject_to_tax, v.is_apportionable, v.applies_to_classes,
        v.default_cost_effect::master.pricing_cost_effect_d,
        v.default_posting_pattern::master.pricing_posting_pattern_d,
        v.default_distribution_policy::master.pricing_distribution_policy_d,
        v.default_capitalization_policy::master.pricing_capitalization_policy_d,
        v.default_posting_role_code,
        'platform_seed', v.sort_order,
        jsonb_build_object(
            '_seed',
            jsonb_build_object(
                'pack', 'condition_type',
                'version', '3.0.0'
            )
        ),
        'active', p_actor_id
    FROM (VALUES
        ('DISC_COMMERCIAL', 'Commercial Discount',
         'Vendor-extended commercial discount applied to the line subtotal.',
         'discount', NULL, 'percent', 0.0::numeric, NULL::numeric, NULL,
         false, true, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'REDUCE_COST', 'INHERIT_LINE_ACCOUNT', 'INHERIT_LINE', 'FOLLOW_LINE', NULL, 10::smallint),
        ('DISC_PROMPT_PAYMENT', 'Prompt Payment Discount',
         'Early-settlement discount governed by the selected payment term.',
         'discount', 'settlement', 'percent', 0.0, NULL, NULL,
         false, true, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'SEPARATE_ACCOUNT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'purchase_discount', 11::smallint),
        ('TAX_GST', 'Goods and Services Tax',
         'GST pricing kind; jurisdictional variants remain in master.tax_type.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'TAX_RECOVERABLE', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'input_tax_recoverable', 20::smallint),
        ('TAX_HST', 'Harmonized Sales Tax',
         'Canadian harmonized sales tax pricing kind.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'TAX_RECOVERABLE', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'input_tax_recoverable', 21::smallint),
        ('TAX_PST', 'Provincial Sales Tax',
         'Canadian provincial sales tax pricing kind.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'ADD_TO_COST', 'INHERIT_LINE_ACCOUNT', 'INHERIT_LINE', 'FOLLOW_LINE', NULL, 22::smallint),
        ('TAX_SALES', 'Sales Tax',
         'General sales-tax pricing kind.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'ADD_TO_COST', 'INHERIT_LINE_ACCOUNT', 'INHERIT_LINE', 'FOLLOW_LINE', NULL, 23::smallint),
        ('TAX_USE', 'Use Tax',
         'Self-assessed use-tax pricing kind.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order'],
         'NO_COST_EFFECT', 'TAX_SELF_ASSESSED', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', NULL, 24::smallint),
        ('TAX_VAT', 'Value Added Tax',
         'VAT pricing kind; jurisdictional variants remain in master.tax_type.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'TAX_RECOVERABLE', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'input_tax_recoverable', 25::smallint),
        ('TAX_SURCHARGE', 'Cess / Surcharge',
         'Surcharge-style levy pricing kind.',
         'tax', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'ADD_TO_COST', 'INHERIT_LINE_ACCOUNT', 'INHERIT_LINE', 'FOLLOW_LINE', NULL, 26::smallint),
        ('WHT_GENERIC', 'Withholding Tax',
         'Withholding pricing kind; jurisdictional variants remain in master.tax_type.',
         'withholding', NULL, 'percent', 0.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice'],
         'NO_COST_EFFECT', 'LIABILITY_SPLIT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'wht_payable', 30::smallint),
        ('CHG_FREIGHT_IN', 'Freight In',
         'Inbound landed-cost transportation charge.',
         'charge', 'landed', 'amount', NULL, 0.0, 'value',
         true, true, ARRAY['purchase_invoice','purchase_order'],
         'ADD_TO_COST', 'INHERIT_LINE_ACCOUNT', 'APPORTION_TO_LINES', 'FOLLOW_LINE', NULL, 40::smallint),
        ('CHG_FREIGHT_OUT', 'Freight Out',
         'Outbound transportation charge.',
         'charge', NULL, 'amount', NULL, 0.0, 'value',
         true, true, ARRAY['sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'SEPARATE_ACCOUNT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', NULL, 41::smallint),
        ('CHG_INSURANCE_TRANSIT', 'Transit Insurance',
         'Insurance charge for goods in transit.',
         'charge', NULL, 'amount', NULL, 0.0, 'value',
         false, true, ARRAY['purchase_invoice','purchase_order'],
         'NO_COST_EFFECT', 'SEPARATE_ACCOUNT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', NULL, 42::smallint),
        ('CHG_PACKING', 'Packing Charge',
         'Packing and handling charge.',
         'charge', NULL, 'amount', NULL, 0.0, 'value',
         true, true, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'SEPARATE_ACCOUNT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', NULL, 43::smallint),
        ('CHG_CUSTOMS_DUTY', 'Customs Duty',
         'Import customs duty treated as landed cost.',
         'charge', 'landed', 'percent', 0.0, NULL, 'value',
         true, true, ARRAY['purchase_invoice','purchase_order'],
         'ADD_TO_COST', 'INHERIT_LINE_ACCOUNT', 'INHERIT_LINE', 'FOLLOW_LINE', NULL, 44::smallint),
        ('CHG_MISC', 'Miscellaneous Charge',
         'Generic miscellaneous charge.',
         'charge', NULL, 'amount', NULL, 0.0, 'value',
         true, true, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'SEPARATE_ACCOUNT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', NULL, 49::smallint),
        ('RET_WARRANTY', 'Warranty Retention',
         'Retention held until warranty obligations are satisfied.',
         'retention', 'warranty', 'percent', 5.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order'],
         'NO_COST_EFFECT', 'LIABILITY_SPLIT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'ap_retention_payable', 50::smallint),
        ('RET_PERFORMANCE', 'Performance Retention',
         'Retention released after performance obligations are satisfied.',
         'retention', 'performance', 'percent', 10.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order'],
         'NO_COST_EFFECT', 'LIABILITY_SPLIT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'ap_retention_payable', 51::smallint),
        ('RET_COMPLETION', 'Completion Retention',
         'Retention released after completion sign-off.',
         'retention', 'completion', 'percent', 5.0, NULL, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order'],
         'NO_COST_EFFECT', 'LIABILITY_SPLIT', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', 'ap_retention_payable', 52::smallint),
        ('PRINCIPAL_MARKER', 'Principal Line Marker',
         'Audit-only marker for the principal line amount.',
         'principal_marker', NULL, 'amount', NULL, 0.0, NULL,
         false, false, ARRAY['purchase_invoice','purchase_order','sales_invoice','sales_order'],
         'NO_COST_EFFECT', 'MEMO_ONLY', 'NO_COST_DISTRIBUTION', 'NEVER_CAPITALIZE', NULL, 0::smallint)
    ) AS v(
        code, name, description, term_type, term_sub_type,
        default_basis, default_rate, default_amount,
        default_apportion_basis,
        is_subject_to_tax, is_apportionable, applies_to_classes,
        default_cost_effect, default_posting_pattern,
        default_distribution_policy, default_capitalization_policy,
        default_posting_role_code, sort_order
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION master.seed_condition_type_catalog(uuid, uuid) IS
  'Idempotently copies the platform pricing-condition catalog into one tenant after its provisioning principal exists. Intended for tenant onboarding, not request-time use.';

CREATE OR REPLACE FUNCTION master.trg_normalize_tax_jurisdiction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := upper(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.country_code :=
        nullif(upper(btrim(NEW.country_code::text)), '')::character(2);
    NEW.state_region_code :=
        nullif(upper(btrim(NEW.state_region_code)), '');
    NEW.authority_name := nullif(btrim(NEW.authority_name), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_tax_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := upper(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tax_jurisdiction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION
                'Active or retired tax jurisdictions cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF ROW(NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION
            'Tax-jurisdiction ownership and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.status <> 'draft'
       AND ROW(
           NEW.code, NEW.jurisdiction_type,
           NEW.country_code, NEW.state_region_code
       ) IS DISTINCT FROM ROW(
           OLD.code, OLD.jurisdiction_type,
           OLD.country_code, OLD.state_region_code
       ) THEN
        RAISE EXCEPTION
            'Active or retired tax-jurisdiction identity is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF (OLD.status = 'active' AND NEW.status NOT IN ('active', 'retired'))
       OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
        RAISE EXCEPTION 'Invalid tax-jurisdiction lifecycle transition'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tax_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION
                'Active or retired tax types cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF ROW(NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION
            'Tax-type ownership and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.status <> 'draft'
       AND ROW(
           NEW.code, NEW.tax_class, NEW.section_code_mode,
           NEW.condition_type_id
       )
           IS DISTINCT FROM
           ROW(
               OLD.code, OLD.tax_class, OLD.section_code_mode,
               OLD.condition_type_id
           ) THEN
        RAISE EXCEPTION
            'Active or retired tax-type classification is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF (OLD.status = 'active' AND NEW.status NOT IN ('active', 'retired'))
       OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
        RAISE EXCEPTION 'Invalid tax-type lifecycle transition'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;

-- Canonical business-partner and commercial-role guards.
CREATE OR REPLACE FUNCTION master.trg_normalize_counterparty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF TG_TABLE_NAME = 'business_partner' THEN
        NEW.code := upper(btrim(NEW.code));
        NEW.name := btrim(NEW.name);
        NEW.display_name := nullif(btrim(NEW.display_name), '');
        NEW.legal_name := nullif(btrim(NEW.legal_name), '');
        NEW.legal_form := nullif(btrim(NEW.legal_form), '');
        NEW.registration_country_code :=
            nullif(upper(btrim(NEW.registration_country_code::text)), '')::character(2);
        NEW.website_url := nullif(btrim(NEW.website_url), '');
        NEW.description := nullif(btrim(NEW.description), '');
    ELSIF TG_TABLE_NAME = 'supplier' THEN
        NEW.supplier_code := upper(btrim(NEW.supplier_code));
        NEW.supplier_type :=
            lower(btrim(NEW.supplier_type::text))::master.supplier_type_d;
    ELSIF TG_TABLE_NAME = 'customer' THEN
        NEW.customer_code := upper(btrim(NEW.customer_code));
        NEW.customer_type :=
            lower(btrim(NEW.customer_type::text))::master.customer_type_d;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_counterparty_catalog()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_domain text;
    v_code text;
BEGIN
    IF TG_TABLE_NAME = 'business_partner' THEN
        IF NEW.legal_form IS NULL THEN RETURN NEW; END IF;
        NEW.legal_form := CASE lower(btrim(NEW.legal_form))
            WHEN 'private_limited_company' THEN 'private_limited'
            ELSE lower(btrim(NEW.legal_form)) END;
        v_domain := 'master.legal_form'; v_code := NEW.legal_form;
    ELSIF TG_TABLE_NAME = 'supplier' THEN
        v_domain := 'master.supplier_type'; v_code := NEW.supplier_type::text;
    ELSIF TG_TABLE_NAME = 'customer' THEN
        v_domain := 'master.customer_type'; v_code := NEW.customer_type::text;
    ELSE
        IF NEW.statement_cycle_code IS NULL THEN RETURN NEW; END IF;
        NEW.statement_cycle_code := lower(btrim(NEW.statement_cycle_code));
        v_domain := 'master.statement_cycle'; v_code := NEW.statement_cycle_code;
    END IF;
    IF NOT control.lookup_value_is_active(v_domain, v_code, NEW.tenant_id) THEN
        RAISE EXCEPTION 'Unknown or inactive lookup value %/%', v_domain, v_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_business_partner_alias_cache()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
    IF NEW.aliases IS DISTINCT FROM OLD.aliases AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'business_partner.aliases is a derived cache; write master.business_partner_alias'
            USING ERRCODE='generated_always';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_refresh_business_partner_alias_cache()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);v_partner uuid:=COALESCE(NEW.business_partner_id,OLD.business_partner_id);
BEGIN
    UPDATE master.business_partner bp SET aliases=COALESCE((
      SELECT array_agg(a.alias_name ORDER BY a.is_primary DESC,a.alias_name)
      FROM master.business_partner_alias a WHERE a.tenant_id=v_tenant AND a.business_partner_id=v_partner
       AND a.status='active' AND a.effective_from<=CURRENT_DATE AND(a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)
    ),'{}'::text[]) WHERE bp.tenant_id=v_tenant AND bp.id=v_partner;
    RETURN COALESCE(NEW,OLD);
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_partner_relationship_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.status <> 'active' OR NEW.relationship_type_code <> 'parent' THEN
        RETURN NEW;
    END IF;
    IF EXISTS (
        WITH RECURSIVE ancestors(id) AS (
            SELECT NEW.target_business_partner_id
            UNION
            SELECT relation.target_business_partner_id
              FROM master.business_partner_relationship relation
              JOIN ancestors ON ancestors.id = relation.source_business_partner_id
             WHERE relation.tenant_id = NEW.tenant_id
               AND relation.relationship_type_code = 'parent'
               AND relation.status = 'active'
               AND relation.id IS DISTINCT FROM NEW.id
        ) SELECT 1 FROM ancestors WHERE id = NEW.source_business_partner_id
    ) THEN
        RAISE EXCEPTION 'Business Partner parent relationship would create a cycle'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_partner_profile_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.status = 'active' THEN
        IF NOT EXISTS (SELECT 1 FROM master.company_code c WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.company_code_id AND c.is_active) THEN
            RAISE EXCEPTION 'Company code must be active' USING ERRCODE='foreign_key_violation';
        END IF;
        IF NEW.payment_term_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.payment_term p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.payment_term_id AND p.is_active) THEN
            RAISE EXCEPTION 'Payment term must be active' USING ERRCODE='foreign_key_violation';
        END IF;
        IF NEW.default_accounting_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.accounting_profile p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.default_accounting_profile_id AND p.is_active) THEN
            RAISE EXCEPTION 'Accounting profile must be active' USING ERRCODE='foreign_key_violation';
        END IF;
        -- Branch before resolving Supplier-only fields: Customer profile records
        -- do not contain preferred_remittance_bank_link_id.
        IF TG_TABLE_NAME = 'company_code_supplier_profile' THEN
            IF NEW.preferred_remittance_bank_link_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM master.bank_account_link l WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.preferred_remittance_bank_link_id AND (l.company_code_id IS NULL OR l.company_code_id=NEW.company_code_id) AND l.effective_from<=CURRENT_DATE AND (l.effective_until IS NULL OR l.effective_until>CURRENT_DATE)) THEN
                RAISE EXCEPTION 'Remittance bank link must be effective for the company' USING ERRCODE='foreign_key_violation';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_counterparty_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_old_status text;
    v_new_status text;
    v_valid boolean := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF (TG_TABLE_NAME = 'business_partner' AND OLD.status <> 'draft')
           OR (TG_TABLE_NAME = 'supplier' AND OLD.status <> 'onboarding')
           OR (TG_TABLE_NAME = 'customer' AND OLD.status <> 'prospect') THEN
            RAISE EXCEPTION
                'Only pre-activation %.% rows may be deleted',
                TG_TABLE_SCHEMA, TG_TABLE_NAME
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION '%.% ownership identity is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner' THEN
        IF NEW.code IS DISTINCT FROM OLD.code
           OR NEW.partner_category IS DISTINCT FROM OLD.partner_category
           OR NEW.ownership_class IS DISTINCT FROM OLD.ownership_class
           OR NEW.category_locked_at IS DISTINCT FROM OLD.category_locked_at
           OR NEW.category_locked_by IS DISTINCT FROM OLD.category_locked_by
           OR NEW.canonical_party_id IS DISTINCT FROM OLD.canonical_party_id
              AND OLD.status <> 'draft'
           OR NEW.representation_purpose_code IS DISTINCT FROM OLD.representation_purpose_code THEN
            RAISE EXCEPTION
                'Business-partner structural identity is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.record_version := OLD.record_version + 1;
    ELSIF TG_TABLE_NAME = 'supplier' THEN
        IF NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
           OR NEW.supplier_code IS DISTINCT FROM OLD.supplier_code THEN
            RAISE EXCEPTION
                'Supplier business-partner binding and code are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'customer' THEN
        IF NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
           OR NEW.customer_code IS DISTINCT FROM OLD.customer_code THEN
            RAISE EXCEPTION
                'Customer business-partner binding and code are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    v_old_status := OLD.status::text;
    v_new_status := NEW.status::text;
    IF v_new_status = v_old_status THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'business_partner' THEN
        v_valid :=
            (v_old_status = 'draft' AND v_new_status IN ('active', 'archived'))
            OR (v_old_status = 'active' AND v_new_status IN ('inactive', 'archived'))
            OR (v_old_status = 'inactive' AND v_new_status IN ('active', 'archived'));
    ELSIF TG_TABLE_NAME = 'supplier' THEN
        v_valid :=
            (v_old_status = 'onboarding' AND v_new_status IN ('active', 'inactive', 'archived'))
            OR (v_old_status = 'active' AND v_new_status IN ('suspended', 'inactive', 'archived'))
            OR (v_old_status = 'suspended' AND v_new_status IN ('active', 'inactive', 'archived'))
            OR (v_old_status = 'inactive' AND v_new_status IN ('active', 'archived'));
    ELSIF TG_TABLE_NAME = 'customer' THEN
        v_valid :=
            (v_old_status = 'prospect' AND v_new_status IN ('active', 'inactive', 'archived'))
            OR (v_old_status = 'active' AND v_new_status IN ('suspended', 'inactive', 'archived'))
            OR (v_old_status = 'suspended' AND v_new_status IN ('active', 'inactive', 'archived'))
            OR (v_old_status = 'inactive' AND v_new_status IN ('active', 'archived'));
    END IF;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid %.% status transition: % -> %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_old_status, v_new_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_business_partner_relationship_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Business Partner relationships are archived, not deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.source_business_partner_id IS DISTINCT FROM OLD.source_business_partner_id
       OR NEW.target_business_partner_id IS DISTINCT FROM OLD.target_business_partner_id
       OR NEW.relationship_type_code IS DISTINCT FROM OLD.relationship_type_code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Business Partner relationship identity and provenance are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    NEW.record_version := OLD.record_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_bump_business_partner_record_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.record_version := OLD.record_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_customer_lifecycle_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_event_id uuid;
    v_event control.customer_lifecycle_event%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status::text <> 'prospect'
           OR NEW.status_changed_at IS NOT NULL
           OR NEW.status_changed_by IS NOT NULL THEN
            RAISE EXCEPTION 'New Customer roles must start as evidence-free prospects'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        IF NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at
           OR NEW.status_changed_by IS DISTINCT FROM OLD.status_changed_by THEN
            RAISE EXCEPTION 'Customer lifecycle evidence is command-owned'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    END IF;

    BEGIN
        v_event_id := NULLIF(
            current_setting('app.customer_lifecycle_event_id', true), ''
        )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_event_id := NULL;
    END;
    IF v_event_id IS NULL THEN
        RAISE EXCEPTION 'Customer status may only change through control.command_customer_lifecycle'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT event.* INTO v_event
      FROM control.customer_lifecycle_event event
     WHERE event.id = v_event_id
       AND event.tenant_id = OLD.tenant_id
       AND event.customer_id = OLD.id;
    IF NOT FOUND
       OR v_event.business_partner_id IS DISTINCT FROM OLD.business_partner_id
       OR v_event.from_status IS DISTINCT FROM OLD.status::text
       OR v_event.to_status IS DISTINCT FROM NEW.status::text
       OR v_event.occurred_by IS DISTINCT FROM NEW.updated_by THEN
        RAISE EXCEPTION 'Customer status change does not match its lifecycle command evidence'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_commercial_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_ownership master.business_partner_ownership_d;
    v_partner_status master.business_partner_status_d;
    v_is_intercompany boolean;
BEGIN
    SELECT partner.ownership_class, partner.status
      INTO v_ownership, v_partner_status
      FROM master.business_partner AS partner
     WHERE partner.tenant_id = NEW.tenant_id
       AND partner.id = NEW.business_partner_id;

    IF v_ownership IS NULL THEN
        RAISE EXCEPTION 'Business partner does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_partner_status = 'archived' THEN
        RAISE EXCEPTION 'Archived business partner cannot receive a new or changed role'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    v_is_intercompany :=
        CASE TG_TABLE_NAME
            WHEN 'supplier' THEN
                to_jsonb(NEW) ->> 'supplier_type' = 'intercompany'
            WHEN 'customer' THEN
                to_jsonb(NEW) ->> 'customer_type' = 'intercompany'
            ELSE false
        END;

    IF (v_ownership = 'internal') IS DISTINCT FROM v_is_intercompany THEN
        RAISE EXCEPTION
            'Internal business partners require an intercompany % role, and intercompany roles require an internal business partner',
            TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- Neon fixed-asset guards.
CREATE OR REPLACE FUNCTION master.trg_validate_asset_book()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_asset_company_id uuid;
    v_asset_nature master.asset_nature_d;
    v_book_currency character(3);
BEGIN
    SELECT asset.company_code_id, class.asset_nature
      INTO v_asset_company_id, v_asset_nature
      FROM master.asset AS asset
      JOIN master.asset_class AS class
        ON class.tenant_id = asset.tenant_id
       AND class.id = asset.asset_class_id
     WHERE asset.tenant_id = NEW.tenant_id
       AND asset.id = NEW.asset_id;

    IF v_asset_company_id IS NULL THEN
        RAISE EXCEPTION 'Asset does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_asset_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION 'Asset book company must match the owning asset company'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(assignment.override_currency_code, book.base_currency_code)
      INTO v_book_currency
      FROM master.company_code_book_assignment AS assignment
      JOIN master.ledger_book AS book
        ON book.tenant_id = assignment.tenant_id
       AND book.id = assignment.book_id
     WHERE assignment.tenant_id = NEW.tenant_id
       AND assignment.company_code_id = NEW.company_code_id
       AND assignment.book_id = NEW.ledger_book_id
       AND assignment.status = 'active'
       AND assignment.effective_from <= CURRENT_DATE
       AND (
           assignment.effective_to IS NULL
           OR assignment.effective_to >= CURRENT_DATE
       )
     ORDER BY assignment.priority DESC, assignment.effective_from DESC
     LIMIT 1;

    IF v_book_currency IS NULL THEN
        RAISE EXCEPTION
            'Ledger book is not actively assigned to the asset company'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_book_currency <> NEW.currency_code THEN
        RAISE EXCEPTION
            'Asset book currency % must equal assigned ledger-book currency %',
            NEW.currency_code, v_book_currency
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_asset_nature IN ('land', 'cwip')
       AND NEW.depreciation_method <> 'no_depreciation' THEN
        RAISE EXCEPTION
            'Land and CWIP asset books must use no_depreciation'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_asset_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_company_id uuid;
    v_component_company_id uuid;
    v_cycle boolean;
    v_allocated numeric(9,4);
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            NEW.tenant_id::text || ':' || NEW.parent_asset_id::text,
            0
        )
    );

    SELECT company_code_id
      INTO v_parent_company_id
      FROM master.asset
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.parent_asset_id;
    SELECT company_code_id
      INTO v_component_company_id
      FROM master.asset
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.component_asset_id;

    IF v_parent_company_id IS NULL OR v_component_company_id IS NULL THEN
        RAISE EXCEPTION 'Parent and component assets must exist in the tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent_company_id <> v_component_company_id THEN
        RAISE EXCEPTION 'Parent and component assets must belong to the same company'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'active' THEN
        WITH RECURSIVE descendants AS (
            SELECT component_asset_id
              FROM master.asset_component
             WHERE tenant_id = NEW.tenant_id
               AND parent_asset_id = NEW.component_asset_id
               AND status = 'active'
               AND id <> NEW.id
            UNION
            SELECT relation.component_asset_id
              FROM master.asset_component AS relation
              JOIN descendants
                ON relation.parent_asset_id = descendants.component_asset_id
             WHERE relation.tenant_id = NEW.tenant_id
               AND relation.status = 'active'
               AND relation.id <> NEW.id
        )
        SELECT EXISTS (
            SELECT 1
              FROM descendants
             WHERE component_asset_id = NEW.parent_asset_id
        )
          INTO v_cycle;

        IF v_cycle THEN
            RAISE EXCEPTION 'Asset component hierarchy cycle detected'
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT COALESCE(sum(allocation_percentage), 0)
          INTO v_allocated
          FROM master.asset_component
         WHERE tenant_id = NEW.tenant_id
           AND parent_asset_id = NEW.parent_asset_id
           AND status = 'active'
           AND id <> NEW.id;

        v_allocated := v_allocated + COALESCE(NEW.allocation_percentage, 0);
        IF v_allocated > 100 THEN
            RAISE EXCEPTION
                'Active component allocation for parent asset exceeds 100%%'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_prevent_asset_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION
        'master.asset_assignment_history is append-only'
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_set_asset_assignment_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_user = 'athyperapp' THEN
        NEW.assigned_by := NEW.created_by;
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION master.trg_bi_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'master', 'pg_temp'
AS $$
DECLARE
    v_parent_tenant uuid;
    v_parent_domain text;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT tenant_id, domain
      INTO v_parent_tenant, v_parent_domain
      FROM master.business_intent
     WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent business_intent % not found.', NEW.parent_id;
    END IF;
    IF v_parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION
            'Cross-tenant hierarchy not allowed: parent tenant=%, child tenant=%.',
            v_parent_tenant, NEW.tenant_id;
    END IF;
    IF v_parent_domain IS DISTINCT FROM NEW.domain THEN
        RAISE EXCEPTION
            'Domain mismatch: child domain "%" must match parent domain "%".',
            NEW.domain, v_parent_domain;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_bi_parent_guard() IS
    'Validates same-tenant and same-domain parentage in the Neon business-intent hierarchy.';

CREATE OR REPLACE FUNCTION master.trg_validate_partner_lookup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_domain text;
    v_code text;
BEGIN
    IF TG_TABLE_NAME = 'business_partner_relationship' THEN
        NEW.relationship_type_code := lower(btrim(NEW.relationship_type_code));
        v_domain := 'master.business_partner_relationship_type';
        v_code := NEW.relationship_type_code;
    ELSIF TG_TABLE_NAME = 'business_partner_governance_relation' THEN
        NEW.relation_type_code := lower(btrim(NEW.relation_type_code));
        v_domain := 'master.business_partner_governance_role';
        v_code := NEW.relation_type_code;
    ELSIF TG_TABLE_NAME = 'business_partner_identifier' THEN
        NEW.scheme_code := lower(btrim(NEW.scheme_code));
        NEW.identifier_value := upper(regexp_replace(
            btrim(NEW.identifier_value), '\s+', '', 'g'
        ));
        v_domain := 'master.business_partner_identifier_scheme';
        v_code := NEW.scheme_code;
    ELSE
        NEW.registration_type_code := lower(btrim(NEW.registration_type_code));
        NEW.registration_number := upper(regexp_replace(
            btrim(NEW.registration_number), '\s+', '', 'g'
        ));
        v_domain := 'master.business_partner_tax_registration_type';
        v_code := NEW.registration_type_code;
    END IF;

    IF NOT control.lookup_value_is_active(v_domain, v_code, NEW.tenant_id) THEN
        RAISE EXCEPTION 'Unknown or inactive lookup value %/%', v_domain, v_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_partner_extension_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_new jsonb := to_jsonb(NEW);
    v_old jsonb := to_jsonb(OLD);
    v_key text;
BEGIN
    FOREACH v_key IN ARRAY ARRAY[
        'id', 'tenant_id', 'business_partner_id',
        'source_business_partner_id', 'target_business_partner_id',
        'supplier_id', 'customer_id', 'company_code_id',
        'legal_entity_id', 'source_company_code_id',
        'counterparty_company_code_id', 'contact_person_id', 'person_id'
    ] LOOP
        IF v_new ? v_key AND (v_new -> v_key) IS DISTINCT FROM (v_old -> v_key) THEN
            RAISE EXCEPTION '%.% identity coordinate % is immutable',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, v_key
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    IF v_new ? 'created_at'
       AND ((v_new -> 'created_at') IS DISTINCT FROM (v_old -> 'created_at')
            OR (v_new -> 'created_by') IS DISTINCT FROM (v_old -> 'created_by')) THEN
        RAISE EXCEPTION '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_business_partner_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_partner_id uuid;
    v_role master.partner_role_d;
    v_domain master.operating_organization_domain_d;
BEGIN
    v_partner_id := NEW.business_partner_id;
    v_role := NEW.partner_role;

    IF v_role = 'supplier' AND NOT EXISTS (
        SELECT 1 FROM master.supplier
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = v_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no supplier role', v_partner_id
            USING ERRCODE = 'check_violation';
    ELSIF v_role = 'customer' AND NOT EXISTS (
        SELECT 1 FROM master.customer
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = v_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no customer role', v_partner_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner_operating_organization_assignment' THEN
        SELECT domain INTO v_domain
          FROM master.operating_organization
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.operating_organization_id;
        IF (v_role = 'supplier' AND v_domain NOT IN ('procurement', 'both'))
           OR (v_role = 'customer' AND v_domain NOT IN ('sales', 'both')) THEN
            RAISE EXCEPTION 'Partner role % is incompatible with organization domain %',
                v_role, v_domain
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_legal_entity_partner_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_ownership master.business_partner_ownership_d;
BEGIN
    SELECT ownership_class INTO v_ownership
      FROM master.business_partner
     WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;
    IF v_ownership IS DISTINCT FROM 'internal'::master.business_partner_ownership_d THEN
        RAISE EXCEPTION 'Legal entity self mapping requires an internal business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_reject_person_business_partner_legacy_link_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'Legacy Person-to-Business-Partner evidence is immutable'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_supplier_remittance_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_partner_id uuid;
    v_owner_id uuid;
    v_owner_type text;
    v_company_id uuid;
    v_account_status master.bank_account_status_d;
BEGIN
    IF NEW.preferred_remittance_bank_link_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT business_partner_id INTO v_partner_id
      FROM master.supplier
     WHERE tenant_id = NEW.tenant_id AND id = NEW.supplier_id;
    SELECT link.owner_id, link.owner_type, link.company_code_id, account.status
      INTO v_owner_id, v_owner_type, v_company_id, v_account_status
      FROM master.bank_account_link link
      JOIN master.bank_account account
        ON account.tenant_id = link.tenant_id
       AND account.id = link.bank_account_id
     WHERE link.tenant_id = NEW.tenant_id
       AND link.id = NEW.preferred_remittance_bank_link_id
       AND link.relationship_role = 'beneficiary';
    IF NOT FOUND OR v_account_status <> 'active'
       OR v_owner_type <> 'business_partner'
       OR v_owner_id <> v_partner_id
       OR (v_company_id IS NOT NULL AND v_company_id <> NEW.company_code_id) THEN
        RAISE EXCEPTION 'Preferred remittance link is not an active compatible supplier-beneficiary account'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_intercompany_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.counterparty_supplier_profile_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.company_code_supplier_profile profile
            WHERE profile.tenant_id = NEW.tenant_id
              AND profile.id = NEW.counterparty_supplier_profile_id
              AND profile.company_code_id = NEW.source_company_code_id
       ) THEN
        RAISE EXCEPTION 'Counterparty supplier profile must belong to source company'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.mirror_customer_profile_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.company_code_customer_profile profile
            WHERE profile.tenant_id = NEW.tenant_id
              AND profile.id = NEW.mirror_customer_profile_id
              AND profile.company_code_id = NEW.counterparty_company_code_id
       ) THEN
        RAISE EXCEPTION 'Mirror customer profile must belong to counterparty company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_set_site_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_company uuid;
    v_parent_level   smallint;
    v_cycle          boolean;
BEGIN
    IF NEW.parent_site_id IS NULL THEN
        NEW.level_no := 1;
        RETURN NEW;
    END IF;

    SELECT s.company_code_id, s.level_no
      INTO v_parent_company, v_parent_level
      FROM master.site s
     WHERE s.tenant_id = NEW.tenant_id
       AND s.id = NEW.parent_site_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent site % does not exist in tenant %',
            NEW.parent_site_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent_company <> NEW.company_code_id THEN
        RAISE EXCEPTION 'Parent and child sites must belong to the same company code'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    WITH RECURSIVE ancestors AS (
        SELECT s.id, s.parent_site_id
          FROM master.site s
         WHERE s.tenant_id = NEW.tenant_id
           AND s.id = NEW.parent_site_id
        UNION ALL
        SELECT p.id, p.parent_site_id
          FROM master.site p
          JOIN ancestors a ON p.id = a.parent_site_id
         WHERE p.tenant_id = NEW.tenant_id
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
      INTO v_cycle;

    IF v_cycle THEN
        RAISE EXCEPTION 'Site hierarchy cycle detected for site %', NEW.id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    NEW.level_no := v_parent_level + 1;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_set_site_hierarchy() IS
  'Derives site level and rejects cross-company parents and hierarchy cycles.';

CREATE OR REPLACE FUNCTION master.trg_validate_work_assignment_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_employee_id uuid;
    v_company_id  uuid;
BEGIN
    IF NEW.employment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT e.employee_id, e.company_code_id
      INTO v_employee_id, v_company_id
      FROM master.employment e
     WHERE e.tenant_id = NEW.tenant_id
       AND e.id = NEW.employment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employment % does not exist in tenant %',
            NEW.employment_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_employee_id IS NOT NULL AND v_employee_id <> NEW.employee_id THEN
        RAISE EXCEPTION 'Work assignment employee does not match employment employee'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION 'Work assignment company does not match employment company'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_work_assignment_contract() IS
  'Requires an assignment employment, employee, and company code to describe the same workforce contract.';

CREATE OR REPLACE FUNCTION master.trg_validate_employment_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code company
         WHERE company.tenant_id = NEW.tenant_id
           AND company.id = NEW.company_code_id
           AND company.legal_entity_id = NEW.legal_entity_id
    ) THEN
        RAISE EXCEPTION 'Employment company code does not belong to its legal entity'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.employee_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.employee employee
         WHERE employee.tenant_id = NEW.tenant_id
           AND employee.id = NEW.employee_id
           AND employee.person_id = NEW.person_id
    ) THEN
        RAISE EXCEPTION 'Employment employee does not belong to its person'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_employment_contract() IS
  'Requires employment person, optional employee, legal entity, and company code to resolve to one tenant-local workforce contract.';

CREATE OR REPLACE FUNCTION master.trg_guard_warehouse_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.site_id IS DISTINCT FROM OLD.site_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'warehouse tenant, site and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    IF OLD.status = 'active' AND NEW.status <> 'active' AND (
        EXISTS (
            SELECT 1 FROM ledger.inventory_balance
             WHERE tenant_id = OLD.tenant_id AND warehouse_id = OLD.id
               AND quantity_on_hand <> 0
        )
        OR EXISTS (
            SELECT 1 FROM ledger.inventory_valuation_layer
             WHERE tenant_id = OLD.tenant_id AND warehouse_id = OLD.id
               AND remaining_quantity > 0
        )
    ) THEN
        RAISE EXCEPTION 'warehouse with on-hand stock or open valuation layers cannot be deactivated'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_warehouse_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
BEGIN
    IF NOT control.lookup_value_is_active(
        'master.warehouse_type',
        NEW.warehouse_type,
        NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'unknown or inactive warehouse type %', NEW.warehouse_type
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_risk_subject_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_business_partner_id uuid;
BEGIN
    IF NEW.subject_type = 'business_partner' THEN
        IF NEW.subject_id IS DISTINCT FROM NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject business_partner requires subject_id = business_partner_id'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSIF NEW.subject_type = 'supplier' THEN
        SELECT business_partner_id
          INTO v_business_partner_id
          FROM master.supplier
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.subject_id;
        IF NOT FOUND OR v_business_partner_id IS DISTINCT FROM NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject supplier % is missing or belongs to another business partner',
                NEW.subject_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSIF NEW.subject_type = 'customer' THEN
        SELECT business_partner_id
          INTO v_business_partner_id
          FROM master.customer
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.subject_id;
        IF NOT FOUND OR v_business_partner_id IS DISTINCT FROM NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject customer % is missing or belongs to another business partner',
                NEW.subject_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_risk_subject_binding() IS
  'Validates business-partner, supplier, and customer polymorphic subject bindings. Project engagement resolution remains capability-owned until its canonical aggregate is extracted.';

CREATE OR REPLACE FUNCTION master.trg_risk_model_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_weight numeric;
BEGIN
    IF OLD.status = 'active'
       AND (
           OLD.code IS DISTINCT FROM NEW.code
           OR OLD.version IS DISTINCT FROM NEW.version
           OR OLD.name IS DISTINCT FROM NEW.name
           OR OLD.description IS DISTINCT FROM NEW.description
           OR OLD.applicable_context IS DISTINCT FROM NEW.applicable_context
           OR OLD.scoring_algorithm IS DISTINCT FROM NEW.scoring_algorithm
           OR OLD.risk_band_thresholds IS DISTINCT FROM NEW.risk_band_thresholds
           OR OLD.config IS DISTINCT FROM NEW.config
           OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       ) THEN
        RAISE EXCEPTION
            'active risk model %.% is immutable; publish a new version',
            OLD.code, OLD.version
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status <> 'active' AND NEW.status = 'active' THEN
        SELECT COALESCE(sum(weight), 0)
          INTO v_weight
          FROM master.risk_model_dimension
         WHERE model_code = NEW.code
           AND model_version = NEW.version;
        IF v_weight <> 1.0000 THEN
            RAISE EXCEPTION
                'risk model %.% cannot be activated: weights total %, expected 1.0000',
                NEW.code, NEW.version, v_weight
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_risk_model_weight_sum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_model_code text := COALESCE(NEW.model_code, OLD.model_code);
    v_model_version text := COALESCE(NEW.model_version, OLD.model_version);
    v_status text;
    v_weight numeric;
BEGIN
    SELECT status
      INTO v_status
      FROM master.risk_model
     WHERE code = v_model_code
       AND version = v_model_version;

    IF NOT FOUND OR v_status <> 'active' THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(sum(weight), 0)
      INTO v_weight
      FROM master.risk_model_dimension
     WHERE model_code = v_model_code
       AND model_version = v_model_version;

    IF v_weight <> 1.0000 THEN
        RAISE EXCEPTION
            'active risk model %.% dimension weights must total 1.0000; found %',
            v_model_code, v_model_version, v_weight
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_risk_model_dimension_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    SELECT status
      INTO v_status
      FROM master.risk_model
     WHERE code = OLD.model_code
       AND version = OLD.model_version;

    IF v_status = 'active' THEN
        RAISE EXCEPTION
            'dimensions of active risk model %.% are immutable',
            OLD.model_code, OLD.model_version
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_assessment_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF OLD.status = 'approved' AND (
        OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
        OR OLD.subject_type IS DISTINCT FROM NEW.subject_type
        OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
        OR OLD.business_partner_id IS DISTINCT FROM NEW.business_partner_id
        OR OLD.assessment_context IS DISTINCT FROM NEW.assessment_context
        OR OLD.model_code IS DISTINCT FROM NEW.model_code
        OR OLD.model_version IS DISTINCT FROM NEW.model_version
        OR OLD.overall_score IS DISTINCT FROM NEW.overall_score
    ) THEN
        RAISE EXCEPTION
            'approved party risk assessment is structurally immutable; supersede it'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status = 'approved'
       AND OLD.risk_band IS DISTINCT FROM NEW.risk_band
       AND (
           NOT NEW.is_override
           OR NEW.override_reason IS NULL
           OR NEW.override_score IS NULL
       ) THEN
        RAISE EXCEPTION
            'changing an approved risk band requires override reason and score'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_evidence_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF (
        OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
        OR OLD.subject_type IS DISTINCT FROM NEW.subject_type
        OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
        OR OLD.business_partner_id IS DISTINCT FROM NEW.business_partner_id
        OR OLD.source_code IS DISTINCT FROM NEW.source_code
        OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
        OR OLD.evidence_type IS DISTINCT FROM NEW.evidence_type
        OR OLD.evidence_date IS DISTINCT FROM NEW.evidence_date
        OR OLD.received_at IS DISTINCT FROM NEW.received_at
        OR OLD.valid_from IS DISTINCT FROM NEW.valid_from
        OR OLD.ingested_by IS DISTINCT FROM NEW.ingested_by
        OR OLD.ingested_via IS DISTINCT FROM NEW.ingested_via
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR OLD.created_by IS DISTINCT FROM NEW.created_by
    ) THEN
        RAISE EXCEPTION
            'party risk evidence identity and source fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.raw_payload IS NOT NULL
       AND OLD.raw_payload IS DISTINCT FROM NEW.raw_payload THEN
        RAISE EXCEPTION
            'party risk evidence raw_payload is immutable once written'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_driver_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_score_assessment_id uuid;
    v_score_dimension_code text;
    v_assessment_business_partner_id uuid;
    v_evidence_business_partner_id uuid;
BEGIN
    IF NEW.dimension_score_id IS NOT NULL THEN
        SELECT assessment_id, dimension_code
          INTO v_score_assessment_id, v_score_dimension_code
          FROM master.party_risk_dimension_score
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.dimension_score_id;

        IF NOT FOUND
           OR v_score_assessment_id IS DISTINCT FROM NEW.assessment_id
           OR v_score_dimension_code IS DISTINCT FROM NEW.dimension_code THEN
            RAISE EXCEPTION
                'risk driver dimension score does not match its assessment and dimension'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.evidence_id IS NOT NULL THEN
        SELECT business_partner_id
          INTO v_assessment_business_partner_id
          FROM master.party_risk_assessment
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.assessment_id;

        SELECT business_partner_id
          INTO v_evidence_business_partner_id
          FROM master.party_risk_evidence
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.evidence_id;

        IF v_evidence_business_partner_id IS DISTINCT FROM
           v_assessment_business_partner_id THEN
            RAISE EXCEPTION
                'risk driver evidence belongs to another business partner'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_mitigation_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_assessment_business_partner_id uuid;
    v_driver_assessment_id uuid;
BEGIN
    IF NEW.assessment_id IS NOT NULL THEN
        SELECT business_partner_id
          INTO v_assessment_business_partner_id
          FROM master.party_risk_assessment
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.assessment_id;
        IF v_assessment_business_partner_id IS DISTINCT FROM
           NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk mitigation assessment belongs to another business partner'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
        SELECT assessment_id
          INTO v_driver_assessment_id
          FROM master.party_risk_driver
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.driver_id;
        IF NOT FOUND
           OR (
               NEW.assessment_id IS NOT NULL
               AND v_driver_assessment_id IS DISTINCT FROM NEW.assessment_id
           ) THEN
            RAISE EXCEPTION
                'risk mitigation driver does not match its assessment'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_review_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION
        'party risk review events are append-only'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

-- Cross-row invariants for the Neon product, catalog, and BOM foundation.

CREATE OR REPLACE FUNCTION master.trg_guard_product_catalog_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'master.% identity, tenant, and creation evidence are immutable',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_commodity_category_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT c.id, c.parent_id
              FROM master.commodity_category c
             WHERE c.tenant_id = NEW.tenant_id
               AND c.id = NEW.parent_id
            UNION ALL
            SELECT c.id, c.parent_id
              FROM master.commodity_category c
              JOIN ancestors a ON a.parent_id = c.id
             WHERE c.tenant_id = NEW.tenant_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Commodity category hierarchy cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_item_product_uom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_product_uom text;
BEGIN
    SELECT p.base_uom_code
      INTO v_product_uom
      FROM master.product p
     WHERE p.tenant_id = NEW.tenant_id
       AND p.id = NEW.product_id;

    IF FOUND AND NEW.base_uom_code <> v_product_uom THEN
        RAISE EXCEPTION
            'Item base UOM % must match product base UOM %',
            NEW.base_uom_code, v_product_uom
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_catalog_item_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_catalog_company uuid;
    v_item_company    uuid;
BEGIN
    SELECT company_code_id INTO v_catalog_company
      FROM master.catalog
     WHERE tenant_id = NEW.tenant_id AND id = NEW.catalog_id;

    SELECT company_code_id INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

    IF v_catalog_company IS NOT NULL
       AND v_item_company IS NOT NULL
       AND v_catalog_company <> v_item_company THEN
        RAISE EXCEPTION 'Catalog item must belong to the catalog company code'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_bom_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_company       uuid;
    v_uom           text;
    v_manufactured  boolean;
BEGIN
    SELECT company_code_id, base_uom_code, is_manufactured
      INTO v_company, v_uom, v_manufactured
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.output_item_id;

    IF FOUND AND (
        v_company <> NEW.company_code_id
        OR v_uom <> NEW.uom_code
        OR NOT v_manufactured
    ) THEN
        RAISE EXCEPTION
            'BOM output must be a manufactured item in the same company and base UOM'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_bom_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_output_item uuid;
    v_item_company uuid;
BEGIN
    SELECT output_item_id
      INTO v_output_item
      FROM master.bom
     WHERE tenant_id = NEW.tenant_id
       AND company_code_id = NEW.company_code_id
       AND id = NEW.bom_id;

    SELECT company_code_id
      INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.component_item_id;

    IF v_output_item = NEW.component_item_id THEN
        RAISE EXCEPTION 'A BOM cannot directly consume its output item'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_item_company IS NOT NULL AND v_item_company <> NEW.company_code_id THEN
        RAISE EXCEPTION 'BOM component must belong to the BOM company code'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_output_item IS NOT NULL AND EXISTS (
        WITH RECURSIVE descendants(item_id) AS (
            SELECT NEW.component_item_id
            UNION
            SELECT bc.component_item_id
              FROM descendants d
              JOIN master.bom b
                ON b.tenant_id = NEW.tenant_id
               AND b.company_code_id = NEW.company_code_id
               AND b.output_item_id = d.item_id
              JOIN master.bom_component bc
                ON bc.tenant_id = b.tenant_id
               AND bc.company_code_id = b.company_code_id
               AND bc.bom_id = b.id
             WHERE bc.id <> NEW.id
        )
        SELECT 1 FROM descendants WHERE item_id = v_output_item
    ) THEN
        RAISE EXCEPTION 'BOM component graph cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_released_bom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_status master.bom_status_d;
BEGIN
    SELECT status INTO v_status
      FROM master.bom
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.bom_id, OLD.bom_id);

    IF v_status IN ('released', 'retired') THEN
        RAISE EXCEPTION
            'Components of a released or retired BOM are immutable; create a new BOM revision'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_project_wbs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, document
AS $$
DECLARE
    v_parent master.project_wbs%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.parent_wbs_id IS DISTINCT FROM OLD.parent_wbs_id
       AND EXISTS (
           SELECT 1 FROM master.project_wbs c
            WHERE c.tenant_id = OLD.tenant_id
              AND c.project_id = OLD.project_id
              AND c.parent_wbs_id = OLD.id
       ) THEN
        RAISE EXCEPTION 'Reparenting a WBS with children is not allowed'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_wbs_id IS NULL THEN
        IF NEW.level_no <> 1 THEN
            RAISE EXCEPTION 'Root WBS level must be 1' USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_parent
          FROM master.project_wbs
         WHERE tenant_id = NEW.tenant_id
           AND project_id = NEW.project_id
           AND id = NEW.parent_wbs_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'WBS parent does not belong to the project'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_parent.is_postable THEN
            RAISE EXCEPTION 'A postable WBS cannot receive child WBS elements'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.level_no := v_parent.level_no + 1;
    END IF;

    IF NEW.parent_wbs_id IS NOT NULL AND EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT w.id, w.parent_wbs_id
              FROM master.project_wbs w
             WHERE w.tenant_id = NEW.tenant_id
               AND w.project_id = NEW.project_id
               AND w.id = NEW.parent_wbs_id
            UNION ALL
            SELECT w.id, w.parent_wbs_id
              FROM master.project_wbs w
              JOIN ancestors a ON a.parent_wbs_id = w.id
             WHERE w.tenant_id = NEW.tenant_id
               AND w.project_id = NEW.project_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'WBS hierarchy cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NOT OLD.is_postable
       AND NEW.is_postable
       AND EXISTS (
           SELECT 1 FROM master.project_wbs c
            WHERE c.tenant_id = NEW.tenant_id
              AND c.project_id = NEW.project_id
              AND c.parent_wbs_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'A WBS with children cannot become postable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_project_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_company uuid;
    v_uom text;
    v_project_company uuid;
BEGIN
    SELECT company_code_id INTO v_project_company
      FROM master.project
     WHERE tenant_id = NEW.tenant_id AND id = NEW.project_id;

    IF NEW.item_id IS NOT NULL THEN
        SELECT company_code_id, base_uom_code INTO v_company, v_uom
          FROM master.item
         WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;
        IF FOUND AND (v_company <> v_project_company OR v_uom <> NEW.uom_code) THEN
            RAISE EXCEPTION 'Project item must match the project company and item base UOM'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_compensation_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master,document AS $$
DECLARE v_employment master.employment%ROWTYPE; v_group master.pay_group%ROWTYPE; v_structure master.pay_structure%ROWTYPE; v_change document.compensation_change%ROWTYPE;
BEGIN
    SELECT * INTO v_employment FROM master.employment WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_id;
    SELECT * INTO v_group FROM master.pay_group WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;
    IF v_employment.employee_id IS DISTINCT FROM NEW.employee_id OR v_employment.company_code_id IS DISTINCT FROM v_group.company_code_id THEN
        RAISE EXCEPTION 'Compensation employee, employment and pay group must resolve to one company' USING ERRCODE='check_violation';
    END IF;
    IF NEW.currency_code<>v_group.currency_code THEN RAISE EXCEPTION 'Compensation currency must match the pay group' USING ERRCODE='check_violation'; END IF;
    IF NEW.pay_structure_id IS NOT NULL THEN
        SELECT * INTO v_structure FROM master.pay_structure WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_structure_id;
        IF v_structure.currency_code<>NEW.currency_code OR (v_structure.pay_group_id IS NOT NULL AND v_structure.pay_group_id<>NEW.pay_group_id) THEN
            RAISE EXCEPTION 'Compensation pay structure must match pay group and currency' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.source_compensation_change_id IS NOT NULL THEN
        SELECT * INTO v_change FROM document.compensation_change WHERE tenant_id=NEW.tenant_id AND id=NEW.source_compensation_change_id;
        IF v_change.employee_id<>NEW.employee_id OR v_change.effective_date<>NEW.effective_from OR v_change.proposed_pay_group_id<>NEW.pay_group_id OR v_change.proposed_currency_code<>NEW.currency_code OR v_change.proposed_base_amount<>NEW.base_amount OR v_change.proposed_annualized_amount IS DISTINCT FROM NEW.annualized_amount THEN
            RAISE EXCEPTION 'Compensation assignment must materialize its approved change exactly' USING ERRCODE='check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_manage_compensation_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'planned' THEN RAISE EXCEPTION 'Compensation assignment must be created planned' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status<>'planned' AND (
        NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NEW.employment_id IS DISTINCT FROM OLD.employment_id OR
        NEW.pay_group_id IS DISTINCT FROM OLD.pay_group_id OR NEW.pay_structure_id IS DISTINCT FROM OLD.pay_structure_id OR
        NEW.currency_code IS DISTINCT FROM OLD.currency_code OR NEW.base_amount IS DISTINCT FROM OLD.base_amount OR
        NEW.annualized_amount IS DISTINCT FROM OLD.annualized_amount OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
        NEW.source_compensation_change_id IS DISTINCT FROM OLD.source_compensation_change_id
    ) THEN RAISE EXCEPTION 'Effective compensation facts are immutable; create a successor assignment' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND NEW.effective_until IS DISTINCT FROM OLD.effective_until AND NOT(
        OLD.status='active' AND NEW.status='superseded' AND OLD.effective_until IS NULL AND NEW.effective_until>=OLD.effective_from
    ) THEN RAISE EXCEPTION 'Compensation end date may only be set while superseding an active assignment' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(
        (OLD.status='planned' AND NEW.status IN('active','cancelled')) OR
        (OLD.status='active' AND NEW.status IN('superseded','cancelled'))
    ) THEN RAISE EXCEPTION 'Invalid compensation assignment transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('superseded','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final compensation assignment is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_certification_type_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_tenant_id uuid;
BEGIN
  IF NEW.certification_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id
    INTO v_type_tenant_id
    FROM master.certification_type
   WHERE id = NEW.certification_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown certification type: %', NEW.certification_type_id
      USING ERRCODE = '23503';
  END IF;

  IF v_type_tenant_id IS NOT NULL AND v_type_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION
      'Certification type % belongs to another tenant',
      NEW.certification_type_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION master.trg_guard_organization_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_old text:=OLD.status::text; v_new text:=NEW.status::text;
BEGIN
  IF v_old=v_new THEN RETURN NEW; END IF;
  IF NOT ((v_old='draft' AND v_new IN ('active','archived')) OR
          (v_old='active' AND v_new IN ('inactive','retired','archived')) OR
          (v_old='inactive' AND v_new IN ('active','retired','archived'))) THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_LIFECYCLE: % -> %',v_old,v_new USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_record_organization_amendment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,master AS $$
DECLARE v_kind text:=TG_ARGV[0]; v_revision bigint; v_actor uuid;
BEGIN
  IF to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
  v_actor:=COALESCE(NEW.updated_by,NEW.status_changed_by,NEW.created_by);
  SELECT COALESCE(max(revision_no),0)+1 INTO v_revision FROM master.organization_amendment
   WHERE tenant_id=NEW.tenant_id AND resource_kind=v_kind AND resource_id=NEW.id;
  INSERT INTO master.organization_amendment(tenant_id,resource_kind,resource_id,revision_no,amendment_kind,before_state,after_state,recorded_by)
  VALUES(NEW.tenant_id,v_kind,NEW.id,v_revision,CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'lifecycle' ELSE 'profile' END,to_jsonb(OLD),to_jsonb(NEW),v_actor);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_sync_organization_scope_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,authz,event
AS $$
DECLARE v_kind authz.scope_kind_d:=TG_ARGV[0]::authz.scope_kind_d; v_parent uuid; v_status authz.scope_status_d; v_scope_id uuid; v_actor uuid;
BEGIN
  v_actor:=COALESCE(NEW.updated_by,NEW.status_changed_by,NEW.created_by);
  IF v_kind='legal_entity' THEN
    IF NEW.parent_legal_entity_id IS NOT NULL THEN
      SELECT id INTO v_parent FROM authz.scope_target WHERE tenant_id=NEW.tenant_id AND scope_kind='legal_entity' AND target_id=NEW.parent_legal_entity_id;
    END IF;
  ELSIF v_kind='operating_organization' THEN
    IF NEW.parent_operating_organization_id IS NOT NULL THEN
      SELECT id INTO v_parent FROM authz.scope_target WHERE tenant_id=NEW.tenant_id AND scope_kind='operating_organization' AND target_id=NEW.parent_operating_organization_id;
    END IF;
  END IF;
  IF v_parent IS NULL THEN SELECT id INTO v_parent FROM authz.scope_target WHERE tenant_id=NEW.tenant_id AND scope_kind='tenant' AND target_id=NEW.tenant_id; END IF;
  IF v_parent IS NULL THEN
    INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
    SELECT md5(NEW.tenant_id::text||':scope:tenant')::uuid,NEW.tenant_id,'tenant',NEW.tenant_id::text,NEW.tenant_id,NULL,t.display_name,jsonb_build_object('authority_table','master.tenant'),'active',v_actor
      FROM master.tenant t WHERE t.id=NEW.tenant_id RETURNING id INTO v_parent;
  END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'TENANT_SCOPE_TARGET_REQUIRED' USING ERRCODE='foreign_key_violation'; END IF;
  v_status:=CASE WHEN NEW.status::text='active' THEN 'active'::authz.scope_status_d WHEN NEW.status::text IN ('retired','archived') THEN 'retired'::authz.scope_status_d ELSE 'suspended'::authz.scope_status_d END;
  INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
  VALUES(md5(NEW.tenant_id::text||':scope:'||replace(v_kind::text,'_','-')||':'||NEW.id::text)::uuid,NEW.tenant_id,v_kind,v_kind::text||':'||NEW.code,NEW.id,v_parent,COALESCE(NEW.display_name,NEW.name),jsonb_build_object('authority_table',TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME),v_status,v_actor)
  ON CONFLICT(tenant_id,scope_kind,target_id) DO UPDATE SET parent_scope_target_id=EXCLUDED.parent_scope_target_id,display_name=EXCLUDED.display_name,metadata=EXCLUDED.metadata,status=EXCLUDED.status,updated_by=v_actor
  RETURNING id INTO v_scope_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_emit_operating_assignment_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,event AS $$
DECLARE v_tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id); v_id uuid:=COALESCE(NEW.id,OLD.id); v_op char(1):=substr(TG_OP,1,1);
BEGIN
  PERFORM event.fn_authorization_emit_invalidation('wave6:operating_assignment:'||v_id||':'||pg_current_xact_id()::text,'plane',v_tenant,'neon','master.operating_organization_company_assignment',v_op,jsonb_build_object('id',v_id));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_reject_organization_amendment_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'organization_amendment is append-only' USING ERRCODE='integrity_constraint_violation'; END $$;
CREATE OR REPLACE FUNCTION master.trg_enforce_business_partner_governance_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_business_partner_id uuid := COALESCE(NEW.business_partner_id, OLD.business_partner_id);
    v_ownership numeric;
    v_voting numeric;
    v_beneficial numeric;
BEGIN
    SELECT COALESCE(sum(ownership_pct), 0),
           COALESCE(sum(voting_pct), 0),
           COALESCE(sum(beneficial_ownership_pct), 0)
      INTO v_ownership, v_voting, v_beneficial
      FROM master.business_partner_governance_relation
     WHERE tenant_id = v_tenant_id
       AND business_partner_id = v_business_partner_id
       AND status = 'active';

    IF v_ownership > 100 OR v_voting > 100 OR v_beneficial > 100 THEN
        RAISE EXCEPTION 'Active Business Partner governance percentages exceed 100%%'
            USING ERRCODE = 'check_violation',
                  DETAIL = format(
                      'tenant_id=%s business_partner_id=%s ownership=%s voting=%s beneficial=%s',
                      v_tenant_id, v_business_partner_id, v_ownership, v_voting, v_beneficial
                  );
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;
-- Domain-owned G5 materializer for external supplier and customer registrations.
-- The approved, release-pinned G1 decision snapshot is the only request input;
-- no section-specific request row is created or consulted.
CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_role_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,role_id uuid,
 qualification_id uuid,preference_id uuid,result_snapshot_id uuid,
 row_version bigint,case_status text,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared
SET row_security=on AS $$
DECLARE
 fingerprint text; prior event.command_execution%ROWTYPE; execution uuid;
 current_case document.entity_case%ROWTYPE; payload jsonb; bp master.business_partner%ROWTYPE;
 bp_id uuid:=shared.uuidv7(); new_role_id uuid:=shared.uuidv7(); assignment_id uuid:=shared.uuidv7();
 new_qualification_id uuid; new_preference_id uuid; lifecycle record; authority_evidence_id uuid;
 result_snapshot uuid; next_version bigint; attempt_no integer; materialization_id uuid;
 outbox uuid; result jsonb; lineage_hash text; requested_role text; channel text;
 org_id uuid; qualification_type text; preference_rationale text; preflight jsonb;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon'
    OR shared.current_tenant_id()<>p_tenant_id
    OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Business Partner role materialization context mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'Business Partner role materialization arguments are invalid' USING ERRCODE='check_violation';
 END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
  'caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,
  'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e
  WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.business_partner_role'
    AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fingerprint THEN
   RAISE EXCEPTION 'Business Partner role materialization idempotency conflict' USING ERRCODE='unique_violation';
  END IF;
  RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,
   (prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'roleId')::uuid,
   NULLIF(prior.result_payload->>'qualificationId','')::uuid,NULLIF(prior.result_payload->>'preferenceId','')::uuid,
   (prior.result_payload->>'resultSnapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,
   prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid;
  RETURN;
 END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
  actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
 VALUES(p_tenant_id,'entity.case.materialize.business_partner_role',p_idempotency_key,fingerprint,'processing',
  p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
 RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current_case FROM document.entity_case c
  WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved entity case was not found' USING ERRCODE='no_data_found'; END IF;
 IF current_case.row_version<>p_expected_case_version THEN
  RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';
 END IF;
 IF current_case.status<>'approved' OR current_case.entity_code<>'master.business_partner'
    OR current_case.operation_code NOT IN('register','new_partner','add_supplier','add_customer')
    OR current_case.decision_snapshot_id IS NULL THEN
  RAISE EXCEPTION 'Entity case is not an approved Business Partner role registration' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current_case.decision_snapshot_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Decision snapshot was not found' USING ERRCODE='data_corrupted'; END IF;
 requested_role:=payload->>'requestedRole'; channel:=payload->>'registrationChannel';
 org_id:=NULLIF(payload->>'operatingOrganizationId','')::uuid;
 qualification_type:=NULLIF(payload->>'qualificationTypeCode','');
 preference_rationale:=NULLIF(payload->>'preferenceRationale',''); preflight:=payload->'preflight';
 IF NOT(payload?'businessPartnerCode' AND payload?'name' AND payload?'roleCode'
        AND payload?'requestedRole' AND payload?'registrationChannel' AND payload?'operatingOrganizationId')
    OR payload->>'ownershipClass' NOT IN('internal','external') OR requested_role NOT IN('supplier','customer')
    OR channel NOT IN('internal','invitation','mesh_proposal','buyer_request','supplier_self_registration','customer_onboarding')
    OR (requested_role='supplier' AND channel='customer_onboarding')
    OR (requested_role='customer' AND channel NOT IN('internal','mesh_proposal','customer_onboarding'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN(
      'businessPartnerCode','name','displayName','legalName','legalForm','registrationCountryCode',
      'incorporationDate','websiteUrl','description','ownershipClass','requestedRole','roleCode',
      'partnerCategory','legalClassification','supplierType','customerType',
      'registrationChannel','operatingOrganizationId','meshRegistrationExchangeId',
      'meshRegistrationEvidenceHash','bankDisclosureReceiptId','bankDisclosurePurposeCode',
      'qualificationTypeCode','preferenceRationale','companyCodeId','commodityCategoryId','preflight',
      'tenantFields','relationshipProposals')) THEN
  RAISE EXCEPTION 'Business Partner role payload is outside the materializer contract' USING ERRCODE='check_violation';
 END IF;
 IF requested_role='supplier' AND channel='mesh_proposal' AND (
    NULLIF(payload->>'meshRegistrationExchangeId','')::uuid IS NULL
    OR payload->>'meshRegistrationEvidenceHash' !~ '^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'Supplier registration requires accepted MESH exchange evidence' USING ERRCODE='check_violation';
 END IF;
 IF channel='buyer_request' AND (
    NULLIF(payload->>'bankDisclosureReceiptId','')::uuid IS NULL
    OR payload->>'bankDisclosurePurposeCode' !~ '^[a-z][a-z0-9_.-]{1,62}$') THEN
  RAISE EXCEPTION 'Buyer-requested supplier requires purpose-bound disclosure evidence' USING ERRCODE='check_violation';
 END IF;
 IF channel='supplier_self_registration' AND (
    jsonb_typeof(preflight)<>'object' OR preflight-ARRAY['trust','rate','duplicate','sponsorPolicy']::text[]<>'{}'::jsonb
    OR preflight->>'trust'<>'passed' OR preflight->>'rate'<>'passed'
    OR preflight->>'duplicate'<>'passed' OR preflight->>'sponsorPolicy'<>'approved') THEN
  RAISE EXCEPTION 'Supplier self-registration requires bounded successful preflight evidence' USING ERRCODE='check_violation';
 END IF;
 IF requested_role='supplier' AND payload->>'ownershipClass'='external' AND qualification_type IS NULL THEN
  RAISE EXCEPTION 'Supplier registration requires a qualification type' USING ERRCODE='check_violation';
 END IF;
 IF current_case.target_entity_id IS NULL THEN
  INSERT INTO master.business_partner(id,tenant_id,code,name,display_name,legal_name,partner_category,
   ownership_class,category_locked_by,legal_form,registration_country_code,incorporation_date,website_url,
   description,status,created_by)
  VALUES(bp_id,p_tenant_id,payload->>'businessPartnerCode',payload->>'name',payload->>'displayName',
   payload->>'legalName','organization',payload->>'ownershipClass',p_actor_id,payload->>'legalForm',
   NULLIF(payload->>'registrationCountryCode','')::character(2),NULLIF(payload->>'incorporationDate','')::date,
   payload->>'websiteUrl',payload->>'description','draft',p_actor_id) RETURNING * INTO bp;
 ELSE
  bp_id:=current_case.target_entity_id;
  SELECT * INTO bp FROM master.business_partner WHERE tenant_id=p_tenant_id AND id=bp_id FOR UPDATE;
  IF NOT FOUND OR bp.status<>'active'
     OR (requested_role='supplier' AND EXISTS(SELECT 1 FROM master.supplier r WHERE r.tenant_id=p_tenant_id AND r.business_partner_id=bp_id AND r.status<>'retired'))
     OR (requested_role='customer' AND EXISTS(SELECT 1 FROM master.customer r WHERE r.tenant_id=p_tenant_id AND r.business_partner_id=bp_id AND r.status<>'retired')) THEN
   RAISE EXCEPTION 'Target Business Partner is not eligible for the requested role' USING ERRCODE='unique_violation';
  END IF;
 END IF;
 IF requested_role='supplier' THEN
  INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,supplier_type,status,created_by)
   VALUES(new_role_id,p_tenant_id,bp_id,payload->>'roleCode',
    COALESCE(NULLIF(payload->>'supplierType',''),'general')::master.supplier_type_d,'onboarding',p_actor_id);
 ELSE
  INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,customer_type,status,created_by)
   VALUES(new_role_id,p_tenant_id,bp_id,payload->>'roleCode',
    COALESCE(NULLIF(payload->>'customerType',''),'corporate')::master.customer_type_d,'prospect',p_actor_id);
 END IF;
 INSERT INTO master.business_partner_operating_organization_assignment(
  id,tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,status,
  status_changed_at,status_changed_by,created_by)
 VALUES(assignment_id,p_tenant_id,bp_id,org_id,requested_role::master.partner_role_d,CURRENT_DATE,'active',
  clock_timestamp(),p_actor_id,p_actor_id);
 IF requested_role='supplier' AND qualification_type IS NOT NULL THEN
  SELECT created.aggregate_id INTO new_qualification_id
    FROM control.command_create_business_partner_decision(p_tenant_id,'qualification',bp_id,'supplier',new_role_id,
      org_id,NULLIF(payload->>'companyCodeId','')::uuid,NULLIF(payload->>'commodityCategoryId','')::uuid,
      jsonb_build_object('qualificationTypeCode',qualification_type),
      'case-qualification:'||p_case_id::text,p_actor_id) created;
  IF preference_rationale IS NOT NULL THEN
   SELECT created.aggregate_id INTO new_preference_id
     FROM control.command_create_business_partner_decision(p_tenant_id,'supplier_preference',bp_id,'supplier',new_role_id,
       org_id,NULLIF(payload->>'companyCodeId','')::uuid,NULLIF(payload->>'commodityCategoryId','')::uuid,
       jsonb_build_object('effectiveFrom',CURRENT_DATE,'rationale',preference_rationale),
       'case-preference:'||p_case_id::text,p_actor_id) created;
  END IF;
 END IF;
 IF current_case.target_entity_id IS NULL THEN
  SELECT * INTO lifecycle FROM control.command_business_partner_lifecycle(p_tenant_id,'business_partner',bp_id,
   'active',1,'approved governed role registration','case-bp-activate:'||p_case_id::text,p_actor_id);
  authority_evidence_id:=lifecycle.evidence_id;
 END IF;
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id;
 IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN
  RAISE EXCEPTION 'Materialized Business Partner snapshot violates the pinned contract' USING ERRCODE='check_violation';
 END IF;
 result_snapshot:=snapshot.fn_capture_entity('master.business_partner',bp_id,bp.code,1,
  current_case.entity_contract_hash,bp.record_version,'entity.case.materialized','create',payload,
  p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current_case.row_version+1;
 SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m
  WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,
  result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,
  started_at,completed_at,requested_by,completed_by)
 VALUES(p_tenant_id,p_case_id,attempt_no,current_case.decision_snapshot_id,result_snapshot,
  'neon.business_partner_role','1',fingerprint,'succeeded',upper(requested_role)||'_CREATED',
  clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,
  'sourceSnapshotId',current_case.decision_snapshot_id,'targetSnapshotId',result_snapshot,
  'businessPartnerId',bp_id,'roleId',new_role_id,'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,
  lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
 VALUES(p_tenant_id,p_case_id,current_case.decision_snapshot_id,result_snapshot,'materialized_from',
  'master.business_partner',bp_id,'neon.business_partner_role','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET target_entity_id=bp_id,result_snapshot_id=result_snapshot,status='materialized',
  row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
  request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
  result_code,result_snapshot_id,result_evidence,recorded_by)
 VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,
  current_case.row_version,next_version,'approved','materialized','accepted',upper(requested_role)||'_CREATED',
  result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,
   'assignmentId',assignment_id,'qualificationId',new_qualification_id,'preferenceId',new_preference_id,
   'materializationId',materialization_id,'authorityEvidenceId',authority_evidence_id),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
  event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
 VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,
  'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,
  'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,
   'businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,'qualificationId',new_qualification_id,
   'preferenceId',new_preference_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,
   'status','materialized','materializer','neon.business_partner_role'),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'roleId',new_role_id,
  'qualificationId',COALESCE(new_qualification_id::text,''),'preferenceId',COALESCE(new_preference_id::text,''),
  'resultSnapshotId',result_snapshot,'rowVersion',next_version,'status','materialized','outboxId',outbox);
 UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
  status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,new_role_id,new_qualification_id,new_preference_id,result_snapshot,
  next_version,'materialized',false,outbox;
END $$;

-- Company finance configuration has a distinct authority and does not create a role.
CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_company_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,role_id uuid,
 qualification_id uuid,preference_id uuid,result_snapshot_id uuid,
 row_version bigint,case_status text,replayed boolean,outbox_id uuid,
 company_profile_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared
SET row_security=on AS $$
DECLARE
 fingerprint text; prior event.command_execution%ROWTYPE; execution uuid;
 current_case document.entity_case%ROWTYPE; payload jsonb; bp master.business_partner%ROWTYPE;
 bp_id uuid; target_role_id uuid; profile_id uuid; company_id uuid; org_id uuid;
 requested_role text; currency text; payment_term uuid; accounting_profile uuid;
 dimension_set uuid; remittance_link uuid; statement_cycle text; profile_payload jsonb;
 result_snapshot uuid; next_version bigint; attempt_no integer; materialization_id uuid;
 outbox uuid; result jsonb; lineage_hash text; target_type text;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon'
    OR shared.current_tenant_id()<>p_tenant_id
    OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Business Partner company materialization context mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'Business Partner company materialization arguments are invalid' USING ERRCODE='check_violation';
 END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
  'caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,
  'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e
  WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.business_partner_company'
    AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fingerprint THEN
   RAISE EXCEPTION 'Business Partner company materialization idempotency conflict' USING ERRCODE='unique_violation';
  END IF;
  RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,
   (prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'roleId')::uuid,
   NULL::uuid,NULL::uuid,(prior.result_payload->>'resultSnapshotId')::uuid,
   (prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',true,
   (prior.result_payload->>'outboxId')::uuid,(prior.result_payload->>'companyProfileId')::uuid;
  RETURN;
 END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
  actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
 VALUES(p_tenant_id,'entity.case.materialize.business_partner_company',p_idempotency_key,fingerprint,'processing',
  p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
 RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current_case FROM document.entity_case c
  WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved entity case was not found' USING ERRCODE='no_data_found'; END IF;
 IF current_case.row_version<>p_expected_case_version THEN
  RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';
 END IF;
 IF current_case.status<>'approved' OR current_case.entity_code<>'master.business_partner'
    OR current_case.operation_code<>'configure_company' OR current_case.target_entity_id IS NULL
    OR current_case.decision_snapshot_id IS NULL THEN
  RAISE EXCEPTION 'Entity case is not an approved Business Partner company configuration' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current_case.decision_snapshot_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Decision snapshot was not found' USING ERRCODE='data_corrupted'; END IF;
 IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN
  RAISE EXCEPTION 'Company configuration payload violates the pinned contract' USING ERRCODE='check_violation';
 END IF;
 bp_id:=current_case.target_entity_id;
 requested_role:=payload->>'requestedRole';
 org_id:=NULLIF(payload->>'operatingOrganizationId','')::uuid;
 company_id:=NULLIF(payload->>'companyCodeId','')::uuid;
 currency:=upper(NULLIF(btrim(payload->>'currencyCode'),''));
 payment_term:=NULLIF(payload->>'paymentTermId','')::uuid;
 accounting_profile:=NULLIF(payload->>'defaultAccountingProfileId','')::uuid;
 dimension_set:=NULLIF(payload->>'defaultDimensionSetId','')::uuid;
 remittance_link:=NULLIF(payload->>'preferredRemittanceBankLinkId','')::uuid;
 statement_cycle:=NULLIF(btrim(payload->>'statementCycleCode'),'');
 IF requested_role NOT IN('supplier','customer') OR org_id IS NULL OR company_id IS NULL
    OR currency !~ '^[A-Z]{3}$' OR payment_term IS NULL OR accounting_profile IS NULL
    OR (requested_role='supplier' AND remittance_link IS NULL)
    OR (requested_role='customer' AND remittance_link IS NOT NULL) THEN
  RAISE EXCEPTION 'Company configuration coordinates or finance fields are incomplete' USING ERRCODE='check_violation';
 END IF;
 SELECT b.* INTO bp FROM master.business_partner b
  WHERE b.tenant_id=p_tenant_id AND b.id=bp_id AND b.status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target Business Partner is not active' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
   JOIN master.operating_organization_company_assignment company_scope
     ON company_scope.tenant_id=assignment.tenant_id
    AND company_scope.operating_organization_id=assignment.operating_organization_id
    AND company_scope.company_code_id=company_id
   WHERE assignment.tenant_id=p_tenant_id AND assignment.business_partner_id=bp_id
    AND assignment.operating_organization_id=org_id AND assignment.partner_role=requested_role::master.partner_role_d
    AND assignment.status='active' AND assignment.effective_from<=CURRENT_DATE
    AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE)
    AND company_scope.status='active' AND company_scope.effective_from<=CURRENT_DATE
    AND (company_scope.effective_until IS NULL OR company_scope.effective_until>CURRENT_DATE)
  ) THEN
  RAISE EXCEPTION 'Active Business Partner role scope does not cover the selected company' USING ERRCODE='check_violation';
 END IF;
 IF requested_role='supplier' THEN
  SELECT supplier.id INTO target_role_id FROM master.supplier supplier
   WHERE supplier.tenant_id=p_tenant_id AND supplier.business_partner_id=bp_id AND supplier.status<>'retired'
   ORDER BY supplier.created_at,supplier.id LIMIT 1 FOR SHARE;
  IF target_role_id IS NULL THEN RAISE EXCEPTION 'Active supplier role is required' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO master.company_code_supplier_profile(
   tenant_id,supplier_id,company_code_id,currency_code,payment_term_id,
   default_accounting_profile_id,preferred_remittance_bank_link_id,default_dimension_set_id,
   metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,target_role_id,company_id,currency,payment_term,accounting_profile,
   remittance_link,dimension_set,jsonb_build_object('sourceCaseId',p_case_id),'active',
   clock_timestamp(),p_actor_id,p_actor_id)
  ON CONFLICT(tenant_id,supplier_id,company_code_id) DO UPDATE SET
   currency_code=EXCLUDED.currency_code,payment_term_id=EXCLUDED.payment_term_id,
   default_accounting_profile_id=EXCLUDED.default_accounting_profile_id,
   preferred_remittance_bank_link_id=EXCLUDED.preferred_remittance_bank_link_id,
   default_dimension_set_id=EXCLUDED.default_dimension_set_id,
   metadata=master.company_code_supplier_profile.metadata||jsonb_build_object('sourceCaseId',p_case_id),
   status='active',status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,
   updated_at=clock_timestamp(),updated_by=p_actor_id
  RETURNING id INTO profile_id;
  target_type:='master.company_code_supplier_profile';
 ELSE
  SELECT customer.id INTO target_role_id FROM master.customer customer
   WHERE customer.tenant_id=p_tenant_id AND customer.business_partner_id=bp_id AND customer.status<>'retired'
   ORDER BY customer.created_at,customer.id LIMIT 1 FOR SHARE;
  IF target_role_id IS NULL THEN RAISE EXCEPTION 'Active customer role is required' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO master.company_code_customer_profile(
   tenant_id,customer_id,company_code_id,currency_code,payment_term_id,
   default_accounting_profile_id,default_dimension_set_id,statement_cycle_code,
   metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,target_role_id,company_id,currency,payment_term,accounting_profile,
   dimension_set,statement_cycle,jsonb_build_object('sourceCaseId',p_case_id),'active',
   clock_timestamp(),p_actor_id,p_actor_id)
  ON CONFLICT(tenant_id,customer_id,company_code_id) DO UPDATE SET
   currency_code=EXCLUDED.currency_code,payment_term_id=EXCLUDED.payment_term_id,
   default_accounting_profile_id=EXCLUDED.default_accounting_profile_id,
   default_dimension_set_id=EXCLUDED.default_dimension_set_id,
   statement_cycle_code=EXCLUDED.statement_cycle_code,
   metadata=master.company_code_customer_profile.metadata||jsonb_build_object('sourceCaseId',p_case_id),
   status='active',status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,
   updated_at=clock_timestamp(),updated_by=p_actor_id
  RETURNING id INTO profile_id;
  target_type:='master.company_code_customer_profile';
 END IF;
 profile_payload:=jsonb_strip_nulls(jsonb_build_object(
  'businessPartnerId',bp_id,'requestedRole',requested_role,'roleId',target_role_id,
  'operatingOrganizationId',org_id,'companyCodeId',company_id,'companyProfileId',profile_id,
  'currencyCode',currency,'paymentTermId',payment_term,
  'defaultAccountingProfileId',accounting_profile,'defaultDimensionSetId',dimension_set,
  'preferredRemittanceBankLinkId',remittance_link,'statementCycleCode',statement_cycle));
 result_snapshot:=snapshot.fn_capture_entity(target_type,profile_id,bp.code||':'||company_id::text,1,
  current_case.entity_contract_hash,p_expected_case_version,'entity.case.materialized','version',profile_payload,
  p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current_case.row_version+1;
 SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m
  WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,
  result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,
  started_at,completed_at,requested_by,completed_by)
 VALUES(p_tenant_id,p_case_id,attempt_no,current_case.decision_snapshot_id,result_snapshot,
  'neon.business_partner_company','1',fingerprint,'succeeded','COMPANY_CONFIGURED',
  clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,
  'sourceSnapshotId',current_case.decision_snapshot_id,'targetSnapshotId',result_snapshot,
  'businessPartnerId',bp_id,'roleId',target_role_id,'companyProfileId',profile_id,
  'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,
  lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
 VALUES(p_tenant_id,p_case_id,current_case.decision_snapshot_id,result_snapshot,'materialized_from',
  target_type,profile_id,'neon.business_partner_company','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET result_snapshot_id=result_snapshot,status='materialized',
  row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
  request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
  result_code,result_snapshot_id,result_evidence,recorded_by)
 VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,
  current_case.row_version,next_version,'approved','materialized','accepted','COMPANY_CONFIGURED',
  result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'roleId',target_role_id,'role',requested_role,
   'companyProfileId',profile_id,'companyCodeId',company_id,'operatingOrganizationId',org_id,
   'materializationId',materialization_id,'resultKind','company_configured'),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
  event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
 VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,
  'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,
  'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,
   'businessPartnerId',bp_id,'roleId',target_role_id,'role',requested_role,'companyProfileId',profile_id,
   'companyCodeId',company_id,'operatingOrganizationId',org_id,'resultSnapshotId',result_snapshot,
   'rowVersion',next_version,'status','materialized','materializer','neon.business_partner_company',
   'resultKind','company_configured'),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'roleId',target_role_id,
  'companyProfileId',profile_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,
  'status','materialized','outboxId',outbox);
 UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
  status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,target_role_id,NULL::uuid,NULL::uuid,result_snapshot,
  next_version,'materialized',false,outbox,profile_id;
END $$;

-- Kind-specific G5 changes reuse native lifecycle and independent bank-verification authorities.
CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_change_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,role_id uuid,
 qualification_id uuid,preference_id uuid,result_snapshot_id uuid,
 row_version bigint,case_status text,replayed boolean,outbox_id uuid,bank_verification_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared
SET row_security=on AS $$
DECLARE
 fingerprint text; prior event.command_execution%ROWTYPE; execution uuid;
 current_case document.entity_case%ROWTYPE; payload jsonb; bp master.business_partner%ROWTYPE;
 bp_id uuid:=shared.uuidv7(); new_role_id uuid:=shared.uuidv7(); assignment_id uuid:=shared.uuidv7();
 new_qualification_id uuid; new_preference_id uuid; lifecycle record; authority_evidence_id uuid;
 result_snapshot uuid; next_version bigint; attempt_no integer; materialization_id uuid;
 outbox uuid; result jsonb; lineage_hash text; requested_role text; channel text;
 org_id uuid; verification_id uuid; bank_source record; to_state text; result_kind text; reason_code text;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
    OR shared.current_tenant_id() IS DISTINCT FROM p_tenant_id
    OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Business Partner role materialization context mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_case_id IS NULL OR p_expected_case_version IS NULL OR p_idempotency_key IS NULL OR p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'Business Partner role materialization arguments are invalid' USING ERRCODE='check_violation';
 END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
  'caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,
  'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e
  WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.business_partner_change'
    AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fingerprint OR prior.status<>'succeeded' THEN
   RAISE EXCEPTION 'Business Partner role materialization idempotency conflict' USING ERRCODE='unique_violation';
  END IF;
  RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,
   (prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'roleId')::uuid,
   NULLIF(prior.result_payload->>'qualificationId','')::uuid,NULLIF(prior.result_payload->>'preferenceId','')::uuid,
   (prior.result_payload->>'resultSnapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,
   prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid,
   (prior.result_payload->>'bankVerificationId')::uuid;
  RETURN;
 END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
  actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
 VALUES(p_tenant_id,'entity.case.materialize.business_partner_change',p_idempotency_key,fingerprint,'processing',
  p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
 RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current_case FROM document.entity_case c
  WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved entity case was not found' USING ERRCODE='no_data_found'; END IF;
 IF current_case.row_version<>p_expected_case_version THEN
  RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';
 END IF;
 IF current_case.status<>'approved' OR current_case.entity_code<>'master.business_partner'
    OR current_case.operation_code NOT IN('change_bank','deactivate','reactivate','archive')
    OR current_case.target_entity_id IS NULL OR current_case.decision_snapshot_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence approval
      WHERE approval.tenant_id=p_tenant_id AND approval.entity_case_id=p_case_id
       AND approval.after_status='approved' AND approval.outcome='accepted'
       AND approval.recorded_by<>current_case.created_by AND approval.after_version=current_case.row_version) THEN
  RAISE EXCEPTION 'An independently approved Business Partner change case is required' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current_case.decision_snapshot_id;
 IF payload IS NULL OR NOT EXISTS(SELECT 1 FROM runtime_meta.entity_contract contract WHERE contract.tenant_id=p_tenant_id AND contract.id=current_case.entity_contract_id AND contract.entity_contract_hash=current_case.entity_contract_hash AND contract.status IN('published','superseded'))
    OR cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN
  RAISE EXCEPTION 'Business Partner change violates its pinned contract' USING ERRCODE='check_violation';
 END IF;
 bp_id:=current_case.target_entity_id;
 new_role_id:=NULL; assignment_id:=NULL;
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business Partner change target is unavailable' USING ERRCODE='no_data_found'; END IF;
 IF NULLIF(payload->>'expectedBusinessPartnerVersion','')::bigint IS DISTINCT FROM bp.record_version
    OR payload->>'priorStatus' IS DISTINCT FROM bp.status::text THEN
  RAISE EXCEPTION 'Business Partner changed after proposal capture' USING ERRCODE='serialization_failure';
 END IF;
 reason_code:=payload->>'reasonCode';
 IF reason_code IS NULL OR reason_code !~ '^[A-Z][A-Z0-9_.-]{2,126}$' THEN
  RAISE EXCEPTION 'Business Partner change reason is required' USING ERRCODE='check_violation';
 END IF;
 IF current_case.operation_code='change_bank' THEN
  IF payload->>'requestedRole' IS DISTINCT FROM 'supplier' OR bp.status<>'active' THEN
   RAISE EXCEPTION 'Bank change requires an active Supplier Business Partner' USING ERRCODE='check_violation';
  END IF;
  SELECT projection.id,projection.account_fingerprint,profile.id profile_id,profile.company_code_id,
    profile.preferred_remittance_bank_link_id INTO bank_source
   FROM control.mesh_bank_account_projection projection
   JOIN control.mesh_business_partner_account_link link ON link.tenant_id=projection.tenant_id AND link.id=projection.account_link_id AND link.status='active'
   JOIN master.supplier supplier ON supplier.tenant_id=link.tenant_id AND supplier.business_partner_id=link.business_partner_id
   JOIN master.company_code_supplier_profile profile ON profile.tenant_id=supplier.tenant_id AND profile.supplier_id=supplier.id
   WHERE projection.tenant_id=p_tenant_id AND projection.id=(payload->>'bankProjectionId')::uuid
    AND link.business_partner_id=bp_id AND profile.id=(payload->>'supplierCompanyProfileId')::uuid
    AND profile.company_code_id=(payload->>'companyCodeId')::uuid AND profile.status='active'
    AND projection.projection_status IN('available','change_pending')
    AND projection.current_snapshot_id=(payload->>'expectedBankSnapshotId')::uuid
    AND profile.preferred_remittance_bank_link_id IS NOT DISTINCT FROM (payload->>'priorBankLinkId')::uuid
    AND EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
     WHERE assignment.tenant_id=p_tenant_id AND assignment.business_partner_id=bp_id
      AND assignment.operating_organization_id=(payload->>'operatingOrganizationId')::uuid
      AND assignment.partner_role='supplier' AND assignment.status='active'
      AND assignment.effective_from<=CURRENT_DATE AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE)
      AND EXISTS(SELECT 1 FROM master.operating_organization_company_assignment company_scope
       WHERE company_scope.tenant_id=p_tenant_id AND company_scope.operating_organization_id=assignment.operating_organization_id
        AND company_scope.company_code_id=profile.company_code_id AND company_scope.status='active'
        AND company_scope.effective_from<=CURRENT_DATE AND (company_scope.effective_until IS NULL OR company_scope.effective_until>CURRENT_DATE)))
   FOR UPDATE OF projection,profile,link;
  IF NOT FOUND THEN RAISE EXCEPTION 'Available bank projection and active matching company scope are required' USING ERRCODE='check_violation'; END IF;
  verification_id:=shared.uuidv7();
  INSERT INTO document.business_partner_bank_verification(id,tenant_id,bank_projection_id,business_partner_id,
   supplier_company_profile_id,company_code_id,prior_bank_account_link_id,expected_account_fingerprint,idempotency_key,created_by)
  VALUES(verification_id,p_tenant_id,bank_source.id,bp_id,bank_source.profile_id,bank_source.company_code_id,
   bank_source.preferred_remittance_bank_link_id,bank_source.account_fingerprint,'case-bank:'||p_case_id::text,current_case.created_by);
  result_kind:='bank_verification_started';
 ELSE
  IF payload ? 'requestedRole' THEN RAISE EXCEPTION 'Partner lifecycle cannot mutate a thin role' USING ERRCODE='check_violation'; END IF;
  to_state:=CASE current_case.operation_code WHEN 'deactivate' THEN 'inactive' WHEN 'reactivate' THEN 'active' ELSE 'archived' END;
  IF to_state='active' AND EXISTS(SELECT 1 FROM control.business_partner_block block
   WHERE block.tenant_id=p_tenant_id AND block.business_partner_id=bp_id AND block.status='active'
    AND block.effective_from<=clock_timestamp() AND (block.effective_until IS NULL OR block.effective_until>clock_timestamp())) THEN
   RAISE EXCEPTION 'An effective Business Partner block prevents reactivation' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO lifecycle FROM control.command_business_partner_lifecycle(p_tenant_id,'business_partner',bp_id,
   to_state,bp.record_version,reason_code,'case-lifecycle:'||p_case_id::text,p_actor_id);
  IF lifecycle.aggregate_id IS NULL THEN RAISE EXCEPTION 'Business Partner lifecycle did not acknowledge the expected version' USING ERRCODE='serialization_failure'; END IF;
  authority_evidence_id:=lifecycle.evidence_id;
  result_kind:=CASE current_case.operation_code WHEN 'deactivate' THEN 'partner_deactivated' WHEN 'reactivate' THEN 'partner_reactivated' ELSE 'partner_archived' END;
 END IF;
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id;
 IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN
  RAISE EXCEPTION 'Materialized Business Partner snapshot violates the pinned contract' USING ERRCODE='check_violation';
 END IF;
 result_snapshot:=snapshot.fn_capture_entity('master.business_partner',bp_id,bp.code,1,
  current_case.entity_contract_hash,bp.record_version,'entity.case.materialized','version',payload,
  p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current_case.row_version+1;
 SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m
  WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,
  result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,
  started_at,completed_at,requested_by,completed_by)
 VALUES(p_tenant_id,p_case_id,attempt_no,current_case.decision_snapshot_id,result_snapshot,
  'neon.business_partner_change','1',fingerprint,'succeeded',upper(result_kind),
  clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,
  'sourceSnapshotId',current_case.decision_snapshot_id,'targetSnapshotId',result_snapshot,
  'businessPartnerId',bp_id,'roleId',new_role_id,'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,
  lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
 VALUES(p_tenant_id,p_case_id,current_case.decision_snapshot_id,result_snapshot,'materialized_from',
  'master.business_partner',bp_id,'neon.business_partner_change','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET target_entity_id=bp_id,result_snapshot_id=result_snapshot,status='materialized',
  row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
  request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
  result_code,result_snapshot_id,result_evidence,recorded_by)
 VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,
  current_case.row_version,next_version,'approved','materialized','accepted',upper(result_kind),
  result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,
   'assignmentId',assignment_id,'qualificationId',new_qualification_id,'preferenceId',new_preference_id,
   'materializationId',materialization_id,'authorityEvidenceId',authority_evidence_id,
   'resultKind',result_kind,'bankVerificationId',verification_id,'reasonCode',reason_code),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
  event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
 VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,
  'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,
  'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,
   'businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,'qualificationId',new_qualification_id,
   'preferenceId',new_preference_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,
   'status','materialized','materializer','neon.business_partner_change','resultKind',result_kind,'bankVerificationId',verification_id),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'roleId',new_role_id,
  'qualificationId',COALESCE(new_qualification_id::text,''),'preferenceId',COALESCE(new_preference_id::text,''),
  'resultSnapshotId',result_snapshot,'rowVersion',next_version,'status','materialized','outboxId',outbox,
  'bankVerificationId',verification_id);
 UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
  status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,new_role_id,new_qualification_id,new_preference_id,result_snapshot,
  next_version,'materialized',false,outbox,verification_id;
END $$;

CREATE OR REPLACE FUNCTION master.fn_materialize_business_partner_case_relationships()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,shared
SET row_security=on AS $$
DECLARE
 payload jsonb; proposals jsonb; item jsonb; channel jsonb;
 owner_type_id uuid; address_id uuid; contact_id uuid; channel_id uuid;
 primary_addresses integer; primary_contacts integer; primary_channels integer;
 evidence_hash text;
BEGIN
 IF NOT(OLD.status='approved' AND NEW.status='materialized' AND NEW.entity_code='master.business_partner'
   AND NEW.operation_code IN('register','new_partner') AND NEW.target_entity_id IS NOT NULL
   AND NEW.decision_snapshot_id IS NOT NULL AND NEW.result_snapshot_id IS NOT NULL) THEN RETURN NEW; END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=NEW.tenant_id AND s.snapshot_id=NEW.decision_snapshot_id;
 proposals:=payload->'relationshipProposals';
 IF jsonb_typeof(proposals)<>'object' THEN RETURN NEW; END IF;
 IF jsonb_typeof(proposals->'addresses')<>'array' OR jsonb_typeof(proposals->'contactPersons')<>'array'
   OR jsonb_typeof(proposals->'contactChannels')<>'array' THEN
  RAISE EXCEPTION 'Relationship proposals must contain address, contact person, and channel arrays' USING ERRCODE='check_violation';
 END IF;
 SELECT count(*) FILTER(WHERE value->>'isPrimary'='true') INTO primary_addresses FROM jsonb_array_elements(proposals->'addresses');
 SELECT count(*) FILTER(WHERE value->>'isPrimary'='true') INTO primary_contacts FROM jsonb_array_elements(proposals->'contactPersons');
 SELECT count(*) INTO primary_channels FROM jsonb_array_elements(proposals->'contactChannels') c
  JOIN jsonb_array_elements(proposals->'contactPersons') p ON p.value->>'clientItemKey'=c.value->>'contactClientItemKey' AND p.value->>'isPrimary'='true'
  WHERE c.value->>'isPrimary'='true';
 IF jsonb_array_length(proposals->'addresses')<1 OR primary_addresses<>1 OR jsonb_array_length(proposals->'contactPersons')<1 OR primary_contacts<>1 OR primary_channels<1 THEN
  RAISE EXCEPTION 'Exactly one primary address and contact with a primary channel are required' USING ERRCODE='check_violation';
 END IF;
 SELECT id INTO owner_type_id FROM control.owner_type
  WHERE code='business_partner' AND (tenant_id IS NULL OR tenant_id=NEW.tenant_id)
  ORDER BY (tenant_id=NEW.tenant_id) DESC NULLS LAST LIMIT 1;
 IF owner_type_id IS NULL THEN RAISE EXCEPTION 'Business Partner owner type is unavailable' USING ERRCODE='data_exception'; END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(proposals->'addresses') LOOP
  address_id:=shared.uuidv7();
  INSERT INTO master.address(id,tenant_id,address_type,address_kind,line1,line2,city,region,postal_code,country_code,normalized_hash,
   formatted_address,validation_status,metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(address_id,NEW.tenant_id,item->>'purpose',COALESCE(NULLIF(item->>'addressKind',''),'street'),NULLIF(item->>'line1',''),NULLIF(item->>'line2',''),
   NULLIF(item->>'city',''),NULLIF(item->>'region',''),NULLIF(item->>'postalCode',''),(item->>'countryCode')::character(2),item->>'normalizedHash',
   NULLIF(concat_ws(', ',item->>'line1',item->>'line2',item->>'city',item->>'region',item->>'postalCode',item->>'countryCode'),''),
   'unverified',jsonb_build_object('sourceCaseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'clientItemKey',item->>'clientItemKey'),'active',clock_timestamp(),NEW.updated_by,NEW.updated_by);
  INSERT INTO master.address_link(tenant_id,owner_type_id,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
  VALUES(NEW.tenant_id,owner_type_id,NEW.target_entity_id,address_id,item->>'purpose',COALESCE((item->>'isPrimary')::boolean,false),CURRENT_DATE,
   jsonb_build_object('sourceCaseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'definitionFieldCode',item->>'definitionFieldCode'),NEW.updated_by);
  evidence_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'targetId',address_id,'clientItemKey',item->>'clientItemKey')::text,'UTF8'),'sha256'),'hex');
  INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,source_member_path,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
  VALUES(NEW.tenant_id,NEW.id,NEW.decision_snapshot_id,NEW.result_snapshot_id,'materialized_from','$.relationshipProposals.addresses['||(item->>'clientItemKey')||']','master.address',address_id,'neon.business_partner_relationships','1',evidence_hash,NEW.updated_by);
 END LOOP;

 FOR item IN SELECT value FROM jsonb_array_elements(proposals->'contactPersons') LOOP
  contact_id:=shared.uuidv7();
  INSERT INTO master.contact_person(id,tenant_id,owner_type_id,owner_id,contact_name,business_title,department_name,is_primary,metadata,status,created_by)
  VALUES(contact_id,NEW.tenant_id,owner_type_id,NEW.target_entity_id,item->>'contactName',NULLIF(item->>'businessTitle',''),NULLIF(item->>'departmentName',''),COALESCE((item->>'isPrimary')::boolean,false),
   jsonb_build_object('sourceCaseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'clientItemKey',item->>'clientItemKey'),'active',NEW.updated_by);
  IF NULLIF(item->>'roleCode','') IS NOT NULL THEN
   INSERT INTO master.contact_person_role(tenant_id,contact_person_id,role_code,is_primary,effective_from,metadata,created_by)
   VALUES(NEW.tenant_id,contact_id,item->>'roleCode',true,CURRENT_DATE,jsonb_build_object('sourceCaseId',NEW.id),NEW.updated_by);
  END IF;
  evidence_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'targetId',contact_id,'clientItemKey',item->>'clientItemKey')::text,'UTF8'),'sha256'),'hex');
  INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,source_member_path,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
  VALUES(NEW.tenant_id,NEW.id,NEW.decision_snapshot_id,NEW.result_snapshot_id,'materialized_from','$.relationshipProposals.contactPersons['||(item->>'clientItemKey')||']','master.contact_person',contact_id,'neon.business_partner_relationships','1',evidence_hash,NEW.updated_by);
  FOR channel IN SELECT value FROM jsonb_array_elements(proposals->'contactChannels') WHERE value->>'contactClientItemKey'=item->>'clientItemKey' LOOP
   channel_id:=shared.uuidv7();
   INSERT INTO master.contact_link(id,tenant_id,owner_type_id,owner_id,channel_type,value,purpose,role_qualifier,is_primary,is_verified,metadata,status,created_by)
   VALUES(channel_id,NEW.tenant_id,owner_type_id,NEW.target_entity_id,channel->>'channelType',channel->>'value',channel->>'purpose',contact_id::text,
    COALESCE((channel->>'isPrimary')::boolean,false),false,jsonb_build_object('sourceCaseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'contactPersonId',contact_id,'clientItemKey',channel->>'clientItemKey'),'active',NEW.updated_by);
   evidence_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'targetId',channel_id,'clientItemKey',channel->>'clientItemKey')::text,'UTF8'),'sha256'),'hex');
   INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,source_member_path,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
   VALUES(NEW.tenant_id,NEW.id,NEW.decision_snapshot_id,NEW.result_snapshot_id,'materialized_from','$.relationshipProposals.contactChannels['||(channel->>'clientItemKey')||']','master.contact_link',channel_id,'neon.business_partner_relationships','1',evidence_hash,NEW.updated_by);
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.command_materialize_mesh_profile_change_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,role_id uuid,
 qualification_id uuid,preference_id uuid,result_snapshot_id uuid,
 row_version bigint,case_status text,replayed boolean,outbox_id uuid,bank_verification_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared
SET row_security=on AS $$
DECLARE
 resolution document.mesh_profile_change_resolution%ROWTYPE; source_row snapshot.mesh_business_partner_profile_received%ROWTYPE; field text; canonical_field text; expected_value jsonb; current_values jsonb;
 fingerprint text; prior event.command_execution%ROWTYPE; execution uuid;
 current_case document.entity_case%ROWTYPE; payload jsonb; bp master.business_partner%ROWTYPE;
 bp_id uuid:=shared.uuidv7(); new_role_id uuid:=shared.uuidv7(); assignment_id uuid:=shared.uuidv7();
 new_qualification_id uuid; new_preference_id uuid; lifecycle record; authority_evidence_id uuid;
 result_snapshot uuid; next_version bigint; attempt_no integer; materialization_id uuid;
 outbox uuid; result jsonb; lineage_hash text; requested_role text; channel text;
 org_id uuid; verification_id uuid; bank_source record; to_state text; result_kind text; reason_code text;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
    OR shared.current_tenant_id() IS DISTINCT FROM p_tenant_id
    OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Business Partner role materialization context mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_case_id IS NULL OR p_expected_case_version IS NULL OR p_idempotency_key IS NULL OR p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'Business Partner role materialization arguments are invalid' USING ERRCODE='check_violation';
 END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
  'caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,
  'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e
  WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.mesh_profile_change'
    AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fingerprint OR prior.status<>'succeeded' THEN
   RAISE EXCEPTION 'Business Partner role materialization idempotency conflict' USING ERRCODE='unique_violation';
  END IF;
  RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,
   (prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'roleId')::uuid,
   NULLIF(prior.result_payload->>'qualificationId','')::uuid,NULLIF(prior.result_payload->>'preferenceId','')::uuid,
   (prior.result_payload->>'resultSnapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,
   prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid,
   (prior.result_payload->>'bankVerificationId')::uuid;
  RETURN;
 END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
  actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
 VALUES(p_tenant_id,'entity.case.materialize.mesh_profile_change',p_idempotency_key,fingerprint,'processing',
  p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
 RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current_case FROM document.entity_case c
  WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved entity case was not found' USING ERRCODE='no_data_found'; END IF;
 IF current_case.row_version<>p_expected_case_version THEN
  RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';
 END IF;
 IF current_case.status<>'approved' OR current_case.entity_code<>'master.business_partner'
    OR current_case.operation_code NOT IN('amend_partner')
    OR current_case.target_entity_id IS NULL OR current_case.decision_snapshot_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence approval
      WHERE approval.tenant_id=p_tenant_id AND approval.entity_case_id=p_case_id
       AND approval.after_status='approved' AND approval.outcome='accepted'
       AND approval.recorded_by<>current_case.created_by AND approval.after_version=current_case.row_version) THEN
  RAISE EXCEPTION 'An independently approved Business Partner change case is required' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current_case.decision_snapshot_id;
 IF payload IS NULL OR NOT EXISTS(SELECT 1 FROM runtime_meta.entity_contract contract WHERE contract.tenant_id=p_tenant_id AND contract.id=current_case.entity_contract_id AND contract.entity_contract_hash=current_case.entity_contract_hash AND contract.status='published')
    OR cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status='published'),payload))>0 THEN
  RAISE EXCEPTION 'Business Partner change violates its pinned contract' USING ERRCODE='check_violation';
 END IF;
 bp_id:=current_case.target_entity_id;
 new_role_id:=NULL; assignment_id:=NULL;
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business Partner change target is unavailable' USING ERRCODE='no_data_found'; END IF;
 IF NULLIF(payload->>'expectedBusinessPartnerVersion','')::bigint IS DISTINCT FROM bp.record_version
    OR payload->>'priorStatus' IS DISTINCT FROM bp.status::text THEN
  RAISE EXCEPTION 'Business Partner changed after proposal capture' USING ERRCODE='serialization_failure';
 END IF;
 reason_code:=payload->>'reasonCode';
 IF reason_code IS NULL OR reason_code !~ '^[A-Z][A-Z0-9_.-]{2,126}$' THEN
  RAISE EXCEPTION 'Business Partner change reason is required' USING ERRCODE='check_violation';
 END IF;
 SELECT r.* INTO resolution FROM document.mesh_profile_change_resolution r
  JOIN document.mesh_profile_change_case link ON link.tenant_id=r.tenant_id AND link.resolution_id=r.id
  WHERE r.tenant_id=p_tenant_id AND r.id=(payload->>'meshChangeResolutionId')::uuid AND link.entity_case_id=p_case_id
    AND r.business_partner_id=bp_id AND r.created_by=current_case.created_by;
 IF NOT FOUND OR resolution.expected_target_version<>bp.record_version OR bp.status<>'active'
  OR payload->>'meshChangeFingerprint' IS DISTINCT FROM resolution.preview_fingerprint
  OR payload->'meshChangeDecisions' IS DISTINCT FROM resolution.decisions OR payload->'meshChangePreview' IS DISTINCT FROM resolution.preview OR payload ? 'requestedRole'
  OR (payload->>'operatingOrganizationId')::uuid IS DISTINCT FROM resolution.operating_organization_id THEN
  RAISE EXCEPTION 'Pinned profile resolution does not match approved case and target' USING ERRCODE='serialization_failure';
 END IF;
 PERFORM 1 FROM control.mesh_business_partner_profile_projection p WHERE p.tenant_id=p_tenant_id
  AND p.id=resolution.projection_id AND p.current_snapshot_id=resolution.incoming_snapshot_id AND p.projection_status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Incoming profile was withdrawn or superseded' USING ERRCODE='serialization_failure'; END IF;
 SELECT s.* INTO source_row FROM snapshot.mesh_business_partner_profile_received s WHERE s.tenant_id=p_tenant_id AND s.id=resolution.incoming_snapshot_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM snapshot.mesh_business_partner_profile_received a WHERE a.tenant_id=p_tenant_id AND a.id=resolution.baseline_snapshot_id AND a.network_relationship_id=source_row.network_relationship_id AND a.publication_version<source_row.publication_version)
  OR NOT EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment a WHERE a.tenant_id=p_tenant_id AND a.business_partner_id=bp_id AND a.operating_organization_id=resolution.operating_organization_id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)) THEN
  RAISE EXCEPTION 'Profile baseline or operating organization is invalid' USING ERRCODE='check_violation';
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(resolution.decisions))<>7 OR (SELECT count(*) FROM jsonb_object_keys(resolution.proposed_values))<>7 THEN
  RAISE EXCEPTION 'Every profile field requires an explicit decision' USING ERRCODE='check_violation';
 END IF;
 current_values:=jsonb_build_object('displayName',bp.display_name,'legalName',bp.legal_name,'legalForm',bp.legal_form,'countryCode',bp.registration_country_code,'incorporationDate',bp.incorporation_date::text,'websiteUrl',bp.website_url,'description',bp.description);
 FOREACH field IN ARRAY ARRAY['displayName','legalName','legalForm','countryCode','incorporationDate','websiteUrl','description'] LOOP
  IF (resolution.decisions->>('partner.'||field) IS DISTINCT FROM 'source' AND resolution.decisions->>('partner.'||field) IS DISTINCT FROM 'local') OR NOT(resolution.decisions ? ('partner.'||field)) THEN
   RAISE EXCEPTION 'Unsupported profile decision' USING ERRCODE='check_violation';
  END IF;
  expected_value:=CASE WHEN resolution.decisions->>('partner.'||field)='source' THEN COALESCE(source_row.payload_json->'partner'->field,'null'::jsonb) ELSE current_values->field END;
  canonical_field:=CASE field WHEN 'countryCode' THEN 'registrationCountryCode' ELSE field END;
  IF resolution.proposed_values->('partner.'||field) IS DISTINCT FROM expected_value OR COALESCE(payload->canonical_field,'null'::jsonb) IS DISTINCT FROM expected_value THEN
   RAISE EXCEPTION 'Approved field values differ from retained choices' USING ERRCODE='check_violation';
  END IF;
 END LOOP;
 IF NULLIF(btrim(payload->>'legalName'),'') IS NULL THEN RAISE EXCEPTION 'Legal name is required' USING ERRCODE='check_violation'; END IF;
 UPDATE master.business_partner SET display_name=payload->>'displayName',legal_name=payload->>'legalName',legal_form=payload->>'legalForm',registration_country_code=(payload->>'registrationCountryCode')::character(2),incorporation_date=(payload->>'incorporationDate')::date,website_url=payload->>'websiteUrl',description=payload->>'description',updated_by=p_actor_id
  WHERE tenant_id=p_tenant_id AND id=bp_id;
 result_kind:='partner_amended';
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id;
 payload:=(payload-ARRAY['displayName','legalName','legalForm','registrationCountryCode','incorporationDate','websiteUrl','description'])||jsonb_strip_nulls(jsonb_build_object('displayName',bp.display_name,'legalName',bp.legal_name,'legalForm',bp.legal_form,'registrationCountryCode',bp.registration_country_code,'incorporationDate',bp.incorporation_date::text,'websiteUrl',bp.website_url,'description',bp.description));

 IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status='published'),payload))>0 THEN
  RAISE EXCEPTION 'Materialized Business Partner snapshot violates the pinned contract' USING ERRCODE='check_violation';
 END IF;
 result_snapshot:=snapshot.fn_capture_entity('master.business_partner',bp_id,bp.code,1,
  current_case.entity_contract_hash,bp.record_version,'entity.case.materialized','version',payload,
  p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current_case.row_version+1;
 SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m
  WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,
  result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,
  started_at,completed_at,requested_by,completed_by)
 VALUES(p_tenant_id,p_case_id,attempt_no,current_case.decision_snapshot_id,result_snapshot,
  'neon.mesh_profile_change','1',fingerprint,'succeeded',upper(result_kind),
  clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,
  'sourceSnapshotId',current_case.decision_snapshot_id,'targetSnapshotId',result_snapshot,
  'businessPartnerId',bp_id,'roleId',new_role_id,'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,
  lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
 VALUES(p_tenant_id,p_case_id,current_case.decision_snapshot_id,result_snapshot,'materialized_from',
  'master.business_partner',bp_id,'neon.mesh_profile_change','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET target_entity_id=bp_id,result_snapshot_id=result_snapshot,status='materialized',
  row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
  request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
  result_code,result_snapshot_id,result_evidence,recorded_by)
 VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,
  current_case.row_version,next_version,'approved','materialized','accepted',upper(result_kind),
  result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,
   'assignmentId',assignment_id,'qualificationId',new_qualification_id,'preferenceId',new_preference_id,
   'materializationId',materialization_id,'authorityEvidenceId',authority_evidence_id,
   'resultKind',result_kind,'bankVerificationId',verification_id,'reasonCode',reason_code),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
  event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
 VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,
  'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,
  'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,
   'businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,'qualificationId',new_qualification_id,
   'preferenceId',new_preference_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,
   'status','materialized','materializer','neon.mesh_profile_change','resultKind',result_kind,'bankVerificationId',verification_id),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'roleId',new_role_id,
  'qualificationId',COALESCE(new_qualification_id::text,''),'preferenceId',COALESCE(new_preference_id::text,''),
  'resultSnapshotId',result_snapshot,'rowVersion',next_version,'status','materialized','outboxId',outbox,
  'bankVerificationId',verification_id);
 UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
  status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,new_role_id,new_qualification_id,new_preference_id,result_snapshot,
  next_version,'materialized',false,outbox,verification_id;
END $$;

CREATE FUNCTION master.trg_register_provisional_bank() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE p master.bank_provisional_reference;
BEGIN
 IF NEW.bank_institution_id IS NULL THEN
  IF NEW.provisional_bank_reference_id IS NULL THEN
   INSERT INTO master.bank_provisional_reference(tenant_id,submitted_name,submitted_country,submitted_bic)
   VALUES(NEW.tenant_id,NEW.bank_name_override,NEW.bank_country_override,NEW.bic_override)
   RETURNING id INTO NEW.provisional_bank_reference_id;
  ELSE
   SELECT * INTO p FROM master.bank_provisional_reference WHERE tenant_id=NEW.tenant_id AND id=NEW.provisional_bank_reference_id;
   IF NOT FOUND OR ROW(p.submitted_name,p.submitted_country,p.submitted_bic) IS DISTINCT FROM ROW(NEW.bank_name_override,NEW.bank_country_override,NEW.bic_override) THEN RAISE EXCEPTION 'Provisional bank reference does not match submitted details'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
