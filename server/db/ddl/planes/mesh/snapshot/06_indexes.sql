CREATE INDEX template_version_template_recent_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, version DESC);

CREATE INDEX template_version_effective_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, effective_from, effective_to);

CREATE INDEX network_account_profile_publication_snapshot_recipient_idx ON snapshot.network_account_profile_publication(recipient_tenant_id,network_relationship_id,captured_at DESC);
CREATE INDEX bank_account_disclosure_snapshot_recipient_idx ON snapshot.bank_account_disclosure(recipient_tenant_id,captured_at DESC);
