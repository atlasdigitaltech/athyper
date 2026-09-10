export type CatalogRow = { object_key: string; definition: string };
export type Drift = {
  missing_in_live: string[];
  extra_in_live: string[];
  changed: Array<{ object_key: string; target: string; live: string }>;
};

export const catalogQueries: Record<string, string> = {
  views: `
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           pg_get_viewdef(c.oid, false) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('v','m')
     ORDER BY 1`,
  relation_security: `
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           jsonb_build_array(c.relkind, pg_get_userbyid(c.relowner),
             ARRAY(SELECT option FROM unnest(c.reloptions) option ORDER BY option),
             ARRAY(SELECT jsonb_build_array(
               pg_get_userbyid(acl.grantor),
               CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee)::text END,
               acl.privilege_type, acl.is_grantable)::text
               FROM aclexplode(coalesce(c.relacl,
                 acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))) acl
               ORDER BY 1)
           )::text AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','S','f')
     ORDER BY 1`,
  column_privileges: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, a.attname) AS object_key,
           ARRAY(SELECT jsonb_build_array(pg_get_userbyid(acl.grantor),
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee)::text END,
             acl.privilege_type, acl.is_grantable)::text
             FROM aclexplode(a.attacl) acl ORDER BY 1)::text AS definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  function_security: `
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
             pg_get_function_identity_arguments(p.oid)) AS object_key,
           jsonb_build_array(pg_get_userbyid(p.proowner),
             ARRAY(SELECT jsonb_build_array(pg_get_userbyid(acl.grantor),
               CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee)::text END,
               acl.privilege_type, acl.is_grantable)::text
               FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl ORDER BY 1)
           )::text AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  columns: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, a.attname) AS object_key,
           concat_ws('|',
             format_type(a.atttypid, a.atttypmod),
             CASE WHEN a.attnotnull THEN 'not_null' ELSE 'nullable' END,
             coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
             a.attidentity, a.attgenerated,
             coalesce(coll.collname, '')
           ) AS definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      LEFT JOIN pg_collation coll ON coll.oid = a.attcollation AND a.attcollation <> 0
     WHERE n.nspname = ANY($1::text[])
       AND c.relkind IN ('r','p','v','m')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  domains: `
    SELECT format('%I.%I', n.nspname, t.typname) AS object_key,
           concat_ws('|', format_type(t.typbasetype, t.typtypmod),
             t.typnotnull::text, coalesce(pg_get_expr(t.typdefaultbin, 0), ''),
             coalesce(string_agg(pg_get_constraintdef(con.oid, true), ';' ORDER BY con.conname), '')
           ) AS definition
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      LEFT JOIN pg_constraint con ON con.contypid = t.oid
     WHERE n.nspname = ANY($1::text[]) AND t.typtype = 'd'
     GROUP BY n.nspname, t.typname, t.typbasetype, t.typtypmod,
              t.typnotnull, t.typdefaultbin
     ORDER BY 1`,
  constraints: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, con.conname) AS object_key,
           concat_ws('|', con.contype, con.convalidated::text,
             con.condeferrable::text, con.condeferred::text,
             pg_get_constraintdef(con.oid, true)) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  indexes: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, i.relname) AS object_key,
           pg_get_indexdef(i.oid) AS definition
      FROM pg_index x
      JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  rls: `
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           concat_ws('|', c.relrowsecurity::text, c.relforcerowsecurity::text) AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p')
     ORDER BY 1`,
  policies: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, p.polname) AS object_key,
           concat_ws('|', p.polcmd, p.polpermissive::text,
             array_to_string(ARRAY(
               SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles) ORDER BY rolname
             ), ','),
             coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
             coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
           ) AS definition
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  functions: `
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
             pg_get_function_identity_arguments(p.oid)) AS object_key,
           concat_ws('|', pg_get_function_result(p.oid), l.lanname,
             p.prosecdef::text, p.provolatile, p.proparallel,
             coalesce(array_to_string(p.proconfig, ','), ''),
             pg_get_functiondef(p.oid)) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  triggers: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, t.tgname) AS object_key,
           concat_ws('|', t.tgenabled, pg_get_triggerdef(t.oid, true)) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND NOT t.tgisinternal
     ORDER BY 1`,
};

// Catalog SQL can contain significant whitespace in literals and function bodies.
export function catalogMap(rows: readonly CatalogRow[]): Map<string, string> {
  return new Map(rows.map((row) => [row.object_key, row.definition]));
}

export function compare(targetMap: Map<string, string>, liveMap: Map<string, string>): Drift {
  const missing_in_live = [...targetMap.keys()].filter((key) => !liveMap.has(key)).sort();
  const extra_in_live = [...liveMap.keys()].filter((key) => !targetMap.has(key)).sort();
  const changed = [...targetMap.entries()]
    .filter(([key, value]) => liveMap.has(key) && liveMap.get(key) !== value)
    .map(([object_key, targetDefinition]) => ({
      object_key,
      target: targetDefinition,
      live: liveMap.get(object_key)!,
    }))
    .sort((a, b) => a.object_key.localeCompare(b.object_key));
  return { missing_in_live, extra_in_live, changed };
}
