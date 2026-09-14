from pathlib import Path
import re,csv,json,datetime
root=Path('server/db/ddl'); paths=sorted(root.rglob('*.sql'))
out=Path('docs/architecture/business-partner');out.mkdir(parents=True,exist_ok=True)
pattern=re.compile(r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?\w+"?\.)?"?\w+"?)',re.I)
rows=[];refs=[]
selected=re.compile(r'attachment|business_partner|bank_account|bank_institution|bank_branch|bank_provisional|bank_validation|bank_format|bank_verification|certification|commodity_category|industry_code|tax_jurisdiction|tax_type|entity_case|entity_snapshot|policy_definition|policy_rule|policy_test|policy_activation|policy_evaluation|entity_policy_binding|entity_field_policy_binding|entity_field$|entity_surface|entity_flow|entity_operation|entity_contract|network_account_(identifier|profile|tax|commodity|industry)|network_relationship|mesh_profile|company_code_(supplier|customer)_profile|^master\.(supplier|customer)$|party_risk_evidence|lookup_(domain|value)|supplier_activation')
for p in paths:
 text=p.read_text();clean=re.sub(r'/\*[\s\S]*?\*/|--[^\n]*',lambda m:re.sub(r'[^\n]',' ',m[0]),text)
 for m in pattern.finditer(clean):
  table=m[1].replace('"','');line=clean.count('\n',0,m.start())+1;scope='/'.join(p.parts[3:5]) if 'planes' in p.parts else 'common'
  row={'scope':scope,'table':table,'file':str(p),'line':line,'relevant':bool(selected.search(table))};rows.append(row)
  if not row['relevant']:continue
  pos=m.end()
  while pos<len(clean) and clean[pos].isspace():pos+=1
  if pos>=len(clean) or clean[pos]!='(':continue
  start=pos+1;depth=1;quote=None;pos+=1
  while pos<len(clean) and depth:
   c=clean[pos]
   if quote:
    if c==quote:
     if pos+1<len(clean) and clean[pos+1]==quote:pos+=2;continue
     quote=None
   elif c in "'\"":quote=c
   elif c=='(':depth+=1
   elif c==')':depth-=1
   pos+=1
  body=text[start:pos-1]
  refs.append({**row,'create_body':body,'related_ddl_locations':[]})
for p in paths:
 t=p.read_text()
 for line_no,line in enumerate(t.splitlines(),1):
  if re.search(r'\b(ALTER TABLE|DROP TABLE|COMMENT ON TABLE)\b',line,re.I):
   for ref in refs:
    if re.search(r'\b'+re.escape(ref['table'])+r'\b',line):ref['related_ddl_locations'].append({'file':str(p),'line':line_no,'statement_start':line.strip()})
with (out/'attachment-policy-ddl-index.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
(out/'attachment-policy-ddl-detail.json').write_text(json.dumps(refs,indent=2)+'\n')
summary={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Static source scan of all SQL files, then detailed review of relevant CREATE/ALTER/DROP statements, constraints and runtime consumers; not a live-schema verification. Source declarations are not effective table counts.','sqlFiles':len(paths),'createTableDeclarations':len(rows),'relevantCreateDeclarations':len(refs),'indexedSourceBytes':sum(p.stat().st_size for p in paths),'retiredRequestTables':'NEON document/11_grants.sql drops document.business_partner_request and request extension/evidence tables; use document.entity_case.'}
(out/'attachment-policy-ddl-scan-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary));print('detail_bytes', (out/'attachment-policy-ddl-detail.json').stat().st_size)
