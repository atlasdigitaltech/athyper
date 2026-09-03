-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.erp_workforce_projects
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.erp_workforce_projects
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:39
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/master/employee_count_band.sql,server/db/seed/platform/000_lookups/LookupDomain/master/employment_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/pay_component_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/pay_component_value_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/pay_frequency.sql,server/db/seed/platform/000_lookups/LookupDomain/master/project_settlement_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/team_type.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_workforce_projects: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('master.employee_count_band', 'Employee Count Band', 'Standardised headcount bands for supplier business profile.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.employment_type', 'Employment type', 'Type of employment relationship (full_time, part_time, contract, etc.). is_extensible=true — tenants may add custom types.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.pay_component_type', 'Pay Component Type', 'Classification of pay component (earning, deduction, employer_contribution, information). is_extensible=false — type drives processing rules in the payroll engine.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.pay_component_value_type', 'Pay Component Value Type', 'How the component amount is expressed (fixed, percentage, formula, rate_table, system). is_extensible=false — value type drives calculation method.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.pay_frequency', 'Pay Frequency', 'How often payroll is run (weekly, biweekly, semi_monthly, monthly, quarterly, annually). is_extensible=false — pay frequency drives payroll engine scheduling.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.project_settlement_type', 'Settlement type', 'Where project costs settle (cost_center, asset, gl_account, order).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.team_type', 'Team Type', 'Classification of a team by purpose and membership mode (functional, project, virtual, cross_functional, committee). is_extensible=true — tenants may add custom team types.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('e1_10', '1 — 10', 'master.employee_count_band', 'Micro enterprise', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('e11_50', '11 — 50', 'master.employee_count_band', 'Small enterprise', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('e51_200', '51 — 200', 'master.employee_count_band', 'Small-medium enterprise', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('e201_500', '201 — 500', 'master.employee_count_band', 'Medium enterprise', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('e501_1000', '501 — 1,000', 'master.employee_count_band', 'Upper medium enterprise', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('e1001_5000', '1,001 — 5,000', 'master.employee_count_band', 'Large enterprise', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('e5001_plus', '5,001+', 'master.employee_count_band', 'Very large / multinational', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('full_time', 'Full-time', 'master.employment_type', 'Full-time permanent', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('part_time', 'Part-time', 'master.employment_type', 'Part-time permanent', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('contract', 'Contract', 'master.employment_type', 'Fixed-term contract', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('intern', 'Intern', 'master.employment_type', 'Internship / trainee', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('consultant', 'Consultant', 'master.employment_type', 'External consultant', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('earning', 'Earning', 'master.pay_component_type', 'Positive pay element added to gross salary (wages, allowances, bonuses)', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('deduction', 'Deduction', 'master.pay_component_type', 'Employee-side deduction subtracted before net pay (PF, tax, loan recovery)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('statutory', 'Statutory', 'master.pay_component_type', 'Regulatory contribution borne by employer (PF employer share, ESI, gratuity)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('memo', 'Memo', 'master.pay_component_type', 'Computed summary figure, not posted to GL (gross, net, CTC)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('employer_contribution', 'Employer Contribution', 'master.pay_component_type', 'Voluntary employer benefit cost (group insurance, NPS employer share)', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('amount', 'Fixed Amount', 'master.pay_component_value_type', 'Static monetary amount (e.g., 1,600 currency units/month transport allowance)', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rate', 'Rate / Percentage', 'master.pay_component_value_type', 'Percentage of another component (e.g., 40% of basic as HRA)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('formula', 'Formula', 'master.pay_component_value_type', 'Computed by a linked formula_expression (for complex payroll rules)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('units', 'Units × Rate', 'master.pay_component_value_type', 'Quantity × unit rate (e.g., overtime hours × hourly rate)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('flat', 'Flat Per Period', 'master.pay_component_value_type', 'Fixed amount that does not change unless manually overridden per pay period', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('daily', 'Daily', 'master.pay_frequency', 'Paid every working day', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('weekly', 'Weekly', 'master.pay_frequency', 'Paid once per week', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bi_weekly', 'Bi-Weekly', 'master.pay_frequency', 'Paid every two weeks (26 runs/year)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('semi_monthly', 'Semi-Monthly', 'master.pay_frequency', 'Paid twice per month (24 runs/year)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('monthly', 'Monthly', 'master.pay_frequency', 'Paid once per month (12 runs/year)', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('quarterly', 'Quarterly', 'master.pay_frequency', 'Paid every three months (4 runs/year)', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('annual', 'Annual', 'master.pay_frequency', 'Paid once per year (commissions, bonuses)', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('on_demand', 'On Demand', 'master.pay_frequency', 'Ad-hoc payment triggered manually', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cost_center', 'Cost Center', 'master.project_settlement_type', 'Settle to CC', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('asset', 'Asset', 'master.project_settlement_type', 'Capitalize', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gl_account', 'GL Account', 'master.project_settlement_type', 'Settle to account', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('order', 'Order', 'master.project_settlement_type', 'Settle to order', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('functional', 'Functional', 'master.team_type', 'Permanent team organized around a business function', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('project', 'Project', 'master.team_type', 'Temporary team assembled for a specific project', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('virtual', 'Virtual', 'master.team_type', 'Cross-location or distributed team with no physical anchor', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cross_functional', 'Cross-Functional', 'master.team_type', 'Team spanning multiple functional areas', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('committee', 'Committee', 'master.team_type', 'Governance or oversight committee with defined membership', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.employee_count_band', 'master.employment_type', 'master.pay_component_type', 'master.pay_component_value_type', 'master.pay_frequency', 'master.project_settlement_type', 'master.team_type'])) <> 39 THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_workforce_projects: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['master.employee_count_band', 'master.employment_type', 'master.pay_component_type', 'master.pay_component_value_type', 'master.pay_frequency', 'master.project_settlement_type', 'master.team_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_workforce_projects: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.employee_count_band', 'master.employment_type', 'master.pay_component_type', 'master.pay_component_value_type', 'master.pay_frequency', 'master.project_settlement_type', 'master.team_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_workforce_projects: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.employee_count_band', 'master.employment_type', 'master.pay_component_type', 'master.pay_component_value_type', 'master.pay_frequency', 'master.project_settlement_type', 'master.team_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_workforce_projects: semantic assertion failed';
  END IF;
END $assertions$;
