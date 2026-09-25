import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('network catalog matches metadata without production principal grants',()=>{
 const seed=readFileSync('server/db/ddl/planes/neon/authz/14_permission_reference_seed.sql','utf8').split('-- BEGIN BP NETWORK READ CATALOG')[1].split('-- END BP NETWORK READ CATALOG')[0];
 const section=JSON.parse(readFileSync('metadata/products/mdg/entities/business_partner/presentation.section.network.json','utf8'));
 assert.ok(seed.includes(section.authorization.viewPermission));
 assert.match(seed,/'tenant','exact'/);
 assert.doesNotMatch(seed,/INSERT INTO authz\.(group_member|group_role|role_permission)/);
});
test('DEV grant is one read permission, CATL admin only, and expires without replay extension',()=>{
 const grant=readFileSync('tooling/scripts/local-dev/grant-catl-admin-network-read.sql','utf8');
 assert.match(grant,/code='catl.admin'/);
 assert.match(grant,/code='cirrusatlantic'/);
 assert.match(grant,/interval '7 days'/);
 assert.match(grant,/IF rid IS NULL THEN/);
 assert.match(grant,/count\(\*\).*role_permission.*<>1/);
 assert.doesNotMatch(grant,/reveal|UPDATE authz\.(group_member|group_role)/);
});
