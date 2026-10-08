-- Native product review replaces active legacy adoption. Historical receipts
-- remain immutable/readable. This grants no graph writes or release approval.
DROP POLICY IF EXISTS control_product_receipt_insert ON metadata.entity_product_review_receipt;
CREATE POLICY control_product_receipt_insert ON metadata.entity_product_review_receipt
FOR INSERT TO athyper_control_api WITH CHECK (
 action IN ('submit','approve')
 AND authority_tenant_id=shared.current_tenant_id_soft()
 AND actor_id=master.current_principal_id_soft()
 AND EXISTS (
  SELECT 1 FROM master.principal p
  JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id
  WHERE p.id=actor_id AND p.tenant_id=authority_tenant_id AND p.status='active'
   AND p.principal_type='user' AND b.service_client_id IS NULL
   AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api' AND b.status='active'
 )
 AND EXISTS (
  SELECT 1 FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
  WHERE c.id=change_set_id AND c.tenant_id IS NULL AND e.tenant_id IS NULL
   AND e.ownership_model='system' AND c.source_kind='product' AND c.native_core_layout_version=2
   AND c.lock_version=expected_revision
   AND ((action='submit' AND c.status='draft' AND c.created_by=actor_id)
    OR (action='approve' AND c.status='in_review' AND c.created_by<>actor_id AND c.submitted_by<>actor_id
     AND EXISTS (
      SELECT 1 FROM metadata.entity_product_review_receipt prior
      WHERE prior.authority_tenant_id=entity_product_review_receipt.authority_tenant_id
       AND prior.change_set_id=c.id AND prior.actor_id=c.submitted_by AND prior.action='submit'
       AND prior.expected_revision=entity_product_review_receipt.expected_revision-1
       AND prior.contract_hash=entity_product_review_receipt.contract_hash
     )))
 )
);
