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

CREATE TABLE snapshot.network_account_profile_publication (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    owner_tenant_id          uuid        NOT NULL,
    owner_account_id         uuid        NOT NULL,
    recipient_tenant_id      uuid        NOT NULL,
    recipient_account_id     uuid        NOT NULL,
    network_relationship_id  uuid        NOT NULL,
    schema_code              text        NOT NULL,
    schema_version           integer     NOT NULL,
    field_set_code           text        NOT NULL,
    payload_json             jsonb       NOT NULL,
    payload_hash             text        NOT NULL,
    captured_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
    captured_by              uuid        NOT NULL,

    CONSTRAINT network_account_profile_publication_snapshot_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_profile_publication_snapshot_owner_id_uq UNIQUE (owner_tenant_id, id),
    CONSTRAINT network_account_profile_publication_snapshot_participants_chk CHECK (owner_tenant_id <> recipient_tenant_id AND owner_account_id <> recipient_account_id),
    CONSTRAINT network_account_profile_publication_snapshot_schema_chk CHECK (schema_code = 'mesh.business_partner_profile' AND schema_version >= 1 AND field_set_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_account_profile_publication_snapshot_payload_chk CHECK (jsonb_typeof(payload_json) = 'object' AND pg_column_size(payload_json) <= 262144),
    CONSTRAINT network_account_profile_publication_snapshot_safe_chk CHECK (lower(payload_json::text) !~ '"(bank|iban|swift|bic|routing|account.?number|tax|registration.?number|metadata|capabilities|contact|email|phone|address|identifier)[^"]*"[[:space:]]*:'),
    CONSTRAINT network_account_profile_publication_snapshot_hash_chk CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE snapshot.network_account_profile_publication IS
  'Immutable, recipient-specific and bank-free MESH Business Partner profile snapshot. Mutation is rejected; withdrawal is a separate lifecycle event.';

CREATE TABLE snapshot.bank_account_disclosure (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    owner_tenant_id       uuid        NOT NULL,
    recipient_tenant_id   uuid        NOT NULL,
    disclosure_id         uuid        NOT NULL,
    disclosure_version    integer     NOT NULL,
    schema_code           text        NOT NULL DEFAULT 'mesh.bank_account_disclosure',
    schema_version        integer     NOT NULL DEFAULT 1,
    field_set_code        text        NOT NULL DEFAULT 'masked_retrieval_v1',
    payload_json          jsonb       NOT NULL,
    payload_hash          text        NOT NULL,
    captured_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
    captured_by           uuid        NOT NULL,
    CONSTRAINT bank_account_disclosure_snapshot_pkey PRIMARY KEY(id),
    CONSTRAINT bank_account_disclosure_snapshot_owner_id_uq UNIQUE(owner_tenant_id,id),
    CONSTRAINT bank_account_disclosure_snapshot_version_uq UNIQUE(owner_tenant_id,disclosure_id,disclosure_version),
    CONSTRAINT bank_account_disclosure_snapshot_version_chk CHECK(disclosure_version>=1 AND schema_version=1),
    CONSTRAINT bank_account_disclosure_snapshot_field_chk CHECK(field_set_code='masked_retrieval_v1'),
    CONSTRAINT bank_account_disclosure_snapshot_payload_chk CHECK(jsonb_typeof(payload_json)='object' AND pg_column_size(payload_json)<=32768),
    CONSTRAINT bank_account_disclosure_snapshot_safe_chk CHECK(lower(payload_json::text) !~ '"(account.?id.?value|account.?number|iban|routing.?number|raw.?account)[^"]*"[[:space:]]*:'),
    CONSTRAINT bank_account_disclosure_snapshot_hash_chk CHECK(payload_hash ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE snapshot.bank_account_disclosure IS
  'Immutable recipient-specific masked bank disclosure. Raw account identifiers are prohibited; secure retrieval is separately authorized and short-lived.';

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
