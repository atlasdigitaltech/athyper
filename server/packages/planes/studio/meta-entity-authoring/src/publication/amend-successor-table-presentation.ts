import type {MetaEntityGraph} from '@athyper/server-contract-meta-entity-authoring';
import type {TableEntityProduct} from '../authoring/table-product.js';
/** Amend only the detail presentation of an existing table Entity successor.
 * Its signed predecessor's fields, authorization, storage and operations survive. */
export function amendSuccessorTablePresentation(graph:MetaEntityGraph,product:TableEntityProduct):MetaEntityGraph {
  if(graph.entity.entityCode!==product.definition.entity.entityCode)throw Error('TABLE_PRESENTATION_ENTITY_MISMATCH');
  const source=product.definition.surfaces?.filter(s=>s.surfaceKind==='detail') ?? [];
  const targets=graph.surfaces?.filter(s=>s.surfaceKind==='detail') ?? [];
  if(source.length!==1||targets.length!==1||!source[0]?.layoutConfig?.recordPresentation)throw Error('TABLE_PRESENTATION_DETAIL_REQUIRED');
  return {...graph,surfaces:graph.surfaces!.map(s=>s.id===targets[0]!.id?{...s,layoutConfig:{...s.layoutConfig,recordPresentation:structuredClone(source[0]!.layoutConfig!.recordPresentation),...(source[0]!.layoutConfig!.formPresentation ? {formPresentation:structuredClone(source[0]!.layoutConfig!.formPresentation)} : {})}}:s)};
}
