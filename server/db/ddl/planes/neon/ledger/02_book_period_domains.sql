CREATE DOMAIN ledger.book_period_status_d AS text
    CHECK (VALUE IN ('future','open','soft_close','hard_close'));
