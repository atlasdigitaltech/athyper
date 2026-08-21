CREATE DOMAIN governance.moderation_status_d AS text
    CHECK (VALUE IN ('open','reviewing','approved','rejected','removed'));
CREATE DOMAIN governance.cycle_run_status_d AS text
    CHECK (VALUE IN ('draft','scheduled','running','blocked','completed','cancelled'));
CREATE DOMAIN governance.cycle_task_status_d AS text
    CHECK (VALUE IN ('pending','ready','in_progress','blocked','completed','waived','cancelled'));
CREATE DOMAIN governance.certification_status_d AS text
    CHECK (VALUE IN ('draft','submitted','approved','rejected','revoked'));
CREATE DOMAIN governance.legal_hold_status_d AS text
    CHECK (VALUE IN ('draft','active','released','cancelled'));
CREATE DOMAIN governance.report_pack_status_d AS text
    CHECK (VALUE IN ('draft','generating','ready','failed','superseded'));
