import {sql,type Transaction} from "kysely";import type {BusinessPartner360RestrictedValue} from "../record/service.js";
import {restrictedValueFromStorage} from "../protected-values/storage-contract.js";
type Tx=Transaction<Record<string,never>>;type Row=Record<string,unknown>;
/** Only invoked by the authorized, audited reveal command; never a normal projection. */
export async function readBusinessPartner360RestrictedBankValue(input:{tenantId:string;businessPartnerId:string;bankAccountLinkId:string},tx:Tx):Promise<BusinessPartner360RestrictedValue|null>{
 const row=(await sql<Row>`SELECT
   account.metadata
   FROM control.owner_type owner_type
   JOIN master.payment_instrument_link link ON link.owner_type_id=owner_type.id
   JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.payment_instrument_id
   WHERE link.tenant_id=${input.tenantId}::uuid AND link.id=${input.bankAccountLinkId}::uuid
     AND link.owner_id=${input.businessPartnerId}::uuid AND owner_type.code='business_partner'
     AND(owner_type.tenant_id IS NULL OR owner_type.tenant_id=${input.tenantId}::uuid)
     AND link.effective_from<=CURRENT_DATE AND (link.effective_until IS NULL OR link.effective_until>CURRENT_DATE)
   LIMIT 1`.execute(tx)).rows[0];
 return row ? restrictedValueFromStorage(row.metadata, undefined, true) : null;
}
