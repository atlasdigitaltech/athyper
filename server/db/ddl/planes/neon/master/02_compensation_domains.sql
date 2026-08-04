CREATE DOMAIN master.compensation_assignment_status_d AS text
    CHECK (VALUE IN ('planned','active','superseded','cancelled'));
