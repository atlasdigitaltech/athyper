from pathlib import Path
import csv, zipfile
from xml.sax.saxutils import escape

root = Path(__file__).resolve().parent.parent
# label, business guidance; asterisk means required workshop handover field.
common = [('Tenant code*','Existing or proposed tenant code; all row references must belong to it.')]
owner = [('Business owner*','Accountable business contact; collection only.')]
fields = {
'Tenants': [('Tenant code*','2–63 characters; lowercase letter first, then lowercase letters, digits, _ or -.'),('Name*','Enterprise workspace name.'),('Display name*','Name users should see.'),('Default country','Two-letter catalogue code; presentation default, not legal registration.'),('Time zone*','Catalogue time zone, e.g. Asia/Kuala_Lumpur.'),('Default locale*','Must be one of the enabled locales.'),('Enabled locales*','Semicolon-separated choices: en;ar;ms;zh-Hans;hi;ta;fr;de. Include en.'),('Language code','Preferred language; confirm target catalogue.'),('Target launch date*','YYYY-MM-DD; planning only, not a tenant effective-date field.'),*owner],
'Legal Entities': [*common,('Legal entity code*','2–63 characters; lowercase letter first; lowercase letters, digits, _, . or -.'),('Name*','Familiar business name.'),('Legal name*','Exact official name from corporate evidence.'),('Display name','Optional display label.'),('Entity type*','company, group, division or legal_entity; confirm classification.'),('Parent legal entity code','Optional parent within same tenant; no cycles.'),('Registration number*','Required workshop evidence for a registered organization; document exceptions.'),('Registration country*','Two-letter catalogue code; document exceptions.'),('Incorporation date','YYYY-MM-DD.'),('Functional currency*','Three-letter catalogue code confirmed by Finance.'),('Reporting currency','Optional three-letter catalogue code.'),('Effective from','YYYY-MM-DD.'),('Effective until','If supplied with a start date, must be later.'),*owner],
'Company Codes': [*common,('Company code*','2–63 characters; lowercase letter first; lowercase letters, digits, _, . or -.'),('Name*','Accounting unit name.'),('Display name','Optional display label.'),('Legal entity code*','Exactly one owning legal entity in this tenant.'),('Functional currency*','Three-letter catalogue code; Finance confirms differences from legal entity currency.'),('Country*','Two-letter catalogue code; workshop required.'),('Fiscal year start month*','Integer 1–12; does not create fiscal periods.'),('Time zone*','Catalogue time zone.'),('Locale*','Catalogue locale.'),('External reference','Optional reference to a legacy/external system.'),('Accounting purpose*','Reason for separate balancing unit; collection only.'),*owner],
'Operating Organizations': [*common,('Operating organization code*','2–63 characters; lowercase letter first; lowercase letters, digits, _, . or -.'),('Name*','Operational coordination unit name.'),('Display name','Optional display label.'),('Description*','Business purpose and responsibilities.'),('Domain*','procurement, sales or both for this collection pack; confirm other needs separately.'),('Parent operating organization code','Optional parent in same tenant; no cycles.'),('Effective from','YYYY-MM-DD.'),('Effective until','If supplied with a start date, must be later.'),*owner],
'Company Assignments': [*common,('Operating organization code*','Existing or proposed organization from Operating Organizations.'),('Company code*','Participating company in same tenant.'),('Participation role*','lead or participant; separate from profile default company.'),('Effective from*','YYYY-MM-DD; explicit workshop decision.'),('Effective until','Exclusive end date; must be later than start. Blank means open-ended.'),*owner],
'Procurement Profiles': [*common,('Operating organization code*','Domain must be procurement or both; at most one procurement profile.'),('Organization type*','Agreed operational classification, e.g. shared_services; confirm setup vocabulary.'),('Buying model*','Source default is federated; confirm intended model/options with implementation team.'),('Default currency','Optional three-letter catalogue code; operational preference.'),('Lead company code','If provided, must be an active, currently effective member when saved.'),*owner],
'Sales Profiles': [*common,('Operating organization code*','Domain must be sales or both; at most one sales profile.'),('Organization type*','Agreed operational classification; confirm setup vocabulary.'),('Selling model*','Source default is federated; confirm intended model/options with implementation team.'),('Default currency','Optional three-letter catalogue code; operational preference.'),('Booking company code','If provided, must be an active, currently effective member when saved.'),('Invoicing company code','If provided, must be an active, currently effective member when saved.'),*owner],
'Access': [*common,('User or group*','Business identity reference, never a password or secret.'),('Requested responsibility*','Describe needed view, maintain, transact or approve actions.'),('Legal entity code','Requested legal entity scope, if applicable.'),('Company code','Requested company scope, if applicable.'),('Operating organization code','Requested operations scope, if applicable.'),('Scope explanation*','State intended boundaries explicitly; blank scope does not mean unrestricted.'),('Reviewer*','Owner to review request.'),('Decision*','pending, approved, approved_with_conditions or returned; collection only.')],
'Decisions': [('Decision ID*','Unique collection reference, e.g. D001.'),('Topic*','Dependency, exception, evidence, open question or change request.'),('Tenant code','Tenant concerned.'),('Record type','Legal entity, company, operating organization, etc.'),('Record code','Related business code.'),('Question or requirement*','Include old/proposed values and impact when requesting a change.'),('Decision or evidence reference','Agreed answer or controlled evidence location; no embedded secrets.'),('Owner*','Accountable resolver.'),('Due date*','YYYY-MM-DD.'),('Status*','open, resolved or deferred; collection only.')],
'Sign-off': [('Pack version*','Version of collected data being reviewed.'),('Scope or record codes*','Precise records and topics covered.'),('Reviewer role*','Corporate administration, Finance, Procurement, Sales, Security or Sponsor.'),('Reviewer name*','Accountable reviewer.'),('Decision*','pending, approved, approved_with_conditions or returned; collection only.'),('Decision date','YYYY-MM-DD; required when decision is recorded.'),('Conditions','Outstanding conditions and owners.'),('Evidence reference','Reference to approval evidence; a workbook entry does not grant system authority.')]
}
fields['Tenants'].extend([
    ('Date format','Approved display preference, e.g. YYYY-MM-DD; confirm consuming UI supports the value.'),
    ('Number format','Approved display format; confirm consuming UI convention.'),
    ('Week start','0–6; implementer confirms weekday mapping before configuration.'),
    ('Weekend days','Semicolon-separated 0–6 values; implementer confirms weekday mapping. Presentation calendar default.'),
    ('Logo asset reference','Optional managed same-origin asset path; not an external URL.')
])
fields['Legal Entities'].append(('Logo asset reference','Optional managed same-origin asset path for legal-entity presentation.'))
owner_ref = [('Owner type*','tenant, legal_entity, company_code or operating_organization; channels may also use contact_person.'),('Owner reference*','Business code, or Contact reference for contact_person; same tenant.')]
fields.update({
'Addresses': [*common,('Address reference*','Unique workbook reference, e.g. ADDR001; mapped to a generated system ID, not an address code column.'),('Address kind*','street, po_box, rural, military or other.'),('Country*','Mandatory two-letter country catalogue code.'),('Street name','Structured street field; supply street/lines appropriate to country.'),('House number','Keep as text.'),('House number suffix','Optional suffix.'),('Building name','Building or complex.'),('Floor','Floor label.'),('Room','Room label.'),('Entrance','Entrance label.'),('Unit','Suite/unit.'),('Line 1','Unstructured delivery line when applicable; agree structured versus line entry with implementer.'),('Line 2','Additional address line.'),('Line 3','Additional address line.'),('City','City/town; required where local addressing requires it.'),('Dependent locality','District/locality.'),('Region','Region display text.'),('State region code','Catalogue code in country-prefixed form, e.g. MY-14.'),('Postal code','Text; preserve leading zeros.'),('PO box','Required for po_box kind.'),('PO box postal code','Postal code for box delivery.'),('PO box city','City for box delivery.'),('Delivery service type','Optional postal delivery-service detail.'),('Delivery service number','Optional postal delivery-service identifier.'),('Time zone','Catalogue time zone of location.'),('Latitude','Optional -90 to 90; supply together with longitude.'),('Longitude','Optional -180 to 180; supply together with latitude.'),('Evidence reference','Controlled source reference; collection only.'),*owner],
'Address Usages': [*common,*owner_ref,('Address reference*','Matches Addresses sheet in same tenant.'),('Purpose*','Use permitted owner purpose. registered/headquarters are proposed additions requiring configuration; see proposal.'),('Role qualifier','Optional qualifier; must have agreed business meaning.'),('Attention line','Addressee or department for this usage.'),('Primary requested*','yes/no; primary for this owner/purpose/qualifier and validity, not global.'),('Effective from*','YYYY-MM-DD.'),('Effective until','Exclusive date; later than start.'),('Reviewer*','Approves use of address for this purpose; collection only.')],
'Contacts': [*common,('Contact reference*','Unique workbook reference, e.g. CONTACT001; maps to system contact_person ID.'),*owner_ref,('Contact name*','Named business contact; do not invent a person for a shared mailbox.'),('Business title','Job or business title.'),('Department name','Business department.'),('Primary person requested*','yes/no; primary named contact of owner, distinct from role or channel primary.'),('Reviewer*','Business reviewer; collection only.')],
'Contact Roles': [*common,('Contact reference*','Matches Contacts sheet in same tenant.'),('Role code*','Approved contact role, e.g. procurement, sales, accounts_payable, accounts_receivable, legal, tax or support.'),('Primary role requested*','yes/no; primary role for this person, not primary person for owner-role.'),('Effective from*','YYYY-MM-DD.'),('Effective until','Exclusive date; later than start.')],
'Contact Channels': [*common,*owner_ref,('Channel type*','email, phone, fax, sms, whatsapp or website.'),('Value*','Canonical channel value; phone-family numbers in international E.164 form; website URL.'),('Purpose*','Owner-specific permitted purpose. Named contact: default/business/notification/escalation; organization: see proposal.'),('Role qualifier','Optional agreed qualifier; not a substitute for a named-contact role assignment.'),('Primary requested*','yes/no; scoped to owner/channel/purpose/qualifier.'),('Effective from*','ISO timestamp with offset, e.g. 2026-10-01T09:00:00+08:00.'),('Effective until','Exclusive timestamp with offset; later than start.'),('Evidence reference','Source/contact confirmation reference; does not mark channel verified.'),('Reviewer*','Business reviewer; collection only.')],
'Master Defaults': [*common,('Scope type*','tenant, legal_entity, company_code, procurement, sales, partner_company or company_gl.'),('Scope reference*','Business code(s) identifying exact scope; add partner/GL/company coordinate where relevant.'),('Setting*','Named setting from proposal; one decision per row.'),('Proposed value or reference*','Business value or referenced record; not an executable configuration payload.'),('Storage or gap*','Existing table/field, proposed configuration, or proposed behavior; see proposal.'),('Inheritance decision*','explicit, proposed_fallback or none; record approved source and missing/blocked behavior in notes.'),('Override decision*','allowed_by_policy, locked or to_be_decided; proposal only.'),('Effective from','Requested business start; confirm target field/date semantics.'),('Effective until','Requested business end; confirm target field/date semantics.'),('Owner*','Approver of business setting.'),('Decision*','pending, approved, approved_with_conditions or returned.'),('Evidence and notes','Approval/source and resolution behavior; collection only.')]
})

instructions = [
['Item','Instructions'],
['Purpose','athyper organization setup business collection workbook, version 1.1, 2026-09-16. Read the companion README.md.'],
['Workflow','Complete Tenants, Legal Entities, Company Codes, Operating Organizations, Company Assignments, then applicable Profiles.'],
['Required fields','* marks required workshop handover fields. It does not mean every such field is database-mandatory.'],
['Blank templates','Entry sheets are blank. Add one record per row; 100 entry rows are formatted. Extend rows as needed.'],
['References','Use business codes from the other sheets, within the same tenant. Implementers resolve system IDs.'],
['Dates','YYYY-MM-DD. Assignment end date is exclusive. End must be later than start. Blank end means open-ended.'],
['Code format','Tenant: lowercase letter then lowercase letters/digits/_/-. Other organization codes also permit a period. Length 2–63.'],
['Reference data','Use approved currency, country, time-zone and locale catalogue codes from the target environment.'],
['Owners and approvals','Owner, target launch, accounting purpose, Access, Decisions and Sign-off are collection controls, not automatic system settings.'],
['Dependencies','Use address/contact sheets for details, Master Defaults for settings decisions, and Decisions for tax, books, periods, banks, numbering and process dependencies.'],
['Address and contacts','Read address-contact-defaults-proposal.md. References are workbook keys; organization usages and named-contact channels stay separate.'],
['Purposes','Use approved owner-purpose choices; registered/headquarters additions are proposed configuration, not seeded choices.'],
['Defaults','Profile default companies must have active, currently effective membership when profiles are saved. Future membership alone is insufficient.'],
['Examples','Examples sheet is fictional and separate from entry sheets. Do not load examples into production.'],
['Limitations','No automatic cross-sheet validation, import, permission grant or activation. Business and implementation review are required.'],
['Handling','Store the completed workbook using approved business document controls. Never enter credentials.'],
]
examples = [['Record type','Tenant','Code or relationship','Illustrative values'],
['Tenant','northstar','northstar','Name/Display: Northstar Group; time zone: Asia/Kuala_Lumpur; locale: en; enabled: en;ms'],
['Legal entity','northstar','northstar.my','Legal name: Northstar Malaysia Sdn. Bhd.; type: company; country: MY; functional currency: MYR'],
['Legal entity','northstar','northstar.sg','Legal name: Northstar Singapore Pte. Ltd.; type: company; country: SG; functional currency: SGD'],
['Company code','northstar','my01','Legal entity: northstar.my; currency: MYR; country: MY; fiscal start month: 1'],
['Company code','northstar','sg01','Legal entity: northstar.sg; currency: SGD; country: SG; fiscal start month: 1'],
['Operating organization','northstar','regional.buying','Name: Regional Procurement; domain: procurement'],
['Assignment','northstar','regional.buying -> my01','Role: lead; start: 2026-01-01; end: blank'],
['Assignment','northstar','regional.buying -> sg01','Role: participant; start: 2026-01-01; end: blank'],
['Procurement profile','northstar','regional.buying','Type: shared_services; model: federated; default currency: MYR; lead company: my01'],
['Address','northstar','ADDR001','Kind: street; line1: 10 Example Avenue; city: Kuala Lumpur; country: MY; fictional collection reference'],
['Address usage','northstar','legal_entity northstar.my -> ADDR001','Purpose: correspondence; primary: yes; effective from: 2026-01-01'],
['Address usage','northstar','company_code my01 -> ADDR001','Purpose: bill_from; primary: yes; effective from: 2026-01-01; separate approved usage'],
['Contact','northstar','CONTACT001','Owner: company_code my01; contact name: Example Finance Contact; department: Finance'],
['Contact role','northstar','CONTACT001','Role: accounts_payable; primary role: yes; effective from: 2026-01-01'],
['Contact channel','northstar','contact_person CONTACT001','Channel: email; value: finance.contact@example.com; purpose: business; primary: yes; start: 2026-01-01T00:00:00+08:00'],
['Contact channel','northstar','company_code my01','Channel: email; value: finance@example.com; purpose: correspondence; primary: yes; start: 2026-01-01T00:00:00+08:00'],
['Master default','northstar','tenant northstar','Setting: timezone_code; proposed value: Asia/Kuala_Lumpur; existing tenant_profile field; explicit; decision: pending'],
['Note','','','Illustrative relationships only; registration evidence, contacts and other required collection fields still need real business input.']]
guide = [['Sheet','Column','Requirement','Guidance']]
for name, cols in fields.items():
    for label, description in cols:
        guide.append([name,label,'Workshop required' if label.endswith('*') else 'Optional / conditional',description])
    with (root/'templates'/f"{name.lower().replace(' ','-')}.csv").open('w',newline='',encoding='utf-8-sig') as f:
        csv.writer(f).writerow([x[0] for x in cols])
sheets = [('Instructions',instructions),('Field Guide',guide)] + [(name,[[c[0] for c in cols]]) for name,cols in fields.items()] + [('Examples',examples)]
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def col(n):
    result=''
    while n:
        n,r=divmod(n-1,26); result=chr(65+r)+result
    return result

def sheet_xml(name, rows):
    count=len(rows[0]); is_entry=name in fields
    widths=([28,100] if name=='Instructions' else [28,36,25,100] if name=='Field Guide' else [26,24,40,100] if name=='Examples' else [max(20,min(42,len(c)+4)) for c in rows[0]])
    columns=''.join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i,w in enumerate(widths,1))
    data=[]
    total=101 if is_entry else len(rows)
    for i in range(1,total+1):
        values=rows[i-1] if i<=len(rows) else ['']*count
        cells=''.join(f'<c r="{col(j)}{i}" s="{1 if i==1 else 2}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>' for j,v in enumerate(values,1))
        data.append(f'<row r="{i}" ht="{32 if i==1 else 44 if not is_entry else 30}" customHeight="1">{cells}</row>')
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="{NS}"><dimension ref="A1:{col(count)}{total}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>{columns}</cols><sheetData>{''.join(data)}</sheetData><autoFilter ref="A1:{col(count)}{total}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>'''
styles=f'''<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="{NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'''
ctype='http://schemas.openxmlformats.org/package/2006/content-types'
rel='http://schemas.openxmlformats.org/package/2006/relationships'
with zipfile.ZipFile(root/'organization-setup-data-collection.xlsx','w',zipfile.ZIP_DEFLATED) as z:
    overrides=''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,len(sheets)+1))
    z.writestr('[Content_Types].xml',f'<Types xmlns="{ctype}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>{overrides}</Types>')
    z.writestr('_rels/.rels',f'<Relationships xmlns="{rel}"><Relationship Id="rId1" Type="{R}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    entries=''.join(f'<sheet name="{name}" sheetId="{i}" r:id="rId{i}"/>' for i,(name,_) in enumerate(sheets,1))
    z.writestr('xl/workbook.xml',f'<workbook xmlns="{NS}" xmlns:r="{R}"><sheets>{entries}</sheets></workbook>')
    entries=''.join(f'<Relationship Id="rId{i}" Type="{R}/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1))
    z.writestr('xl/_rels/workbook.xml.rels',f'<Relationships xmlns="{rel}">{entries}<Relationship Id="rId{len(sheets)+1}" Type="{R}/styles" Target="styles.xml"/></Relationships>')
    z.writestr('xl/styles.xml',styles)
    for i,(name,rows) in enumerate(sheets,1): z.writestr(f'xl/worksheets/sheet{i}.xml',sheet_xml(name,rows))
print(f'Created workbook with {len(sheets)} sheets, {len(guide)-1} field descriptions and {len(fields)} CSV templates.')
