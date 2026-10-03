-- Read models for the shared Entity Framework. These views grant no business
-- permission and do not replace published parent/scope admission. Underlying
-- tenant RLS and column privileges execute as the invoking role.
CREATE OR REPLACE VIEW master.v_partner_banking_read
WITH (security_invoker=true, security_barrier=true) AS
SELECT bank.id, bank.tenant_id, bank.business_partner_id,
       bank.id AS reveal_link_id,
       bank.bank_name, bank.branch_name, bank.branch_code, bank.bic,
       instrument.status,
       bank.account_holder_name, bank.account_last4, bank.currency_code
FROM master.v_business_partner_bank_account bank
JOIN master.payment_instrument instrument
  ON instrument.tenant_id = bank.tenant_id
 AND instrument.id = bank.bank_account_id;

CREATE OR REPLACE VIEW master.v_partner_industry_read
WITH (security_invoker=true, security_barrier=true) AS
SELECT assignment.id, assignment.tenant_id, assignment.business_partner_id,
       assignment.industry_domain_code, assignment.industry_code_id,
       assignment.assignment_kind, assignment.confidence,
       assignment.source_system, assignment.source_reference,
       assignment.is_primary, assignment.effective_from, assignment.effective_until,
       assignment.status, code.code AS industry_code, code.name AS industry_name,
       CASE WHEN assignment.verified_at IS NULL THEN 'unverified'::text
            ELSE 'verified'::text END AS verification_status
FROM master.business_partner_industry_classification assignment
LEFT JOIN shared.industry_code code
  ON code.id = assignment.industry_code_id
 AND code.domain_code = assignment.industry_domain_code;

-- Stored facts only: neither the coverage nor conditions assert eligibility.
-- Context labels remain unavailable until their Entity targets are onboarded.
CREATE OR REPLACE VIEW control.v_partner_qualification_read
WITH (security_invoker=true, security_barrier=true) AS
SELECT d.id, d.tenant_id, d.business_partner_id, d.qualification_type_code,
       d.context_kind,
       CASE WHEN d.context_id IS NULL THEN '[]'::jsonb
            ELSE '[{"name":null,"state":"unavailable"}]'::jsonb END AS context_reference,
       d.decision,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'scope_group',s.scope_group,'scope_mode',s.scope_mode,'scope_kind',s.scope_kind,
         'selection_mode',s.selection_mode,'commercial_capacity_code',s.commercial_capacity_code,
         'operating_organization_id',s.operating_organization_id,'company_code_id',s.company_code_id,
         'commodity_category_id',s.commodity_category_id,'country_code',s.country_code,
         'country_purpose',s.country_purpose,'commodity_classification_id',s.commodity_classification_id,
         'tax_jurisdiction_id',s.tax_jurisdiction_id,'organization_unit_id',s.organization_unit_id,
         'hierarchy_version',s.hierarchy_version) ORDER BY s.scope_group,s.scope_kind,s.id)
         FROM control.business_partner_decision_scope s
         WHERE s.tenant_id=d.tenant_id AND s.qualification_id=d.id), '[]'::jsonb) AS coverage,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'summary', CASE WHEN item.valid THEN item.value #>> '{presentation,summary}' ELSE NULL END,
         'state', CASE WHEN item.valid THEN 'recorded_not_evaluated' ELSE 'summary_unavailable' END)
         ORDER BY item.ordinality)
         FROM (SELECT c.value,c.ordinality,
           COALESCE(c.value #>> '{presentation,schema}' = 'partner-condition-summary.v1'
             AND jsonb_typeof(c.value #> '{presentation,summary}') = 'string'
             AND length(c.value #>> '{presentation,summary}') BETWEEN 1 AND 1000
             AND (c.value #>> '{presentation,summary}') ~ '[^[:space:]]', false) AS valid
           FROM jsonb_array_elements(d.conditions) WITH ORDINALITY c(value,ordinality)
           WHERE c.ordinality <= 100) item), '[]'::jsonb) AS condition_summaries,
       jsonb_array_length(d.conditions) AS recorded_condition_count,
       d.effective_from, d.effective_until, d.next_review_at,
       CASE WHEN d.effective_from IS NULL THEN 'unspecified'
            WHEN d.effective_from > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN 'scheduled'
            WHEN d.effective_until IS NOT NULL AND d.effective_until <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN 'ended'
            ELSE 'within_window' END AS date_window,
       CURRENT_TIMESTAMP AS assessed_at
FROM control.business_partner_qualification d;

REVOKE ALL ON master.v_partner_banking_read, master.v_partner_industry_read, control.v_partner_qualification_read FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON master.v_partner_banking_read, master.v_partner_industry_read, control.v_partner_qualification_read TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT ON master.v_partner_banking_read, master.v_partner_industry_read, control.v_partner_qualification_read TO athyperadmin;
  END IF;
END $$;
