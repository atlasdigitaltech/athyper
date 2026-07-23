-- Finance foundation certification is derived evidence. Any mutation to a
-- participating Company or shared definition supersedes the current evidence,
-- regardless of whether the write came through the Finance Setup API.

CREATE OR REPLACE FUNCTION governance.invalidate_finance_setup_certification(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_actor_id uuid,
    p_reason text
) RETURNS void
LANGUAGE sql VOLATILE
SET search_path = governance, master, pg_temp
AS $$
    UPDATE governance.cycle_certification cert
       SET status = 'SUPERSEDED',
           supersession_reason = p_reason,
           updated_at = now(),
           updated_by = COALESCE(p_actor_id, cert.updated_by, cert.created_by)
      FROM governance.cycle_run run
      JOIN governance.cycle_type type
        ON type.tenant_id = run.tenant_id AND type.id = run.cycle_type_id
      JOIN master.company_code company
        ON company.tenant_id = run.tenant_id AND company.code = run.entity_code
     WHERE cert.tenant_id = p_tenant_id
       AND cert.cycle_run_id = run.id
       AND company.id = p_company_code_id
       AND type.type_code = 'FIN_SETUP_READINESS'
       AND cert.cert_code = 'FINANCE_POSTING_READY'
       AND cert.status IN ('CERTIFIED', 'ATTESTED')
$$;

CREATE OR REPLACE FUNCTION governance.trg_invalidate_finance_setup_certification()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = governance, master, control, pg_temp
AS $$
DECLARE
    v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    v_tenant_id uuid := (v_row ->> 'tenant_id')::uuid;
    v_actor_id uuid := COALESCE(
        NULLIF(v_row ->> 'updated_by', '')::uuid,
        NULLIF(v_row ->> 'status_changed_by', '')::uuid,
        NULLIF(v_row ->> 'created_by', '')::uuid
    );
    v_company_id uuid;
    v_definition_id uuid;
BEGIN
    CASE TG_ARGV[0]
      WHEN 'company' THEN
        PERFORM governance.invalidate_finance_setup_certification(
            v_tenant_id, (v_row ->> 'id')::uuid, v_actor_id, TG_ARGV[1]);
      WHEN 'company_direct' THEN
        PERFORM governance.invalidate_finance_setup_certification(
            v_tenant_id, (v_row ->> 'company_code_id')::uuid, v_actor_id, TG_ARGV[1]);
      WHEN 'legal_entity' THEN
        FOR v_company_id IN
            SELECT id FROM master.company_code
             WHERE tenant_id = v_tenant_id AND legal_entity_id = (v_row ->> 'id')::uuid
        LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id, v_company_id, v_actor_id, TG_ARGV[1]);
        END LOOP;
      WHEN 'chart' THEN
        FOR v_company_id IN
            SELECT company_code_id FROM master.company_code_chart_assignment
             WHERE tenant_id = v_tenant_id AND chart_of_account_id = (v_row ->> 'id')::uuid
        LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id, v_company_id, v_actor_id, TG_ARGV[1]);
        END LOOP;
      WHEN 'gl_account' THEN
        FOR v_company_id IN
            SELECT company_code_id FROM master.company_code_chart_assignment
             WHERE tenant_id = v_tenant_id
               AND chart_of_account_id = (v_row ->> 'chart_of_account_id')::uuid
        LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id, v_company_id, v_actor_id, TG_ARGV[1]);
        END LOOP;
      WHEN 'book' THEN
        FOR v_company_id IN
            SELECT company_code_id FROM master.company_code_book_assignment
             WHERE tenant_id = v_tenant_id AND book_id = (v_row ->> 'id')::uuid
        LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id, v_company_id, v_actor_id, TG_ARGV[1]);
        END LOOP;
      WHEN 'calendar' THEN
        FOR v_company_id IN
            SELECT company_code_id FROM control.company_fiscal_calendar_assignment
             WHERE tenant_id = v_tenant_id AND fiscal_calendar_config_id = (v_row ->> 'id')::uuid
        LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id, v_company_id, v_actor_id, TG_ARGV[1]);
        END LOOP;
      WHEN 'calendar_rule' THEN
        v_definition_id := (v_row ->> 'fiscal_calendar_config_id')::uuid;
        FOR v_company_id IN
            SELECT company_code_id FROM control.company_fiscal_calendar_assignment
             WHERE tenant_id = v_tenant_id AND fiscal_calendar_config_id = v_definition_id
        LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id, v_company_id, v_actor_id, TG_ARGV[1]);
        END LOOP;
      ELSE
        RAISE EXCEPTION 'Unknown finance certification invalidation scope: %', TG_ARGV[0];
    END CASE;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_ready_company ON master.company_code;
CREATE TRIGGER trg_fin_ready_company AFTER UPDATE OF
  legal_entity_id, functional_currency, country_code, regulatory_framework,
  timezone_code, locale_code, date_format, week_start, status,
  fiscal_year_start_month, fiscal_year_variant, default_ledger_book_id
ON master.company_code
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company', 'Company accounting profile changed');

DROP TRIGGER IF EXISTS trg_fin_ready_legal_entity ON master.legal_entity;
CREATE TRIGGER trg_fin_ready_legal_entity AFTER UPDATE OF
  country_code, functional_currency, reporting_currency, regulatory_framework, status
ON master.legal_entity
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('legal_entity', 'Legal Entity accounting profile changed');

DROP TRIGGER IF EXISTS trg_fin_ready_chart ON master.chart_of_account;
CREATE TRIGGER trg_fin_ready_chart AFTER UPDATE OF
  framework, country_code, account_range, version, is_locked, status
ON master.chart_of_account
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('chart', 'Chart definition changed');

DROP TRIGGER IF EXISTS trg_fin_ready_gl_account ON master.gl_account;
CREATE TRIGGER trg_fin_ready_gl_account AFTER INSERT OR DELETE OR UPDATE OF
  chart_of_account_id, parent_id, account_class, node_type, normal_balance,
  subledger_type, currency_code, status
ON master.gl_account
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('gl_account', 'GL account definition changed');

DROP TRIGGER IF EXISTS trg_fin_ready_chart_assignment ON master.company_code_chart_assignment;
CREATE TRIGGER trg_fin_ready_chart_assignment AFTER INSERT OR UPDATE OR DELETE ON master.company_code_chart_assignment
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company Chart assignment changed');

DROP TRIGGER IF EXISTS trg_fin_ready_gl_control ON master.company_code_gl_account;
CREATE TRIGGER trg_fin_ready_gl_control AFTER INSERT OR UPDATE OR DELETE ON master.company_code_gl_account
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company GL control changed');

DROP TRIGGER IF EXISTS trg_fin_ready_book ON master.ledger_book;
CREATE TRIGGER trg_fin_ready_book AFTER UPDATE OF
  category, reporting_standard, base_currency_code, is_auto_post,
  is_approval_required, is_manual_je_allowed, is_reversal_allowed, close_mode, status
ON master.ledger_book
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('book', 'Ledger Book definition changed');

DROP TRIGGER IF EXISTS trg_fin_ready_book_assignment ON master.company_code_book_assignment;
CREATE TRIGGER trg_fin_ready_book_assignment AFTER INSERT OR UPDATE OR DELETE ON master.company_code_book_assignment
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company Book assignment changed');

DROP TRIGGER IF EXISTS trg_fin_ready_calendar ON control.fiscal_calendar_config;
CREATE TRIGGER trg_fin_ready_calendar AFTER UPDATE OF
  calendar_type, version_no, fiscal_year_label_rule, year_start_rule,
  anchor_month, anchor_day, week_start_day, periods_per_year, leap_week_rule,
  effective_from, effective_to, status
ON control.fiscal_calendar_config
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('calendar', 'Fiscal Calendar definition changed');

DROP TRIGGER IF EXISTS trg_fin_ready_calendar_rule ON control.fiscal_calendar_period_rule;
CREATE TRIGGER trg_fin_ready_calendar_rule AFTER INSERT OR UPDATE OR DELETE ON control.fiscal_calendar_period_rule
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('calendar_rule', 'Fiscal Calendar period rule changed');

DROP TRIGGER IF EXISTS trg_fin_ready_calendar_assignment ON control.company_fiscal_calendar_assignment;
CREATE TRIGGER trg_fin_ready_calendar_assignment AFTER INSERT OR UPDATE OR DELETE ON control.company_fiscal_calendar_assignment
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company Fiscal Calendar assignment changed');

DROP TRIGGER IF EXISTS trg_fin_ready_fiscal_period ON master.fiscal_period;
CREATE TRIGGER trg_fin_ready_fiscal_period AFTER INSERT OR UPDATE OR DELETE ON master.fiscal_period
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Company fiscal period changed');

DROP TRIGGER IF EXISTS trg_fin_ready_book_period ON governance.book_period_status;
CREATE TRIGGER trg_fin_ready_book_period AFTER INSERT OR UPDATE OR DELETE ON governance.book_period_status
FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct', 'Book period posting gate changed');
