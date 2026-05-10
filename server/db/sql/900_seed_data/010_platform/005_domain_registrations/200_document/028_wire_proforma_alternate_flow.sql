-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/028_wire_proforma_alternate_flow.sql
-- Wire create_proforma into the purchase_invoice intake flow picker.
--
-- The create_proforma flow (018_create_proforma_flow.sql) is fully seeded but
-- invisible to users because display_config.alternate_flows is empty. This
-- patch:
--   §A  Adds "create_proforma" to alternate_flows so the intent screen appears
--       at /app/purchase_invoice/new (two-card pre-wizard picker).
--   §B  Updates the label + description for both flows to user-facing copy
--       shown on the intent screen cards.
--
-- Depends on: 001_invoice.sql, 018_create_proforma_flow.sql
-- Idempotent: all updates use WHERE guards; safe to re-run
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ent_id  uuid;
  v_ev_id   uuid;
  v_cur     jsonb;
BEGIN

  -- ── Resolve platform-level purchase_invoice entity + version ───────────────
  SELECT e.id, e.display_config, ev.id
    INTO v_ent_id, v_cur, v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
   WHERE e.table_schema = 'document'
     AND e.table_name   = 'purchase_invoice'
     AND e.tenant_id    IS NULL
     AND ev.version_no  = 1;

  IF v_ent_id IS NULL THEN
    RAISE NOTICE '028_wire_proforma_alternate_flow: purchase_invoice entity not found — skipped';
    RETURN;
  END IF;

  -- ── §A  Wire create_proforma into alternate_flows ─────────────────────────
  IF NOT (COALESCE(v_cur, '{}'::jsonb)->'alternate_flows' @> '"create_proforma"') THEN
    UPDATE control.entity
       SET display_config = jsonb_set(
             COALESCE(display_config, '{}'::jsonb),
             '{alternate_flows}',
             COALESCE(display_config->'alternate_flows', '[]'::jsonb) || '"create_proforma"'::jsonb
           )
     WHERE id = v_ent_id;

    RAISE NOTICE '028: create_proforma added to alternate_flows';
  ELSE
    RAISE NOTICE '028: create_proforma already in alternate_flows — no-op';
  END IF;

  -- ── §B  User-facing labels + descriptions for the intent screen cards ──────
  -- Standard flow (flow_code = 'create', is_default = true)
  UPDATE control.entity_flow
     SET label       = 'Standard Invoice',
         description = 'Bookable Supplier invoice on 3 Steps'
   WHERE entity_version_id = v_ev_id
     AND flow_code          = 'create'
     AND tenant_id          IS NULL;

  -- Proforma flow (flow_code = 'create_proforma', is_default = false)
  UPDATE control.entity_flow
     SET label       = 'Proforma Invoice',
         description = 'Indicative totals only. No GL posting, dedup off. Promote to invoice when supplier confirms.'
   WHERE entity_version_id = v_ev_id
     AND flow_code          = 'create_proforma'
     AND tenant_id          IS NULL;

  RAISE NOTICE '028: flow labels + descriptions updated for purchase_invoice';

END $$;
