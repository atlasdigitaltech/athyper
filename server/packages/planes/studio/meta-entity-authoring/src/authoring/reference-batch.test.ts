import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseSharedReferenceProduct,compileSharedReferenceProduct} from './product.js';
for(const entity of ['currency','language']) it(`qualifies ${entity} through Country's shared read-only reference contract on all planes`,()=>{
 const source=JSON.parse(readFileSync(new URL(`../../../../../../../metadata/products/shared/entities/${entity}/definition.json`,import.meta.url),'utf8'));
 const product=parseSharedReferenceProduct(source);
 for(const plane of ['studio','neon','mesh'] as const){
  const {graph}=compileSharedReferenceProduct(product,plane);
  expect(graph.runtimeProfiles?.[0]).toMatchObject({storageSchema:'shared',storageObject:entity,storagePlane:plane,writeMode:'none'});
  expect(graph.operations?.map(operation=>operation.operationKey).sort()).toEqual(['list','read']);
  expect(graph.operationPermissions?.every(binding=>binding.permissionCode==='common.platform.reference.view')).toBe(true);
  expect(graph.fields.every(field=>field.writeMode==='read_only')).toBe(true);
  if(entity==='currency')expect(graph.fields.find(field=>field.fieldKey==='minor_units')?.dataType).toBe('integer');
 }
});
