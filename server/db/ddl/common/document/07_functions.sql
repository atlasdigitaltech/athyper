CREATE OR REPLACE FUNCTION document.trg_guard_work_item_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.source_entity_code IS DISTINCT FROM OLD.source_entity_code
       OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id THEN
        RAISE EXCEPTION 'work item identity, source, and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

-- Plane-global discovery boundary for the scheduler. Tenant work is returned
-- as coordinates only; each child sweep re-enters tenant RLS independently.
CREATE OR REPLACE FUNCTION document.fn_workflow_sla_due_tenants(
    p_at timestamptz,
    p_limit integer DEFAULT 500
)
RETURNS TABLE (tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = document, master, pg_catalog
AS $$
BEGIN
    IF p_at IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'invalid workflow SLA tenant-discovery arguments';
    END IF;
    RETURN QUERY
    SELECT tenant.id
      FROM master.tenant AS tenant
     WHERE tenant.status = 'active'
       AND EXISTS (
           SELECT 1
             FROM document.work_item AS item
            WHERE item.tenant_id = tenant.id
              AND item.status IN ('open','claimed','in_progress','blocked')
              AND item.due_at <= p_at
              AND NOT (item.payload ? 'sla_breach')
       )
     ORDER BY tenant.id
     LIMIT p_limit;
END;
$$;
