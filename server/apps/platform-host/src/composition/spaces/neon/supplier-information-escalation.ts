import {sql,type Transaction} from 'kysely';
import type {PlaneTransactionCoordinator} from '@athyper/server-foundation/transaction';
import type {PlaneKey} from '@athyper/server-foundation/context';
type Tx=Transaction<Record<string,never>>;
/** Only the existing worker credential can invoke the bounded database-owned timer. */
export async function sweepSupplierInformation(transactions:PlaneTransactionCoordinator<Tx>,scope:{planeKey:PlaneKey;tenantId:string;principalId:string;limit?:number}) {
 if(scope.planeKey!=='neon')return;
 await transactions.run(scope.planeKey,scope,async tx=>{await sql`SELECT document.sweep_process_information_due(${scope.tenantId}::uuid,${scope.principalId}::uuid,${scope.limit??100})`.execute(tx);});
}
