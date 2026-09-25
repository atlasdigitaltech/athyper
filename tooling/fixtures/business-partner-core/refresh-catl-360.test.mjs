import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enrichmentSql} from './refresh-catl-360.mjs';
test('enrichment is scoped, additive and uses existing references and organization writer',()=>{
 const sql=enrichmentSql();
 assert.match(sql,/code='cirrusatlantic'/);
 assert.match(sql,/Expected CATL demo partner missing/);
 assert.match(sql,/Demo identity collision/);
 assert.match(sql,/update_business_partner_organization_identity/);
 assert.match(sql,/ON CONFLICT/);
 assert.doesNotMatch(sql,/\b(DELETE|TRUNCATE|DROP|ALTER)\b/i);
 assert.doesNotMatch(sql,/INSERT INTO (authz|shared)\./);
 assert.doesNotMatch(sql,/SET (verified_at|is_verified|account_id_value)/);
 assert.ok(sql.endsWith('COMMIT;'));
});
