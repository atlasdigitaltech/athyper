CREATE TABLE snapshot.template_version (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    template_id        uuid        NOT NULL,
    version            integer     NOT NULL,
    locale_code        text        NOT NULL DEFAULT 'en',
    content_html       text,
    content_json       jsonb,
    styles_css         text,
    variables_schema   jsonb,
    assets_manifest    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    checksum           text        NOT NULL,
    effective_from     date,
    effective_to       date,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,

    CONSTRAINT template_version_pkey PRIMARY KEY (id),
    CONSTRAINT template_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT template_version_template_id_uq
        UNIQUE (tenant_id, template_id, id),
    CONSTRAINT template_version_number_uq
        UNIQUE (tenant_id, template_id, locale_code, version),
    CONSTRAINT template_version_checksum_uq
        UNIQUE (tenant_id, template_id, locale_code, checksum),
    CONSTRAINT template_version_number_chk CHECK (version >= 1),
    CONSTRAINT template_version_locale_fmt_chk
        CHECK (locale_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT template_version_content_chk
        CHECK (
            (content_html IS NOT NULL)::integer
            + (content_json IS NOT NULL)::integer = 1
        ),
    CONSTRAINT template_version_content_html_chk
        CHECK (content_html IS NULL OR btrim(content_html) <> ''),
    CONSTRAINT template_version_content_json_chk
        CHECK (
            content_json IS NULL
            OR jsonb_typeof(content_json) IN ('object', 'array')
        ),
    CONSTRAINT template_version_variables_schema_chk
        CHECK (
            variables_schema IS NULL
            OR jsonb_typeof(variables_schema) = 'object'
        ),
    CONSTRAINT template_version_assets_manifest_chk
        CHECK (jsonb_typeof(assets_manifest) = 'object'),
    CONSTRAINT template_version_checksum_fmt_chk
        CHECK (checksum ~ '^[a-f0-9]{64}$'),
    CONSTRAINT template_version_effective_range_chk
        CHECK (
            effective_to IS NULL
            OR effective_from IS NULL
            OR effective_to >= effective_from
        )
);

COMMENT ON TABLE snapshot.template_version IS
  'Immutable locale-specific template content version. UPDATE and DELETE are rejected by a database trigger.';

COMMENT ON COLUMN snapshot.template_version.checksum IS
  'Lowercase SHA-256 checksum of the canonical content payload.';

CREATE TABLE snapshot.content_item_version (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    content_item_id uuid        NOT NULL,
    version         integer     NOT NULL,
    body_json       jsonb       NOT NULL,
    body_format     text        NOT NULL DEFAULT 'slate',
    change_summary  text,
    checksum        text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT content_item_version_pkey PRIMARY KEY (id),
    CONSTRAINT content_item_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT content_item_version_item_id_uq
        UNIQUE (tenant_id, content_item_id, id),
    CONSTRAINT content_item_version_number_uq
        UNIQUE (tenant_id, content_item_id, version),
    CONSTRAINT content_item_version_checksum_uq
        UNIQUE (tenant_id, content_item_id, checksum),
    CONSTRAINT content_item_version_number_chk CHECK (version >= 1),
    CONSTRAINT content_item_version_body_chk
        CHECK (jsonb_typeof(body_json) IN ('object', 'array')),
    CONSTRAINT content_item_version_format_chk
        CHECK (body_format IN ('slate', 'prosemirror', 'html', 'markdown')),
    CONSTRAINT content_item_version_summary_chk
        CHECK (change_summary IS NULL OR length(change_summary) <= 2048),
    CONSTRAINT content_item_version_checksum_chk
        CHECK (checksum ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE snapshot.content_item_version IS
  'Immutable content body snapshot. UPDATE and DELETE are rejected by trigger.';
