CREATE TRIGGER notification_delivery_claim_updated_at
BEFORE UPDATE ON event.notification_delivery_claim
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER push_subscription_updated_at
BEFORE UPDATE ON event.push_subscription
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER whatsapp_consent_updated_at
BEFORE UPDATE ON event.whatsapp_consent
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER whatsapp_consent_ledger
AFTER INSERT OR UPDATE OF consent_status ON event.whatsapp_consent
FOR EACH ROW EXECUTE FUNCTION event.trg_mirror_whatsapp_consent_event();

CREATE TRIGGER webhook_subscription_updated_at
BEFORE UPDATE ON event.webhook_subscription
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
