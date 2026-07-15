-- Canonical permission-scope policy. Generic Neon rows preserve the existing
-- tenant/LE/company model. Operating Organization rows remain explicit and
-- domain-bound; permission prefixes are never interpreted as policy.

INSERT INTO shared.permission_scope_policy (
    permission_id, assignment_scope_type, organization_domain,
    propagation_mode, requires_resource_scope, status
)
SELECT p.id, v.assignment_scope_type, NULL, v.propagation_mode, false, 'active'
FROM shared.permission p
CROSS JOIN (VALUES
    ('tenant'::text, 'member_companies'::text),
    ('legal_entity', 'member_companies'),
    ('company_code', 'none')
) AS v(assignment_scope_type, propagation_mode)
WHERE p.status = 'active'
  AND p.plane_eligibility @> ARRAY['neon']::text[]
  AND p.code NOT IN (
      'SOURCE.EVENT.CREATE',
      'SOURCE.DEMAND.AGGREGATE',
      'SOURCE.EVENT.EVALUATE',
      'SALES.OPPORTUNITY.CREATE',
      'SALES.QUOTATION.CREATE',
      'SALES.ORDER.CREATE',
      'AP.INVOICE.APPROVE',
      'PI.APPROVE'
  )
ON CONFLICT (permission_id, assignment_scope_type, organization_domain)
DO UPDATE SET propagation_mode = EXCLUDED.propagation_mode,
              requires_resource_scope = EXCLUDED.requires_resource_scope,
              status = EXCLUDED.status,
              updated_at = now();

-- Explicit non-Operating-Organization examples. These rows deliberately do
-- not receive the generic tenant policy above.
INSERT INTO shared.permission_scope_policy (
    permission_id, assignment_scope_type, organization_domain,
    propagation_mode, requires_resource_scope, status
)
SELECT p.id, v.assignment_scope_type, NULL,
       v.propagation_mode, false, 'active'
FROM (VALUES
    ('SALES.ORDER.CREATE',    'company_code', 'none'),
    ('AP.INVOICE.APPROVE',    'company_code', 'none'),
    ('AP.INVOICE.APPROVE',    'legal_entity', 'member_companies'),
    ('PI.APPROVE',            'company_code', 'none'),
    ('PI.APPROVE',            'legal_entity', 'member_companies')
) AS v(permission_code, assignment_scope_type, propagation_mode)
JOIN shared.permission p ON p.code = v.permission_code
ON CONFLICT (permission_id, assignment_scope_type, organization_domain)
DO UPDATE SET propagation_mode = EXCLUDED.propagation_mode,
              requires_resource_scope = EXCLUDED.requires_resource_scope,
              status = EXCLUDED.status,
              updated_at = now();

INSERT INTO shared.permission_scope_policy (
    permission_id, assignment_scope_type, organization_domain,
    propagation_mode, requires_resource_scope, status
)
SELECT p.id, 'operating_organization', v.organization_domain,
       v.propagation_mode, v.requires_resource_scope, 'active'
FROM (VALUES
    ('SOURCE.EVENT.CREATE',      'procurement', 'none',             false),
    ('SOURCE.DEMAND.AGGREGATE',  'procurement', 'member_companies', false),
    ('SOURCE.EVENT.EVALUATE',    'procurement', 'resource_only',    true),
    ('SALES.OPPORTUNITY.CREATE', 'sales',       'none',             false),
    ('SALES.QUOTATION.CREATE',   'sales',       'member_companies', false)
) AS v(permission_code, organization_domain, propagation_mode, requires_resource_scope)
JOIN shared.permission p ON p.code = v.permission_code
ON CONFLICT (permission_id, assignment_scope_type, organization_domain)
DO UPDATE SET propagation_mode = EXCLUDED.propagation_mode,
              requires_resource_scope = EXCLUDED.requires_resource_scope,
              status = EXCLUDED.status,
              updated_at = now();
