-- LookupDomain/log/export_type.sql
-- Lookup values for domain: log.export_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('release',       'Release Export',
     'log.export_type',
     'Full report pack release exported. detail carries release_id, certification_id, '
     'is_clean_close_at_export, is_integrity_valid_at_export, export_version.',
     10),
    ('statement',     'Statement Export',
     'log.export_type',
     'Financial statement instance exported (P&L, Balance Sheet, Cash Flow). '
     'detail carries instance_id, period_id, statement_type.',
     20),
    ('pack_download', 'Pack Download',
     'log.export_type',
     'Report pack downloaded by a recipient. detail carries distribution_id, format.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
