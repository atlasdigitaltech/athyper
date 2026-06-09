-- ============================================================================
-- mesh/01d_utility_tables.sql
-- Concept: Mesh-owned utility tables for uploads, calendars, UI preferences,
--          notification preferences, and saved views.
-- Depends on: mesh/01_tables.sql, mesh/01a_foundation_tables.sql,
--             mesh/01c_content_collaboration_tables.sql, shared/01_tables.sql
-- ============================================================================
-- Scope rule:
--   These tables mirror selected Neon utility shapes while replacing tenant,
--   finance, and workspace runtime dependencies with Mesh account/principal
--   ownership and local shared reference snapshots.

CREATE TABLE IF NOT EXISTS mesh.multipart_upload (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code                text        NOT NULL,
    upload_id                   text        NOT NULL,
    storage_bucket              text        NOT NULL,
    storage_key                 text        NOT NULL,
    file_name                   text        NOT NULL,
    original_filename           text,
    content_type                text,
    size_bytes                  bigint,
    part_etags                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
    status                      text        NOT NULL DEFAULT 'initiated',
    expires_at                  timestamptz NOT NULL,
    completed_at                timestamptz,
    aborted_at                  timestamptz,
    attachment_id               uuid,
    initiated_by_principal_id   uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT 'system',
    updated_at                  timestamptz,
    updated_by                  text,

    CONSTRAINT mesh_multipart_upload_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_multipart_upload_account_upload_uq UNIQUE (account_code, upload_id),
    CONSTRAINT mesh_multipart_upload_status_chk CHECK (
        status IN ('initiated', 'uploading', 'completed', 'aborted', 'failed')
    ),
    CONSTRAINT mesh_multipart_upload_upload_id_chk CHECK (btrim(upload_id) <> ''),
    CONSTRAINT mesh_multipart_upload_bucket_chk CHECK (btrim(storage_bucket) <> ''),
    CONSTRAINT mesh_multipart_upload_key_chk CHECK (btrim(storage_key) <> ''),
    CONSTRAINT mesh_multipart_upload_file_chk CHECK (btrim(file_name) <> ''),
    CONSTRAINT mesh_multipart_upload_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT mesh_multipart_upload_parts_chk CHECK (jsonb_typeof(part_etags) = 'array'),
    CONSTRAINT mesh_multipart_upload_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_multipart_upload_expiry_chk CHECK (expires_at > created_at),
    CONSTRAINT mesh_multipart_upload_completed_chk CHECK (
        status <> 'completed' OR (completed_at IS NOT NULL AND attachment_id IS NOT NULL)
    ),
    CONSTRAINT mesh_multipart_upload_aborted_chk CHECK (
        status <> 'aborted' OR aborted_at IS NOT NULL
    ),
    CONSTRAINT mesh_multipart_upload_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_multipart_upload_attachment_fk FOREIGN KEY (account_code, attachment_id)
        REFERENCES mesh.attachment (account_code, id) ON DELETE RESTRICT,
    CONSTRAINT mesh_multipart_upload_initiated_by_fk FOREIGN KEY (initiated_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS mesh_multipart_upload_account_idx
    ON mesh.multipart_upload (account_code, status, expires_at);
CREATE INDEX IF NOT EXISTS mesh_multipart_upload_attachment_idx
    ON mesh.multipart_upload (attachment_id)
    WHERE attachment_id IS NOT NULL;

COMMENT ON TABLE mesh.multipart_upload IS
    'Mesh-owned multipart upload tracker for object payloads that later become mesh.attachment rows.';
COMMENT ON COLUMN mesh.multipart_upload.part_etags IS
    'JSONB array of {part_number, etag} objects returned by object storage during multipart upload.';

CREATE TABLE IF NOT EXISTS mesh.holiday_calendar (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    code                text        NOT NULL,
    name                text        NOT NULL,
    country_code        character(2),
    weekend_pattern     text        NOT NULL DEFAULT 'SAT_SUN',
    weekend_days        smallint[],
    description         text,
    is_default          boolean     NOT NULL DEFAULT false,
    sort_order          smallint    NOT NULL DEFAULT 0,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_holiday_calendar_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_holiday_calendar_account_code_uq UNIQUE NULLS NOT DISTINCT (account_code, code),
    CONSTRAINT mesh_holiday_calendar_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_holiday_calendar_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_holiday_calendar_country_chk CHECK (
        country_code IS NULL OR country_code::text ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT mesh_holiday_calendar_weekend_chk CHECK (
        weekend_pattern IN ('SAT_SUN', 'FRI_SAT', 'FRI_ONLY', 'SUN_ONLY', 'CUSTOM', 'NONE')
    ),
    CONSTRAINT mesh_holiday_calendar_custom_days_chk CHECK (
        weekend_pattern <> 'CUSTOM'
        OR (weekend_days IS NOT NULL AND array_length(weekend_days, 1) > 0)
    ),
    CONSTRAINT mesh_holiday_calendar_noncustom_days_chk CHECK (
        weekend_pattern = 'CUSTOM' OR weekend_days IS NULL
    ),
    CONSTRAINT mesh_holiday_calendar_weekend_range_chk CHECK (
        weekend_days IS NULL OR weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
    ),
    CONSTRAINT mesh_holiday_calendar_weekend_max_chk CHECK (
        weekend_days IS NULL OR array_length(weekend_days, 1) <= 7
    ),
    CONSTRAINT mesh_holiday_calendar_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_holiday_calendar_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_holiday_calendar_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_holiday_calendar_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_holiday_calendar_default_uq
    ON mesh.holiday_calendar (
        COALESCE(account_code, ''),
        COALESCE(country_code, '')
    )
    WHERE is_default = true AND status = 'active';
CREATE INDEX IF NOT EXISTS mesh_holiday_calendar_country_idx
    ON mesh.holiday_calendar (country_code)
    WHERE country_code IS NOT NULL AND status = 'active';

COMMENT ON TABLE mesh.holiday_calendar IS
    'Mesh business calendar. account_code NULL means platform/global calendar; account rows are participant-specific.';

CREATE TABLE IF NOT EXISTS mesh.holiday_calendar_day (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    holiday_calendar_id   uuid        NOT NULL,
    calendar_year         smallint    NOT NULL,
    holiday_date          date        NOT NULL,
    name                  text        NOT NULL,
    day_type              text        NOT NULL DEFAULT 'HOLIDAY',
    observance_type       text        NOT NULL DEFAULT 'MANDATORY',
    is_half_day           boolean     NOT NULL DEFAULT false,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text        NOT NULL DEFAULT 'system',
    updated_at            timestamptz,
    updated_by            text,

    CONSTRAINT mesh_holiday_calendar_day_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_holiday_calendar_day_calendar_date_uq UNIQUE (holiday_calendar_id, holiday_date),
    CONSTRAINT mesh_holiday_calendar_day_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_holiday_calendar_day_type_chk CHECK (
        day_type IN ('HOLIDAY', 'WORKING_OVERRIDE', 'BLACKOUT')
    ),
    CONSTRAINT mesh_holiday_calendar_day_observance_chk CHECK (
        observance_type IN ('MANDATORY', 'RESTRICTED', 'OPTIONAL')
    ),
    CONSTRAINT mesh_holiday_calendar_day_year_chk CHECK (calendar_year BETWEEN 2000 AND 2099),
    CONSTRAINT mesh_holiday_calendar_day_year_date_chk CHECK (
        EXTRACT(YEAR FROM holiday_date) = calendar_year
    ),
    CONSTRAINT mesh_holiday_calendar_day_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_holiday_calendar_day_calendar_fk FOREIGN KEY (holiday_calendar_id)
        REFERENCES mesh.holiday_calendar (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_holiday_calendar_day_year_idx
    ON mesh.holiday_calendar_day (holiday_calendar_id, calendar_year, holiday_date);

COMMENT ON TABLE mesh.holiday_calendar_day IS
    'Individual holiday, working override, or blackout date for a Mesh holiday calendar.';

-- principal_ui_profile and principal_ui_preference removed — master.* owns these for all planes.

CREATE TABLE IF NOT EXISTS mesh.principal_notification_preference (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    principal_id            uuid        NOT NULL,
    event_code              text        NOT NULL,
    channel                 text        NOT NULL,
    is_enabled              boolean,
    frequency_code          text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_principal_notification_pref_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_principal_notification_pref_uq UNIQUE (account_code, principal_id, event_code, channel),
    CONSTRAINT mesh_principal_notification_pref_event_chk CHECK (btrim(event_code) <> ''),
    CONSTRAINT mesh_principal_notification_pref_channel_chk CHECK (
        channel IN ('in_app', 'email', 'sms', 'push', 'webhook')
    ),
    CONSTRAINT mesh_principal_notification_pref_frequency_chk CHECK (
        frequency_code IS NULL OR frequency_code IN ('immediate', 'hourly', 'daily', 'weekly', 'never')
    ),
    CONSTRAINT mesh_principal_notification_pref_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_principal_notification_pref_status_chk CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT mesh_principal_notification_pref_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_principal_notification_pref_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_principal_notification_pref_event_idx
    ON mesh.principal_notification_preference (account_code, event_code, channel);

COMMENT ON TABLE mesh.principal_notification_preference IS
    'Mesh notification preference overrides per principal, event, and channel.';

CREATE TABLE IF NOT EXISTS mesh.saved_view (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    owner_principal_id      uuid,
    scope                   text        NOT NULL,
    surface_code            text        NOT NULL,
    entity_key              text,
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    is_pinned               boolean     NOT NULL DEFAULT false,
    is_default              boolean     NOT NULL DEFAULT false,
    state_json              jsonb       NOT NULL,
    state_hash              text,
    version                 integer     NOT NULL DEFAULT 1,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       text,
    deleted_at              timestamptz,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_saved_view_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_saved_view_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_saved_view_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_saved_view_surface_chk CHECK (btrim(surface_code) <> ''),
    CONSTRAINT mesh_saved_view_state_chk CHECK (jsonb_typeof(state_json) = 'object'),
    CONSTRAINT mesh_saved_view_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_saved_view_version_chk CHECK (version >= 1),
    CONSTRAINT mesh_saved_view_scope_chk CHECK (scope IN ('personal', 'shared', 'system')),
    CONSTRAINT mesh_saved_view_status_chk CHECK (status IN ('active', 'archived')),
    CONSTRAINT mesh_saved_view_deleted_status_chk CHECK (deleted_at IS NULL OR status = 'archived'),
    CONSTRAINT mesh_saved_view_scope_owner_chk CHECK (
        CASE scope
            WHEN 'personal' THEN owner_principal_id IS NOT NULL
            WHEN 'system' THEN owner_principal_id IS NULL
            WHEN 'shared' THEN true
            ELSE false
        END
    ),
    CONSTRAINT mesh_saved_view_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_saved_view_owner_fk FOREIGN KEY (owner_principal_id)
        REFERENCES mesh.principal (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_saved_view_name_uq
    ON mesh.saved_view (account_code, scope, owner_principal_id, surface_code, entity_key, name)
    NULLS NOT DISTINCT
    WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS mesh_saved_view_one_default_uq
    ON mesh.saved_view (account_code, scope, owner_principal_id, surface_code, entity_key)
    NULLS NOT DISTINCT
    WHERE is_default = true AND status = 'active';
CREATE INDEX IF NOT EXISTS mesh_saved_view_surface_idx
    ON mesh.saved_view (account_code, surface_code)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS mesh_saved_view_owner_idx
    ON mesh.saved_view (account_code, owner_principal_id, surface_code)
    WHERE status = 'active' AND owner_principal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_saved_view_hash_idx
    ON mesh.saved_view (account_code, surface_code, state_hash)
    WHERE state_hash IS NOT NULL AND status = 'active';

COMMENT ON TABLE mesh.saved_view IS
    'Mesh saved grid/list/query presets. Personal views are principal-owned; shared/system views are account-visible.';
