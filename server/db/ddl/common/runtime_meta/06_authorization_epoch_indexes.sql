CREATE UNIQUE INDEX authorization_epoch_global_uq
    ON runtime_meta.authorization_epoch (scope_kind) WHERE scope_kind = 'global';
CREATE UNIQUE INDEX authorization_epoch_tenant_uq
    ON runtime_meta.authorization_epoch (tenant_id) WHERE scope_kind = 'tenant';
CREATE UNIQUE INDEX authorization_epoch_plane_uq
    ON runtime_meta.authorization_epoch (tenant_id, plane_code) WHERE scope_kind = 'plane';
