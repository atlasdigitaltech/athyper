-- Canonical clean-install payment-instrument invariants, not a migration.
-- Bank details share the instrument primary key: there is no second account identity.
ALTER TABLE master.bank_account
 ADD CONSTRAINT bank_account_created_by_fk FOREIGN KEY(tenant_id,created_by)
 REFERENCES master.principal(tenant_id,id),
 ADD CONSTRAINT bank_account_updated_by_fk FOREIGN KEY(tenant_id,updated_by)
 REFERENCES master.principal(tenant_id,id);

CREATE FUNCTION master.guard_payment_instrument_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW.tenant_id,NEW.instrument_type_code) IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.instrument_type_code) THEN
  RAISE EXCEPTION 'Instrument identity and type are immutable' USING ERRCODE='23514';
 END IF;
 NEW.record_version := OLD.record_version + 1;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_instrument_identity BEFORE UPDATE ON master.payment_instrument
 FOR EACH ROW EXECUTE FUNCTION master.guard_payment_instrument_identity();

CREATE FUNCTION master.require_payment_instrument_subtype() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE instrument_id uuid := COALESCE(NEW.id,OLD.id);
        instrument_tenant uuid := COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
 -- Deferred until both the parent and bank details have been captured atomically.
 IF EXISTS(SELECT 1 FROM master.payment_instrument i
           WHERE i.tenant_id=instrument_tenant AND i.id=instrument_id)
 AND NOT EXISTS(SELECT 1 FROM master.bank_account b
                WHERE b.tenant_id=instrument_tenant AND b.id=instrument_id) THEN
  RAISE EXCEPTION 'Bank-account instrument requires exactly one tenant-consistent bank detail'
   USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_instrument_subtype
 AFTER INSERT OR UPDATE ON master.payment_instrument DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION master.require_payment_instrument_subtype();
CREATE CONSTRAINT TRIGGER bank_account_subtype
 AFTER INSERT OR UPDATE OR DELETE ON master.bank_account DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION master.require_payment_instrument_subtype();

COMMENT ON COLUMN master.bank_account.id IS
 'Shared primary key and tenant-consistent foreign key to payment_instrument; bank-specific document references continue to target this subtype.';
COMMENT ON COLUMN master.bank_account_house_config.payment_instrument_link_id IS
 'Generic owner link; the house-bank guard additionally requires company ownership and a bank-account subtype.';
