import {sql} from 'kysely';
import type {RecordDatabase} from '@athyper/server-service-records';
import {qualifyInstalledProfileSource} from './profile-source-qualification.js';
/** Independent action qualification. Source resolution can be published without
 * granting HR linkage; the action needs its bounded target reader too. */
export async function qualifyInstalledPrincipalLink(plane:string,database:RecordDatabase):Promise<boolean> {
  if(plane!=='neon' || !await qualifyInstalledProfileSource(plane,database))return false;
  const result=await sql<{qualified:boolean}>`SELECT current_database() LIKE '%neon' AND EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid=to_regprocedure('master.entity_person_link_target_v1(uuid,uuid)')
      AND p.prosecdef AND (r.rolsuper OR r.rolbypassrls)
      AND p.proconfig @> ARRAY['row_security=off']::text[]
      AND has_function_privilege('athyperapp',p.oid,'EXECUTE')
      AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) AS qualified`.execute(database);
  return result.rows[0]?.qualified===true;
}
