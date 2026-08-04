ALTER TABLE control.bank_account_validation_rule
    ADD CONSTRAINT bank_account_validation_rule_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country(code),
    ADD CONSTRAINT bank_account_validation_rule_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code);
