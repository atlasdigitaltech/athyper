-- Correct nullable correspondent semantics for databases created before this fix.
ALTER TABLE master.bank_account
    DROP CONSTRAINT bank_account_correspondent_self_chk;

ALTER TABLE master.bank_account
    ADD CONSTRAINT bank_account_correspondent_self_chk CHECK (
        correspondent_bank_party_id IS NULL
        OR correspondent_bank_party_id IS DISTINCT FROM bank_party_id
    );
