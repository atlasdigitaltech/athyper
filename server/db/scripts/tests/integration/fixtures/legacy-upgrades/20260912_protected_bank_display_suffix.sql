-- Preserve the validated display suffix of protected bank registrations.
-- Apply on NEON only; this does not alter access or verified-account state.
CREATE OR REPLACE FUNCTION master.trg_normalize_bank_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := nullif(lower(btrim(NEW.code)), '');
    NEW.name := nullif(btrim(NEW.name), '');
    NEW.account_holder_name := btrim(NEW.account_holder_name);
    NEW.account_id_value :=
        upper(regexp_replace(NEW.account_id_value, '[^A-Za-z0-9]', '', 'g'));
    IF nullif(btrim(NEW.metadata->>'protectedValueToken'), '') IS NOT NULL THEN
        -- Protected registrations persist a fingerprint, not the account number.
        -- Their display suffix must come from the validated input, never the hash.
        IF NEW.account_id_value !~ '^[A-F0-9]{64}$'
           OR NEW.account_last4 IS NULL
           OR upper(btrim(NEW.account_last4)) !~ '^[A-Z0-9]{4}$' THEN
            RAISE EXCEPTION 'Protected bank fingerprint and four-character display suffix are required'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.account_last4 := upper(btrim(NEW.account_last4));
    ELSE
        NEW.account_last4 := right(NEW.account_id_value, 4);
    END IF;
    NEW.currency_code := upper(btrim(NEW.currency_code::text));
    NEW.bic_override :=
        nullif(upper(regexp_replace(NEW.bic_override, '\s+', '', 'g')), '');
    NEW.bank_name_override := nullif(btrim(NEW.bank_name_override), '');
    IF NEW.bank_country_override IS NOT NULL THEN
        NEW.bank_country_override :=
            upper(btrim(NEW.bank_country_override::text));
    END IF;
    NEW.provider_account_ref := nullif(btrim(NEW.provider_account_ref), '');
    RETURN NEW;
END;
$$;
