import fs from "node:fs";
import cp from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
const out =
  "governance/policy/reports/business-partner-populated-final-fixtures-20260912.dev.json";
if (fs.existsSync(out)) throw Error("Preserve fixtures");
const tenant = "44444444-4444-4444-8444-444444444444",
  bp = "01a092d1-8242-7948-9ce9-6f19c38c4b27";
const ids = {
  comments: [randomUUID(), randomUUID()],
  attachments: [randomUUID(), randomUUID()],
  series: [randomUUID(), randomUUID()],
  jurisdiction: randomUUID(),
  tax: randomUUID(),
  bank: randomUUID(),
  bankReference: randomUUID(),
  bankLink: randomUUID(),
};
const text =
    "Synthetic BP independent attachment qualification. No customer data.\n",
  hash = createHash("sha256").update(text).digest("hex");
let sql = `BEGIN;SET LOCAL app.current_tenant_id='${tenant}';DO $fixture$ DECLARE actor uuid;BEGIN SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id='${tenant}' AND code='seed.three-plane-provisioner' AND status='active';PERFORM set_config('app.current_principal_id',actor::text,true);`;
for (let i = 0; i < 2; i++)
  sql += `INSERT INTO document.comment(id,tenant_id,entity_type,entity_id,commenter_id,comment_text,created_by) VALUES('${ids.comments[i]}','${tenant}','master.business_partner','${bp}',actor,'Synthetic independent ${i === 0 ? "allowed" : "denied"} comment',actor);INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES('${ids.series[i]}','${tenant}',actor);INSERT INTO document.attachment(id,tenant_id,file_name,original_filename,content_type,size_bytes,sha256,storage_bucket,storage_key,uploaded_by,created_by,status,series_id) VALUES('${ids.attachments[i]}','${tenant}','bp-final-${i}.txt','bp-final-${i}.txt','text/plain',${Buffer.byteLength(text)},'${hash}','bp-enter-documents','qualification/final/${ids.attachments[i]}.txt',actor,actor,'active','${ids.series[i]}');UPDATE document.attachment_series SET current_attachment_id='${ids.attachments[i]}' WHERE id='${ids.series[i]}';INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,link_kind,created_by) VALUES('${tenant}','master.business_partner','${bp}','${ids.series[i]}','supporting',actor);`;
sql += `INSERT INTO master.tax_jurisdiction(id,tenant_id,code,name,jurisdiction_type,country_code,status,created_by) VALUES('${ids.jurisdiction}','${tenant}','QUAL.GB.${ids.jurisdiction.slice(0, 8).toUpperCase()}','Synthetic qualification jurisdiction','country','GB','draft',actor);UPDATE master.tax_jurisdiction SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id='${ids.jurisdiction}';INSERT INTO master.business_partner_tax_registration(id,tenant_id,business_partner_id,jurisdiction_id,registration_type_code,registration_number,status,created_by) VALUES('${ids.tax}','${tenant}','${bp}','${ids.jurisdiction}','vat','SYNTHETICGB123456789','draft',actor);UPDATE master.business_partner_tax_registration SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id='${ids.tax}';INSERT INTO master.bank_provisional_reference(id,tenant_id,submitted_name,submitted_country) VALUES('${ids.bankReference}','${tenant}','Synthetic qualification bank','GB');INSERT INTO master.bank_account(id,tenant_id,provisional_bank_reference_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,created_by) VALUES('${ids.bank}','${tenant}','${ids.bankReference}','Synthetic qualification holder','iban','GB82WEST12345698765432','5432','GBP','Synthetic qualification bank','GB',actor);INSERT INTO master.bank_account_link(id,tenant_id,owner_type_id,owner_type,owner_id,relationship_role,bank_account_id,created_by) SELECT '${ids.bankLink}','${tenant}',id,'business_partner','${bp}','beneficiary','${ids.bank}',actor FROM control.owner_type WHERE code='business_partner' AND status='active';END $fixture$;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`;
cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-enter-db",
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
const report = {
  createdAt: new Date().toISOString(),
  tenant,
  businessPartnerId: bp,
  ids,
  synthetic: true,
  accessChanged: false,
  retained: true,
  objectsWritten: false,
  attachmentContentSha256: hash,
  bankVerified: false,
  description:
    "Two independent comments and attachments; synthetic tax number and sample IBAN. Fixture creation does not qualify business onboarding.",
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const upload = `import {loadConfig}from './src/config/index.ts';import{createContainer}from'./src/composition/create-container.ts';import{registerAdapters}from'./src/composition/register-adapters.ts';import{createLifecycle}from'@athyper/server-foundation/lifecycle';const config=loadConfig(),c=createContainer();registerAdapters(c,config,createLifecycle());if(c.adapters.objectStorageDocumentsBucket!=='bp-enter-documents')throw Error('ISOLATED_BUCKET_REQUIRED');for(const id of ${JSON.stringify(ids.attachments)})await c.adapters.objectStorageDocuments.put('qualification/final/'+id+'.txt',${JSON.stringify(text)},{contentType:'text/plain'});console.log('FIXTURE_OBJECTS_WRITTEN');process.exit(0);`;
const result = cp.spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-dependency-studio-api",
    "node",
    "--import",
    "tsx",
    "--input-type=module",
  ],
  { input: upload, encoding: "utf8", timeout: 30000 },
);
if (result.status || !result.stdout.includes("FIXTURE_OBJECTS_WRITTEN"))
  throw Error(
    "Fixture object upload failed; rows inventoried, no access changed",
  );
report.objectsWritten = true;
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(report);
