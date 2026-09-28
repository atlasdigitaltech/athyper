import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const registry=JSON.parse(readFileSync('governance/config/governance/entity-placeholder-packages.json','utf8'));
test('reserved entity packages have no hidden implementation or source consumers',()=>{
  const files=execFileSync('rg',['--files','apps','packages','server','-g','*.ts','-g','*.tsx','-g','*.mjs','-g','package.json'],{encoding:'utf8'}).trim().split('\n');
  const source=files.map(path=>({path,text:readFileSync(path,'utf8')}));
  for(const entry of registry.packages){
    assert.deepEqual(readdirSync(`${entry.path}/src`),['index.ts']);
    assert.equal(readFileSync(`${entry.path}/${entry.entry}`,'utf8').trim(),entry.expectedImplementation);
    assert.equal(JSON.parse(readFileSync(`${entry.path}/package.json`,'utf8')).name,entry.name);
    const consumers=source.filter(file=>!file.path.startsWith(`${entry.path}/`)&&file.text.includes(entry.name)).map(file=>file.path);
    assert.deepEqual(consumers,[],`${entry.name}: re-review placeholder status when consumers appear`);
  }
});
