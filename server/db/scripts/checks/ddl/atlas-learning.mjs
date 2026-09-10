import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
for(const [label,path] of [['COMMON','common/ai'],['STUDIO','planes/studio/ai']]){
 const stages=['03_tables.sql','05_constraints.sql','06_indexes.sql','07_functions.sql','08_triggers.sql','10_rls.sql','11_grants.sql'];
 const blocks=stages.flatMap(stage=>{const source=readFileSync(resolve(root,'ddl',path,stage),'utf8');const block=source.match(new RegExp(`-- BEGIN ATLAS F4 LEARNING ${label}\\n([\\s\\S]*?)-- END ATLAS F4 LEARNING ${label}`));return block?[block[1]]:[];});
 const migration=`BEGIN;\nSET LOCAL lock_timeout = '5s';\n${blocks.join('')}COMMIT;\n`;
 const target=resolve(root,'migrations',`20260910_atlas_learning_${label.toLowerCase()}.sql`);
 if(process.argv.includes('--write'))writeFileSync(target,migration);
 else if(readFileSync(target,'utf8')!==migration)throw Error(`${target}: regenerate F4 migration from canonical blocks`);
 console.log(`PASS Atlas learning ${label.toLowerCase()} migration parity`);
}
