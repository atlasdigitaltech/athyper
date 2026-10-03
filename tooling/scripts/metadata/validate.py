"""Read-only consistency checks for the BP review artifacts; no runtime activation."""
import hashlib
import json
import re
import sys
import argparse
from jsonschema import Draft202012Validator
from pathlib import Path
from source_workspace import discover_workspace
from historical_evidence import verify_evidence

arguments = argparse.ArgumentParser(add_help=False)
arguments.add_argument('--package-root')
arguments.add_argument('--repository-root')
arguments.add_argument('--source-bundle')
arguments.add_argument('--release-ready', action='store_true')
arguments.add_argument('--release-candidate')
args, _ = arguments.parse_known_args()
REPO = Path(args.repository_root).resolve() if args.repository_root else Path(__file__).resolve().parents[3]
ROOT = Path(args.package_root).resolve() if args.package_root else REPO / 'metadata/entities'
SCHEMAS = REPO / 'metadata/schemas/entity-artifacts-v2'
REVIEW = ROOT.parent / 'review'
SOURCE_BUNDLE = Path(args.source_bundle).resolve() if args.source_bundle else next((REPO / 'docs/architecture/application-experience/entity-policy-examples').glob('business-partner-definition-bundle-22ee*.json'))
TYPES = {'core', 'operation', 'presentation_surface', 'presentation_section', 'flow'}
READ_POLICIES = {'authorized_projection', 'masked_only', 'excluded_until_explicitly_authorized'}
WRITE_POLICIES = {'handler_only', 'system_managed', 'server_numbering'}
# Global reference catalogues are read through the bounded, permission-checked
# reference directory. They have no tenant_id because their owning scope is
# the consuming business object, not the catalogue row.
SHARED_TABLE_TENANT_FIELD_ALLOWLIST = {
    'shared.country', 'shared.state_region', 'shared.language', 'shared.locale',
    'shared.timezone', 'shared.uom', 'shared.currency',
    'shared.classification_scheme', 'shared.commodity_code',
    'shared.commodity_crosswalk', 'shared.industry_code',
    'shared.industry_crosswalk', 'shared.bank_institution',
    'shared.bank_branch', 'shared.bank_identifier',
}
LOCALIZED_PROPERTIES = {
    'label', 'title', 'description', 'helpText', 'emptyLabel', 'viewAllLabel',
    'tooltip', 'placeholder', 'ariaLabel',
}
TRANSLATIONS = {}

def public_type(base):
    if base.endswith('[]'): return 'array'
    if base in ('uuid', 'boolean', 'date'): return base
    if base.startswith('timestamp'): return 'datetime'
    if base in ('smallint', 'integer', 'bigint'): return 'integer'
    if base.startswith(('numeric', 'decimal', 'real', 'double precision')): return 'decimal'
    if base in ('json', 'jsonb'): return 'object'
    if base.startswith(('text', 'character', 'varchar')): return 'string'
    raise AssertionError(('Unsupported PostgreSQL base type', base))

def check_field(field, catalog):
    binding = field['binding']
    row = catalog[(binding['sourceObject'], binding['column'])]
    if not (field['storageType'] == row['type']):
        raise AssertionError(field['key'])
    if not (field['dataType'] == public_type(row['baseType'])):
        raise AssertionError(field['key'])
    if not (field['nullable'] == row['nullable']):
        raise AssertionError(field['key'])

def digest(value):
    data = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return 'sha256:' + hashlib.sha256(data.encode()).hexdigest()

def refs(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('Ref') and isinstance(item, str) and item.endswith('.json'):
                yield item
            elif key.endswith('Refs') and isinstance(item, list):
                yield from (x for x in item if isinstance(x, str) and x.endswith('.json'))
            else:
                yield from refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from refs(item)

def draft_statuses(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {'implementationStatus', 'permissionStatus', 'handlerBindingStatus'} and isinstance(item, str) and item.startswith('draft_'):
                yield key, item
            yield from draft_statuses(item)
    elif isinstance(value, list):
        for item in value:
            yield from draft_statuses(item)

def assert_localized(value, path):
    """Reject raw UI copy in runtime artifacts; source fixtures are excluded."""
    if isinstance(value, dict):
        if 'labelKey' in value:
            key, text = value['labelKey'], value['defaultText']
            if not (key not in TRANSLATIONS or TRANSLATIONS[key] == text):
                raise AssertionError((path, 'conflicting translation key', key))
            TRANSLATIONS[key] = text
        for key, item in value.items():
            location = f'{path}.{key}'
            # Empty-state copy is still carried by the current runtime's
            # string-only descriptor contract. Its localization migration is
            # deliberately deferred; every other UI label is a resource.
            if key in LOCALIZED_PROPERTIES and not (key == 'title' and path.endswith('.emptyState')):
                if not (isinstance(item, dict)):
                    raise AssertionError((location, 'must be a translation object'))
                if not (set(item) == {'labelKey', 'defaultText'}):
                    raise AssertionError((location, item))
                if not (isinstance(item['labelKey'], str) and item['labelKey']):
                    raise AssertionError(location)
                if not (isinstance(item['defaultText'], str)):
                    raise AssertionError(location)
            assert_localized(item, location)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_localized(item, f'{path}[{index}]')

VALUE_ORIGINS = {'stored', 'computed', 'derived', 'server_assigned'}
STORAGE_KINDS = {'handler_projection', 'field_projection', 'registered_service', 'table'}

def assert_security_contracts(value, path):
    """Validate security-sensitive nested contracts, including child collections."""
    if isinstance(value, dict):
        if value.get('dataCategory') in {'personal_contact', 'bank_account'} and 'readPolicy' in value and 'protection' not in value:
            raise AssertionError((path, 'sensitive data category requires protection'))
        if 'authorization' in value:
            authorization = value['authorization']
            if authorization.get('discoverableWhenDenied') is not False or authorization.get('enforceBeforeDataQuery') is not True:
                raise AssertionError((path, 'authorization must deny discovery and authorize before query'))
        if 'protection' in value:
            protection = value['protection']
            if protection.get('sensitivity') not in {'internal', 'restricted'}:
                raise AssertionError((path, 'protected value requires sensitivity'))
            normal = protection.get('normalProjection', {})
            if normal.get('mode') != 'masked' or normal.get('plaintextInNormalQueries') is not False:
                raise AssertionError((path, 'protected value must remain masked'))
            if value.get('readPolicy') != 'masked_only':
                raise AssertionError((path, 'protected value must be masked_only'))
        if 'valueOrigin' in value and value['valueOrigin'] not in VALUE_ORIGINS:
            raise AssertionError((path, 'invalid valueOrigin'))
        for key, item in value.items():
            assert_security_contracts(item, f'{path}.{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_security_contracts(item, f'{path}[{index}]')

workspace = discover_workspace(ROOT.parent)
coverage = workspace['coverage']
print('Source coverage:', json.dumps(coverage['counts'], sort_keys=True), '(publication unverified)')
for row in coverage['entities']:
    if row['missingRequired'] or row['missingRecommended']:
        print(row['entityCode'], 'required gaps:', ','.join(row['missingRequired']), 'recommended gaps:', ','.join(row['missingRecommended']))
files = {document['ref']: document['value'] for document in workspace['documents']}
files.update({'review/' + str(p.relative_to(REVIEW)): json.loads(p.read_text()) for p in REVIEW.rglob('*.json')})
release = files['business_partner/release.json']

def compiler_boundary_artifact(path, source):
    """Materialize the immutable compiler output without writing source files.

    New authoring documents deliberately omit artifactHash. Legacy source can
    contain a stale frozen hash, but the compiler ignores it and derives the
    value again. A hash only becomes authoritative in a frozen release receipt.
    """
    content = {key: value for key, value in source.items() if key != 'artifactHash'}
    computed = digest(content)
    return {**content, 'artifactHash': computed}

artifacts = {
    path: compiler_boundary_artifact(path, artifact)
    for path, artifact in files.items()
    if isinstance(artifact, dict) and artifact.get('artifactType') in TYPES
}
schemas = {
    kind: Draft202012Validator(json.loads((SCHEMAS/f'{kind}.schema.json').read_text()))
    for kind in TYPES
}
for path, artifact in artifacts.items():
    errors = sorted(schemas[artifact['artifactType']].iter_errors(artifact), key=lambda error: list(error.path))
    if errors:
        raise AssertionError((path, 'closed-world schema violation', errors[0].message))
release_errors = sorted(Draft202012Validator(json.loads((SCHEMAS/'release.schema.json').read_text())).iter_errors(release), key=lambda error: list(error.path))
if release_errors:
    raise AssertionError(('business_partner/release.json', 'closed-world schema violation', release_errors[0].message))
if not (len({a['artifactKey'] for a in artifacts.values()}) == len(artifacts)):
    raise AssertionError("len({a['artifactKey'] for a in artifacts.values()}) == len(artifacts)")
keys = {a['artifactKey'] for a in artifacts.values()}
# Independent database catalog evidence, not the former generator's SQL regex.
catalog_document = files['review/storage-catalog.json']
catalog = {(r['table'], r['column']): r for r in catalog_document['columns']}
tables = {}
for table, column in catalog:
    tables.setdefault(table, set()).add(column)
evidence_receipts = [verify_evidence(REPO, source) for source in catalog_document.get('ddlFallbacks', [])]
index_document = files['review/index-catalog.json']
indexes = {item['ref']: item for item in index_document['indexes']}
evidence_receipts.extend(verify_evidence(REPO, source) for source in index_document.get('source', {}).get('ddlEvidence', []))
for receipt in evidence_receipts:
    if receipt['status'] == 'historical_only':
        print('Historical DDL evidence verified:', receipt['path'], receipt['revision'], '(current release evidence requires recapture)')
permission_document = files['review/permission-catalog.json']
permissions = {item['code']: item for item in permission_document['permissions']}
registry_document = files['review/registry-catalog.json']
registry = {(item['kind'], item['key']): item for item in registry_document['entries']}
shape_document = files['review/shape-catalog.json']
shape_catalog = {kind: {path: set(keys) for path, keys in paths.items()} for kind, paths in shape_document['shapes'].items()}

candidate_scope = None

def assert_operation_input_schema(value, path):
    if not isinstance(value, dict):
        raise AssertionError(("operation", '.'.join(path), "input schema must be an object"))
    unknown = set(value) - {"required", "properties", "additionalProperties"}
    if unknown:
        raise AssertionError(("operation", '.'.join(path), "unknown input-schema property", sorted(unknown)))
    required = value.get("required", [])
    if not isinstance(required, list) or any(not isinstance(key, str) or not key for key in required):
        raise AssertionError(("operation", '.'.join(path), "invalid input-schema required"))
    properties = value.get("properties", {})
    if not isinstance(properties, dict) or any(not isinstance(key, str) or not key for key in properties):
        raise AssertionError(("operation", '.'.join(path), "invalid input-schema properties"))
    if not set(required) <= set(properties):
        raise AssertionError(("operation", '.'.join(path), "required input lacks a declared property"))
    if value.get("additionalProperties") not in {True, False, None}:
        raise AssertionError(("operation", '.'.join(path), "invalid input-schema additionalProperties"))
    for key, field in properties.items():
        if not isinstance(field, dict) or set(field) - {"type", "enum"}:
            raise AssertionError(("operation", '.'.join(path + ("properties", key)), "invalid input property"))
        if field.get("type") not in {"string", "integer", "boolean", "object"}:
            raise AssertionError(("operation", '.'.join(path + ("properties", key)), "unsupported input type"))
        if "enum" in field and (not isinstance(field["enum"], list) or not field["enum"]):
            raise AssertionError(("operation", '.'.join(path + ("properties", key)), "invalid input enum"))

def assert_closed_nested_shape(value, artifact_type, path=()):
    if artifact_type == "operation" and path[-2:] == ("operations", "[]") and isinstance(value, dict) and "inputSchema" in value:
        assert_operation_input_schema(value["inputSchema"], path + ("inputSchema",))
        value = {key: item for key, item in value.items() if key != "inputSchema"}
    if isinstance(value, dict):
        allowed = shape_catalog[artifact_type].get('.'.join(path))
        if allowed is None:
            raise AssertionError((artifact_type, '.'.join(path), 'unrecognised normative object shape'))
        unknown = set(value) - allowed
        if unknown:
            raise AssertionError((artifact_type, '.'.join(path), 'unknown normative property', sorted(unknown)))
        for key, item in value.items():
            assert_closed_nested_shape(item, artifact_type, path + (key,))
    elif isinstance(value, list):
        for item in value:
            assert_closed_nested_shape(item, artifact_type, path + ('[]',))

def permission_codes(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {'permissionCode', 'viewPermission', 'readPermissionCode'} and isinstance(item, str):
                yield item
            elif key == 'fieldPermissions' and isinstance(item, list):
                for code in item:
                    if not (isinstance(code, str)):
                        raise AssertionError(('fieldPermissions must contain permission codes', code))
                    yield code
            yield from permission_codes(item)
    elif isinstance(value, list):
        for item in value:
            yield from permission_codes(item)

def contract_values(value, property_name):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == property_name and isinstance(item, str):
                yield item
            yield from contract_values(item, property_name)
    elif isinstance(value, list):
        for item in value:
            yield from contract_values(item, property_name)

def registry_keys(value):
    kinds = {'handlerKey': 'handler', 'evaluatorKey': 'evaluator', 'resolverKey': 'resolver', 'rendererKey': 'renderer'}
    if isinstance(value, dict):
        for key, item in value.items():
            if key in kinds and isinstance(item, str):
                yield kinds[key], item
            yield from registry_keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from registry_keys(item)

def check_protection(protection, operations, path):
    if 'classification' in protection:
        raise AssertionError((path, 'retired protection classification'))
    if not (protection.get('sensitivity') in {'internal', 'restricted'}):
        raise AssertionError(path)
    if protection.get('dataCategory') not in {None, 'personal_contact', 'bank_account'}:
        raise AssertionError(path)
    normal = protection['normalProjection']
    if not (normal['mode'] == 'masked' and normal['plaintextInNormalQueries'] is False):
        raise AssertionError(path)
    if not (isinstance(normal['maskedDisplay'], str) and normal['maskedDisplay']):
        raise AssertionError(path)
    reveal = protection.get('reveal')
    if reveal:
        if not (reveal['operationKey'] in operations):
            raise AssertionError((path, 'missing reveal operation'))
        operation = operations[reveal['operationKey']]
        if not (reveal['permissionCode'] == operation['permissionCode']):
            raise AssertionError((path, 'reveal permission mismatch'))
        if not (reveal['cachePolicy'] == 'no_store'):
            raise AssertionError(path)
for path, artifact in artifacts.items():
    for prop in ['schema', 'schemaVersion', 'contractStatus', 'artifactType', 'artifactKey', 'entityCode', 'plane', 'artifactHash', 'dependencies']:
        if not (prop in artifact):
            raise AssertionError((path, prop))
    if not (artifact['contractStatus'] == 'draft_for_review'):
        raise AssertionError(path)
    assert_localized(artifact, path)
    assert_closed_nested_shape(artifact, artifact['artifactType'])
    assert_security_contracts(artifact, path)
    if not (artifact['artifactHash'] == digest({k: v for k, v in artifact.items() if k != 'artifactHash'})):
        raise AssertionError(path)
    if not (set(artifact['dependencies']) <= keys):
        raise AssertionError(path)
    for code in permission_codes(artifact):
        if not (code in permissions):
            raise AssertionError((path, 'permission missing from evidence', code))
        if not (permissions[code]['status'] in {'published', 'requires_catalog_publication'}):
            raise AssertionError((path, code))
    for kind, key in registry_keys(artifact):
        entry = registry.get((kind, key))
        # Source work may name an implemented but unpublished provider. A
        # release-ready run below requires live publication evidence.
        if not entry or entry['status'] not in {'published', 'requires_registry_publication', 'implemented_source'}:
            raise AssertionError((path, 'registry evidence missing', kind, key))
    for ref in refs(artifact):
        if not (ref in artifacts):
            raise AssertionError((path, ref))
        if not (ref[:-5] in artifact['dependencies'] or ref == path):
            raise AssertionError((path, ref))
    if artifact['artifactType'] == 'core' and artifact.get('coreKind') not in {'field_defaults_profile', 'operation_defaults_profile'}:
        if not ('protectedFields' not in artifact):
            raise AssertionError((path, 'retired protection shape'))
        profile = artifacts[artifact['defaultsProfileRef']]
        if not (profile['profileKey'] == artifact['defaultsProfile']):
            raise AssertionError("profile['profileKey'] == artifact['defaultsProfile']")
        if not (profile['coreKind'] == 'field_defaults_profile'):
            raise AssertionError("profile['coreKind'] == 'field_defaults_profile'")
        field_keys = [f['key'] for f in artifact['fields']]
        if not (len(field_keys) == len(set(field_keys))):
            raise AssertionError(path)
        storage = artifact['storage']
        if artifact['entityCode'] != 'business_partner_request' and (storage.get('kind') not in STORAGE_KINDS or storage.get('genericWriteEnabled') is not False):
            raise AssertionError((path, 'storage kind or generic-write security posture invalid'))
        if artifact['storage']['primaryObject'] not in SHARED_TABLE_TENANT_FIELD_ALLOWLIST:
            required_core_blocks = {'businessContext', 'validationAuthority', 'projectionPolicy', 'querySafetyLimits', 'capabilities', 'readinessFacts'}
            if not (required_core_blocks <= set(artifact)):
                raise AssertionError((path, 'required Core security block missing'))
            context = artifact['businessContext']
            if context.get('selectorMayChangeOwnership') is not False:
                raise AssertionError((path, 'selector must not change ownership'))
            authority = artifact['validationAuthority']
            if authority.get('uiVisibilityGrantsAccess') is not False or authority.get('missingEvaluator') != 'block_write':
                raise AssertionError((path, 'validation authority security posture invalid'))
            projection = artifact['projectionPolicy']
            if projection.get('unknownField') != 'deny' or projection.get('serverOnlyDependenciesNeverSerialized') is not True:
                raise AssertionError((path, 'projection security posture invalid'))
            limits = artifact['querySafetyLimits']
            if not (isinstance(limits.get('maxPageSize'), int) and 1 <= limits['maxPageSize'] <= 100 and limits.get('presentationMayOnlyNarrow') is True):
                raise AssertionError((path, 'query safety limits invalid'))
            audit = artifact['capabilities'].get('audit')
            if audit and audit.get('enabled') is not True:
                raise AssertionError((path, 'audit capability must remain enabled'))
        if storage['primaryObject'] not in SHARED_TABLE_TENANT_FIELD_ALLOWLIST:
            if not (storage.get('tenantField') == 'tenant_id'):
                raise AssertionError((path, 'tenantField is required'))
        for source in artifact['storage']['sourceObjects']:
            if not (source in tables):
                raise AssertionError((path, source))
            if not (any((field['binding']['sourceObject'] == source for field in artifact['fields']))):
                raise AssertionError((path, 'unused sourceObject', source))
        for field in artifact['fields']:
            if not ('mask' not in field):
                raise AssertionError((path, field['key'], 'retired protection shape'))
            resolved = {**profile['fieldDefaults'], **artifact.get('fieldDefaults', {}), **field}
            for facet in ('uiFacets','authoringPolicy','tenantConfig'):
                resolved[facet] = {**profile['fieldDefaults'].get(facet, {}), **artifact.get('fieldDefaults', {}).get(facet, {}), **field.get(facet, {})}
            if not (resolved['authoringPolicy']['customizationPolicy'] in ('locked', 'facet_only')):
                raise AssertionError("resolved['authoringPolicy']['customizationPolicy'] in ('locked','facet_only')")
            if not (resolved['uiFacets']['visibility'] in ('visible', 'hidden')):
                raise AssertionError("resolved['uiFacets']['visibility'] in ('visible','hidden')")
            if not (resolved['uiFacets']['editability'] in ('readonly', 'editable_in_governed_draft')):
                raise AssertionError("resolved['uiFacets']['editability'] in ('readonly','editable_in_governed_draft')")
            if not (resolved['readPolicy'] in READ_POLICIES):
                raise AssertionError((path, field['key'], 'invalid readPolicy'))
            if not (resolved['writePolicy'] in WRITE_POLICIES):
                raise AssertionError((path, field['key'], 'invalid writePolicy'))
            if 'protection' in field:
                if not (resolved['readPolicy'] == 'masked_only'):
                    raise AssertionError((path, field['key'], 'protected value must be masked_only'))
            if resolved['writePolicy'] in {'server_numbering', 'system_managed'}:
                if not (resolved['uiFacets']['editability'] == 'readonly'):
                    raise AssertionError((path, field['key'], 'server-managed value must be readonly'))
            check_field(field, catalog)
            if not (field.get('readPolicy') != 'excluded_until_explicitly_authorized'):
                raise AssertionError(path)
        if artifact['entityCode'] == 'business_partner':
            organization_profile_fields = {
                'legal_form_value_id', 'business_type_value_id', 'founded_year',
                'employee_count', 'employee_count_as_of', 'employee_count_scope',
            }
            for field in artifact['fields']:
                if field['key'] not in organization_profile_fields:
                    continue
                facets = field.get('dynamicFacets', [])
                expected = {
                    'facet': 'visibility', 'engine': 'jsonlogic.v1',
                    'expression': {'==': [{'var': 'record.partner_category'}, 'organization']},
                    'valueWhenTrue': 'visible', 'valueWhenFalse': 'hidden',
                    'evaluationFailure': 'hide', 'serverAuthoritative': False,
                }
                if not (expected in facets):
                    raise AssertionError((path, field['key'], 'organization applicability facet required'))
        operations = {op['key']: op for op in artifacts.get(artifact['entityCode'] + '/operation.json', {}).get('operations', [])}
        for field in artifact['fields']:
            if 'protection' in field:
                check_protection(field['protection'], operations, (path, field['key']))
        for item in artifact.get('protections', []):
            check_protection(item, operations, (path, item.get('protectedSource', {}).get('key')))
            protected = item.get('protectedSource')
            if protected:
                if not (protected['serialization'] == 'never_in_normal_projection'):
                    raise AssertionError(path)
                if not (protected['sourceObject'] in tables and protected['column'] in tables[protected['sourceObject']]):
                    raise AssertionError(path)
                if not (protected['key'] not in field_keys):
                    raise AssertionError(path)
        query = artifact.get('query')
        if not (query is not None and set(query) == {'search', 'filters', 'sorts'}):
            raise AssertionError((path, 'query allow-list required'))
        for kind, capability in [('search', 'prefix_search'), ('filters', 'filter'), ('sorts', 'sort')]:
            seen = set()
            for entry in query[kind]:
                key = entry['fieldKey']
                if not (key in field_keys and key not in seen):
                    raise AssertionError((path, kind, key))
                seen.add(key)
                if kind == 'filters':
                    expected_mode = {'exact_casefold': 'casefold', 'exact': 'value'}.get(entry['operatorSet'])
                    if not (expected_mode and entry.get('mode') == expected_mode):
                        raise AssertionError((path, kind, key, 'operatorSet and mode disagree'))
                if not ('protection' not in next((field for field in artifact['fields'] if field['key'] == key))):
                    raise AssertionError((path, kind, key))
                index = indexes[entry['indexRef']]
                if not (index['table'] == artifact['storage']['primaryObject']):
                    raise AssertionError((path, kind, key, 'index belongs to another table'))
                if not (capability in index['supports']):
                    raise AssertionError((path, kind, key, 'index does not support requested query capability'))
                column = next(field['binding']['column'] for field in artifact['fields'] if field['key'] == key)
                key_parts = index.get('keyParts')
                if not (isinstance(key_parts, list) and key_parts):
                    raise AssertionError((path, kind, key, 'structured index key parts required'))
                leading = next((part for part in key_parts if part.get('column') != 'tenant_id'), None)
                if not leading:
                    raise AssertionError((path, kind, key, 'index has no non-tenant key part'))
                query_mode = entry.get('mode') if kind != 'filters' else entry.get('mode')
                casefold = query_mode == 'casefold' or (kind == 'search' and entry.get('mode') == 'prefix_casefold')
                if casefold:
                    if not (leading.get('kind') == 'expression' and leading.get('expression') == f'lower({column})' and leading.get('caseFold') is True):
                        raise AssertionError((path, kind, key, 'casefold query must use matching lower() index expression'))
                    if kind == 'search' and leading.get('opclass') != 'text_pattern_ops':
                        raise AssertionError((path, kind, key, 'prefix_casefold requires text_pattern_ops'))
                elif not (leading.get('kind') == 'column' and leading.get('column') == column):
                    raise AssertionError((path, kind, key, 'index must lead with the query column'))
                if kind == 'sort' or kind == 'sorts':
                    if entry.get('mode') not in {'value', 'casefold'}:
                        raise AssertionError((path, kind, key, 'sort mode required'))
                    if entry.get('collation') not in {'database_default', 'C'}:
                        raise AssertionError((path, kind, key, 'sort collation required'))
                    if entry['collation'] != 'C' and leading.get('defaultOpclass') is not True:
                        raise AssertionError((path, kind, key, 'database-default sort requires default text opclass'))
        relation_defaults = artifact.get('relationDefaults')
        if relation_defaults:
            if not (artifact['entityCode'] == 'business_partner'):
                raise AssertionError((path, 'relation defaults are aggregate-owned'))
            for relation in artifact.get('relations', []):
                effective = {**relation_defaults, **relation}
                effective['binding'] = {**relation_defaults.get('binding', {}), **relation['binding']}
                effective['binding']['scopeContract'] = {
                    **relation_defaults.get('binding', {}).get('scopeContract', {}),
                    **relation['binding'].get('scopeContract', {}),
                }
                for key, value in relation['binding'].get('scopeContract', {}).items():
                    if key in relation_defaults.get('binding', {}).get('scopeContract', {}) and value == relation_defaults['binding']['scopeContract'][key]:
                        raise AssertionError((path, relation['relationKey'], 'repeated scope default: ' + key))
                if not (effective['binding']['scopeContract']['ownerEntityCode'] == artifact['entityCode']):
                    raise AssertionError((path, relation['relationKey']))
                if not (effective['load'] == 'lazy' and effective['defaultInclude'] is False):
                    raise AssertionError((path, relation['relationKey']))
                scope = effective['binding'].get('scopeContract')
                if not (scope and scope['ownerEntityCode'] == artifact['entityCode']):
                    raise AssertionError((path, relation['relationKey'], 'owner scope contract missing'))
                if not (scope['tenantEqualityRequired'] is True and scope['responseMustBind']):
                    raise AssertionError((path, relation['relationKey'], 'tenant/owner scope contract incomplete'))
                mapping = scope.get('ownerMapping')
                if not mapping or mapping.get('kind') == 'unavailable':
                    raise AssertionError((path, relation['relationKey'], 'validated owner mapping required'))
                template_key = mapping.get('template')
                if template_key:
                    templates = relation_defaults.get('ownerMappingTemplates', {})
                    if template_key not in templates:
                        raise AssertionError((path, relation['relationKey'], 'unknown owner mapping template'))
                    mapping = {**templates[template_key], **mapping}
                    mapping['responseAliases'] = {
                        **templates[template_key].get('responseAliases', {}),
                        **scope['ownerMapping'].get('responseAliases', {}),
                    }
                aliases = mapping.get('responseAliases', {})
                if not (set(scope['responseMustBind']) <= set(aliases)):
                    raise AssertionError((path, relation['relationKey'], 'response bindings lack owner mapping aliases'))
                if mapping['kind'] in {'direct_owner', 'polymorphic_owner', 'link_table'}:
                    source = mapping['sourceObject']
                    required_columns = [mapping['tenantColumn'], mapping['ownerColumn']]
                    if mapping['kind'] in {'polymorphic_owner', 'link_table'}:
                        required_columns.append(mapping['ownerTypeColumn'])
                    if mapping['kind'] == 'link_table':
                        required_columns.append(mapping['targetColumn'])
                    if not (source in tables and set(required_columns) <= tables[source]):
                        raise AssertionError((path, relation['relationKey'], 'owner mapping source is not catalogued'))
                elif mapping['kind'] == 'foreign_key_path':
                    segments = mapping.get('segments', [])
                    if not segments:
                        raise AssertionError((path, relation['relationKey'], 'owner path required'))
                    for segment in segments:
                        if not (segment['sourceObject'] in tables and segment['toObject'] in tables and segment['fromColumn'] in tables[segment['sourceObject']] and segment['toColumn'] in tables[segment['toObject']]):
                            raise AssertionError((path, relation['relationKey'], 'owner path is not catalogued'))
                else:
                    raise AssertionError((path, relation['relationKey'], 'unsupported owner mapping kind'))
                # A repeated default has no semantic information and grows the
                # always-loaded aggregate Core.
                for key, value in relation.items():
                    if key != 'binding' and key in relation_defaults:
                        if not (value != relation_defaults[key]):
                            raise AssertionError((path, relation['relationKey'], key))
                for key, value in relation['binding'].items():
                    if key in relation_defaults.get('binding', {}) and key != 'scopeContract':
                        if not (value != relation_defaults['binding'][key]):
                            raise AssertionError((path, relation['relationKey'], 'binding.' + key))
        for binding in artifact.get('serverDependencies', []):
            if not (binding['column'] in tables[binding['sourceObject']]):
                raise AssertionError((path, binding))
        for name in ['idField', 'tenantField', 'versionField']:
            column = artifact['storage'].get(name)
            if column:
                if not (column in tables[artifact['storage']['primaryObject']]):
                    raise AssertionError((path, name))
    if artifact['artifactType'] == 'operation':
        if 'operationDefaultsProfileRef' in artifact:
            profile = artifacts[artifact['operationDefaultsProfileRef']]
            if not (profile['coreKind'] == 'operation_defaults_profile'):
                raise AssertionError(path)
            if not (profile['profileKey'] == artifact['operationDefaultsProfile']):
                raise AssertionError(path)
            if not (profile['artifactKey'] in artifact['dependencies']):
                raise AssertionError(path)
            if not ('operationDefaults' in profile):
                raise AssertionError(path)
        operations = {op['key']: op for op in artifact['operations']}
        if not (len(operations) == len(artifact['operations'])):
            raise AssertionError(path)
        for operation in artifact['operations']:
            if not (operation.get('scopeBinding') and operation.get('permissionCode')):
                raise AssertionError((path, operation))
            if operation['scopeBinding'].get('denyUnresolved') is not True:
                raise AssertionError((path, operation['key'], 'unresolved scope must deny'))
            if artifact['entityCode'] == 'business_partner' and operation.get('idempotency') not in {'not_applicable', 'required', 'optional'}:
                raise AssertionError((path, operation['key'], 'idempotency required'))
            if not (operation['execution'].get('registryRequired')):
                raise AssertionError(path)
            if operation['key'] == 'request_change' and operation['execution']['handlerKey'] == 'neon.bp.governed-request.create.v1':
                target = operation.get('targetBinding')
                if not (target and target['targetEntityCode'] == artifact['entityCode']):
                    raise AssertionError((path, 'governed request target binding missing'))
                if not (target['targetResolution'] == 'operation_context_only' and target['clientSuppliedTargetEntityCode'] == 'forbidden'):
                    raise AssertionError((path, 'unsafe governed request target binding'))
        order = artifact.get('transactionOrder')
        if order:
            if not ('authorize_current_actor' in order and order.index('authorize_current_actor') < order.index('resolve_persisted_context')):
                raise AssertionError((path, 'authorization must precede context resolution'))
        core = artifacts.get(artifact['entityCode'] + '/core.json')
        if core and 'reveal' in operations:
            all_protections = [field['protection'] for field in core.get('fields', []) if 'protection' in field] + core.get('protections', [])
            if not (any((item.get('reveal', {}).get('operationKey') == 'reveal' for item in all_protections))):
                raise AssertionError((path, 'reveal operation has no protected field'))
        bindings = artifact['policyBindings']
        if not (len({b['bindingKey'] for b in bindings}) == len(bindings)):
            raise AssertionError(path)
        for binding in bindings:
            if not (binding['operationKey'] in operations):
                raise AssertionError((path, binding))
            if not (binding['policyKind'] in {'approval_transition', 'evidence_requirement', 'duplicate_detection', 'readiness_requirement', 'decision_authorization'}):
                raise AssertionError("binding['policyKind'] in {'approval_transition', 'evidence_requirement', 'duplicate_detection', 'readiness_requirement', 'decision_authorization'}")
            if binding['policyKind'] == 'readiness_requirement':
                fact_core = artifacts[binding['factEntityCode'] + '/core.json']
                if not (set(binding['factCodes']) <= {f['code'] for f in fact_core['readinessFacts']}):
                    raise AssertionError("set(binding['factCodes']) <= {f['code'] for f in fact_core['readinessFacts']}")
    if artifact['artifactType'] == 'presentation_section' and 'coreRef' in artifact:
        fields = {f['key'] for f in artifacts[artifact['coreRef']]['fields']}
        if not ({f['fieldKey'] for f in artifact['fieldBindings']} <= fields):
            raise AssertionError(path)
    if artifact['artifactType'] == 'presentation_section':
        if not (artifact.get('authorization', {}).get('viewPermission') or artifact.get('accessAuthority') == 'operation_authorized_parent_flow'):
            raise AssertionError((path, 'section access authority missing'))
        for collection in artifact.get('childCollections', []):
            if 'coreRef' in collection:
                child = artifacts[collection['coreRef']]
                child_fields = {field['key'] for field in child['fields']}
                if not ({field['fieldKey'] for field in collection.get('fieldBindings', [])} <= child_fields):
                    raise AssertionError((path, collection['key']))
            if collection.get('binding', {}).get('kind') == 'registered_aggregate_projection':
                if not (collection['binding'].get('handlerRegistrationRequired') is True):
                    raise AssertionError((path, collection['key']))
                for source in collection['binding'].get('sourceObjects', []):
                    if not (source in tables):
                        raise AssertionError((path, collection['key'], source))
            for field in collection.get('fields', []):
                if not ('mask' not in field):
                    raise AssertionError((path, collection['key'], field['key'], 'retired protection shape'))
                if 'protection' in field:
                    # Collections can declare reveal only through their referenced
                    # child operation; unbound aggregate projections are masked-only.
                    if not ('reveal' not in field['protection']):
                        raise AssertionError((path, collection['key'], 'unbound collection reveal'))
                    check_protection(field['protection'], {}, (path, collection['key'], field['key']))
    if artifact['artifactType'] == 'presentation_surface':
        operation = artifacts[artifact['entityCode'] + '/operation.json']
        if not ({a['operationKey'] for a in artifact.get('actions', [])} <= {o['key'] for o in operation['operations']}):
            raise AssertionError(path)
        if artifact.get('surfaceKey') == 'list' and artifact['entityCode'] == 'business_partner':
            core = artifacts[artifact['entityCode'] + '/core.json']
            presentation = artifact.get('queryPresentation')
            if not (presentation):
                raise AssertionError((path, 'list query presentation missing'))
            if not (set(presentation['search']['fieldKeys']) <= {item['fieldKey'] for item in core['query']['search']}):
                raise AssertionError((path, 'list search exceeds Core allow-list'))
            if not ({item['fieldKey'] for item in presentation['quickFilters']} <= {item['fieldKey'] for item in core['query']['filters']}):
                raise AssertionError((path, 'list filters exceed Core allow-list'))
            if not ({item['field'] for item in artifact['sort']} <= {item['fieldKey'] for item in core['query']['sorts']}):
                raise AssertionError((path, 'list sort exceeds Core allow-list'))
declared_services = {dependency['serviceKey'] for dependency in release['externalDependencies']}
if not (len(declared_services) == len(release['externalDependencies'])):
    raise AssertionError('duplicate release external dependency')
used_services = {key for artifact in artifacts.values() for key in contract_values(artifact, 'serviceKey')}
if not (used_services <= declared_services):
    raise AssertionError(('undeclared service dependencies', sorted(used_services - declared_services)))
used_evaluators = {key for artifact in artifacts.values() for key in contract_values(artifact, 'evaluatorKey')}
if used_evaluators:
    if not ('neon.evaluator-registry.v1' in declared_services and release['activation'].get('validateEvaluatorRegistry') is True):
        raise AssertionError('evaluator registry dependency and activation validation required')

if args.release_candidate:
    candidate_path = Path(args.release_candidate).resolve()
    candidate = json.loads(candidate_path.read_text())
    candidate_schema = Draft202012Validator(json.loads((SCHEMAS/'release_candidate.schema.json').read_text()))
    candidate_errors = sorted(candidate_schema.iter_errors(candidate), key=lambda error: list(error.path))
    if candidate_errors:
        raise AssertionError(('release candidate', 'closed-world schema violation', candidate_errors[0].message))
    if candidate['targetPlanes'] != ['neon']:
        raise AssertionError('release candidate target plane is invalid')
    by_key = {artifact['artifactKey']: (path, artifact) for path, artifact in artifacts.items()}
    closure = set()
    pending = list(candidate['roots'])
    while pending:
        artifact_key = pending.pop()
        if artifact_key in closure:
            continue
        item = by_key.get(artifact_key)
        if not item:
            raise AssertionError(('release candidate', 'unknown root or dependency', artifact_key))
        closure.add(artifact_key)
        pending.extend(item[1]['dependencies'])
    replacement_keys = candidate['replacementArtifactKeys']
    added_keys = candidate['addedArtifactKeys']
    changed_keys = replacement_keys + added_keys
    direct_replacements = set(replacement_keys) - closure
    if not direct_replacements <= set(by_key):
        raise AssertionError(('release candidate', 'direct replacement source missing', sorted(direct_replacements - set(by_key))))
    source_keys = closure | direct_replacements
    expected = set(candidate['expectedArtifactKeys'])
    if len(expected) != len(candidate['expectedArtifactKeys']) or source_keys != expected:
        raise AssertionError(('release candidate', 'artifact closure changed', {
            'missing': sorted(expected - source_keys), 'unexpected': sorted(source_keys - expected),
        }))
    forbidden = sorted(key for key in source_keys if any(key.startswith(prefix) for prefix in candidate['forbiddenArtifactPrefixes']))
    if forbidden:
        raise AssertionError(('release candidate', 'deferred artifact entered closure', forbidden))
    source_artifacts = {path: artifact for key, (path, artifact) in by_key.items() if key in source_keys}
    baseline_ref = candidate['baseline']
    baseline_path = (REPO / baseline_ref['path']).resolve()
    baseline = json.loads(baseline_path.read_text())
    if not (
        baseline.get('schema') == 'athyper.compiled-entity-baseline/1'
        and baseline.get('schemaVersion') == 1
        and isinstance(baseline.get('capturedFrom'), dict)
        and isinstance(baseline.get('artifacts'), list)
    ):
        raise AssertionError('release candidate baseline is invalid')
    captured = baseline['capturedFrom']
    for key in ('publicationKey', 'releaseId', 'releaseHash', 'artifactCount'):
        if captured.get(key) != baseline_ref[key]:
            raise AssertionError(('release candidate', 'baseline receipt mismatch', key))
    if len(baseline['artifacts']) != baseline_ref['artifactCount']:
        raise AssertionError('release candidate baseline artifact count is invalid')
    baseline_artifacts = {}
    baseline_by_key = {}
    for entry in baseline['artifacts']:
        if not (isinstance(entry, dict) and isinstance(entry.get('ref'), str) and entry['ref'].endswith('.json') and isinstance(entry.get('content'), dict)):
            raise AssertionError('release candidate baseline artifact is invalid')
        artifact = entry['content']
        if not isinstance(artifact.get('artifactKey'), str) or entry['ref'] in baseline_artifacts or artifact['artifactKey'] in baseline_by_key:
            raise AssertionError('release candidate baseline artifact identity is invalid')
        baseline_artifacts[entry['ref']] = artifact
        baseline_by_key[artifact['artifactKey']] = (entry['ref'], artifact)
    if len(set(changed_keys)) != len(changed_keys):
        raise AssertionError('release candidate replacement keys are duplicated')
    if not set(changed_keys) <= set(by_key):
        raise AssertionError(('release candidate', 'replacement source is missing', sorted(set(changed_keys) - set(by_key))))
    if not set(replacement_keys) <= set(baseline_by_key):
        raise AssertionError(('release candidate', 'replacement absent from baseline', sorted(set(replacement_keys) - set(baseline_by_key))))
    if set(added_keys) & set(baseline_by_key):
        raise AssertionError(('release candidate', 'addition already exists in baseline', sorted(set(added_keys) & set(baseline_by_key))))
    scoped_artifacts = dict(baseline_artifacts)
    for key in changed_keys:
        path, artifact = by_key[key]
        if key in baseline_by_key:
            del scoped_artifacts[baseline_by_key[key][0]]
        scoped_artifacts[path] = artifact
    runtime_keys = {artifact['artifactKey'] for artifact in scoped_artifacts.values()}
    expected_runtime = set(candidate['expectedRuntimeArtifactKeys'])
    if len(expected_runtime) != len(candidate['expectedRuntimeArtifactKeys']) or runtime_keys != expected_runtime:
        raise AssertionError(('release candidate', 'runtime artifact set changed', {
            'missing': sorted(expected_runtime - runtime_keys), 'unexpected': sorted(runtime_keys - expected_runtime),
        }))
    for key in direct_replacements:
        dependencies = by_key[key][1].get('dependencies')
        if not isinstance(dependencies, list) or not set(dependencies) <= runtime_keys:
            raise AssertionError(('release candidate', 'direct replacement dependency is not retained', key))
    scoped_services = {key for artifact in scoped_artifacts.values() for key in contract_values(artifact, 'serviceKey')}
    scoped_services |= {entry['serviceKey'] for entry in baseline.get('externalDependencies', []) if isinstance(entry, dict) and isinstance(entry.get('serviceKey'), str)}
    scoped_evaluators = {key for artifact in scoped_artifacts.values() for key in contract_values(artifact, 'evaluatorKey')}
    if scoped_evaluators:
        scoped_services.add('neon.evaluator-registry.v1')
    candidate_release_input = candidate['release']
    if {'artifacts', 'releaseHash'} & set(candidate_release_input):
        raise AssertionError('release candidate release input must be hash-free')
    candidate_dependencies = [item['serviceKey'] for item in candidate_release_input.get('externalDependencies', [])]
    if len(candidate_dependencies) != len(set(candidate_dependencies)) or set(candidate_dependencies) != scoped_services:
        raise AssertionError(('release candidate', 'external dependency closure changed', {
            'missing': sorted(scoped_services - set(candidate_dependencies)),
            'unexpected': sorted(set(candidate_dependencies) - scoped_services),
        }))
    candidate_entries = [
        {'artifactKey': artifact['artifactKey'], 'artifactType': artifact['artifactType'], 'entityCode': artifact['entityCode'], 'ref': path, 'hash': artifact['artifactHash']}
        for path, artifact in sorted(scoped_artifacts.items(), key=lambda item: item[1]['artifactKey'])
    ]
    candidate_release = {**candidate_release_input, 'artifacts': candidate_entries}
    candidate_release['releaseHash'] = digest({key: value for key, value in candidate_release.items() if key not in {'releaseHash', 'signature'}})
    candidate_release_errors = sorted(Draft202012Validator(json.loads((SCHEMAS/'release.schema.json').read_text())).iter_errors(candidate_release), key=lambda error: list(error.path))
    if candidate_release_errors:
        raise AssertionError(('release candidate', 'compiled envelope schema violation', candidate_release_errors[0].message))
    candidate_scope = {
        'path': candidate_path,
        'key': candidate['candidateKey'],
        'artifacts': scoped_artifacts,
        'changed_artifacts': {by_key[key][0]: by_key[key][1] for key in changed_keys},
        'baseline_artifacts': baseline_artifacts,
        'release': candidate_release,
    }
source = SOURCE_BUNDLE
bundle = json.loads(source.read_text())['envelope']['payload']['bundle']
coverage = files['review/source-coverage.json']
if not (coverage['sourceFileSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()):
    raise AssertionError("coverage['sourceFileSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()")
if not ({k: v['sourceValue'] for k, v in coverage['coverage'].items()} == bundle):
    raise AssertionError("{k: v['sourceValue'] for k, v in coverage['coverage'].items()} == bundle")
for kind in bundle['requestSchemas']:
    flow = artifacts['business_partner_request/flow.' + kind + '.json']
    if not (flow['requestContract']['requiredPaths'] == bundle['requestSchemas'][kind]['required']):
        raise AssertionError("flow['requestContract']['requiredPaths'] == bundle['requestSchemas'][kind]['required']")
    for channel in flow['supportedSources']:
        if not (flow['journey'] in bundle['mappingContracts'][channel]['allowedJourneys'] or (flow['journey'] == 'governance' and channel in ['internal', 'api'])):
            raise AssertionError("flow['journey'] in bundle['mappingContracts'][channel]['allowedJourneys'] or (flow['journey'] == 'governance' and channel in ['internal', 'api'])")
workflow_definitions = artifacts['business_partner_request/flow.base.json'].get('workflowDefinitions', {})
if set(workflow_definitions) != set(bundle['workflowDefinitions']):
    raise AssertionError('compiled Flow workflow journeys must match approved definition source')
for journey, source_workflow in bundle['workflowDefinitions'].items():
    compiled_workflow = workflow_definitions[journey]
    source_stages = source_workflow['stages']
    compiled_stages = compiled_workflow.get('stages', [])
    if len(source_stages) != len(compiled_stages):
        raise AssertionError((journey, 'compiled Flow workflow stage count differs'))
    for source_stage, compiled_stage in zip(source_stages, compiled_stages):
        expected = {key: value for key, value in source_stage.items() if key != 'name'}
        actual = {key: value for key, value in compiled_stage.items() if key != 'label'}
        if expected != actual or compiled_stage.get('label', {}).get('defaultText') != source_stage['name']:
            raise AssertionError((journey, source_stage['code'], 'compiled Flow workflow stage differs'))
expected_sections = {s['code'] for s in bundle['viewDescriptors']['neonPartner360']['sections']}
if not (expected_sections <= {s['sectionKey'] for s in artifacts['business_partner/presentation.detail.json']['sections']}):
    raise AssertionError("expected_sections <= {s['sectionKey'] for s in artifacts['business_partner/presentation.detail.json']['sections']}")
bp_core = artifacts['business_partner/core.json']
published_children = set()
bp_detail = artifacts['business_partner/presentation.detail.json']
for entry in bp_detail['sections']:
    section = artifacts[entry['presentationRef']]
    if section.get('authorization', {}).get('viewPermission'):
        if not (entry.get('viewPermission') == section['authorization']['viewPermission']):
            raise AssertionError((entry['sectionKey'], 'detail and section permissions differ'))
    if section.get('coreRef'):
        published_children.add(artifacts[section['coreRef']]['entityCode'])
    published_children.update(collection.get('entityCode') for collection in section.get('childCollections', []))
if not ({relation['targetEntityCode'] for relation in bp_core['relations']} <= published_children):
    raise AssertionError('Business Partner relation has no published section')
for path, artifact in artifacts.items():
    for pack in artifact.get('completenessPacks', []):
        for requirement in pack['requirements']:
            fact = requirement['factRef']
            owner = artifacts[fact['entityCode']+'/core.json']
            if not (fact['code'] in {f['code'] for f in owner['readinessFacts']}):
                raise AssertionError((path, fact))
            if not (requirement['enforcement'] in ('informational', 'operation_gate')):
                raise AssertionError("requirement['enforcement'] in ('informational','operation_gate')")
            if requirement['enforcement'] == 'operation_gate':
                ref = requirement['operationBindingRef']
                binding = next(b for b in artifacts[ref['artifactRef']]['policyBindings'] if b['bindingKey']==ref['bindingKey'])
                if not (binding['policyKind'] == 'readiness_requirement' and binding['factEntityCode'] == fact['entityCode'] and (fact['code'] in binding['factCodes'])):
                    raise AssertionError((path, fact))
    if artifact.get('flowKind') == 'variant':
        base = artifacts[artifact['baseFlowRef']]
        if not (set(artifact['sourceMappingKeys']) <= set(base['sourceMappingCatalog'])):
            raise AssertionError(path)
        for ref in artifact['presentationSlots'].values():
            if not (ref in artifacts and ref[:-5] in artifact['dependencies']):
                raise AssertionError(path)
    if 'targetCoreRef' in artifact:
        target = artifacts[artifact['targetCoreRef']]
        if not ({f['fieldKey'] for f in artifact.get('targetFieldBindings', [])} <= {f['key'] for f in target['fields']}):
            raise AssertionError(path)
if args.release_ready:
    readiness_failures = []
    selected_codes = {artifact.get('entityCode') for artifact in (candidate_scope['artifacts'] if candidate_scope else artifacts).values() if artifact.get('entityCode')}
    for row in coverage['entities']:
        if row['entityCode'] in selected_codes and row['missingRequired']:
            readiness_failures.append(row['entityCode'] + ': required planes not declared: ' + ','.join(row['missingRequired']))
    historical = [receipt['path'] for receipt in evidence_receipts if receipt['status'] == 'historical_only']
    if historical:
        readiness_failures.append('current DDL evidence requires recapture: ' + ','.join(historical))
    ready_artifacts = candidate_scope['artifacts'] if candidate_scope else artifacts
    ready_release = candidate_scope['release'] if candidate_scope else release
    if len(ready_release['artifacts']) != len(ready_artifacts):
        readiness_failures.append('release envelope does not include every compiled artifact')
    for entry in ready_release['artifacts']:
        artifact = ready_artifacts.get(entry['ref'])
        if artifact is None or entry['hash'] != artifact['artifactHash'] or entry['artifactKey'] != artifact['artifactKey']:
            readiness_failures.append('release receipt does not match compiled artifacts')
            break
    if ready_release['releaseHash'] != digest({k: v for k, v in ready_release.items() if k not in ['releaseHash', 'signature']}):
        readiness_failures.append('release envelope hash is invalid')
    if not (ready_release['signature']['value'] and ready_release['contractStatus'] not in {'unsigned_review_only', 'draft_for_review'}):
        readiness_failures.append('release is unsigned review-only')
    if not (ready_release['releaseNo'] == 1 and ready_release['supersedesReleaseId'] is None or (ready_release['releaseNo'] > 1 and ready_release['supersedesReleaseId'])):
        readiness_failures.append('release predecessor is invalid')
    if ready_release['contractStatus'] in {'unsigned_review_only', 'draft_for_review'}:
        readiness_failures.append('release has not been approved')
    if ready_release.get('runtimeCompatibility', {}).get('currentRuntimeCompatible') is not True:
        readiness_failures.append('release runtime compatibility is not qualified')
    # Candidate authoring is intentionally draft-only.  The compiler's explicit
    # publication projection upgrades its immutable output to `published`; source
    # input must never be relabelled live before a signed activation exists.
    changed_artifacts = candidate_scope['changed_artifacts'] if candidate_scope else ready_artifacts
    if not candidate_scope:
        unapproved_artifacts = [path for path, artifact in changed_artifacts.items() if artifact.get('contractStatus') in {'unsigned_review_only', 'draft_for_review'}]
        if unapproved_artifacts:
            readiness_failures.append('compiled artifacts have not been approved: ' + ','.join(sorted(unapproved_artifacts)))
        for path, artifact in changed_artifacts.items():
            statuses = list(draft_statuses(artifact))
            if statuses:
                readiness_failures.append(f'{path}: {statuses}')
    baseline_permissions = set(permission_codes(list(candidate_scope['baseline_artifacts'].values()))) if candidate_scope else set()
    introduced_permissions = set(permission_codes(list(ready_artifacts.values()))) - baseline_permissions
    unpublished = [code for code in introduced_permissions if permissions[code]['status'] != 'published']
    if unpublished:
        readiness_failures.append('permissions not published: ' + ','.join(sorted(set(unpublished))))
    unpublished_registry = []
    baseline_registry = {item for artifact in candidate_scope['baseline_artifacts'].values() for item in registry_keys(artifact)} if candidate_scope else set()
    for artifact in ready_artifacts.values():
        for kind, key in registry_keys(artifact):
            if (kind, key) in baseline_registry:
                continue
            entry = registry[(kind, key)]
            if entry['status'] != 'published':
                unpublished_registry.append(f'{kind}:{key}')
    if unpublished_registry:
        readiness_failures.append('providers not published: ' + ','.join(sorted(set(unpublished_registry))))
    if not (not readiness_failures):
        raise AssertionError('Release readiness failed: ' + '; '.join(readiness_failures))

# Negative checks demonstrate that the known corruption cannot produce PASS.
import copy
sample = next(a['fields'][0] for a in artifacts.values() if a['artifactType'] == 'core' and a.get('fields'))
for mutation in ['phantom', 'invalid_storage_type', 'wrong_public_type']:
    bad = copy.deepcopy(sample)
    if mutation == 'phantom': bad['binding']['column'] = 'NOT'
    if mutation == 'invalid_storage_type': bad['storageType'] = 'IS'
    if mutation == 'wrong_public_type': bad['dataType'] = 'invalid_type'
    try: check_field(bad, catalog)
    except (AssertionError, KeyError): pass
    else: raise AssertionError(('Validator accepted corruption', mutation))
try:
    assert_localized({'labelKey':'test.collision','defaultText':'One'}, 'negative-test')
    assert_localized({'labelKey':'test.collision','defaultText':'Two'}, 'negative-test')
except AssertionError: pass
else: raise AssertionError('Validator accepted conflicting translation keys')
candidate_note = f" Scoped candidate {candidate_scope['key']} carries {len(candidate_scope['baseline_artifacts'])} pinned baseline artifacts and compiles {len(candidate_scope['artifacts'])} runtime artifacts." if candidate_scope else ''
print(f'PASS: {len(artifacts)} artifacts; hashes, catalog types, query/index allow-lists, protection/reveal contracts, relation defaults, scopes, translations, 19 flow variants and source coverage. Offline catalog validation; publication also checks the target source catalog.{candidate_note}')
