#!/usr/bin/env tsx

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

type CatalogRow = { object_key: string; definition: string };
type Difference = {
  missingInUpgrade: string[];
  extraInUpgrade: string[];
  changed: Array<{ objectKey: string; clean: string; upgrade: string }>;
};

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split("=");
    return [key, rest.join("=") || "true"];
  }),
);
const cleanUrl = args.get("--clean-url") ?? process.env.CLEAN_DATABASE_URL;
const upgradeUrl = args.get("--upgrade-url") ?? process.env.UPGRADE_DATABASE_URL;
if (!cleanUrl || !upgradeUrl) {
  throw new Error("--clean-url and --upgrade-url are required");
}

const typedRelations = [
  "business_partner_request_address",
  "business_partner_request_contact_person",
  "business_partner_request_contact_channel",
  "business_partner_request_identifier",
  "business_partner_request_tax_registration",
  "business_partner_request_classification",
  "business_partner_request_certification",
  "business_partner_request_materialization_item",
] as const;
const queries: Record<string, string> = {
  relationDispositions: `
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           c.relkind::text AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('document', 'master')
       AND c.relkind IN ('r', 'p', 'v', 'm')
       AND c.relname ~ '(business_partner|supplier|customer)'
     ORDER BY 1`,
  columns: `
    SELECT format('%I.%I', c.relname, a.attname) AS object_key,
           concat_ws('|', format_type(a.atttypid, a.atttypmod),
             a.attnotnull::text, coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
             a.attidentity, a.attgenerated) AS definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  requestExtensionColumns: `
    SELECT format('business_partner_request.%I', a.attname) AS object_key,
           concat_ws('|', format_type(a.atttypid, a.atttypmod),
             a.attnotnull::text, coalesce(pg_get_expr(d.adbin, d.adrelid), '')) AS definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = 'document' AND c.relname = 'business_partner_request'
       AND a.attname = ANY(ARRAY['extension_mode','extension_fingerprint','extension_counts'])
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  constraintSemantics: `
    SELECT format('%I.%s.%s', c.relname, con.contype,
             row_number() OVER (
               PARTITION BY c.relname, con.contype
               ORDER BY regexp_replace(pg_get_constraintdef(con.oid, true), '\s+', '', 'g') COLLATE "C"
             )) AS object_key,
           concat_ws('|', con.contype, con.convalidated::text,
             con.condeferrable::text, con.condeferred::text,
             pg_get_constraintdef(con.oid, true)) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
     ORDER BY 1`,
  supportingIndexes: `
    SELECT format('%I.%I', c.relname, i.relname) AS object_key,
           pg_get_indexdef(i.oid) AS definition
      FROM pg_index x
      JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class i ON i.oid = x.indexrelid
      LEFT JOIN pg_constraint con ON con.conindid = i.oid
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
       AND con.oid IS NULL
     ORDER BY 1`,
  rls: `
    SELECT c.relname AS object_key,
           concat_ws('|', c.relrowsecurity::text, c.relforcerowsecurity::text)
             AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
     ORDER BY 1`,
  policies: `
    SELECT format('%I.%I', c.relname, p.polname) AS object_key,
           concat_ws('|', p.polcmd, p.polpermissive::text,
             array_to_string(ARRAY(
               SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles) ORDER BY rolname
             ), ','), coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
             coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) AS definition
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
     ORDER BY 1`,
  triggers: `
    SELECT format('%I.%I', c.relname, t.tgname) AS object_key,
           concat_ws('|', t.tgenabled, pg_get_triggerdef(t.oid, true)) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'document'
       AND (
         c.relname = ANY($1::text[])
         OR (c.relname = 'business_partner_request'
             AND t.tgname = 'trg_business_partner_request_payload_boundary')
       )
       AND NOT t.tgisinternal
     ORDER BY 1`,
  functions: `
    SELECT format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
             AS object_key,
           concat_ws('|', pg_get_function_result(p.oid), l.lanname,
             p.prosecdef::text, p.provolatile, p.proparallel,
             coalesce(array_to_string(p.proconfig, ','), ''),
             pg_get_functiondef(p.oid)) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'document' AND p.proname IN (
       'fn_business_partner_payload_has_restricted_key',
       'trg_guard_business_partner_request_payload_boundary',
       'trg_guard_business_partner_request_extension'
     )
     ORDER BY 1`,
  tableOwners: `
    SELECT c.relname AS object_key, role_row.rolname AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles role_row ON role_row.oid = c.relowner
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
     ORDER BY 1`,
  tableGrants: `
    SELECT format('%I.%I', grant_row.table_name, grant_row.grantee) AS object_key,
           string_agg(grant_row.privilege_type, ',' ORDER BY grant_row.privilege_type)
             AS definition
      FROM information_schema.role_table_grants grant_row
     WHERE grant_row.table_schema = 'document'
       AND grant_row.table_name = ANY($1::text[])
       AND grant_row.grantee IN ('athyperapp','athyperadmin','PUBLIC')
     GROUP BY grant_row.table_name, grant_row.grantee
     ORDER BY 1`,
  functionGrants: `
    SELECT format('%I.%I', p.proname, role_name) AS object_key,
           has_function_privilege(role_name, p.oid, 'EXECUTE')::text AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN unnest(ARRAY['athyperapp','athyperadmin','public']) AS role_name
     WHERE n.nspname = 'document' AND p.proname IN (
       'fn_business_partner_payload_has_restricted_key',
       'trg_guard_business_partner_request_payload_boundary',
       'trg_guard_business_partner_request_extension'
     )
     ORDER BY 1`,
  comments: `
    SELECT format('%I.table', c.relname) AS object_key,
           coalesce(obj_description(c.oid, 'pg_class'), '') AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'document' AND c.relname = ANY($1::text[])
    UNION ALL
    SELECT format('business_partner_request.%I', a.attname),
           coalesce(col_description(c.oid, a.attnum), '')
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'document' AND c.relname = 'business_partner_request'
       AND a.attname = ANY(ARRAY['extension_mode','extension_fingerprint','extension_counts'])
     ORDER BY 1`,
  s2Columns: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, a.attname) AS object_key,
           concat_ws('|', format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
             coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attidentity, a.attgenerated)
             AS definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE (n.nspname, c.relname) IN (
       ('master','person'),
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  s2Constraints: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, con.conname) AS object_key,
           concat_ws('|', con.contype, con.convalidated::text, con.condeferrable::text,
             con.condeferred::text, pg_get_constraintdef(con.oid, true)) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE (n.nspname, c.relname) IN (
       ('master','person'),
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) OR con.conname IN (
       'business_partner_organization_only_chk',
       'business_partner_request_organization_boundary_chk'
     )
     ORDER BY 1`,
  s2Indexes: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, i.relname) AS object_key,
           pg_get_indexdef(i.oid) AS definition
      FROM pg_index x
      JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE (n.nspname, c.relname) IN (
       ('master','person'),
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     )
     ORDER BY 1`,
  s2Rls: `
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           concat_ws('|', c.relrowsecurity::text, c.relforcerowsecurity::text) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE (n.nspname, c.relname) IN (
       ('master','person'),
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) ORDER BY 1`,
  s2Policies: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, p.polname) AS object_key,
           concat_ws('|', p.polcmd, p.polpermissive::text,
             array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname), ','),
             coalesce(pg_get_expr(p.polqual,p.polrelid),''),
             coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) AS definition
      FROM pg_policy p
      JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname, c.relname) IN (
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) ORDER BY 1`,
  s2Triggers: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, t.tgname) AS object_key,
           concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true)) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('master','person'),
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) AND NOT t.tgisinternal ORDER BY 1`,
  s2Functions: `
    SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS object_key,
           concat_ws('|',pg_get_function_result(p.oid),l.lanname,p.prosecdef::text,p.provolatile,
             p.proparallel,coalesce(array_to_string(p.proconfig,','),''),pg_get_functiondef(p.oid)) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
     WHERE (n.nspname,p.proname) IN (
       ('master','trg_reject_person_business_partner_legacy_link_mutation'),
       ('document','fn_workforce_request_payload_has_restricted_key'),
       ('document','trg_guard_workforce_request')
     ) ORDER BY 1`,
  s2Owners: `
    SELECT format('%I.%I',n.nspname,c.relname) AS object_key, role_row.rolname AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles role_row ON role_row.oid=c.relowner
     WHERE (n.nspname,c.relname) IN (
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) ORDER BY 1`,
  s2TableGrants: `
    SELECT format('%I.%I.%I',table_schema,table_name,grantee) AS object_key,
           string_agg(privilege_type,',' ORDER BY privilege_type) AS definition
      FROM information_schema.role_table_grants
     WHERE (table_schema,table_name) IN (
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) AND grantee IN ('athyperapp','athyperadmin','PUBLIC')
     GROUP BY table_schema,table_name,grantee ORDER BY 1`,
  s2Comments: `
    SELECT format('%I.%I',n.nspname,c.relname) AS object_key,
           coalesce(obj_description(c.oid,'pg_class'),'') AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('master','person'),
       ('master','person_business_partner_legacy_link'),
       ('document','workforce_request')
     ) ORDER BY 1`,
  s3Columns: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,a.attname) AS object_key,
           concat_ws('|',format_type(a.atttypid,a.atttypmod),a.attnotnull::text,
             coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attidentity,a.attgenerated) AS definition
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE (n.nspname,c.relname) IN (
       ('master','customer'),('master','company_code_customer_profile'),
       ('control','customer_account_designation'),('control','customer_credit_review'),
       ('control','customer_lifecycle_event'))
       AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1`,
  s3Constraints: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,con.conname) AS object_key,
           concat_ws('|',con.contype,con.convalidated::text,con.condeferrable::text,
             con.condeferred::text,pg_get_constraintdef(con.oid,true)) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('master','customer'),('master','company_code_customer_profile'),
       ('control','customer_account_designation'),('control','customer_credit_review'),
       ('control','customer_lifecycle_event')) ORDER BY 1`,
  s3Indexes: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,i.relname) AS object_key,
           pg_get_indexdef(i.oid) AS definition
      FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=x.indexrelid
     WHERE (n.nspname,c.relname) IN (
       ('master','customer'),('master','company_code_customer_profile'),
       ('control','customer_account_designation'),('control','customer_credit_review'),
       ('control','customer_lifecycle_event')) ORDER BY 1`,
  s3Triggers: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,t.tgname) AS object_key,
           concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true)) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('master','customer'),('control','customer_account_designation'),
       ('control','customer_credit_review'),('control','customer_lifecycle_event'))
       AND NOT t.tgisinternal ORDER BY 1`,
  s3Functions: `
    SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS object_key,
           concat_ws('|',pg_get_function_result(p.oid),l.lanname,p.prosecdef::text,p.provolatile,
             p.proparallel,coalesce(array_to_string(p.proconfig,','),''),pg_get_functiondef(p.oid)) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     JOIN pg_language l ON l.oid=p.prolang
     WHERE (n.nspname='control' AND p.proname IN (
       'trg_validate_customer_credit_review_scope','trg_guard_customer_credit_review',
       'command_customer_lifecycle'))
        OR (n.nspname='master' AND p.proname='trg_guard_customer_lifecycle_authority')
     ORDER BY 1`,
  s3Views: `
    SELECT format('%I.%I',n.nspname,c.relname) AS object_key,
           concat_ws('|',c.relkind,pg_get_viewdef(c.oid,true)) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('control','current_customer_account_designation'),('control','current_customer_credit_limit'),
       ('master','v_business_partner_app_index'),('master','v_business_partner_role_summary')) ORDER BY 1`,
  s3RlsAndPolicies: `
    SELECT format('%I.%I',n.nspname,c.relname) AS object_key,
           concat_ws('|',c.relrowsecurity::text,c.relforcerowsecurity::text) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('control','customer_account_designation'),('control','customer_credit_review'),
       ('control','customer_lifecycle_event'))
    UNION ALL
    SELECT format('%I.%I.%I',n.nspname,c.relname,p.polname),
           concat_ws('|',p.polcmd,p.polpermissive::text,
             array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname),','),
             coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('control','customer_account_designation'),('control','customer_credit_review'),
       ('control','customer_lifecycle_event')) ORDER BY 1`,
  s3Comments: `
    SELECT format('%I.%I',n.nspname,c.relname) AS object_key,
           coalesce(obj_description(c.oid,'pg_class'),'') AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname,c.relname) IN (
       ('master','customer'),('master','company_code_customer_profile'),
       ('control','customer_account_designation'),('control','customer_credit_review'),('control','customer_lifecycle_event'),
       ('control','current_customer_account_designation'),('control','current_customer_credit_limit')) ORDER BY 1`,
  s3LifecycleTableGrants: `
    SELECT format('%I.%I.%I',grant_row.table_schema,grant_row.table_name,grant_row.grantee) AS object_key,
           string_agg(grant_row.privilege_type,',' ORDER BY grant_row.privilege_type) AS definition
      FROM information_schema.role_table_grants grant_row
     WHERE (grant_row.table_schema,grant_row.table_name) IN (
       ('master','customer'),('control','customer_lifecycle_event'))
       AND grant_row.grantee IN ('athyperapp','athyperadmin','PUBLIC')
     GROUP BY grant_row.table_schema,grant_row.table_name,grant_row.grantee ORDER BY 1`,
  s3LifecycleColumnGrants: `
    SELECT format('%I.%I.%I.%I',grant_row.table_schema,grant_row.table_name,grant_row.column_name,grant_row.grantee) AS object_key,
           string_agg(grant_row.privilege_type,',' ORDER BY grant_row.privilege_type) AS definition
      FROM information_schema.column_privileges grant_row
     WHERE grant_row.table_schema='master' AND grant_row.table_name='customer'
       AND grant_row.grantee IN ('athyperapp','athyperadmin','PUBLIC')
     GROUP BY grant_row.table_schema,grant_row.table_name,grant_row.column_name,grant_row.grantee ORDER BY 1`,
  s3LifecycleFunctionGrants: `
    SELECT role_name AS object_key,
           has_function_privilege(role_name,p.oid,'EXECUTE')::text AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN unnest(ARRAY['athyperapp','athyperadmin','public']) role_name
     WHERE n.nspname='control' AND p.proname='command_customer_lifecycle'
     ORDER BY 1`,
  s4Columns: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,a.attname) object_key,
      concat_ws('|',format_type(a.atttypid,a.atttypmod),a.attnotnull::text,coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attgenerated) definition
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE (n.nspname,c.relname) IN (('master','business_partner'),('master','business_partner_alias'),('master','supplier'),('master','customer'),('master','business_partner_relationship'),('master','business_partner_operating_organization_assignment'),('master','company_code_supplier_profile'),('master','company_code_customer_profile'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','customer_lifecycle_event'),('control','business_partner_decision_scope')) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1`,
  s4Constraints: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,con.conname) object_key,
      concat_ws('|',con.contype,con.convalidated::text,con.condeferrable::text,con.condeferred::text,pg_get_constraintdef(con.oid,true)) definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (('master','business_partner'),('master','business_partner_alias'),('master','supplier'),('master','customer'),('master','business_partner_relationship'),('master','business_partner_operating_organization_assignment'),('master','company_code_supplier_profile'),('master','company_code_customer_profile'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','customer_lifecycle_event'),('control','business_partner_decision_scope')) ORDER BY 1`,
  s4Indexes: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,i.relname) object_key,pg_get_indexdef(i.oid) definition
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=x.indexrelid
    WHERE (n.nspname,c.relname) IN (('master','business_partner_alias'),('master','business_partner_relationship'),('master','business_partner_operating_organization_assignment'),('control','business_partner_decision_scope')) ORDER BY 1`,
  s4Triggers: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,t.tgname) object_key,concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true)) definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (('master','business_partner'),('master','business_partner_alias'),('master','supplier'),('master','customer'),('master','business_partner_relationship'),('master','company_code_supplier_profile'),('master','company_code_customer_profile'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','business_partner_decision_scope')) AND NOT t.tgisinternal ORDER BY 1`,
  s4Functions: `
    SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) object_key,
      concat_ws('|',pg_get_function_result(p.oid),l.lanname,p.prosecdef::text,p.provolatile,coalesce(array_to_string(p.proconfig,','),''),pg_get_functiondef(p.oid)) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE (n.nspname,p.proname) IN (('master','trg_validate_counterparty_catalog'),('master','trg_guard_business_partner_alias_cache'),('master','trg_refresh_business_partner_alias_cache'),('master','trg_guard_partner_relationship_cycle'),('master','trg_validate_partner_profile_references'),('control','trg_validate_decision_scope'),('control','trg_materialize_legacy_decision_scope')) ORDER BY 1`,
  s4RlsPolicies: `
    SELECT format('%I.%I',n.nspname,c.relname) object_key,concat_ws('|',c.relrowsecurity::text,c.relforcerowsecurity::text) definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname) IN (('master','business_partner_alias'),('control','business_partner_decision_scope'))
    UNION ALL SELECT format('%I.%I.%I',n.nspname,c.relname,p.polname),concat_ws('|',p.polcmd,p.polpermissive::text,array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname),','),coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname) IN (('master','business_partner_alias'),('control','business_partner_decision_scope')) ORDER BY 1`,
  s5Columns: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,a.attname) object_key,concat_ws('|',format_type(a.atttypid,a.atttypmod),a.attnotnull::text,coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attgenerated) definition
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE (n.nspname,c.relname) IN (('master','business_partner'),('master','supplier'),('master','customer'),('master','business_partner_relationship'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','business_partner_mutation_evidence')) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1`,
  s5ConstraintsIndexes: `
    SELECT format('constraint.%I.%I.%I',n.nspname,c.relname,con.conname) object_key,concat_ws('|',con.contype,con.convalidated::text,pg_get_constraintdef(con.oid,true)) definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname) IN (('master','supplier'),('master','customer'),('master','business_partner_relationship'),('control','business_partner_qualification'),('control','customer_credit_review'),('control','business_partner_mutation_evidence'))
    UNION ALL SELECT format('index.%I.%I.%I',n.nspname,c.relname,i.relname),pg_get_indexdef(i.oid) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=x.indexrelid WHERE (n.nspname,c.relname)=('control','business_partner_mutation_evidence') ORDER BY 1`,
  s5Triggers: `
    SELECT format('%I.%I.%I',n.nspname,c.relname,t.tgname) object_key,concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true)) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (('master','business_partner'),('master','supplier'),('master','customer'),('master','business_partner_relationship'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','customer_lifecycle_event'),('control','business_partner_mutation_evidence')) AND NOT t.tgisinternal AND (t.tgname LIKE '%mutation%' OR t.tgname LIKE '%record_version%' OR t.tgname LIKE '%s5_evidence%' OR t.tgname LIKE '%delete_guard%') ORDER BY 1`,
  s5Functions: `
    SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) object_key,concat_ws('|',pg_get_function_result(p.oid),l.lanname,p.prosecdef::text,p.provolatile,coalesce(array_to_string(p.proconfig,','),''),pg_get_functiondef(p.oid)) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE (n.nspname,p.proname) IN (('control','fn_record_business_partner_mutation'),('control','command_business_partner_lifecycle'),('control','command_business_partner_decision'),('control','trg_enforce_business_partner_mutation_authority'),('control','trg_reject_business_partner_mutation_evidence_change'),('control','trg_record_customer_lifecycle_mutation'),('master','trg_guard_business_partner_relationship_mutation'),('master','trg_bump_business_partner_record_version')) ORDER BY 1`,
  s5RlsPolicies: `
    SELECT format('%I.%I',n.nspname,c.relname) object_key,concat_ws('|',c.relrowsecurity::text,c.relforcerowsecurity::text) definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname)=('control','business_partner_mutation_evidence')
    UNION ALL SELECT format('%I.%I.%I',n.nspname,c.relname,p.polname),concat_ws('|',p.polcmd,p.polpermissive::text,array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname),','),coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname)=('control','business_partner_mutation_evidence') ORDER BY 1`,
  s5Grants: `
    SELECT format('table.%s.%s.%s',table_schema,table_name,grantee) object_key,string_agg(privilege_type,',' ORDER BY privilege_type) definition FROM information_schema.role_table_grants WHERE (table_schema,table_name) IN (('master','business_partner'),('master','supplier'),('master','customer'),('master','business_partner_relationship'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','business_partner_mutation_evidence')) AND grantee IN('athyperapp','athyperadmin','PUBLIC') GROUP BY table_schema,table_name,grantee
    UNION ALL SELECT format('column.%s.%s.%s.%s',table_schema,table_name,column_name,grantee),string_agg(privilege_type,',' ORDER BY privilege_type) FROM information_schema.role_column_grants WHERE (table_schema,table_name) IN (('master','business_partner'),('master','supplier'),('master','customer'),('master','business_partner_relationship')) AND grantee IN('athyperapp','athyperadmin') GROUP BY table_schema,table_name,column_name,grantee
    UNION ALL SELECT format('function.%I.%I.%s',n.nspname,p.proname,role_name),has_function_privilege(role_name,p.oid,'EXECUTE')::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['athyperapp','athyperadmin','public']) role_name WHERE n.nspname='control' AND p.proname IN('fn_record_business_partner_mutation','command_business_partner_lifecycle','command_business_partner_decision') ORDER BY 1`,
};

const normalize = (value: string): string => value
  .replace(/\s+/g, " ")
  .replace(/\s*([(),;:=<>])\s*/g, "$1")
  .replace(/\s*([+!~])\s*/g, "$1")
  .replace(/;?\s*\$function\$/g, "$function$")
  .replace(/\$function\$\s*/g, "$function$")
  .trim();
const clean = postgres(cleanUrl, { max: 1, prepare: false });
const upgrade = postgres(upgradeUrl, { max: 1, prepare: false });

type DatabaseIdentity = { system_identifier: string; database_oid: string; database_name: string };
const identity = async (sql: postgres.Sql): Promise<DatabaseIdentity> => {
  const rows = await sql<DatabaseIdentity[]>`
    SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
           oid::text AS database_oid,
           datname AS database_name
      FROM pg_database
     WHERE datname = current_database()
  `;
  if (!rows[0]) throw new Error("unable to resolve database identity");
  return rows[0];
};

const capture = async (sql: postgres.Sql, query: string): Promise<Map<string, string>> => {
  const parameters = query.includes("$1") ? [typedRelations] : [];
  const rows = await sql.unsafe<CatalogRow[]>(query, parameters);
  return new Map(rows.map((row) => [row.object_key, normalize(row.definition)]));
};
const compare = (cleanState: Map<string, string>, upgradeState: Map<string, string>): Difference => ({
  missingInUpgrade: [...cleanState.keys()].filter((key) => !upgradeState.has(key)).sort(),
  extraInUpgrade: [...upgradeState.keys()].filter((key) => !cleanState.has(key)).sort(),
  changed: [...cleanState.entries()]
    .filter(([key, value]) => upgradeState.has(key) && upgradeState.get(key) !== value)
    .map(([objectKey, cleanDefinition]) => ({
      objectKey,
      clean: cleanDefinition,
      upgrade: upgradeState.get(objectKey)!,
    }))
    .sort((left, right) => left.objectKey.localeCompare(right.objectKey)),
});

try {
  const [cleanIdentity, upgradeIdentity] = await Promise.all([identity(clean), identity(upgrade)]);
  if (cleanIdentity.system_identifier === upgradeIdentity.system_identifier
    && cleanIdentity.database_oid === upgradeIdentity.database_oid) {
    throw new Error(
      `clean and upgrade inputs resolve to the same database: ${cleanIdentity.database_name}; distinct databases are required`,
    );
  }
  const differences: Record<string, Difference> = {};
  for (const [category, query] of Object.entries(queries)) {
    const [cleanState, upgradeState] = await Promise.all([
      capture(clean, query),
      capture(upgrade, query),
    ]);
    differences[category] = compare(cleanState, upgradeState);
  }

  const report = {
    schemaVersion: 1,
    scope: "S0-S5 Business Partner DDL, including security and mutation ownership",
    normalization: {
      whitespace: "collapsed",
      constraints: "compared by relation, type, validation flags, and definition; names ignored",
      indexes: "constraint-owned indexes represented by constraint semantics",
    },
    databases: { clean: cleanIdentity, upgrade: upgradeIdentity },
    differences,
  };
  const output = args.get("--json");
  if (output && output !== "true") {
    await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  let failureCount = 0;
  for (const [category, difference] of Object.entries(differences)) {
    const count = difference.missingInUpgrade.length
      + difference.extraInUpgrade.length
      + difference.changed.length;
    failureCount += count;
    process.stdout.write(`${category}: drift=${count}\n`);
  }
  if (failureCount > 0) {
    process.stderr.write(`FAIL S0-S5 Business Partner catalog drift=${failureCount}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("PASS clean and upgraded S0-S5 Business Partner catalogs are equivalent\n");
  }
} finally {
  await Promise.all([clean.end(), upgrade.end()]);
}
