import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {parseTableEntityProduct} from '../authoring/table-product.js';
import {amendSuccessorTablePresentation} from './amend-successor-table-presentation.js';
it('amends navigation without replacing the predecessor authorization, operations or storage',()=>{
 const product=parseTableEntityProduct(JSON.parse(readFileSync(new URL('../../../../../../../metadata/products/shared/entities/principal/definition.json',import.meta.url),'utf8')));
 const graph=structuredClone(product.definition);
 const detail=graph.surfaces!.find(s=>s.surfaceKind==='detail')!;
 const predecessor={...graph,surfaces:graph.surfaces!.map(s=>s===detail?{...s,layoutConfig:{...s.layoutConfig,recordPresentation:{schemaVersion:1,titleField:'name',sections:[],actions:[]}}}:s)};
 const amended=amendSuccessorTablePresentation(predecessor,product);
 expect(amended.runtimeProfiles).toEqual(predecessor.runtimeProfiles);
 expect(amended.operations).toEqual(predecessor.operations);
 expect(amended.operationPermissions).toEqual(predecessor.operationPermissions);
 expect(amended.fields).toEqual(predecessor.fields);
 expect(amended.surfaces![0]).toEqual(predecessor.surfaces![0]);
 expect(amended.surfaces!.find(s=>s.surfaceKind==='detail')?.layoutConfig?.recordPresentation).toEqual(detail.layoutConfig?.recordPresentation);
 expect(()=>amendSuccessorTablePresentation({...predecessor,entity:{...predecessor.entity,entityCode:'other'}},product)).toThrow('ENTITY_MISMATCH');
});
