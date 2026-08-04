CREATE INDEX template_version_template_recent_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, version DESC);

CREATE INDEX template_version_effective_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, effective_from, effective_to);
