"""Read-only consistency checks for the BP review artifacts; no runtime activation."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = next(p for p in ROOT.parents if (p / 'server/db/ddl').is_dir())
TYPES = {'core', 'operation', 'presentation_surface', 'presentation_section', 'flow'}
LOCALIZED_PROPERTIES = {
    'label', 'title', 'description', 'helpText', 'emptyLabel', 'viewAllLabel',
    'tooltip', 'placeholder', 'ariaLabel',
}

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

def assert_localized(value, path):
    """Reject raw UI copy in runtime artifacts; source fixtures are excluded."""
    if isinstance(value, dict):
        for key, item in value.items():
            location = f'{path}.{key}'
            if key in LOCALIZED_PROPERTIES:
                assert isinstance(item, dict), (location, 'must be a translation object')
                assert set(item) == {'labelKey', 'defaultText'}, (location, item)
                assert isinstance(item['labelKey'], str) and item['labelKey'], location
                assert isinstance(item['defaultText'], str), location
            assert_localized(item, location)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_localized(item, f'{path}[{index}]')

files = {str(p.relative_to(ROOT)): json.loads(p.read_text()) for p in ROOT.rglob('*.json')}
release = files['business_partner/release.json']
artifacts = {p: a for p, a in files.items() if a.get('artifactType') in TYPES}
assert len(release['artifacts']) == len(artifacts)
assert len({a['artifactKey'] for a in artifacts.values()}) == len(artifacts)
keys = {a['artifactKey'] for a in artifacts.values()}
# Parse source table declarations for column existence (not a SQL semantic validator).
tables = {}
for base in ['server/db/ddl/common', 'server/db/ddl/planes/neon']:
    for path in (REPO / base).rglob('*.sql'):
        for match in re.finditer(r'CREATE TABLE (?:IF NOT EXISTS )?(\w+\.\w+)\s*\((.*?)\n\);', path.read_text(), re.S):
            tables[match[1]] = set(re.findall(r'^\s{2,}(\w+)\s+[\w.]+', match[2], re.M))
for path, artifact in artifacts.items():
    for prop in ['schema', 'schemaVersion', 'contractStatus', 'artifactType', 'artifactKey', 'entityCode', 'plane', 'artifactHash', 'dependencies']:
        assert prop in artifact, (path, prop)
    assert artifact['contractStatus'] == 'draft_for_review', path
    assert_localized(artifact, path)
    assert artifact['artifactHash'] == digest({k: v for k, v in artifact.items() if k != 'artifactHash'}), path
    assert set(artifact['dependencies']) <= keys, path
    for ref in refs(artifact):
        assert ref in artifacts, (path, ref)
        assert ref[:-5] in artifact['dependencies'] or ref == path, (path, ref)
    if artifact['artifactType'] == 'core':
        field_keys = [f['key'] for f in artifact['fields']]
        assert len(field_keys) == len(set(field_keys)), path
        for source in artifact['storage']['sourceObjects']:
            assert source in tables, (path, source)
        for field in artifact['fields']:
            binding = field['binding']
            assert binding['column'] in tables[binding['sourceObject']], (path, binding)
        for name in ['idField', 'tenantField', 'versionField']:
            column = artifact['storage'].get(name)
            if column:
                assert column in tables[artifact['storage']['primaryObject']], (path, name)
    if artifact['artifactType'] == 'operation':
        operations = {op['key'] for op in artifact['operations']}
        assert len(operations) == len(artifact['operations']), path
        for operation in artifact['operations']:
            assert operation.get('scopeBinding') and operation.get('permissionCode'), (path, operation)
            assert operation['execution'].get('registryRequired'), path
        bindings = artifact['policyBindings']
        assert len({b['bindingKey'] for b in bindings}) == len(bindings), path
        for binding in bindings:
            assert binding['operationKey'] in operations, (path, binding)
            assert binding['policyKind'] in {'approval_transition', 'evidence_requirement', 'duplicate_detection', 'readiness_requirement', 'decision_authorization'}
            if binding['policyKind'] == 'readiness_requirement':
                fact_core = artifacts[binding['factEntityCode'] + '/core.json']
                assert set(binding['factCodes']) <= {f['code'] for f in fact_core['readinessFacts']}
    if artifact['artifactType'] == 'presentation_section' and 'coreRef' in artifact:
        fields = {f['key'] for f in artifacts[artifact['coreRef']]['fields']}
        assert {f['fieldKey'] for f in artifact['fieldBindings']} <= fields, path
    if artifact['artifactType'] == 'presentation_surface':
        operation = artifacts[artifact['entityCode'] + '/operation.json']
        assert {a['operationKey'] for a in artifact.get('actions', [])} <= {o['key'] for o in operation['operations']}, path
for entry in release['artifacts']:
    artifact = artifacts[entry['ref']]
    assert entry['hash'] == artifact['artifactHash']
    assert entry['artifactKey'] == artifact['artifactKey']
assert release['releaseHash'] == digest({k: v for k, v in release.items() if k not in ['releaseHash', 'signature']})
assert release['signature']['value'] is None and release['contractStatus'] == 'unsigned_review_only'
source = next(ROOT.parent.glob('business-partner-definition-bundle-22ee*.json'))
bundle = json.loads(source.read_text())['envelope']['payload']['bundle']
coverage = files['review/source-coverage.json']
assert coverage['sourceFileSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
assert {k: v['sourceValue'] for k, v in coverage['coverage'].items()} == bundle
for kind in bundle['requestSchemas']:
    flow = artifacts['business_partner_request/flow.' + kind + '.json']
    assert flow['requestContract']['requiredPaths'] == bundle['requestSchemas'][kind]['required']
    for channel in flow['supportedSources']:
        assert flow['journey'] in bundle['mappingContracts'][channel]['allowedJourneys'] or (flow['journey'] == 'governance' and channel in ['internal', 'api'])
expected_sections = {s['code'] for s in bundle['viewDescriptors']['neonPartner360']['sections']}
assert expected_sections <= {s['sectionKey'] for s in artifacts['business_partner/presentation.detail.json']['sections']}
print(f'PASS: {len(artifacts)} artifacts; hashes, references, DDL field bindings, operation scopes, 19 flows and source coverage.')
