CREATE DOMAIN document.work_item_status_d AS text
    CHECK (VALUE IN ('open','claimed','in_progress','blocked','completed','cancelled'));
CREATE DOMAIN document.work_item_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
