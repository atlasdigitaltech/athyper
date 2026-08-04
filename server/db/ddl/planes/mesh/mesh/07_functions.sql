CREATE OR REPLACE FUNCTION mesh.trg_guard_creation_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR (
           to_jsonb(NEW) ? 'created_by_tenant_id'
           AND (to_jsonb(NEW) -> 'created_by_tenant_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'created_by_tenant_id')
       ) THEN
        RAISE EXCEPTION '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_network_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF (to_jsonb(NEW) -> 'id') IS DISTINCT FROM (to_jsonb(OLD) -> 'id')
       OR (
           to_jsonb(NEW) ? 'tenant_id'
           AND (to_jsonb(NEW) -> 'tenant_id') IS DISTINCT FROM (to_jsonb(OLD) -> 'tenant_id')
       )
       OR (
           to_jsonb(NEW) ? 'account_code'
           AND (to_jsonb(NEW) -> 'account_code') IS DISTINCT FROM (to_jsonb(OLD) -> 'account_code')
       )
       OR (
           to_jsonb(NEW) ? 'network_account_id'
           AND (to_jsonb(NEW) -> 'network_account_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'network_account_id')
       )
       OR (
           to_jsonb(NEW) ? 'owner_account_id'
           AND (to_jsonb(NEW) -> 'owner_account_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'owner_account_id')
       )
       OR (
           to_jsonb(NEW) ? 'catalog_id'
           AND (to_jsonb(NEW) -> 'catalog_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'catalog_id')
       )
       OR (
           to_jsonb(NEW) ? 'catalog_item_id'
           AND (to_jsonb(NEW) -> 'catalog_item_id')
               IS DISTINCT FROM (to_jsonb(OLD) -> 'catalog_item_id')
       )
       OR (
           to_jsonb(NEW) ? 'buyer_tenant_id'
           AND (
               (to_jsonb(NEW) -> 'buyer_tenant_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'buyer_tenant_id')
               OR (to_jsonb(NEW) -> 'buyer_account_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'buyer_account_id')
               OR (to_jsonb(NEW) -> 'supplier_tenant_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'supplier_tenant_id')
               OR (to_jsonb(NEW) -> 'supplier_account_id')
                   IS DISTINCT FROM (to_jsonb(OLD) -> 'supplier_account_id')
           )
       ) THEN
        RAISE EXCEPTION '%.% identity coordinates are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_catalog_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM mesh.network_account AS account
        WHERE account.tenant_id = NEW.tenant_id
          AND account.id = NEW.owner_account_id
          AND account.network_role IN ('supplier', 'both')
          AND account.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'catalog owner must be an active supplier-capable network account'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_set_catalog_publication_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh, master
AS $$
BEGIN
    IF NEW.status = 'published'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.published_at := COALESCE(NEW.published_at, statement_timestamp());
        NEW.published_by := COALESCE(
            NEW.published_by,
            master.current_principal_id_soft()
        );
        IF NEW.published_by IS NULL THEN
            RAISE EXCEPTION 'publishing a catalog requires principal context'
                USING ERRCODE = 'not_null_violation';
        END IF;
    ELSIF TG_OP = 'UPDATE'
          AND OLD.status = 'published'
          AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'catalog publication evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_catalog_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM mesh.network_relationship AS relationship
        WHERE relationship.id = NEW.network_relationship_id
          AND relationship.buyer_tenant_id = NEW.buyer_tenant_id
          AND relationship.buyer_account_id = NEW.buyer_account_id
          AND relationship.supplier_tenant_id = NEW.supplier_tenant_id
          AND relationship.supplier_account_id = NEW.supplier_account_id
          AND relationship.status = 'active'
          AND (
              relationship.effective_from IS NULL
              OR relationship.effective_from <= CURRENT_DATE
          )
          AND (
              relationship.effective_until IS NULL
              OR relationship.effective_until >= CURRENT_DATE
          )
    ) THEN
        RAISE EXCEPTION
            'catalog audience requires a matching active network relationship'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_catalog_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.network_relationship_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mesh.network_relationship AS relationship
           WHERE relationship.id = NEW.network_relationship_id
             AND relationship.supplier_tenant_id = NEW.tenant_id
             AND relationship.supplier_account_id = NEW.owner_account_id
             AND relationship.status = 'active'
       ) THEN
        RAISE EXCEPTION
            'relationship price requires an active relationship owned by the catalog supplier'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.price_type = 'contract'
       AND NOT EXISTS (
           SELECT 1
           FROM mesh.catalog_audience AS audience
           JOIN mesh.catalog_item AS item
             ON item.tenant_id = NEW.tenant_id
            AND item.owner_account_id = NEW.owner_account_id
            AND item.id = NEW.catalog_item_id
           WHERE audience.supplier_tenant_id = NEW.tenant_id
             AND audience.supplier_account_id = NEW.owner_account_id
             AND audience.catalog_id = item.catalog_id
             AND audience.network_relationship_id = NEW.network_relationship_id
             AND audience.access_kind = 'contract'
             AND audience.status = 'active'
       ) THEN
        RAISE EXCEPTION
            'contract price requires an active contract catalog audience'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Application-facing access helpers are deliberately context bound: callers
-- cannot supply a tenant identifier. Base-table RLS delegates cross-tenant
-- publication reads to these functions.
CREATE OR REPLACE FUNCTION mesh.current_network_account_id_soft()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT NULLIF(
        current_setting('app.current_network_account_id', true),
        ''
    )::uuid;
$$;

CREATE OR REPLACE FUNCTION mesh.catalog_is_visible(p_catalog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM mesh.catalog AS catalog
        WHERE catalog.id = p_catalog_id
          AND (
              catalog.tenant_id = shared.current_tenant_id_soft()
              OR (
                  shared.current_tenant_id_soft() IS NOT NULL
                  AND catalog.status = 'published'
                  AND (
                      catalog.valid_from IS NULL
                      OR catalog.valid_from <= CURRENT_DATE
                  )
                  AND (
                      catalog.valid_until IS NULL
                      OR catalog.valid_until >= CURRENT_DATE
                  )
                  AND (
                      catalog.visibility = 'public'
                      OR (
                          catalog.visibility = 'connected'
                          AND EXISTS (
                              SELECT 1
                              FROM mesh.network_relationship AS relationship
                              WHERE relationship.supplier_tenant_id = catalog.tenant_id
                                AND relationship.supplier_account_id = catalog.owner_account_id
                                AND relationship.buyer_tenant_id =
                                    shared.current_tenant_id_soft()
                                AND relationship.buyer_account_id =
                                    mesh.current_network_account_id_soft()
                                AND relationship.status = 'active'
                                AND (
                                    relationship.effective_from IS NULL
                                    OR relationship.effective_from <= CURRENT_DATE
                                )
                                AND (
                                    relationship.effective_until IS NULL
                                    OR relationship.effective_until >= CURRENT_DATE
                                )
                          )
                      )
                      OR (
                          catalog.visibility = 'relationship'
                          AND EXISTS (
                              SELECT 1
                              FROM mesh.catalog_audience AS audience
                              WHERE audience.supplier_tenant_id = catalog.tenant_id
                                AND audience.supplier_account_id = catalog.owner_account_id
                                AND audience.catalog_id = catalog.id
                                AND audience.buyer_tenant_id =
                                    shared.current_tenant_id_soft()
                                AND audience.buyer_account_id =
                                    mesh.current_network_account_id_soft()
                                AND audience.status = 'active'
                                AND (
                                    audience.valid_from IS NULL
                                    OR audience.valid_from <= CURRENT_DATE
                                )
                                AND (
                                    audience.valid_until IS NULL
                                    OR audience.valid_until >= CURRENT_DATE
                                )
                          )
                      )
                  )
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION mesh.catalog_item_is_visible(p_catalog_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, mesh
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM mesh.catalog_item AS item
        WHERE item.id = p_catalog_item_id
          AND mesh.catalog_is_visible(item.catalog_id)
          AND (
              item.tenant_id = shared.current_tenant_id_soft()
              OR item.status = 'published'
          )
    );
$$;

CREATE OR REPLACE FUNCTION mesh.catalog_price_is_visible(p_catalog_price_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM mesh.catalog_price AS price
        WHERE price.id = p_catalog_price_id
          AND mesh.catalog_item_is_visible(price.catalog_item_id)
          AND (
              price.network_relationship_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM mesh.network_relationship AS relationship
                  WHERE relationship.id = price.network_relationship_id
                    AND (
                        relationship.supplier_tenant_id =
                            shared.current_tenant_id_soft()
                        OR (
                            relationship.buyer_tenant_id =
                                shared.current_tenant_id_soft()
                            AND relationship.buyer_account_id =
                                mesh.current_network_account_id_soft()
                        )
                    )
                    AND relationship.status = 'active'
              )
          )
    );
$$;
