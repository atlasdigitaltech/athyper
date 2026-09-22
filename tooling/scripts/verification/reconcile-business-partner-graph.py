#!/usr/bin/env python3
"""Read-only Neon BP graph reconciliation. SQL scanning is declaration evidence, not a SQL parser.
Run from any directory. Requires python3 and a local Docker PostgreSQL container.
Never emits domain rows, credentials or full runtime payloads; never writes to the database.
"""
import argparse, csv, hashlib, json, re, subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REVIEW = ROOT / 'docs/architecture/application-experience/neon-business-partner-ddl-review'
EXAMPLES = ROOT / 'metadata/products/mdg/entities'
OUT = REVIEW / 'bp2-00'
COMPOSITION = 'server/apps/platform-host/src/composition/register-services.ts'

def refs(value, keys):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in keys:
                if isinstance(item, str): yield item
                elif isinstance(item, list): yield from (x for x in item if isinstance(x, str))
            yield from refs(item, keys)
    elif isinstance(value, list):
        for item in value: yield from refs(item, keys)

def write_csv(name, rows, fields):
    with (OUT / name).open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader(); writer.writerows(rows)

def adjacent_owner(table):
    schema, name = table.split('.')
    schema_owners = {'public':'Database provisioning','authz':'Identity and authorization','audit':'Audit and retention','runtime_meta':'Runtime metadata and usage','ops':'Platform operations','ai':'Atlas','log':'Delivery operations','event':'Messaging and integration events','governance':'Process governance'}
    if schema in schema_owners: return schema_owners[schema]
    groups = [
        ('Shared collaboration/content', r'conversation|multipart|content_item|render_output'),
        ('Process orchestration', r'workflow|process_|work_item'),
        ('External workforce', r'external_|worker_|workforce_|contingent_|statement_of_work'),
        ('Internal HR/payroll', r'employee|employment|work_assignment|payroll|pay_|compensation|leave_|statutory|attendance|shift_|time_punch|holiday|work_pattern|people_request|hr_case|onboarding_case|offboarding_case|policy_acknowledgment'),
        ('Procurement', r'purchase_|sourcing_|punchout|catalog|procurement_|commitment|receipt|delivery_note|schedule_line'),
        ('Sales', r'sales_'),
        ('Inventory/manufacturing', r'warehouse|product|item|bom|stocktake|production_|inventory_'),
        ('Projects/planning/budget', r'project|planning_|budget_|obligation_horizon'),
        ('Finance/treasury/tax', r'bank_|asset|depreciation|fx_|fiscal_|company_fiscal|company_code_(chart|book|dimension)|chart_of_account|ledger_book|dimension_|accounting_|posting_|cross_book|book_period|gl_|journal_|payment_|invoice_|tax_|wht_|intercompany_|ic_|netting_|match_exception|pricing_|condition_|rounding_'),
        ('Integration/connectors', r'connector_|integration_|webhook_'),
        ('Entitlements/usage', r'subscription_|tenant_usage|usage_'),
        ('Policy/formula engine', r'formula_|rate_table|policy_'),
        ('Scheduling', r'cron_'),
        ('Records transfer', r'import_'),
        ('Organization', r'organization_|org_unit'),
        ('Experience/identity/content configuration', r'tenant_relationship|workspace|module|principal_|team|brand_|letterhead|print_|template|business_intent|user_profile'),
        ('Audit configuration', r'audit_'),
    ]
    return next((owner for owner, pattern in groups if re.match(pattern,name)), f'{schema} domain: requires owner confirmation before expansion')

CORE_REVIEW = {
 'address': 'BP2-02: add country-dependent state_region/timezone contracts; existing columns alone do not complete lookup/filter/write validation',
 'address_link': 'BP2-02: verify owner registry, purpose, effective dates and primary overlap through existing commands',
 'business_partner': 'BP2-04/06/16: extend relations only through verified providers; complete alias/relationship/context graph',
 'business_partner_banking': 'BP2-09: account core is not link/usage/company/disclosure graph; preserve protected reader',
 'business_partner_commodity_capability': 'BP2-05: tenant category -> code assignment -> shared domain/code, not a direct shared code FK',
 'business_partner_governance_relation': 'BP2-04: distinguish governance relation from ordinary partner relationship and internal legal-entity link',
 'business_partner_identifier': 'BP2-04: verify schemes, jurisdiction, effective dates and protected reveal',
 'business_partner_industry_classification': 'BP2-05: domain plus code UUID and allowed isic/naics identity',
 'business_partner_operating_organization_assignment': 'BP2-06: role capability, organization/company scope and revocation',
 'business_partner_qualification': 'BP2-07/10: decision scope and governed outcomes; not generic editable qualification rows',
 'business_partner_request': 'BF-04: replace retired stored bindings with actual case/snapshot projection; keep logical entity and domain status mapping',
 'business_partner_tax_registration': 'BP2-04: tax jurisdiction/scheme and protected projection through current authority',
 'certification': 'BP2-05/BF-05: certificate type/custom alternative, validity and attachment parent parity',
 'contact_person': 'BP2-03: roles/channels/person identity link and authorized primary selection',
 'country': 'BP2-01/02: reuse natural code; state, postal hints and historical inactive display',
 'customer': 'BP2-06/08: role core does not imply company designation/credit/lifecycle completeness',
 'customer_company_profile': 'BP2-06/08: company admission, commercial references and credit decision ownership',
 'supplier': 'BP2-06/07: role core does not imply qualification/preference/activation completeness',
 'supplier_company_profile': 'BP2-06/07/09: company admission, terms, activation and bank usage relationships',
 'workforce': 'BP2-12: internal employee boundary only; external_worker/engagement is a separate graph and permission contract',
 'platform.core_field_defaults': 'Retained platform defaults; not a business storage entity',
 'platform.governed_child_operation': 'Retained operation policy defaults; not a business storage entity',
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database-container', required=True)
    args = parser.parse_args()
    if not args.database_container.startswith('athyper-dev-db-'):
        parser.error('Use a local athyper-dev-db-* container; other environments are out of scope')
    def query(sql):
        raw = subprocess.check_output(['docker', 'exec', args.database_container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'athyper_neon', '-Atc',
            'BEGIN READ ONLY; SELECT coalesce(jsonb_agg(row_to_json(q)),\'[]\'::jsonb) FROM (' + sql + ') q; COMMIT;'], text=True)
        return json.loads(next(line for line in raw.splitlines() if line.startswith('[')))
    schema = query("SELECT table_schema||'.'||table_name AS object, column_name AS column FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,ordinal_position")
    columns = defaultdict(set)
    for row in schema: columns[row['object']].add(row['column'])
    permissions = {r['canonical_code'] for r in query("SELECT canonical_code FROM authz.permission WHERE status='published'")}
    active = query("SELECT h.publication_key,h.applied_release_id::text,h.source_release_no,h.artifact_hash,h.activated_at,p.payload_json FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=h.applied_release_id WHERE p.artifact_kind='compiled_entity_runtime' ORDER BY h.publication_key")
    manifest = ROOT / 'server/db/ddl/planes/neon/_manifest.txt'
    paths = [ROOT/'server/db/ddl'/line.strip() for line in manifest.read_text().splitlines() if line.strip() and not line.startswith('#')]
    events=[]; final={}
    for order, path in enumerate(paths):
        text=path.read_text()
        # Preserve newline counts while excluding SQL comments from declaration matching.
        text=re.sub(r'/\*.*?\*/',lambda m:'\n'*m[0].count('\n'),text,flags=re.S)
        text=re.sub(r'--[^\n]*','',text)
        for m in re.finditer(r'\b(CREATE\s+(?:UNLOGGED\s+)?TABLE|DROP\s+TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-z_]+\.[a-z_]+)',text,re.I):
            kind='create' if m[1].upper().startswith('CREATE') else 'drop'
            event={'object':m[2], 'event':kind, 'manifest_order':order+1,'source':str(path.relative_to(ROOT)), 'line':text[:m.start()].count('\n')+1}
            events.append(event); final[m[2]]=event
    allocations=list(csv.DictReader((REVIEW/'phase-2-table-work-packages.csv').open()))
    user_tables={r['table'] for r in csv.DictReader((REVIEW/'user-list-reconciliation.csv').open())}
    assert len(allocations)==len({r['table'] for r in allocations})
    assert len(user_tables)==43 and user_tables <= {r['table'] for r in allocations}
    assert {e['object'] for e in events if e['event']=='create'} == {r['table'] for r in allocations}, 'DDL inventory changed; reconcile allocation CSV first'
    drafts=[]
    for path in sorted(EXAMPLES.rglob('*.json')):
        d=json.loads(path.read_text())
        if d.get('artifactType') in ('core','operation','presentation_section','presentation_surface','flow'):
            drafts.append((str(path.relative_to(ROOT)),d))
    live=[]; releases=[]
    for release in active:
        payload=release.pop('payload_json')
        releases.append({**release,'compiled_release_hash':payload['release']['releaseHash'],'entity_code':payload['entityCode'],'artifact_count':len(payload['artifacts'])})
        for artifact in payload['artifacts']: live.append((release['publication_key'],artifact.get('content',artifact)))
    draft_by_key={d['artifactKey']:d for _,d in drafts}
    drift=[]
    for publication,d in live:
        draft=draft_by_key.get(d['artifactKey'])
        # Published status and generated hashes necessarily differ from review input.
        stable=lambda value: {k:v for k,v in value.items() if k not in ('artifactHash','contractStatus')}
        drift.append({'artifact':d['artifactKey'],'publication':publication,'comparison':'same_semantic_content' if draft and stable(draft)==stable(d) else 'draft_changed_or_absent','active_hash':d.get('artifactHash','')})
    table_draft=defaultdict(set); table_live=defaultdict(set); issues=[]; ledger=[]; cores=[]
    for origin,documents in [('draft',drafts),('active',live)]:
        for path,d in documents:
            sources=set(refs(d,{'sourceObject','sourceObjects','primaryObject'}))
            for source in sources:
                (table_draft if origin=='draft' else table_live)[source].add(d['artifactKey'])
                if source not in columns or final.get(source,{}).get('event')=='drop':
                    issues.append({'origin':origin,'artifact':d['artifactKey'],'kind':'missing_or_retired_source','reference':source,'corrective_package':'BF-04 / BP2-00' if 'business_partner_request' in source else 'BP2-01–BP2-16'})
            core_issues=[]
            for field in d.get('fields',[]):
                binding=field.get('binding',{}); source=binding.get('sourceObject',''); column=binding.get('column','')
                status='projection_or_unbound' if not source else ('present' if column in columns.get(source, set()) else 'missing_column_or_source')
                if status=='missing_column_or_source': core_issues.append(field.get('key',''))
                ledger.append({'origin':origin,'artifact':d['artifactKey'],'field_key':field.get('key',''),'label_key':field.get('label',{}).get('labelKey',''),'source_object':source,'column':column,'data_type':field.get('dataType',''),'binding_status':status,'evidence':path})
            if d['artifactType']=='core':
                cores.append({'origin':origin,'entity':d['entityCode'],'artifact':d['artifactKey'],'sources':'; '.join(sorted(sources)), 'field_count':len(d.get('fields',[])), 'invalid_bindings':'; '.join(core_issues),'assessment':'binding_gaps' if core_issues or any(x not in columns for x in sources) else 'bindings_present_domain_completeness_not_proven','generic_write_enabled':d.get('storage',{}).get('genericWriteEnabled','unspecified'),'remaining_domain_work':CORE_REVIEW.get(d['entityCode'],'Review new core before claiming completeness')})
    # Static source evidence excludes generated declarations/build output and tests.
    mentions=defaultdict(set)
    for path in sorted((ROOT/'server').rglob('*.ts')):
        if any(x in path.parts for x in ('node_modules','dist','generated','__tests__')) or path.name.endswith(('.test.ts','.d.ts')): continue
        if '/src/' not in str(path): continue
        text=path.read_text()
        for match in re.finditer(r'\b(?:shared|master|control|document|snapshot|runtime_meta|authz|audit|event|log|ops|ledger|ai)\.[a-z][a-z0-9_]*',text):
            if match[0] in final:
                mentions[match[0]].add(f'{path.relative_to(ROOT)}:{text[:match.start()].count(chr(10))+1}')
    owner_by_package={'BP2-01':'Shared reference','BP2-02':'Address','BP2-03':'Contact/person','BP2-04':'Business Partner identity','BP2-05':'Classification/certification','BP2-06':'Partner role/company context','BP2-07':'Supplier','BP2-08':'Customer','BP2-09':'Banking','BP2-10':'Partner governance','BP2-11':'Workforce commercial policy','BP2-12':'External workforce','BP2-13':'Workforce/procurement/finance','BP2-14':'Risk','BP2-15':'Neon integrations','BF-05':'Shared collaboration'}
    tables=[]
    for a in allocations:
        t=a['table']; lifecycle=final[t]['event']; package=a['primary_work_package']
        tables.append({'table':t,'user_listed':t in user_tables,'owning_domain':('Shared entity case/snapshot' if lifecycle=='drop' else adjacent_owner(t) if a['family']=='Adjacent domain or infrastructure' else owner_by_package.get(package,a['family'])), 'exposure_type':('retired: never expose or recreate' if lifecycle=='drop' else 'internal infrastructure; no BP CRUD' if a['schema'] in ('public','authz','audit','runtime_meta','ops','ai','log','event','governance') else a['planned_disposition']),'work_package':package,'consumer_or_exclusion':a['required_outcome'],'final_ddl_state':'retired' if lifecycle=='drop' else 'declared','final_ddl_evidence':f"{final[t]['source']}:{final[t]['line']}",'local_catalog_present':t in columns,'ownership_basis':'phase allocation and schema/domain classification; source consumers attached','draft_artifacts':'; '.join(sorted(table_draft[t])) or 'none in inspected examples','active_artifacts':'; '.join(sorted(table_live[t])) or 'none in current compiled activation','provider_source_evidence':'; '.join(sorted(mentions[t])) or 'no explicit qualified reference found; inspect dynamic/indirect consumers before removal','completeness':'retired: case/snapshot correction required' if lifecycle=='drop' else 'artifact presence does not prove domain completeness; see core and field ledgers'})
    composition=(ROOT/COMPOSITION).read_text()
    registered_sections=dict(re.findall(r'"(neon\.bp\.section\.[^"]+)":\s*"([^"]+)"',composition))
    registered_operations=set(re.findall(r'handlerKey === "([^"]+)"',composition))
    handler_refs=defaultdict(set); operation_rows=[]; presentation_rows=[]
    for origin,documents in [('draft',drafts),('active',live)]:
        for path,d in documents:
            for h in refs(d,{'handlerKey'}): handler_refs[h].add(f"{origin}:{d['artifactKey']}")
            if d['artifactType']=='presentation_section':
                core_ref=d.get('coreRef','').removesuffix('.json')
                binding=d.get('dataBinding',{})
                presentation_rows.append({'origin':origin,'artifact':d['artifactKey'],'core_ref':core_ref,'renderer':d.get('rendererKey',''),'binding_kind':binding.get('kind',''),'runtime_handler':binding.get('handlerKey',binding.get('serviceKey','')),'field_keys':'; '.join(refs(d.get('fieldBindings',[]),{'fieldKey'})),'child_core_refs':'; '.join(refs(d.get('childCollections',[]),{'coreRef'})),'browser_contract':'EntityRuntimeSectionResource.presentation.fields/childCollections and typed data; service projection must match keys','server_projection':'server/packages/platform/experience/src/entity-section-service.ts:browserSectionPresentation','browser_parser':'packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx:CompiledEntitySectionContent'})
            for op in d.get('operations',[]):
                h=op.get('execution',{}).get('handlerKey',''); perm=op.get('permissionCode','')
                registered=h in registered_operations
                operation_rows.append({'origin':origin,'entity':d['entityCode'],'operation':op.get('key',''),'permission':perm,'permission_published_locally':perm in permissions,'handler':h,'generic_dispatch_registration':registered,'disposition':'registered: domain admission still required' if registered and perm in permissions else 'unavailable through generic dispatch; may have separate domain route','corrective_package':'BF-04' if d['entityCode']=='business_partner_request' else 'owning BP2 domain package','evidence':COMPOSITION})
    reasons={'overview':'authorized compact overview and record revision','identity':'category-aware identity and protected projection','contacts':'owner/channel/primary semantics','addresses':'polymorphic owner and effective address links','identifiers-tax':'jurisdiction and protected identifier projection','roles-scope':'role eligibility and organization/company scope','supplier-company':'supplier profile company admission','customer-company':'customer profile company admission','banking':'masking, verification, disclosure acceptance and company usage','qualifications-certificates':'decision results and certificate parent admission','credit':'credit outcome and company authorization','requests':'case/snapshot compatibility projection and requester visibility','activity':'authorized evidence/history envelope','business-activity':'organization/company-scoped business documents','network':'accepted provenance without exposing raw inbox payloads'}
    # Capability dispatch is separate from the six literal domain registrations.
    capability_implemented = {
        'platform.comments.'+action+'.v1' for action in ('read','create','update_own','archive_own')
    } | {'platform.attachments.'+action+'.v1' for action in ('read','create','finalize','status','download')}
    handlers=[]
    for h in sorted(set(handler_refs)|set(registered_sections)|registered_operations):
        section=registered_sections.get(h)
        status='registered_section' if section else 'registered_operation' if h in registered_operations else 'registered_capability_branch' if h in capability_implemented else 'not_in_generic_domain_dispatch'
        handlers.append({'handler_key':h,'registration':status,'consumers':'; '.join(sorted(handler_refs[h])),'authority':COMPOSITION if status!='not_in_generic_domain_dispatch' else 'review declaration alone is not executable registration','why_specialized':reasons[section] if section else 'governed command: domain validation, concurrency, idempotency and evidence' if h in registered_operations else 'shared capability: parent/audience admission and lifecycle service; CA owner retains implementation' if h in capability_implemented else 'resolve actual service/route or keep unavailable; no implementation inferred','read_scope':'one named section via businessPartner360.section; overview has dedicated method' if section else 'not a section reader'})
    OUT.mkdir(exist_ok=True)
    for name,rows in [('table-surface-map.csv',tables),('core-completeness.csv',cores),('field-naming-ledger.csv',ledger),('handler-ledger.csv',handlers),('operation-availability.csv',operation_rows),('source-mismatches.csv',issues),('final-ddl-events.csv',events),('artifact-drift.csv',drift),('presentation-naming-ledger.csv',presentation_rows)]:
        if rows: write_csv(name,rows,list(rows[0]))
    summary={'captured_at':datetime.now(timezone.utc).isoformat(),'database':'local athyper_neon','read_only':True,'manifest_files':len(paths),'reviewed_tables':len(tables),'user_listed_tables':len(user_tables),'retired_tables':sum(e['event']=='drop' for e in final.values()),'draft_artifacts':len(drafts),'active_artifacts':len(live),'source_mismatches':len(issues),'draft_active_differences':sum(r['comparison']!='same_semantic_content' for r in drift),'core_binding_gaps':sum(c['assessment']=='binding_gaps' for c in cores),'registered_section_handlers':len(registered_sections),'registered_domain_operation_handlers':len(registered_operations),'releases':releases,'manifest_sha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'limitations':['Static SQL declaration scan is not a PostgreSQL parser; live catalog cross-check recorded separately.','Qualified source mentions are candidate provider evidence, not proof of reachability or authorization.','Activation snapshot is metadata-only; no authenticated browser journey or operation execution is claimed.','Generic domain dispatch registration is distinct from domain-specific HTTP routes and shared collaboration capability dispatch.']}
    (OUT/'active-reconciliation.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ('releases','limitations')},indent=2))

if __name__=='__main__': main()
