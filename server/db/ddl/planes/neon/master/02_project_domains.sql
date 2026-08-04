CREATE DOMAIN master.project_type_d AS text
    CHECK (VALUE IN ('internal', 'customer', 'capital', 'research', 'implementation'));

CREATE DOMAIN master.project_status_d AS text
    CHECK (VALUE IN ('draft', 'planned', 'active', 'on_hold', 'completed', 'closed', 'cancelled'));

CREATE DOMAIN master.project_wbs_type_d AS text
    CHECK (VALUE IN ('summary', 'control_account', 'work_package'));

CREATE DOMAIN master.project_item_type_d AS text
    CHECK (VALUE IN ('material', 'service', 'asset', 'expense', 'deliverable'));

CREATE DOMAIN master.project_record_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'closed', 'cancelled'));
