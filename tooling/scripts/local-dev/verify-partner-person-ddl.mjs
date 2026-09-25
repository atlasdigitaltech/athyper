/** Rollback-only rehearsal on existing DEV; no database/instance creation or durable schema writes. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildSql} from '../../fixtures/business-partner-core/seed.mjs';
const read=p=>readFileSync(p,'utf8');
const master='server/db/ddl/planes/neon/master/';
const tables=read(master+'03_tables.sql');
const shape=tables.match(/    CONSTRAINT business_partner_person_shape_chk[\s\S]*?(?=    CONSTRAINT business_partner_code_fmt_chk)/)?.[0];
if(!shape)throw Error('Identity shape constraints missing');
const constraints=shape.trim().replace(/,\s*$/,'').replace(/CONSTRAINT /g,'ADD CONSTRAINT ');
const domain="ALTER DOMAIN master.business_partner_category_d DROP CONSTRAINT business_partner_category_d_check; ALTER DOMAIN master.business_partner_category_d ADD CONSTRAINT business_partner_category_d_check CHECK(VALUE IN ('organization','person'));";
const index=read(master+'06_indexes.sql').split('\n').find(x=>x.startsWith('CREATE UNIQUE INDEX business_partner_live_person_purpose_uq'));
if(!index)throw Error('Person-purpose index missing');
const test=read('server/db/scripts/tests/integration/business-partner-person-identity.sql').replace(/^BEGIN;$/m,'').replace(/^ROLLBACK;$/m,'');
const sql=`BEGIN; SET LOCAL lock_timeout='5s'; ${domain}
ALTER TABLE master.business_partner DROP CONSTRAINT business_partner_organization_only_chk;
ALTER TABLE master.business_partner ADD COLUMN person_id uuid, ${constraints};
ALTER TABLE master.business_partner ADD CONSTRAINT business_partner_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT;
${index}
${test}
SET CONSTRAINTS ALL DEFERRED;
${process.argv.includes('--fixtures')?buildSql(false).replace(/^BEGIN;/,'').replace(/ROLLBACK;$/,''):''}
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;`;
execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:sql,stdio:['pipe','inherit','inherit']});
