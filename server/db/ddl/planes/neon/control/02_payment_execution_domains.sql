CREATE DOMAIN control.payment_execution_delivery_mode_d AS text
    CHECK (VALUE IN ('api', 'sftp', 'file', 'check_print', 'manual'));

CREATE DOMAIN control.payment_execution_profile_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'paused', 'deprecated'));
