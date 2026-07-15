INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('atlas',          'Atlas Anomaly Feedback',
     'log.ai_feedback_type',
     'User feedback on an Atlas anomaly detection result. Migrated from log.atlas_feedback. '
     'detail: {anomaly_type, anomaly_severity, account_code, fiscal_year, period_number}.',
     10),
    ('classification', 'Classification Feedback',
     'log.ai_feedback_type',
     'User correction of an AI classification result. Migrated from log.classification_feedback. '
     'detail: {class_label, confidence_before, confidence_after}.',
     20)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
