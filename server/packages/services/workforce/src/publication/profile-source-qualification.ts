import {sql} from "kysely";
import type {RecordDatabase} from "@athyper/server-service-records";

/** Installed reader ownership, RLS completeness and all write fences must be
 * present. A compiled resolver name alone does not admit a publication. */
export async function qualifyInstalledProfileSource(plane:string,database:RecordDatabase):Promise<boolean> {
  if(plane==='studio'||plane==='mesh') {
    const result=await sql<{qualified:boolean}>`SELECT
      current_database() LIKE ${'%' + plane}
      AND (SELECT count(*) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
        WHERE p.oid IN(to_regprocedure('master.entity_projected_profile_source_v1(uuid,uuid)'),
          to_regprocedure('master.trg_projected_profile_source_fence()'),to_regprocedure('master.trg_projected_profile_source_guard()'))
          AND p.prosecdef AND (r.rolsuper OR r.rolbypassrls) AND p.proconfig @> ARRAY['row_security=off']::text[]
          AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))=3
      AND has_function_privilege('athyperapp',to_regprocedure('master.entity_projected_profile_source_v1(uuid,uuid)'),'EXECUTE')
      AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('master.principal_identity_binding')
        AND tgname='trg_projected_profile_source_fence' AND tgtype=31 AND tgenabled IN('O','A')
        AND tgfoid=to_regprocedure('master.trg_projected_profile_source_fence()'))
      AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('master.principal_profile')
        AND tgname='trg_projected_profile_source_guard' AND tgtype=23 AND tgenabled IN('O','A')
        AND tgfoid=to_regprocedure('master.trg_projected_profile_source_guard()')) AS qualified`.execute(database);
    return result.rows[0]?.qualified===true;
  }
  if(plane!=="neon")return false;
  const result=await sql<{qualified:boolean}>`SELECT
    EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=to_regprocedure('master.entity_profile_source_v1(uuid,uuid)')
        AND p.prosecdef AND (r.rolsuper OR r.rolbypassrls)
        AND p.proconfig @> ARRAY['row_security=off']::text[]
        AND has_function_privilege('athyperapp',p.oid,'EXECUTE'))
    AND (SELECT count(*) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid IN(to_regprocedure('master.entity_profile_source_v1(uuid,uuid)'),
        to_regprocedure('master.trg_profile_source_fence()'),
        to_regprocedure('master.trg_principal_profile_source_guard()'),
        to_regprocedure('master.entity_link_person_v1(uuid,uuid,uuid,text)'))
        AND p.prosecdef AND (r.rolsuper OR r.rolbypassrls)
        AND p.proconfig @> ARRAY['row_security=off']::text[]
        AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))=4
    AND (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND t.tgname='trg_profile_source_fence' AND t.tgtype=31
      AND t.tgfoid=to_regprocedure('master.trg_profile_source_fence()')
      AND t.tgrelid IN(to_regclass('master.principal_person_link'),to_regclass('master.employee'),
        to_regclass('master.principal_identity_binding')))=3
    AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('master.principal_profile')
      AND t.tgname='trg_principal_profile_source_guard' AND t.tgenabled IN ('O','A') AND t.tgtype=23
      AND t.tgfoid=to_regprocedure('master.trg_principal_profile_source_guard()'))
    AND NOT has_table_privilege('athyperapp',to_regclass('master.principal_person_link'),'INSERT,UPDATE,DELETE')
    AS qualified`.execute(database);
  return result.rows[0]?.qualified===true;
}
