-- G4 data protection and stewardship. Protected bank values remain in the
-- bank authority only; every ordinary evidence/event payload is hash/mask only.

CREATE TABLE mesh.bank_disclosure_purpose (
  code text NOT NULL,
  name text NOT NULL,
  owner_relationship_role text NOT NULL,
  recipient_relationship_role text NOT NULL,
  required_capability_code text NOT NULL,
  maximum_retrieval_seconds integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  CONSTRAINT bank_disclosure_purpose_pkey PRIMARY KEY(code),
  CONSTRAINT bank_disclosure_purpose_code_chk CHECK(code~'^[a-z][a-z0-9_.-]{1,62}$'),
  CONSTRAINT bank_disclosure_purpose_name_chk CHECK(length(btrim(name)) BETWEEN 1 AND 128),
  CONSTRAINT bank_disclosure_purpose_roles_chk CHECK(
    owner_relationship_role IN('buyer','supplier') AND
    recipient_relationship_role IN('buyer','supplier') AND
    owner_relationship_role<>recipient_relationship_role),
  CONSTRAINT bank_disclosure_purpose_capability_chk CHECK(required_capability_code IN('payments')),
  CONSTRAINT bank_disclosure_purpose_ttl_chk CHECK(maximum_retrieval_seconds BETWEEN 30 AND 900),
  CONSTRAINT bank_disclosure_purpose_status_chk CHECK(status IN('active','deprecated','retired'))
);

INSERT INTO mesh.bank_disclosure_purpose(
  code,name,owner_relationship_role,recipient_relationship_role,
  required_capability_code,maximum_retrieval_seconds,created_by
) VALUES
  ('settlement','Settlement','supplier','buyer','payments',300,'00000000-0000-0000-0000-000000000000'),
  ('refund','Refund','buyer','supplier','payments',300,'00000000-0000-0000-0000-000000000000');

INSERT INTO master.audit_event_contract(
  code,event_code_pattern,priority,allowed_operations,default_severity,
  allowed_actor_types,allowed_scope,reason_required,capture_mode,
  max_payload_bytes,schema_version,metadata,status
) VALUES(
  'mesh_protected_value_event','^data\.mesh_bank_retrieved$',14,
  ARRAY['execute']::audit.operation_d[],'warning',
  ARRAY['user','service_account','system']::audit.actor_type_d[],
  'tenant',false,'metadata',8192,1,
  '{"event_category":"protected_value","owner":"mesh-payments-security","purpose":"purpose_bound_bank_retrieval"}',
  'active'
) ON CONFLICT(code) DO NOTHING;

ALTER TABLE mesh.bank_account_link
  DROP CONSTRAINT mesh_bank_account_link_purpose_chk,
  ADD CONSTRAINT mesh_bank_account_link_purpose_fk FOREIGN KEY(purpose)
    REFERENCES mesh.bank_disclosure_purpose(code) ON DELETE RESTRICT,
  DROP CONSTRAINT mesh_bank_account_link_metadata_chk,
  ADD CONSTRAINT mesh_bank_account_link_metadata_chk CHECK(
    jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096 AND
    metadata-ARRAY['_seed','sourceReference','notes']::text[]='{}'::jsonb);

ALTER TABLE mesh.bank_account_disclosure
  DROP CONSTRAINT bank_account_disclosure_purpose_chk,
  ADD CONSTRAINT bank_account_disclosure_purpose_fk FOREIGN KEY(purpose)
    REFERENCES mesh.bank_disclosure_purpose(code) ON DELETE RESTRICT,
  DROP CONSTRAINT bank_account_disclosure_metadata_chk,
  ADD CONSTRAINT bank_account_disclosure_metadata_chk CHECK(
    jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096 AND
    metadata-ARRAY['_seed','sourceReference','approvalReference']::text[]='{}'::jsonb);

ALTER TABLE mesh.network_account
  ADD COLUMN capabilities_contract_name text NOT NULL DEFAULT 'mesh.network-account-capabilities',
  ADD COLUMN capabilities_contract_version integer NOT NULL DEFAULT 1,
  ADD COLUMN capabilities_contract_hash char(64) NOT NULL DEFAULT '948e75f92322a56e0e47dbcc2b665c9d21d935fbc36e6a9ed65065c4f2748e41',
  ADD COLUMN metadata_contract_name text NOT NULL DEFAULT 'mesh.network-account-metadata',
  ADD COLUMN metadata_contract_version integer NOT NULL DEFAULT 1,
  ADD COLUMN metadata_contract_hash char(64) NOT NULL DEFAULT 'db11d1ce09619543edebc85bc7c9b458643688613268287279450a080b61fa93',
  ADD CONSTRAINT network_account_contract_release_chk CHECK(
    capabilities_contract_name='mesh.network-account-capabilities' AND
    capabilities_contract_version=1 AND
    capabilities_contract_hash='948e75f92322a56e0e47dbcc2b665c9d21d935fbc36e6a9ed65065c4f2748e41' AND
    metadata_contract_name='mesh.network-account-metadata' AND
    metadata_contract_version=1 AND
    metadata_contract_hash='db11d1ce09619543edebc85bc7c9b458643688613268287279450a080b61fa93'),
  ADD CONSTRAINT network_account_capabilities_allowlist_chk CHECK(
    capabilities-ARRAY['documentKinds','protocols','regions','features']::text[]='{}'::jsonb),
  ADD CONSTRAINT network_account_metadata_allowlist_chk CHECK(
    metadata-ARRAY['_seed','externalScopeKey','sourceReference','tags','onboardingChannel']::text[]='{}'::jsonb);

ALTER TABLE mesh.network_account_profile
  DROP CONSTRAINT network_account_profile_website_chk,
  ADD CONSTRAINT network_account_profile_metadata_allowlist_chk CHECK(
    metadata-ARRAY['_seed','sourceReference','tags']::text[]='{}'::jsonb);
ALTER TABLE mesh.network_account_commodity_capability
  DROP CONSTRAINT network_account_commodity_capability_metadata_chk,
  ADD CONSTRAINT network_account_commodity_capability_metadata_chk CHECK(
    jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096 AND
    metadata-ARRAY['_seed','sourceReference','certifications','regions']::text[]='{}'::jsonb);
ALTER TABLE mesh.bank_account
  ADD CONSTRAINT mesh_bank_account_metadata_allowlist_chk CHECK(
    metadata-ARRAY['_seed','sourceReference','verificationReference','provider','labels']::text[]='{}'::jsonb);

CREATE OR REPLACE FUNCTION mesh.is_hardened_https_url(p_value text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT p_value IS NOT NULL
     AND p_value=btrim(p_value)
     AND length(p_value)<=2048
     AND p_value!~'[[:cntrl:][:space:]\\]'
     AND p_value!~'@'
     AND p_value~'^https://([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?::[0-9]{1,5})?(?:[/?#][^[:space:]\\]*)?$'
$$;
ALTER TABLE mesh.network_account_profile
  ADD CONSTRAINT network_account_profile_website_chk CHECK(
    website_url IS NULL OR mesh.is_hardened_https_url(website_url));

CREATE TABLE mesh.network_account_profile_address (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  network_account_id uuid NOT NULL,
  address_kind text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  locality text NOT NULL,
  administrative_area text,
  postal_code text,
  country_code character(2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT network_account_profile_address_pkey PRIMARY KEY(id),
  CONSTRAINT network_account_profile_address_tenant_uq UNIQUE(tenant_id,id),
  CONSTRAINT network_account_profile_address_kind_chk CHECK(address_kind IN('registered','remittance','operational')),
  CONSTRAINT network_account_profile_address_values_chk CHECK(
    length(btrim(address_line1)) BETWEEN 1 AND 256 AND
    (address_line2 IS NULL OR length(btrim(address_line2)) BETWEEN 1 AND 256) AND
    length(btrim(locality)) BETWEEN 1 AND 128 AND
    (administrative_area IS NULL OR length(btrim(administrative_area)) BETWEEN 1 AND 128) AND
    (postal_code IS NULL OR length(btrim(postal_code)) BETWEEN 1 AND 32)),
  CONSTRAINT network_account_profile_address_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT network_account_profile_address_status_chk CHECK(status IN('active','inactive')),
  CONSTRAINT network_account_profile_address_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
  CONSTRAINT network_account_profile_address_account_fk FOREIGN KEY(tenant_id,network_account_id)
    REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT network_account_profile_address_country_fk FOREIGN KEY(country_code)
    REFERENCES shared.country(code) ON DELETE RESTRICT,
  CONSTRAINT network_account_profile_address_created_by_fk FOREIGN KEY(tenant_id,created_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT network_account_profile_address_updated_by_fk FOREIGN KEY(tenant_id,updated_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX network_account_profile_address_current_uq
  ON mesh.network_account_profile_address(tenant_id,network_account_id,address_kind)
  WHERE status='active' AND effective_until IS NULL;

CREATE TABLE mesh.bank_account_retrieval_evidence (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  recipient_tenant_id uuid NOT NULL,
  recipient_account_id uuid NOT NULL,
  disclosure_id uuid NOT NULL,
  purpose_code text NOT NULL,
  disclosure_version integer NOT NULL,
  protection_key_version integer NOT NULL,
  protected_token_hash char(64) NOT NULL,
  command_fingerprint char(64) NOT NULL,
  idempotency_key text NOT NULL,
  authorized_until timestamptz NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retrieved_by uuid NOT NULL,
  CONSTRAINT bank_account_retrieval_evidence_pkey PRIMARY KEY(id),
  CONSTRAINT bank_account_retrieval_evidence_key_uq UNIQUE(recipient_tenant_id,idempotency_key),
  CONSTRAINT bank_account_retrieval_evidence_hash_chk CHECK(
    protected_token_hash~'^[a-f0-9]{64}$' AND command_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT bank_account_retrieval_evidence_version_chk CHECK(disclosure_version>=1 AND protection_key_version>=1),
  CONSTRAINT bank_account_retrieval_evidence_key_chk CHECK(
    btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT bank_account_retrieval_evidence_expiry_chk CHECK(authorized_until>retrieved_at),
  CONSTRAINT bank_account_retrieval_evidence_disclosure_fk FOREIGN KEY(disclosure_id)
    REFERENCES mesh.bank_account_disclosure(id) ON DELETE RESTRICT,
  CONSTRAINT bank_account_retrieval_evidence_purpose_fk FOREIGN KEY(purpose_code)
    REFERENCES mesh.bank_disclosure_purpose(code) ON DELETE RESTRICT,
  CONSTRAINT bank_account_retrieval_evidence_actor_fk FOREIGN KEY(recipient_tenant_id,retrieved_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE mesh.canonical_party_correlation_case (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  network_account_id uuid NOT NULL,
  current_canonical_party_id uuid,
  proposed_canonical_party_id uuid NOT NULL,
  reason text NOT NULL,
  resolution_reason text,
  status text NOT NULL DEFAULT 'open',
  row_version bigint NOT NULL DEFAULT 1,
  opened_by uuid NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT canonical_party_correlation_case_pkey PRIMARY KEY(id),
  CONSTRAINT canonical_party_correlation_case_tenant_uq UNIQUE(tenant_id,id),
  CONSTRAINT canonical_party_correlation_case_claim_chk CHECK(
    proposed_canonical_party_id IS DISTINCT FROM current_canonical_party_id),
  CONSTRAINT canonical_party_correlation_case_reason_chk CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  CONSTRAINT canonical_party_correlation_case_status_chk CHECK(status IN('open','accepted','rejected')),
  CONSTRAINT canonical_party_correlation_case_resolution_chk CHECK(
    (status='open' AND resolution_reason IS NULL AND resolved_by IS NULL AND resolved_at IS NULL) OR
    (status IN('accepted','rejected') AND length(btrim(resolution_reason)) BETWEEN 1 AND 2000 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT canonical_party_correlation_case_version_chk CHECK(row_version>=1),
  CONSTRAINT canonical_party_correlation_case_account_fk FOREIGN KEY(tenant_id,network_account_id)
    REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT canonical_party_correlation_case_opened_by_fk FOREIGN KEY(tenant_id,opened_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT canonical_party_correlation_case_resolved_by_fk FOREIGN KEY(tenant_id,resolved_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX canonical_party_correlation_case_open_uq
  ON mesh.canonical_party_correlation_case(tenant_id,network_account_id) WHERE status='open';

ALTER TABLE mesh.network_command_evidence DROP CONSTRAINT network_command_evidence_kind_chk,
  ADD CONSTRAINT network_command_evidence_kind_chk CHECK(aggregate_kind IN(
    'network_account','network_relationship','network_relationship_capability',
    'registration_exchange','bank_account','canonical_party_correlation_case',
    'catalog','document_envelope'));

CREATE OR REPLACE FUNCTION mesh.trg_normalize_bank_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
BEGIN
  IF TG_TABLE_NAME='bank_party' THEN
    NEW.code:=lower(btrim(NEW.code));NEW.name:=btrim(NEW.name);
    NEW.bic:=nullif(upper(regexp_replace(NEW.bic,'\s+','','g')),'');
  ELSE
    NEW.code:=nullif(lower(btrim(NEW.code)),'');NEW.name:=nullif(btrim(NEW.name),'');
    NEW.account_holder_name:=btrim(NEW.account_holder_name);
    NEW.protected_value_token:=btrim(NEW.protected_value_token);
    NEW.identifier_fingerprint:=lower(NEW.identifier_fingerprint);
    NEW.account_last4:=upper(btrim(NEW.account_last4));
    NEW.bic_override:=nullif(upper(regexp_replace(NEW.bic_override,'\s+','','g')),'');
  END IF;RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mesh_bank_account_normalize ON mesh.bank_account;
CREATE TRIGGER trg_mesh_bank_account_normalize
BEFORE INSERT OR UPDATE OF code,name,account_holder_name,protected_value_token,
  identifier_fingerprint,account_last4,bic_override
ON mesh.bank_account FOR EACH ROW EXECUTE FUNCTION mesh.trg_normalize_bank_identity();

CREATE OR REPLACE FUNCTION mesh.trg_guard_bank_account_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_evidence uuid;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.network_account_id IS DISTINCT FROM OLD.network_account_id
     OR NEW.account_id_type IS DISTINCT FROM OLD.account_id_type
     OR NEW.identifier_fingerprint IS DISTINCT FROM OLD.identifier_fingerprint
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Mesh bank-account identity is immutable' USING ERRCODE='check_violation';
  END IF;
  IF ROW(NEW.protected_value_token,NEW.protection_key_version)
     IS DISTINCT FROM ROW(OLD.protected_value_token,OLD.protection_key_version) THEN
    BEGIN v_evidence:=nullif(current_setting('app.mesh_command_evidence_id',true),'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_evidence:=NULL;END;
    IF v_evidence IS NULL OR NOT EXISTS(
      SELECT 1 FROM mesh.network_command_evidence e WHERE e.id=v_evidence
       AND e.aggregate_kind='bank_account' AND e.aggregate_id=NEW.id
       AND e.command_code='bank_token_rotate'
       AND (e.evidence->>'oldKeyVersion')::integer=OLD.protection_key_version
       AND (e.evidence->>'newKeyVersion')::integer=NEW.protection_key_version
       AND e.evidence->>'oldTokenHash'=encode(public.digest(convert_to(OLD.protected_value_token,'UTF8'),'sha256'),'hex')
       AND e.evidence->>'newTokenHash'=encode(public.digest(convert_to(NEW.protected_value_token,'UTF8'),'sha256'),'hex')) THEN
      RAISE EXCEPTION 'Bank token rotation requires its command function' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_bank_disclosure()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,mesh AS $$
DECLARE v_relationship mesh.network_relationship%ROWTYPE;v_purpose mesh.bank_disclosure_purpose%ROWTYPE;v_actual_owner text;v_actual_recipient text;
BEGIN
  SELECT * INTO v_relationship FROM mesh.network_relationship WHERE id=NEW.network_relationship_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank disclosure requires an active relationship' USING ERRCODE='foreign_key_violation';END IF;
  SELECT * INTO v_purpose FROM mesh.bank_disclosure_purpose WHERE code=NEW.purpose AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank disclosure purpose is not active' USING ERRCODE='foreign_key_violation';END IF;
  v_actual_owner:=CASE WHEN (NEW.owner_tenant_id,NEW.owner_account_id)=(v_relationship.buyer_tenant_id,v_relationship.buyer_account_id) THEN 'buyer' WHEN (NEW.owner_tenant_id,NEW.owner_account_id)=(v_relationship.supplier_tenant_id,v_relationship.supplier_account_id) THEN 'supplier' END;
  v_actual_recipient:=CASE WHEN (NEW.recipient_tenant_id,NEW.recipient_account_id)=(v_relationship.buyer_tenant_id,v_relationship.buyer_account_id) THEN 'buyer' WHEN (NEW.recipient_tenant_id,NEW.recipient_account_id)=(v_relationship.supplier_tenant_id,v_relationship.supplier_account_id) THEN 'supplier' END;
  IF v_actual_owner IS DISTINCT FROM v_purpose.owner_relationship_role OR v_actual_recipient IS DISTINCT FROM v_purpose.recipient_relationship_role THEN
    RAISE EXCEPTION 'Bank disclosure participants violate governed purpose direction' USING ERRCODE='check_violation';
  END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_rotate_bank_protected_token(
  p_bank_account_id uuid,p_new_token text,p_new_key_version integer,
  p_reason text,p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(bank_account_id uuid,protection_key_version integer,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_row mesh.bank_account%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_hash text;v_evidence uuid;v_old_hash text;v_new_hash text;
BEGIN
  IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_new_token IS NULL OR btrim(p_new_token)<>p_new_token OR length(p_new_token) NOT BETWEEN 8 AND 512 OR p_new_token!~'^[A-Za-z0-9][A-Za-z0-9._:/-]+$' OR p_new_token~'(\.\.|//)' OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid bank token rotation' USING ERRCODE='check_violation';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('bankAccountId',p_bank_account_id,'newTokenHash',encode(public.digest(convert_to(p_new_token,'UTF8'),'sha256'),'hex'),'newKeyVersion',p_new_key_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,(v_existing.evidence->>'newKeyVersion')::integer,v_existing.id,true;RETURN;END IF;
  SELECT * INTO v_row FROM mesh.bank_account WHERE tenant_id=v_actor AND id=p_bank_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account is not visible to owner' USING ERRCODE='no_data_found';END IF;
  IF p_new_key_version<>v_row.protection_key_version+1 OR p_new_token=v_row.protected_value_token THEN RAISE EXCEPTION 'Bank token rotation version is stale or token is unchanged' USING ERRCODE='serialization_failure';END IF;
  v_old_hash:=encode(public.digest(convert_to(v_row.protected_value_token,'UTF8'),'sha256'),'hex');v_new_hash:=encode(public.digest(convert_to(p_new_token,'UTF8'),'sha256'),'hex');
  v_evidence:=mesh.fn_record_network_command(v_actor,NULL,'bank_account',v_row.id,'bank_token_rotate','key_v'||v_row.protection_key_version::text,'key_v'||p_new_key_version::text,v_row.protection_key_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('oldKeyVersion',v_row.protection_key_version,'newKeyVersion',p_new_key_version,'oldTokenHash',v_old_hash,'newTokenHash',v_new_hash),p_actor_id);
  PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);
  UPDATE mesh.bank_account SET protected_value_token=p_new_token,protection_key_version=p_new_key_version,updated_by=p_actor_id WHERE id=v_row.id;
  PERFORM set_config('app.mesh_command_evidence_id','',true);
  RETURN QUERY SELECT v_row.id,p_new_key_version,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_retrieve_bank_protected_token(
  p_disclosure_id uuid,p_expected_disclosure_version integer,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(protected_value_token text,protection_key_version integer,authorized_until timestamptz,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared,audit AS $$
DECLARE v_disclosure mesh.bank_account_disclosure%ROWTYPE;v_bank mesh.bank_account%ROWTYPE;v_purpose mesh.bank_disclosure_purpose%ROWTYPE;v_existing mesh.bank_account_retrieval_evidence%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_hash text;v_token_hash text;v_until timestamptz;v_id uuid:=shared.uuidv7();
BEGIN
  IF NOT pg_has_role(session_user,'athyper_protected_value_retriever','MEMBER') OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_expected_disclosure_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Protected bank retrieval is not authorized' USING ERRCODE='insufficient_privilege';END IF;
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('disclosureId',p_disclosure_id,'expectedVersion',p_expected_disclosure_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':bank-retrieval:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM mesh.bank_account_retrieval_evidence WHERE recipient_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
  SELECT d.* INTO v_disclosure FROM mesh.bank_account_disclosure d WHERE d.id=p_disclosure_id AND d.recipient_tenant_id=v_actor FOR SHARE;
  IF NOT FOUND OR v_disclosure.status<>'active' OR v_disclosure.disclosure_version<>p_expected_disclosure_version OR (v_disclosure.expires_at IS NOT NULL AND v_disclosure.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Disclosure is unavailable, stale, expired or revoked' USING ERRCODE='insufficient_privilege';END IF;
  SELECT * INTO v_purpose FROM mesh.bank_disclosure_purpose WHERE code=v_disclosure.purpose AND status='active';
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM mesh.network_relationship_capability c WHERE c.network_relationship_id=v_disclosure.network_relationship_id AND c.capability_code=v_purpose.required_capability_code AND c.status='active' AND c.effective_from<=CURRENT_DATE AND (c.effective_until IS NULL OR c.effective_until>CURRENT_DATE)) THEN RAISE EXCEPTION 'Required relationship capability is unavailable' USING ERRCODE='insufficient_privilege';END IF;
  SELECT * INTO v_bank FROM mesh.bank_account WHERE id=v_disclosure.bank_account_id;
  v_token_hash:=encode(public.digest(convert_to(v_bank.protected_value_token,'UTF8'),'sha256'),'hex');
  IF v_existing.id IS NOT NULL THEN IF v_existing.command_fingerprint<>v_hash OR v_existing.protected_token_hash<>v_token_hash OR v_existing.authorized_until<=clock_timestamp() THEN RAISE EXCEPTION 'Retrieval replay is stale or mismatched' USING ERRCODE='serialization_failure';END IF;RETURN QUERY SELECT v_bank.protected_value_token,v_bank.protection_key_version,v_existing.authorized_until,v_existing.id,true;RETURN;END IF;
  v_until:=least(COALESCE(v_disclosure.expires_at,'infinity'::timestamptz),clock_timestamp()+make_interval(secs=>v_purpose.maximum_retrieval_seconds));
  INSERT INTO mesh.bank_account_retrieval_evidence(id,recipient_tenant_id,recipient_account_id,disclosure_id,purpose_code,disclosure_version,protection_key_version,protected_token_hash,command_fingerprint,idempotency_key,authorized_until,retrieved_by) VALUES(v_id,v_actor,v_disclosure.recipient_account_id,v_disclosure.id,v_disclosure.purpose,v_disclosure.disclosure_version,v_bank.protection_key_version,v_token_hash,v_hash,p_idempotency_key,v_until,p_actor_id);
  PERFORM audit.append_event(p_event_code=>'data.mesh_bank_retrieved',p_operation=>'execute',p_entity_type=>'bank_account_disclosure',p_entity_id=>v_disclosure.id,p_context=>jsonb_build_object('retrievalEvidenceId',v_id,'purpose',v_disclosure.purpose,'recipientAccountId',v_disclosure.recipient_account_id,'authorizedUntil',v_until,'protectionKeyVersion',v_bank.protection_key_version));
  RETURN QUERY SELECT v_bank.protected_value_token,v_bank.protection_key_version,v_until,v_id,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_open_canonical_party_correlation_case(
  p_network_account_id uuid,p_proposed_canonical_party_id uuid,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(case_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_account mesh.network_account%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_id uuid:=shared.uuidv7();v_hash text;v_evidence uuid;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_proposed_canonical_party_id IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid correlation dispute' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('networkAccountId',p_network_account_id,'proposedCanonicalPartyId',p_proposed_canonical_party_id,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT * INTO v_account FROM mesh.network_account WHERE tenant_id=v_actor AND id=p_network_account_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Network account is not visible to owner' USING ERRCODE='no_data_found';END IF;IF v_account.canonical_party_id IS NOT DISTINCT FROM p_proposed_canonical_party_id THEN RAISE EXCEPTION 'Correlation claim does not conflict' USING ERRCODE='check_violation';END IF;
 v_evidence:=mesh.fn_record_network_command(v_actor,NULL,'canonical_party_correlation_case',v_id,'correlation_open','none','open',0,p_reason,p_idempotency_key,v_hash,jsonb_build_object('networkAccountId',v_account.id,'currentCanonicalPartyId',v_account.canonical_party_id,'proposedCanonicalPartyId',p_proposed_canonical_party_id),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);INSERT INTO mesh.canonical_party_correlation_case(id,tenant_id,network_account_id,current_canonical_party_id,proposed_canonical_party_id,reason,status,row_version,opened_by)VALUES(v_id,v_actor,v_account.id,v_account.canonical_party_id,p_proposed_canonical_party_id,p_reason,'open',1,p_actor_id);PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT v_id,'open'::text,1::bigint,v_evidence,false;
END $$;

CREATE OR REPLACE FUNCTION mesh.command_resolve_canonical_party_correlation_case(
  p_case_id uuid,p_action text,p_expected_version bigint,p_reason text,
  p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(case_id uuid,status text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,mesh,shared AS $$
DECLARE v_case mesh.canonical_party_correlation_case%ROWTYPE;v_actor uuid:=shared.current_tenant_id();v_existing mesh.network_command_evidence%ROWTYPE;v_hash text;v_evidence uuid;v_to text;
BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM p_actor_id OR p_action NOT IN('accept','reject') OR p_expected_version<1 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid correlation resolution' USING ERRCODE='check_violation';END IF;
 v_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':mesh:'||p_idempotency_key,0));SELECT * INTO v_existing FROM mesh.network_command_evidence WHERE actor_tenant_id=v_actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.command_fingerprint<>v_hash THEN RAISE EXCEPTION 'Mesh idempotency key was reused with a different command' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;RETURN;END IF;
 SELECT * INTO v_case FROM mesh.canonical_party_correlation_case WHERE tenant_id=v_actor AND id=p_case_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Correlation case is not visible to owner' USING ERRCODE='no_data_found';END IF;IF v_case.status<>'open' OR v_case.row_version<>p_expected_version OR v_case.opened_by=p_actor_id THEN RAISE EXCEPTION 'Correlation resolution is stale, terminal or violates maker-checker' USING ERRCODE='serialization_failure';END IF;
 v_to:=CASE p_action WHEN 'accept' THEN 'accepted' ELSE 'rejected' END;v_evidence:=mesh.fn_record_network_command(v_actor,NULL,'canonical_party_correlation_case',v_case.id,'correlation_'||p_action,'open',v_to,p_expected_version,p_reason,p_idempotency_key,v_hash,jsonb_build_object('networkAccountId',v_case.network_account_id,'currentCanonicalPartyId',v_case.current_canonical_party_id,'proposedCanonicalPartyId',v_case.proposed_canonical_party_id),p_actor_id);PERFORM set_config('app.mesh_command_evidence_id',v_evidence::text,true);IF p_action='accept' THEN UPDATE mesh.network_account SET canonical_party_id=v_case.proposed_canonical_party_id,updated_by=p_actor_id WHERE tenant_id=v_actor AND id=v_case.network_account_id AND canonical_party_id IS NOT DISTINCT FROM v_case.current_canonical_party_id;IF NOT FOUND THEN RAISE EXCEPTION 'Canonical-party correlation changed concurrently' USING ERRCODE='serialization_failure';END IF;END IF;UPDATE mesh.canonical_party_correlation_case AS target SET status=v_to,row_version=target.row_version+1,resolution_reason=p_reason,resolved_by=p_actor_id,resolved_at=clock_timestamp() WHERE target.id=v_case.id;PERFORM set_config('app.mesh_command_evidence_id','',true);RETURN QUERY SELECT v_case.id,v_to,p_expected_version+1,v_evidence,false;
END $$;

CREATE TRIGGER trg_canonical_party_correlation_case_command BEFORE INSERT OR UPDATE OF status,row_version ON mesh.canonical_party_correlation_case FOR EACH ROW EXECUTE FUNCTION mesh.trg_enforce_g3_command();
CREATE TRIGGER trg_canonical_party_correlation_case_immutable BEFORE UPDATE ON mesh.canonical_party_correlation_case FOR EACH ROW WHEN(NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.network_account_id IS DISTINCT FROM OLD.network_account_id OR NEW.current_canonical_party_id IS DISTINCT FROM OLD.current_canonical_party_id OR NEW.proposed_canonical_party_id IS DISTINCT FROM OLD.proposed_canonical_party_id OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.opened_by IS DISTINCT FROM OLD.opened_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_canonical_party_correlation_case_no_delete BEFORE DELETE ON mesh.canonical_party_correlation_case FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_bank_account_retrieval_evidence_immutable BEFORE UPDATE OR DELETE ON mesh.bank_account_retrieval_evidence FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_immutable_exchange_evidence();
CREATE TRIGGER trg_network_account_profile_address_updated BEFORE UPDATE ON mesh.network_account_profile_address FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE mesh.bank_disclosure_purpose ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.bank_disclosure_purpose FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_address ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.network_account_profile_address FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_retrieval_evidence ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.bank_account_retrieval_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.canonical_party_correlation_case ENABLE ROW LEVEL SECURITY;ALTER TABLE mesh.canonical_party_correlation_case FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_disclosure_purpose_read ON mesh.bank_disclosure_purpose FOR SELECT USING(true);CREATE POLICY bank_disclosure_purpose_owner ON mesh.bank_disclosure_purpose FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY network_account_profile_address_tenant ON mesh.network_account_profile_address USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());CREATE POLICY network_account_profile_address_owner ON mesh.network_account_profile_address FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY bank_account_retrieval_evidence_recipient ON mesh.bank_account_retrieval_evidence FOR SELECT USING(recipient_tenant_id=shared.current_tenant_id_soft());CREATE POLICY bank_account_retrieval_evidence_owner ON mesh.bank_account_retrieval_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY canonical_party_correlation_case_tenant ON mesh.canonical_party_correlation_case FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());CREATE POLICY canonical_party_correlation_case_owner ON mesh.canonical_party_correlation_case FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

REVOKE ALL ON mesh.bank_disclosure_purpose,mesh.network_account_profile_address,mesh.bank_account_retrieval_evidence,mesh.canonical_party_correlation_case FROM PUBLIC;
GRANT SELECT ON mesh.bank_disclosure_purpose,mesh.network_account_profile_address,mesh.canonical_party_correlation_case TO athyperapp;
GRANT INSERT,UPDATE ON mesh.network_account_profile_address TO athyperapp;
GRANT ALL PRIVILEGES ON mesh.bank_disclosure_purpose,mesh.network_account_profile_address,mesh.bank_account_retrieval_evidence,mesh.canonical_party_correlation_case TO athyperadmin;
REVOKE INSERT,UPDATE,DELETE ON mesh.bank_account_retrieval_evidence,mesh.canonical_party_correlation_case FROM athyperapp;
GRANT USAGE ON SCHEMA mesh TO athyper_protected_value_retriever;
REVOKE ALL ON FUNCTION mesh.command_rotate_bank_protected_token(uuid,text,integer,text,text,uuid),mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid),mesh.command_open_canonical_party_correlation_case(uuid,uuid,text,text,uuid),mesh.command_resolve_canonical_party_correlation_case(uuid,text,bigint,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesh.command_rotate_bank_protected_token(uuid,text,integer,text,text,uuid),mesh.command_open_canonical_party_correlation_case(uuid,uuid,text,text,uuid),mesh.command_resolve_canonical_party_correlation_case(uuid,text,bigint,text,text,uuid) TO athyperapp,athyperadmin;
GRANT EXECUTE ON FUNCTION mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid) TO athyper_protected_value_retriever;

COMMENT ON TABLE mesh.bank_account_retrieval_evidence IS 'Immutable purpose-bound retrieval audit. Contains token hashes and authorization coordinates only, never a token or bank identifier.';
COMMENT ON TABLE mesh.canonical_party_correlation_case IS 'Stewarded conflicting correlation claim. Opening a case grants no access and never overwrites the current canonical-party coordinate.';
