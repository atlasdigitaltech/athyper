"""Read-only preflight for the BP integrated release scope.

This never applies DDL.  It proves whether the selected Studio and Neon targets
already contain the collaboration and capability structures required before a
release envelope can be published.
"""
import hashlib
import argparse
import os
import subprocess
import sys
from pathlib import Path
from verify_live_schema import connection_environment

REPO = Path(__file__).resolve().parents[3]
SOURCES = {
    'studio capability': REPO / 'server/db/ddl/planes/studio/metadata/03_tables.sql',
    'studio capability constraints': REPO / 'server/db/ddl/planes/studio/metadata/05_constraints.sql',
    'studio capability rls': REPO / 'server/db/ddl/planes/studio/metadata/10_rls.sql',
    'studio capability grants': REPO / 'server/db/ddl/planes/studio/metadata/11_grants.sql',
    'studio capability functions': REPO / 'server/db/ddl/planes/studio/metadata/07_functions.sql',
    'studio capability triggers': REPO / 'server/db/ddl/planes/studio/metadata/08_triggers.sql',
    'neon comment history': REPO / 'server/db/ddl/common/document/03_foundation_tables.sql',
    'neon comment integrity': REPO / 'server/db/ddl/common/document/12_collaboration_integrity.sql',
    'neon comment audience': REPO / 'server/db/ddl/planes/neon/document/10_rls.sql',
}
CHECKS = {
    'STUDIO_SCHEMA_DATABASE_URL': {
        'label': 'Studio',
        'objects': {
            'metadata.entity_capability': {
                'columns': {'id', 'tenant_id', 'entity_id', 'change_set_id', 'capability_key', 'declaration', 'binding', 'created_at', 'created_by', 'updated_at', 'updated_by'},
                'constraints': {'entity_capability_entity_fk', 'entity_capability_changeset_fk', 'entity_capability_tenant_fk', 'entity_capability_actor_fk'},
                'triggers': {'entity_capability_graph_guard', 'entity_capability_updated_at', 'entity_capability_graph_validate'},
                'rls': True,
            },
        },
    },
    'NEON_SCHEMA_DATABASE_URL': {
        'label': 'Neon',
        'objects': {
            'document.comment': {
                'columns': {'revision_no'},
                'triggers': {'comment_revision_number', 'comment_revision_capture'},
                'rls': True,
            },
            'document.comment_draft': {'columns': {'expires_at'}, 'rls': True},
            'document.attachment': {
                'columns': {'admitted_release_hash', 'admitted_policy_hash', 'draft_id'},
                'constraints': {'attachment_draft_fk', 'attachment_admission_pair'},
                'triggers': {'attachment_immutable_bytes'},
                'rls': True,
            },
            'document.attachment_series': {'columns': {'display_name', 'revision_no'}, 'rls': True},
            'document.attachment_link': {'columns': {'category_code'}, 'rls': True},
            'document.attachment_folder': {'triggers': {'aa_attachment_folder_owner_lock'}, 'rls': True},
            'document.comment_revision': {
                'columns': {'id', 'tenant_id', 'comment_id', 'revision_no', 'comment_text', 'content_format', 'content_json', 'content_html', 'content_schema', 'visibility', 'status', 'change_kind', 'created_at', 'created_by'},
                'constraints': {'comment_revision_tenant_fk', 'comment_revision_comment_fk'},
                'triggers': {'comment_revision_immutable'},
                'rls': True,
            },
        },
    },
}

SQL = """
WITH objects AS (
 SELECT n.nspname || '.' || c.relname AS object_name, c.oid, c.relrowsecurity AS rls
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND n.nspname IN ('metadata','document')
), columns AS (
 SELECT n.nspname || '.' || c.relname AS object_name, array_agg(a.attname ORDER BY a.attname) AS names
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND n.nspname IN ('metadata','document')
 GROUP BY n.nspname,c.relname
), constraints AS (
 SELECT n.nspname || '.' || c.relname AS object_name, array_agg(x.conname ORDER BY x.conname) AS names
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('metadata','document') GROUP BY n.nspname,c.relname
), triggers AS (
 SELECT n.nspname || '.' || c.relname AS object_name, array_agg(t.tgname ORDER BY t.tgname) AS names
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname IN ('metadata','document') GROUP BY n.nspname,c.relname
)
SELECT coalesce(json_object_agg(objects.object_name,json_build_object(
 'columns',coalesce(columns.names,ARRAY[]::text[]), 'constraints',coalesce(constraints.names,ARRAY[]::text[]),
 'triggers',coalesce(triggers.names,ARRAY[]::text[]), 'rls',objects.rls)), '{}'::json)
FROM objects LEFT JOIN columns USING(object_name) LEFT JOIN constraints USING(object_name) LEFT JOIN triggers USING(object_name);
"""

def query(url, container=None, plane=None):
    command = ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', SQL]
    if container:
        command = ['docker', 'exec', container] + command + ['-U', 'postgres', '-d', f'athyper_{plane}']
    result = subprocess.run(command, env=None if container else connection_environment(url), capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('catalog query failed; check connectivity and catalog access')
    import json
    return json.loads(result.stdout)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', help='Read catalogs through docker exec instead of database URLs; performs no writes')
    args = parser.parse_args()
    missing_environment = [key for key in CHECKS if not os.environ.get(key) and not args.container]
    if missing_environment:
        sys.exit('BLOCKED: required read-only database URLs are absent: ' + ', '.join(missing_environment))
    errors = []
    for environment, target in CHECKS.items():
        try:
            objects = query(os.environ.get(environment), args.container, target['label'].lower())
        except RuntimeError as error:
            errors.append(f"{target['label']}: {error}")
            continue
        for name, expected in target['objects'].items():
            actual = objects.get(name)
            if not actual:
                errors.append(f"{target['label']}: {name} is absent")
                continue
            for key in ('columns', 'constraints', 'triggers'):
                absent = expected.get(key, set()) - set(actual.get(key, []))
                if absent:
                    errors.append(f"{target['label']}: {name} missing {key}: {', '.join(sorted(absent))}")
            if expected.get('rls') and not actual.get('rls'):
                errors.append(f"{target['label']}: {name} does not have row-level security enabled")
    if errors:
        print('\n'.join(errors))
        sys.exit('BLOCKED: data-preserving DDL preflight is incomplete; do not publish this release.')
    print('PASS: required Studio capability and Neon comment-history structures are present with constraints, triggers, and RLS.')
    print('Pinned DDL evidence:')
    for label, path in SOURCES.items():
        print(f'  {label}: {path.relative_to(REPO)} sha256={hashlib.sha256(path.read_bytes()).hexdigest()}')

if __name__ == '__main__':
    main()
