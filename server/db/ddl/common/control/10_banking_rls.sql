ALTER TABLE control.bank_account_validation_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.bank_account_validation_rule FORCE ROW LEVEL SECURITY;

CREATE POLICY bank_account_validation_rule_read
    ON control.bank_account_validation_rule FOR SELECT USING (true);
CREATE POLICY bank_account_validation_rule_seed_write
    ON control.bank_account_validation_rule FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
