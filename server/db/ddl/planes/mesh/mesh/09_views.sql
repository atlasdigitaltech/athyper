CREATE VIEW mesh.current_tenant_network_account
WITH (security_barrier = true)
AS
SELECT account.*
FROM mesh.network_account AS account
WHERE account.tenant_id = shared.current_tenant_id_soft()
  AND account.status = 'active';

CREATE VIEW mesh.current_tenant_network_relationship
WITH (security_barrier = true)
AS
SELECT relationship.*
FROM mesh.network_relationship AS relationship
WHERE (
        relationship.buyer_tenant_id = shared.current_tenant_id_soft()
        OR relationship.supplier_tenant_id = shared.current_tenant_id_soft()
      )
  AND relationship.status = 'active';

CREATE VIEW mesh.visible_catalog
WITH (security_barrier = true)
AS
SELECT catalog.*
FROM mesh.catalog AS catalog
WHERE mesh.catalog_is_visible(catalog.id);

CREATE VIEW mesh.visible_catalog_item
WITH (security_barrier = true)
AS
SELECT item.*
FROM mesh.catalog_item AS item
WHERE mesh.catalog_item_is_visible(item.id);

CREATE VIEW mesh.visible_catalog_price
WITH (security_barrier = true)
AS
SELECT price.*
FROM mesh.catalog_price AS price
WHERE mesh.catalog_price_is_visible(price.id)
  AND price.status = 'active'
  AND price.effective_from <= CURRENT_DATE
  AND (
      price.effective_until IS NULL
      OR price.effective_until >= CURRENT_DATE
  );
