import {sql,type Transaction} from 'kysely';
/** Enabled capabilities are BP facts, not Supplier/Customer identities or approvals. */
export async function readEnabledPartnerCapabilities(tenantId:string,businessPartnerId:string,tx:Transaction<Record<string,never>>){
 const rows=await sql<{supplier_enabled:boolean;customer_enabled:boolean}>`
  SELECT supplier_enabled,customer_enabled FROM master.business_partner
  WHERE tenant_id=${tenantId}::uuid AND id=${businessPartnerId}::uuid
 `.execute(tx);
 const partner=rows.rows[0];
 return (['supplier','customer'] as const).flatMap(code=>partner?.[`${code}_enabled`]===true?[{code,status:'enabled' as const}]:[]);
}
