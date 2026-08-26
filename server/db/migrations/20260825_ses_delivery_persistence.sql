-- Add the three-plane SES provider-event authority and email suppression projection.
-- Raw provider payloads and recipient addresses are intentionally excluded.
BEGIN;

CREATE TABLE event.notification_provider_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, delivery_id uuid NOT NULL,
    provider_code text NOT NULL, provider_event_id text NOT NULL, provider_message_id text NOT NULL,
    event_type text NOT NULL, occurred_at timestamptz NOT NULL, diagnostic jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload_sha256 char(64) NOT NULL, previous_status text NOT NULL, projected_status text NOT NULL,
    transition_applied boolean NOT NULL, is_redacted boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
    CONSTRAINT notification_provider_event_pkey PRIMARY KEY(id),
    CONSTRAINT notification_provider_event_provider_id_uq UNIQUE(provider_code,provider_event_id),
    CONSTRAINT notification_provider_event_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT notification_provider_event_type_chk CHECK(event_type IN ('send','delivery','delivery_delay','bounce','complaint','reject','rendering_failure')),
    CONSTRAINT notification_provider_event_provider_chk CHECK(provider_code='amazon_ses'),
    CONSTRAINT notification_provider_event_hash_chk CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT notification_provider_event_redacted_chk CHECK(is_redacted),
    CONSTRAINT notification_provider_event_diagnostic_chk CHECK(jsonb_typeof(diagnostic)='object'),
    CONSTRAINT notification_provider_event_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id),
    CONSTRAINT notification_provider_event_delivery_fk FOREIGN KEY(tenant_id,delivery_id) REFERENCES event.notification_delivery(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE event.notification_email_suppression (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, scope text NOT NULL,
    address_hash char(64) NOT NULL, reason text NOT NULL, provider_code text,
    source_provider_event_id uuid, expires_at timestamptz, released_at timestamptz, released_by uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT notification_email_suppression_pkey PRIMARY KEY(id),
    CONSTRAINT notification_email_suppression_scope_chk CHECK((scope='global' AND tenant_id IS NULL) OR (scope='tenant' AND tenant_id IS NOT NULL)),
    CONSTRAINT notification_email_suppression_hash_chk CHECK(address_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT notification_email_suppression_reason_chk CHECK(reason IN ('permanent_bounce','complaint','manual','legal','security')),
    CONSTRAINT notification_email_suppression_expiry_chk CHECK(expires_at IS NULL OR expires_at>created_at),
    CONSTRAINT notification_email_suppression_release_chk CHECK((released_at IS NULL)=(released_by IS NULL)),
    CONSTRAINT notification_email_suppression_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
    CONSTRAINT notification_email_suppression_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    CONSTRAINT notification_email_suppression_source_fk FOREIGN KEY(tenant_id,source_provider_event_id) REFERENCES event.notification_provider_event(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX notification_provider_event_delivery_idx ON event.notification_provider_event(tenant_id,delivery_id,occurred_at DESC,id DESC);
CREATE INDEX notification_provider_event_message_idx ON event.notification_provider_event(provider_code,provider_message_id);
CREATE UNIQUE INDEX notification_email_suppression_tenant_active_uq ON event.notification_email_suppression(tenant_id,address_hash) WHERE scope='tenant' AND released_at IS NULL;
CREATE UNIQUE INDEX notification_email_suppression_global_active_uq ON event.notification_email_suppression(address_hash) WHERE scope='global' AND released_at IS NULL;
CREATE INDEX notification_email_suppression_expiry_idx ON event.notification_email_suppression(expires_at) WHERE released_at IS NULL AND expires_at IS NOT NULL;

CREATE TRIGGER notification_provider_event_append_only BEFORE UPDATE OR DELETE ON event.notification_provider_event
  FOR EACH ROW EXECUTE FUNCTION event.trg_reject_append_only_mutation();
CREATE TRIGGER notification_email_suppression_updated_at BEFORE UPDATE ON event.notification_email_suppression
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE event.notification_provider_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_provider_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON event.notification_provider_event FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());

ALTER TABLE event.notification_email_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_email_suppression FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    CREATE POLICY notification_email_suppression_tenant_read ON event.notification_email_suppression FOR SELECT TO athyperapp
      USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
    CREATE POLICY notification_email_suppression_tenant_write ON event.notification_email_suppression FOR ALL TO athyperapp
      USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(scope='tenant' AND tenant_id=shared.current_tenant_id());
    GRANT SELECT,INSERT ON event.notification_provider_event TO athyperapp;
    GRANT SELECT,INSERT,UPDATE ON event.notification_email_suppression TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    CREATE POLICY notification_email_suppression_admin_access ON event.notification_email_suppression FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
    GRANT ALL PRIVILEGES ON event.notification_provider_event,event.notification_email_suppression TO athyperadmin;
  END IF;
END $$;

REVOKE ALL ON event.notification_provider_event,event.notification_email_suppression FROM PUBLIC;
COMMENT ON TABLE event.notification_provider_event IS 'Append-only, PII-redacted external delivery lifecycle receipt ledger.';
COMMENT ON TABLE event.notification_email_suppression IS 'Hash-only global and tenant email suppression projection; global rows are replicated to each plane.';

COMMIT;
