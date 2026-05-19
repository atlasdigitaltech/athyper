-- 20260519_accounting_distribution_gl_account_company_coa_filter.sql
-- Scope purchase invoice accounting distribution GL account choices to the selected company's primary operating COA.

UPDATE control.entity_field ef
   SET lookup_config = '{
         "search_fields": ["code", "name"],
         "filters": {
           "status": "active",
           "posting_allowed": true
         },
         "dependent_filter": {
           "source_field": "company_code_id",
           "target_field": "chart_of_account_id",
           "through_entity": "company_code_chart_assignment",
           "through_source_field": "company_code_id",
           "through_target_field": "chart_of_account_id",
           "through_filters": {
             "status": "active",
             "assignment_type": "operating",
             "is_primary": true
           },
           "empty_behavior": "empty"
         }
       }'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.entity e
  JOIN control.entity_version ev ON ev.entity_id = e.id
 WHERE e.tenant_id IS NULL
   AND e.entity_code = 'accounting_distribution'
   AND ev.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.entity_version_id = ev.id
   AND ef.name = 'gl_account_id'
   AND COALESCE(ef.lookup_config, '{}'::jsonb) IS DISTINCT FROM '{
         "search_fields": ["code", "name"],
         "filters": {
           "status": "active",
           "posting_allowed": true
         },
         "dependent_filter": {
           "source_field": "company_code_id",
           "target_field": "chart_of_account_id",
           "through_entity": "company_code_chart_assignment",
           "through_source_field": "company_code_id",
           "through_target_field": "chart_of_account_id",
           "through_filters": {
             "status": "active",
             "assignment_type": "operating",
             "is_primary": true
           },
           "empty_behavior": "empty"
         }
       }'::jsonb;
