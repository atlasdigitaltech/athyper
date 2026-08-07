import { sql, type Transaction } from "kysely";

import type { PlaneDatabaseRegistry, RuntimeDatabase } from "../runtime/plane-database-registry.js";
import type { AdmittedIdentity, IdentityAdmissionRepository, IdentityCoordinate } from "./identity-admission.repository.js";

/** Frozen compatibility implementation of the pre-canonical direct-join path. */
export class LegacySqlIdentityAdmissionRepository implements IdentityAdmissionRepository {
  constructor(private readonly databases: PlaneDatabaseRegistry) {}

  async resolve(coordinate: IdentityCoordinate): Promise<AdmittedIdentity | null> {
    const binding = this.databases.forPlane(coordinate.planeKey);
    return binding.db.transaction().execute(async (trx) => {
      await establish(trx,coordinate.tenantId,binding.databasePlane);
      const result=await sql<any>`
        SELECT t.code tenant_code,t.name tenant_name,p.id::text principal_id,p.principal_type::text principal_type,p.auth_epoch,
          b.id::text identity_binding_id,b.status::text binding_status,
          m.id::text membership_id,m.membership_kind::text membership_kind,m.status::text membership_status,
          m.effective_from membership_effective_from,m.effective_until membership_effective_until
        FROM master.tenant t
        JOIN master.principal_identity_binding b ON b.tenant_id=t.id
          AND b.provider_code=${coordinate.providerCode}::master.identity_provider_d
          AND b.realm_key=lower(btrim(${coordinate.realmKey})) AND b.subject_id=btrim(${coordinate.subjectId})
        JOIN master.principal p ON p.tenant_id=b.tenant_id AND p.id=b.principal_id
        JOIN authz.plane_membership m ON m.tenant_id=p.tenant_id AND m.principal_id=p.id
        WHERE t.id=${coordinate.tenantId}::uuid AND t.status='active' AND p.status='active' AND b.status='active'
          AND m.status='active' AND m.effective_from<=statement_timestamp()
          AND (m.effective_until IS NULL OR m.effective_until>statement_timestamp())
        ORDER BY m.effective_from DESC,m.id LIMIT 1`.execute(trx);
      const row=result.rows[0]; if(!row)return null;
      return Object.freeze({planeKey:coordinate.planeKey,databasePlane:binding.databasePlane,tenantId:coordinate.tenantId,
        tenantCode:row.tenant_code,tenantName:row.tenant_name,principalId:row.principal_id,identityBindingId:row.identity_binding_id,
        principalType:row.principal_type,authEpoch:Number(row.auth_epoch),membershipId:row.membership_id,membershipKind:row.membership_kind,
        bindingStatus:row.binding_status,bindingEffectiveFrom:null,bindingEffectiveUntil:null,
        membershipStatus:row.membership_status,membershipEffectiveFrom:iso(row.membership_effective_from),membershipEffectiveUntil:iso(row.membership_effective_until)});
    });
  }

  async resolveCandidates(input: Omit<IdentityCoordinate,"tenantId"> & {readonly tenantIds:readonly string[]}): Promise<AdmittedIdentity[]> {
    const rows=await Promise.all([...new Set(input.tenantIds)].map(tenantId=>this.resolve({...input,tenantId})));
    return rows.filter((row):row is AdmittedIdentity=>row!==null);
  }
}
async function establish(trx:Transaction<Record<string,any>>,tenantId:string,plane:string){await sql`SELECT set_config('app.database_plane',${plane},true),set_config('app.current_tenant_id',${tenantId},true)`.execute(trx as unknown as RuntimeDatabase);}
function iso(value:Date|string|null):string|null{return value===null?null:value instanceof Date?value.toISOString():new Date(value).toISOString();}
