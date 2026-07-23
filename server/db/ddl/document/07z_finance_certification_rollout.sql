-- Stage F late-slot production posting gate. Capability is globally available, but only
-- an effective rollout_mode=enforce policy blocks production journals.
CREATE OR REPLACE FUNCTION document.trg_je_finance_readiness_gate_fn()
RETURNS trigger LANGUAGE plpgsql
SET search_path=document,governance,master,control,pg_catalog AS $$
DECLARE v_capability_enabled boolean:=false;v_rollout_mode text:='observe';v_company_code text;
BEGIN
  IF NEW.status<>'posted' OR OLD.status='posted' OR NEW.is_reversal
     OR NEW.source_doc_type IN('opening_balance','finance_setup_test','reversal') THEN RETURN NEW;END IF;

  SELECT CASE WHEN flag.tenant_overrides ? NEW.tenant_id::text
    THEN (flag.tenant_overrides->>NEW.tenant_id::text)::boolean ELSE flag.is_enabled END
    INTO v_capability_enabled FROM control.feature_flag flag
   WHERE flag.code='finance.posting_readiness_gate' AND(flag.expires_at IS NULL OR flag.expires_at>now());
  IF NOT COALESCE(v_capability_enabled,false) THEN RETURN NEW;END IF;
  v_rollout_mode:=control.resolve_finance_posting_rollout_mode(NEW.tenant_id,NEW.company_code_id,NEW.posting_date);
  IF v_rollout_mode<>'enforce' THEN RETURN NEW;END IF;

  SELECT code INTO v_company_code FROM master.company_code WHERE tenant_id=NEW.tenant_id AND id=NEW.company_code_id;
  IF NOT EXISTS(
    WITH latest_run AS(
      SELECT run.id FROM governance.cycle_run run JOIN governance.cycle_type type
        ON type.tenant_id=run.tenant_id AND type.id=run.cycle_type_id
       WHERE run.tenant_id=NEW.tenant_id AND run.entity_code=v_company_code
         AND type.type_code='FIN_SETUP_READINESS' AND run.status<>'CANCELLED'
       ORDER BY run.run_number DESC,run.created_at DESC LIMIT 1)
    SELECT 1 FROM latest_run
    JOIN governance.cycle_certification cert ON cert.tenant_id=NEW.tenant_id AND cert.cycle_run_id=latest_run.id
    WHERE cert.cert_code='FINANCE_POSTING_READY' AND cert.status='ATTESTED'
      AND cert.snapshot_payload ? 'fourDomainReadiness'
      AND COALESCE((cert.snapshot_payload->'fourDomainReadiness'->'summary'->>'readyForCertification')::boolean,false)
      AND NOT EXISTS(SELECT 1 FROM governance.cycle_task task WHERE task.tenant_id=cert.tenant_id AND task.cycle_run_id=cert.cycle_run_id AND task.is_mandatory AND task.status<>'COMPLETED')
      AND NOT EXISTS(SELECT 1 FROM governance.cycle_deviation deviation WHERE deviation.tenant_id=cert.tenant_id AND deviation.cycle_run_id=cert.cycle_run_id AND deviation.severity='CRITICAL' AND deviation.status NOT IN('RESOLVED','REJECTED','EXPIRED','REVOKED'))
  ) THEN
    RAISE EXCEPTION 'FINANCE_POSTING_READINESS_REQUIRED: company % is in enforce mode without a current four-domain FINANCE_POSTING_READY certification',COALESCE(v_company_code,NEW.company_code_id::text) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION document.trg_je_finance_readiness_gate_fn IS
  'Stage F rollout-aware production posting gate. Observe is non-blocking; enforce requires an attested current four-domain snapshot.';
