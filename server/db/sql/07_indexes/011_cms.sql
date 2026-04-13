-- 07_indexes/011_cms.sql
-- Depends on: 04_tables/003f_master_cms.sql, 04_tables/009a_snapshot_cms.sql
-- Naming: <table>_<cols>_idx | _pidx (partial WHERE).

-- master.content_item
CREATE INDEX IF NOT EXISTS content_item_tenant_status_kind_idx
    ON master.content_item (tenant_id, status, kind);

CREATE INDEX IF NOT EXISTS content_item_tenant_parent_idx
    ON master.content_item (tenant_id, parent_id);

CREATE INDEX IF NOT EXISTS content_item_tenant_locale_slug_idx
    ON master.content_item (tenant_id, locale_code, slug);

CREATE INDEX IF NOT EXISTS content_item_published_pidx
    ON master.content_item (tenant_id, kind, locale_code)
    WHERE status = 'PUBLISHED';

-- snapshot.content_item_version
CREATE INDEX IF NOT EXISTS civ_item_version_desc_idx
    ON snapshot.content_item_version (content_item_id, version DESC);

-- master.content_item_link
CREATE INDEX IF NOT EXISTS cil_source_idx
    ON master.content_item_link (source_content_item_id);

CREATE INDEX IF NOT EXISTS cil_target_idx
    ON master.content_item_link (target_content_item_id);

-- master.content_item_access_grant
CREATE INDEX IF NOT EXISTS ciag_item_subject_idx
    ON master.content_item_access_grant (content_item_id, subject_type, subject_id);

-- Partial index for non-expiring grants only (volatile now() cannot be used in predicates)
CREATE INDEX IF NOT EXISTS ciag_item_level_perpetual_pidx
    ON master.content_item_access_grant (content_item_id, access_level)
    WHERE expires_at IS NULL;
