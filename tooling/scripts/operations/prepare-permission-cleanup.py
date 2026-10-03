#!/usr/bin/env python3
"""Prepare reviewable, transactionally guarded permission retirement SQL. Never connects.

The input is a finite scoped correction, not runtime dispatch. Roles/groups are
preserved; only reviewed role-permission edges are removed. Any other FK
reference (including denies, ACLs, delegations or operation bindings) blocks apply.
Existing role status/audit/RLS controls are never disabled.
"""
import argparse
import hashlib
import json
import re
import uuid
from pathlib import Path


def prepare(manifest, apply=False):
    if set(manifest) != {'schema', 'plane', 'tenantIds', 'actorId', 'permissions', 'purpose'} or manifest['schema'] != 'permission-cleanup/1':
        raise ValueError('Exact permission-cleanup/1 manifest required')
    if manifest['plane'] not in ('neon', 'mesh', 'studio') or not manifest['purpose']:
        raise ValueError('Explicit plane and purpose required')
    if not isinstance(manifest['actorId'], str):
        raise ValueError('Explicit audited actor UUID required')
    uuid.UUID(manifest['actorId'])
    if not isinstance(manifest['purpose'], str) or len(manifest['purpose']) > 1000:
        raise ValueError('Bounded correction purpose required')
    if not manifest['tenantIds'] or len(set(manifest['tenantIds'])) != len(manifest['tenantIds']):
        raise ValueError('Explicit unique tenant scope required')
    for tenant in manifest['tenantIds']:
        uuid.UUID(tenant)
    seen = set()
    for row in manifest['permissions']:
        if set(row) != {'code', 'entityCode', 'successorReleaseId', 'successorArtifactHash', 'expectedParent'}:
            raise ValueError('Exact permission correction row required')
        if not re.fullmatch(r'[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}', row['code']) or row['code'].split('.')[0] != manifest['plane']:
            raise ValueError('Permission must belong to the selected plane')
        if not re.fullmatch(r'[a-z][a-z0-9_]{1,62}', row['entityCode']) or row['code'] in seen:
            raise ValueError('Invalid entity or duplicate permission')
        parent = row['expectedParent']
        if not isinstance(parent, dict) or set(parent) != {'entityCode', 'relationshipKey'}:
            raise ValueError('Explicit expected parent required')
        for key in ['entityCode', 'relationshipKey']:
            if (apply or parent[key] is not None) and not re.fullmatch(r'[a-z][a-z0-9_]{1,62}', parent[key] or ''):
                raise ValueError('Verified parent entity and relationship required')
        seen.add(row['code'])
        # A draft may have unresolved coordinates. Apply SQL may not.
        if apply or row['successorReleaseId'] is not None:
            uuid.UUID(row['successorReleaseId'])
        if (apply or row['successorArtifactHash'] is not None) and not re.fullmatch(r'[a-f0-9]{64}', row['successorArtifactHash'] or ''):
            raise ValueError('Verified active successor artifact hash required')
    if not seen:
        raise ValueError('Finite nonempty permission list required')
    payload = json.dumps(manifest, sort_keys=True).replace("'", "''")
    sql = "\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL search_path = pg_catalog, pg_temp;\nSET LOCAL standard_conforming_strings = on;\nSET LOCAL row_security = off;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n"
    # No live execution or secrets. row_security=off rejects incomplete RLS-filtered inventories; it does not grant BYPASSRLS or disable table policies.
    sql += f"CREATE TEMP TABLE cleanup_input ON COMMIT DROP AS SELECT '{payload}'::jsonb AS value;\n"
    sql += """
CREATE TEMP TABLE cleanup_targets ON COMMIT DROP AS
SELECT p.id, p.canonical_code, p.status, x.value AS requested
FROM authz.permission p CROSS JOIN cleanup_input i
JOIN LATERAL jsonb_array_elements(i.value->'permissions') x ON true
WHERE p.canonical_code=x.value->>'code';
SELECT jsonb_build_object('permission', t.canonical_code, 'status', t.status,
 'rolePermissionId', rp.id, 'tenantId', rp.tenant_id, 'roleId', rp.role_id,
 'roleStatus', r.status, 'groupId', gr.group_id) AS affected_relationship
FROM cleanup_targets t LEFT JOIN authz.role_permission rp ON rp.permission_id=t.id
LEFT JOIN authz.role r ON r.id=rp.role_id AND r.tenant_id=rp.tenant_id
LEFT JOIN authz.group_role gr ON gr.role_id=rp.role_id AND gr.tenant_id=rp.tenant_id;
-- Report all FK dependencies, not just known role/group relationships.
CREATE TEMP TABLE cleanup_dependencies (relation text, column_name text, row_count bigint) ON COMMIT DROP;
DO $report$
DECLARE ref record; n bigint;
BEGIN
 FOR ref IN SELECT c.conrelid::regclass relation, a.attname column_name
 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.confrelid='authz.permission'::regclass LOOP
   EXECUTE format('SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM cleanup_targets)',ref.relation,ref.column_name) INTO n;
   INSERT INTO cleanup_dependencies VALUES(ref.relation::text, ref.column_name, n);
 END LOOP;
END $report$;
TABLE cleanup_dependencies;
"""
    if not apply:
        return sql + 'ROLLBACK;\n'
    # Lock the exact authority/dependency tables and activation state; fail on any
    # unresolved restriction. No disabled triggers, role suspension or new grants.
    sql += """
LOCK TABLE authz.permission, authz.role_permission, authz.role, authz.group_role IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE runtime_meta.release_activation_head, runtime_meta.applied_release, runtime_meta.applied_release_payload IN SHARE MODE;
DO $guard$
DECLARE ref record; n bigint; row record; doc jsonb; rule jsonb;
BEGIN
 IF current_setting('app.database_plane',true) IS DISTINCT FROM (SELECT value->>'plane' FROM cleanup_input) THEN
   RAISE EXCEPTION 'Cleanup plane must match the configured database plane';
 END IF;
 IF (SELECT count(*) FROM cleanup_targets) <> (SELECT jsonb_array_length(value->'permissions') FROM cleanup_input) THEN
   RAISE EXCEPTION 'Missing permission; refresh inventory';
 END IF;
 IF EXISTS (SELECT 1 FROM cleanup_targets t LEFT JOIN authz.permission p ON p.id=t.id
   WHERE p.id IS NULL OR p.canonical_code<>t.canonical_code) THEN
   RAISE EXCEPTION 'Permission inventory changed before lock; refresh correction';
 END IF;
 IF EXISTS (SELECT 1 FROM authz.role_permission rp JOIN cleanup_targets t ON t.id=rp.permission_id
   WHERE NOT EXISTS (SELECT 1 FROM cleanup_input i, jsonb_array_elements_text(i.value->'tenantIds') tenant WHERE tenant.value=rp.tenant_id::text)) THEN
   RAISE EXCEPTION 'Permission has role dependencies outside explicit tenant scope';
 END IF;
 IF EXISTS (SELECT 1 FROM authz.role_permission rp JOIN cleanup_targets t ON t.id=rp.permission_id
   JOIN authz.role r ON r.id=rp.role_id AND r.tenant_id=rp.tenant_id WHERE r.status NOT IN ('draft','suspended')) THEN
   RAISE EXCEPTION 'Roles must be independently prepared for governed modification; cleanup does not suspend roles';
 END IF;
 FOR ref IN SELECT c.conrelid::regclass relation, a.attname column_name
 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.confrelid='authz.permission'::regclass LOOP
   EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',ref.relation);
   IF ref.relation NOT IN ('authz.role_permission'::regclass,'authz.permission_scope_kind'::regclass) THEN
     EXECUTE format('SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM cleanup_targets)',ref.relation,ref.column_name) INTO n;
     IF n>0 THEN RAISE EXCEPTION 'Unresolved permission dependency in %; preserve denies/policies/history',ref.relation; END IF;
   END IF;
 END LOOP;
 -- No active payload may still mention an old permission, even in a policy or profile.
 IF EXISTS (SELECT 1 FROM runtime_meta.release_activation_head h
   JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
   JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id CROSS JOIN cleanup_targets t
   WHERE jsonb_path_exists(p.payload_json, '$.** ? (@ == $code)', jsonb_build_object('code',t.canonical_code))) THEN
   RAISE EXCEPTION 'Old permission still referenced by an active publication';
 END IF;
 FOR row IN SELECT * FROM cleanup_targets LOOP
   BEGIN
   SELECT artifact->'content'->'descriptor' INTO STRICT doc
   FROM runtime_meta.release_activation_head h
   JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
   JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id
   CROSS JOIN LATERAL jsonb_array_elements(p.payload_json->'release'->'artifacts') artifact
   WHERE a.source_release_id=(row.requested->>'successorReleaseId')::uuid
     AND a.artifact_hash=row.requested->>'successorArtifactHash'
     AND p.artifact_kind='compiled_entity_runtime'
     AND artifact->>'artifactType'='runtime_contract'
     AND artifact->>'entityCode'=row.requested->>'entityCode'
     AND p.tenant_id IS NULL;
   EXCEPTION WHEN no_data_found OR too_many_rows THEN
     RAISE EXCEPTION 'Exactly one active platform successor required for %', row.canonical_code;
   END;
   rule := doc->'directoryScope'->'parent';
   IF doc IS NULL OR doc->>'planeKey' IS DISTINCT FROM (SELECT value->>'plane' FROM cleanup_input)
     OR rule IS DISTINCT FROM row.requested->'expectedParent' THEN
     RAISE EXCEPTION 'Active platform-owned successor with enforced parent scope required for %', row.canonical_code;
   END IF;
 END LOOP;
END $guard$;
-- Existing role audit/version/epoch triggers remain authoritative.
DELETE FROM authz.role_permission rp USING cleanup_targets t WHERE rp.permission_id=t.id
RETURNING rp.id AS removed_role_permission_id, rp.tenant_id, rp.role_id, rp.permission_id;
-- Retain immutable catalog identity/history. Retired permissions cannot be assigned.
UPDATE authz.permission p SET status='retired', status_changed_at=clock_timestamp(),
 status_changed_by=(i.value->>'actorId')::uuid, updated_at=clock_timestamp(), updated_by=(i.value->>'actorId')::uuid
FROM cleanup_targets t, cleanup_input i WHERE p.id=t.id AND p.status<>'retired';
SELECT jsonb_build_object('purpose',i.value->>'purpose','plane',i.value->>'plane',
 'tenantIds',i.value->'tenantIds','permissions',i.value->'permissions','status','retired',
 'rolesAndGroupsPreserved',true) AS cleanup_receipt FROM cleanup_input i;
COMMIT;
"""
    return sql


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--apply', action='store_true', help='Generate guarded write SQL; does not execute it')
    args = parser.parse_args()
    try:
        data = json.loads(args.manifest.read_text())
        sql = prepare(data, args.apply)
    except (ValueError, TypeError, AttributeError, KeyError) as error:
        parser.error(f"Incomplete or invalid cleanup manifest: {error}")
    args.output.write_text(sql)
    print(json.dumps({'mode': 'guarded_apply_sql' if args.apply else 'read_only_inventory_sql', 'manifestSha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(), 'output': str(args.output), 'executed': False}))

if __name__ == '__main__':
    main()
