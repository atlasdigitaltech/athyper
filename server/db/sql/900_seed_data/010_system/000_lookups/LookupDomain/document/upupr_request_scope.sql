-- LookupDomain/document/upupr_request_scope.sql
-- Lookup values for domain: document.upupr_request_scope
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('profile',       'Profile Fields',   'document.upupr_request_scope',
     'given_name, family_name, preferred_name, display_name, avatar_url.',      10,
     '{"changes_key":"profile","affected_tables":["master.principal_profile"]}'),
    ('locale_contact','Locale & Contact', 'document.upupr_request_scope',
     'locale, timezone, non-login contact channels.',                            20,
     '{"changes_key":"locale_contact","affected_tables":["master.principal_profile","master.contact_link"]}'),
    ('iam_group',     'IAM Group',        'document.upupr_request_scope',
     'Add or remove self-service-eligible IAM group memberships.',               30,
     '{"changes_key":"iam_group","affected_tables":["master.group_member"]}'),
    ('ou_assignment', 'Company Code Assignment', 'document.upupr_request_scope',
     'Change primary company code and company-code-scoped ACL entries.',         40,
     '{"changes_key":"ou_assignment","affected_tables":["master.principal_profile","master.company_code_access"]}'),

    ('ui_profile', 'UI Profile', 'document.upupr_request_scope',
     'UI appearance, density, navigation defaults, and working-context shortcuts in '
     'master.principal_ui_profile. Most changes are direct (self-service). '
     'Governed changes (e.g. forced workspace, mandated density) route through UPUPR.',
     50,
     '{"changes_key":"ui_profile","affected_tables":["master.principal_ui_profile"]}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
