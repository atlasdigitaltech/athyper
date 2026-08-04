CREATE VIEW master.business_partner_governance_summary
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    tenant_id,
    business_partner_id,
    sum(COALESCE(ownership_pct, 0)) FILTER (WHERE status = 'active') AS disclosed_equity_pct,
    sum(COALESCE(beneficial_ownership_pct, ownership_pct, 0)) FILTER (WHERE status = 'active') AS disclosed_beneficial_ownership_pct,
    count(*) FILTER (WHERE relation_type_code = 'ubo' AND status = 'active') AS ubo_count,
    count(*) FILTER (WHERE relation_type_code IN ('director','board_member','officer') AND status = 'active') AS leadership_count,
    count(*) FILTER (WHERE relation_type_code IN ('signatory','authorized_representative','proxy') AND status = 'active') AS signatory_count,
    min(end_of_term) FILTER (WHERE status = 'active' AND end_of_term IS NOT NULL) AS next_end_of_term
FROM master.business_partner_governance_relation
GROUP BY tenant_id, business_partner_id;

CREATE VIEW master.entity_commodity_assignment
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    assignment.id,
    assignment.tenant_id,
    CASE
      WHEN assignment.commodity_category_id IS NOT NULL THEN 'commodity_category'
      WHEN assignment.product_id IS NOT NULL THEN 'product'
      ELSE 'item'
    END AS owner_type,
    COALESCE(assignment.commodity_category_id, assignment.product_id, assignment.item_id) AS owner_id,
    assignment.commodity_domain_code,
    assignment.commodity_code_id,
    code.code,
    code.name,
    assignment.mapping_type,
    assignment.confidence,
    assignment.provenance,
    assignment.is_owner_primary,
    assignment.is_code_routing_default,
    assignment.status
FROM master.commodity_code_assignment AS assignment
JOIN shared.commodity_code AS code ON code.id = assignment.commodity_code_id
WHERE assignment.status = 'active';

COMMENT ON VIEW master.business_partner_governance_summary IS
  'Canonical governance summary over business_partner_governance_relation.';
COMMENT ON VIEW master.entity_commodity_assignment IS
  'Canonical commodity assignment projection replacing v_entity_commodity.';
