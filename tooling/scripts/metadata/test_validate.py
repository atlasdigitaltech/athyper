"""Mutation tests for validator rules that protect the compiled BP package."""
import copy
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
REPOSITORY = TOOLS.parents[2]
PACKAGE = REPOSITORY / 'metadata/entities'
SOURCE = next((REPOSITORY / 'docs/architecture/application-experience/entity-policy-examples').glob('business-partner-definition-bundle-22ee*.json'))

def digest(value):
    return 'sha256:' + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def rehash(root):
    entries = []
    for path in sorted([*root.rglob('*.json'), *(root.parent/'profiles').rglob('*.json')]):
        value = json.loads(path.read_text())
        if value.get('artifactType') in {'core', 'operation', 'presentation_surface', 'presentation_section', 'flow'}:
            value['artifactHash'] = digest({key: item for key, item in value.items() if key != 'artifactHash'})
            path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
            entries.append({'artifactKey': value['artifactKey'], 'artifactType': value['artifactType'], 'entityCode': value['entityCode'], 'ref': str(path.relative_to(root if path.is_relative_to(root) else root.parent/'profiles')), 'hash': value['artifactHash']})
    release_path = root/'business_partner/release.json'
    release = json.loads(release_path.read_text())
    release['artifacts'] = entries
    release['releaseHash'] = digest({key: item for key, item in release.items() if key not in {'releaseHash', 'signature'}})
    release_path.write_text(json.dumps(release, indent=2, ensure_ascii=False) + '\n')

class ValidatorMutationTests(unittest.TestCase):
    def fails(self, expected, mutate):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)/'entities'
            shutil.copytree(PACKAGE, root, ignore=shutil.ignore_patterns('__pycache__'))
            shutil.copytree(PACKAGE.parent/'review', root.parent/'review')
            shutil.copytree(PACKAGE.parent/'profiles', root.parent/'profiles')
            mutate(root)
            rehash(root)
            result = subprocess.run([
                sys.executable, str(TOOLS/'validate.py'), '--package-root', str(root),
                '--repository-root', str(REPOSITORY), '--source-bundle', str(SOURCE),
            ], text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertIn(expected, result.stderr + result.stdout)

    def test_rejects_wrong_leading_index_column(self):
        self.fails('matching lower() index expression', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['query']['filters'][0].update(indexRef='master.business_partner.business_partner_name_idx')))

    def test_rejects_exact_mode_against_casefold_index(self):
        self.fails('operatorSet and mode disagree', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['query']['filters'][0].update(mode='value')))

    def test_rejects_prefix_mode_against_casefold_index(self):
        self.fails('index must lead with the query column', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['query']['search'][0].update(mode='prefix')))

    def test_rejects_filter_operator_mode_disagreement(self):
        self.fails('operatorSet and mode disagree', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['query']['filters'][0].update(operatorSet='exact')))

    def test_rejects_sort_without_casefold_mode(self):
        self.fails('index must lead with the query column', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['query']['sorts'][0].update(mode='value')))

    def test_rejects_default_collation_sort_on_pattern_index(self):
        self.fails('index does not support requested query capability', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['query']['sorts'][0].update(indexRef='master.business_partner.business_partner_name_idx')))

    def test_rejects_missing_tenant_field(self):
        self.fails('tenantField is required', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['storage'].pop('tenantField')))

    def test_rejects_unknown_write_policy(self):
        self.fails('invalid writePolicy', lambda root: self._edit_field(root, 'business_partner/core.json', 'name', lambda field: field.update(writePolicy='banana')))

    def test_rejects_unknown_read_policy(self):
        self.fails('invalid readPolicy', lambda root: self._edit_field(root, 'business_partner/core.json', 'name', lambda field: field.update(readPolicy='banana')))

    def test_rejects_unmasked_protected_value(self):
        self.fails('protected value must be masked_only', lambda root: self._edit_field(root, 'business_partner_tax_registration/core.json', 'registration_number', lambda field: field.update(readPolicy='authorized_projection')))

    def test_rejects_retired_protection_classification(self):
        self.fails('unknown normative property', lambda root: self._edit_field(root, 'business_partner_tax_registration/core.json', 'registration_number', lambda field: field['protection'].update(classification='restricted')))

    def test_rejects_editable_server_number(self):
        self.fails('server-managed value must be readonly', lambda root: self._edit_field(root, 'business_partner/core.json', 'code', lambda field: field.update(uiFacets={'visibility':'visible','editability':'editable_in_governed_draft'})))

    def test_rejects_section_permission_mismatch(self):
        self.fails('detail and section permissions differ', lambda root: self._edit(root, 'business_partner/presentation.detail.json', lambda value: next(section for section in value['sections'] if section['sectionKey']=='attachments').update(viewPermission='neon.collaboration.comment.read')))

    def test_rejects_reveal_permission_mismatch(self):
        self.fails('reveal permission mismatch', lambda root: self._edit_field(root, 'business_partner_tax_registration/core.json', 'registration_number', lambda field: field['protection']['reveal'].update(permissionCode='neon.relationship.business_partner_bank.reveal')))

    def test_rejects_missing_relation_scope_contract(self):
        self.fails('validated owner mapping required', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['relations'][0]['binding'].pop('scopeContract')))

    def test_rejects_unknown_field_permission(self):
        self.fails('permission missing from evidence', lambda root: self._edit(root, 'business_partner/presentation.section.workforce.json', lambda value: value['authorization']['fieldPermissions'].append('neon.invalid.field_permission')))

    def test_rejects_unknown_owner_mapping_column(self):
        self.fails('owner mapping source is not catalogued', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['relations'][0]['binding']['scopeContract']['ownerMapping'].update(ownerColumn='missing_owner_column')))

    def test_rejects_missing_organization_applicability(self):
        self.fails('organization applicability facet required', lambda root: self._edit_field(root, 'business_partner/core.json', 'founded_year', lambda field: field.pop('dynamicFacets')))

    def test_rejects_unknown_top_level_property(self):
        self.fails('closed-world schema violation', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value.update(typoedSecurityFlag=True)))

    def test_rejects_unknown_nested_property(self):
        self.fails('unknown normative property', lambda root: self._edit(root, 'business_partner/presentation.section.contacts.json', lambda value: value['authorization'].update(enforceBeforeDateQuery=True)))

    def test_rejects_schema_version_or_plane_change(self):
        self.fails('closed-world schema violation', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value.update(schemaVersion=9)))

    def test_rejects_missing_business_context(self):
        self.fails('required Core security block missing', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value.pop('businessContext')))

    def test_rejects_relaxed_core_security_posture(self):
        self.fails('validation authority security posture invalid', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['validationAuthority'].update(uiVisibilityGrantsAccess=True)))

    def test_rejects_unsafe_query_limit(self):
        self.fails('query safety limits invalid', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['querySafetyLimits'].update(maxPageSize=100000)))

    def test_rejects_generic_write(self):
        self.fails('storage kind or generic-write security posture invalid', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['storage'].update(genericWriteEnabled=True)))

    def test_rejects_authorization_after_context_resolution(self):
        self.fails('authorization must precede context resolution', lambda root: self._edit(root, 'business_partner/operation.json', lambda value: value['transactionOrder'].reverse()))

    def test_rejects_relaxed_section_authorization(self):
        self.fails('authorization must deny discovery and authorize before query', lambda root: self._edit(root, 'business_partner/presentation.section.contacts.json', lambda value: value['authorization'].update(enforceBeforeDataQuery=False)))

    def test_rejects_unprotected_contact_channel(self):
        self.fails('sensitive data category requires protection', lambda root: self._edit(root, 'business_partner/presentation.section.contacts.json', lambda value: next(field for field in value['childCollections'][1]['fields'] if field['key'] == 'value').pop('protection')))

    def test_rejects_disabled_audit(self):
        self.fails('audit capability must remain enabled', lambda root: self._edit(root, 'business_partner/core.json', lambda value: value['capabilities']['audit'].update(enabled=False)))

    def test_live_gate_connection_environment_is_url_only(self):
        spec = importlib.util.spec_from_file_location('live_gate', TOOLS/'verify_live_schema.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with mock.patch.dict(os.environ, {'PGHOSTADDR': 'wrong-host', 'PGSERVICE': 'wrong-service', 'PGSSLMODE': 'disable'}, clear=False):
            environment = module.connection_environment('postgresql://user:secret@review-db.example:5432/athyper_neon?sslmode=require')
        self.assertEqual('review-db.example', environment['PGHOST'])
        self.assertEqual('athyper_neon', environment['PGDATABASE'])
        self.assertEqual('require', environment['PGSSLMODE'])
        self.assertNotIn('PGHOSTADDR', environment)
        self.assertNotIn('PGSERVICE', environment)
        with self.assertRaises(ValueError):
            module.connection_environment('postgresql://review-db.example/athyper_neon?host=wrong')

    def test_rejects_undeclared_runtime_service(self):
        self.fails('undeclared service dependencies', lambda root: self._edit(root, 'business_partner/release.json', lambda value: value['externalDependencies'].__setitem__(slice(None), [item for item in value['externalDependencies'] if item['serviceKey'] != 'platform.audit.v1'])))

    def test_rejects_child_field_not_declared_by_child_core(self):
        self.fails('contacts', lambda root: self._edit(root, 'business_partner/presentation.section.contacts.json', lambda value: value['childCollections'][0]['fieldBindings'][0].update(fieldKey='not_a_contact_field')))

    def test_rejects_missing_required_handler_registration(self):
        self.fails('registry evidence missing', lambda root: self._edit(root, 'business_partner/operation.json', lambda value: value['operations'][0]['execution'].update(handlerKey='neon.bp.not_registered.v1')))

    def test_rejects_translation_key_with_conflicting_text(self):
        self.fails('conflicting translation key', lambda root: self._edit(root, 'business_partner/presentation.list.json', lambda value: value['queryPresentation']['quickFilters'][0].update(label={'labelKey':'entity.business_partner.core.fields.name.label','defaultText':'Different label'})))

    def test_rejects_list_filter_not_in_core_allow_list(self):
        self.fails('list filters exceed Core allow-list', lambda root: self._edit(root, 'business_partner/presentation.list.json', lambda value: value['queryPresentation']['quickFilters'].append({'fieldKey':'ownership_class','control':'select','label':{'labelKey':'entity.business_partner.presentation.list.filters.ownership_class.label','defaultText':'Ownership class'}})))

    def _edit(self, root, rel, mutate):
        path = root/rel
        value = json.loads(path.read_text())
        mutate(value)
        path.write_text(json.dumps(value, indent=2) + '\n')

    def _edit_field(self, root, rel, key, mutate):
        self._edit(root, rel, lambda value: mutate(next(field for field in value['fields'] if field['key']==key)))

if __name__ == '__main__':
    unittest.main()
