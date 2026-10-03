import { readFile } from "node:fs/promises";

export interface DefinerException {
  readonly signature: string;
  readonly owner: string;
  readonly rowSecurityOff: boolean;
  readonly reason: string;
}
export interface DefinerRole {
  readonly name: string;
  readonly bypassRls: boolean;
  readonly schemas: readonly string[];
  readonly tables: readonly { readonly relation: string; readonly privileges: readonly string[] }[];
  readonly functions: readonly string[];
  readonly tenantReadPolicies?: readonly string[];
  readonly policies?: readonly {
    readonly relation: string;
    readonly command: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
    readonly using?: string;
    readonly check?: string;
    readonly reason: string;
  }[];
}
export interface DefinerContract {
  readonly schemaVersion: 1;
  readonly sourceSignatures: readonly string[];
  readonly ordinaryOwners: Readonly<Record<string, string>>;
  readonly exceptions: readonly DefinerException[];
  readonly roles: readonly DefinerRole[];
}
export const definerContractUrl = new URL("../../contracts/security/security-definer-ownership.v1.json", import.meta.url);
const identifier = /^[a-z_][a-z0-9_]{0,62}$/;
const signature = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_., \[\]]*\)$/;

export function validateDefinerContract(value: DefinerContract): DefinerContract {
  if (value.schemaVersion !== 1 || !value.ordinaryOwners || !Array.isArray(value.roles) || !Array.isArray(value.exceptions))
    throw new TypeError("Invalid definer ownership contract");
  const declaredRoles: readonly DefinerRole[] = value.roles;
  if (!Array.isArray(value.sourceSignatures) || new Set(value.sourceSignatures).size!==value.sourceSignatures.length || value.sourceSignatures.some((identity: string) => !signature.test(identity)))
    throw new TypeError("Source definers require unique exact signatures");
  const roles = new Map(declaredRoles.map(role => [role.name, role]));
  if (roles.size !== value.roles.length) throw new TypeError("Duplicate definer role");
  for (const [schema, owner] of Object.entries(value.ordinaryOwners)) {
    if (!identifier.test(schema) || !identifier.test(owner) || !roles.has(owner) || roles.get(owner)!.bypassRls)
      throw new TypeError(`Ordinary owner must be a declared RLS-bound role: ${schema}`);
  }
  const signatures = new Set<string>();
  for (const exception of value.exceptions) {
    if (!signature.test(exception.signature) || signatures.has(exception.signature) || !exception.reason.trim() ||
        typeof exception.rowSecurityOff !== "boolean") throw new TypeError("Invalid or duplicate definer exception");
    signatures.add(exception.signature);
    if (!value.sourceSignatures.includes(exception.signature)) throw new TypeError("Definer exception must have a source signature");
    if (!roles.has(exception.owner) && !["$ddlOwner", "athyper_projection_owner", "athyper_publication_recovery_owner"].includes(exception.owner))
      throw new TypeError(`Undeclared definer exception owner: ${exception.owner}`);
    if (exception.rowSecurityOff && !roles.get(exception.owner)?.bypassRls)
      throw new TypeError("Explicit row_security=off requires a declared bypass owner");
  }
  for (const role of declaredRoles) {
    if (!identifier.test(role.name) || typeof role.bypassRls !== "boolean" || role.schemas.some(schema => !identifier.test(schema)))
      throw new TypeError("Invalid definer role grant");
    if (role.bypassRls && !value.exceptions.some(entry => entry.owner === role.name))
      throw new TypeError("Bypass owner requires an explicit signature exception");
    for (const table of role.tables) {
      if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(table.relation) || !table.privileges.length ||
          table.privileges.some(privilege => !["SELECT", "INSERT", "UPDATE", "DELETE"].includes(privilege)))
        throw new TypeError("Definer grants must enumerate relations and DML privileges");
    }
    if (role.functions.some(fn => !signature.test(fn))) throw new TypeError("Definer EXECUTE grants require exact signatures");
    if (role.tenantReadPolicies?.some(relation => !role.tables.some(table => table.relation === relation && table.privileges.includes("SELECT"))))
      throw new TypeError("Tenant-read owner policies require an explicit SELECT grant");
    for (const policy of role.policies ?? []) {
      if (!role.tables.some(table => table.relation===policy.relation && (policy.command==='ALL' || table.privileges.includes(policy.command))) || !["ALL","SELECT","INSERT","UPDATE","DELETE"].includes(policy.command) || !policy.reason.trim() ||
          [policy.using,policy.check].some(expression => expression !== undefined && (!expression.trim() || expression.includes(';'))))
        throw new TypeError("Owner policies require a declared relation, command, and fixed expression");
      if ((policy.command==='INSERT' && policy.using !== undefined) || (['SELECT','DELETE'].includes(policy.command) && policy.check !== undefined))
        throw new TypeError("Owner policy clauses must match their command");
      if (policy.using===undefined && policy.check===undefined)
        throw new TypeError("Owner policies require an explicit guard");
    }
  }
  return value;
}

export async function readDefinerContract(): Promise<DefinerContract> {
  return validateDefinerContract(JSON.parse(await readFile(definerContractUrl, "utf8")) as DefinerContract);
}

export function expectedDefinerOwner(contract: DefinerContract, schema: string, identity: string, rowSecurityOff: boolean, ddlOwner: string): string {
  const exception = contract.exceptions.find(entry => entry.signature === identity);
  if (rowSecurityOff && !exception?.rowSecurityOff) throw new Error(`Unlisted RLS bypass signature: ${identity}`);
  if (exception && exception.rowSecurityOff !== rowSecurityOff) throw new Error(`RLS configuration drift: ${identity}`);
  if (!contract.sourceSignatures.includes(identity)) throw new Error(`Unregistered source definer signature: ${identity}`);
  const owner = exception?.owner ?? contract.ordinaryOwners[schema];
  if (!owner) throw new Error(`Unregistered definer schema: ${schema}`);
  return owner === "$ddlOwner" ? ddlOwner : owner;
}

const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** Generated grants are a fixed reviewable contract. New routine bodies cannot
 * silently expand privileges during deployment. Missing plane-local objects are
 * omitted; they remain listed in the cross-plane source contract. */
export function definerPrivilegesSql(contract: DefinerContract): string {
  const payload = literal(JSON.stringify(contract.roles, null, 2));
  return `-- Generated by scripts/checks/security/generate-security-definer-contract.ts.
-- Source: contracts/security/security-definer-ownership.v1.json.
-- No table ownership, administrative privileges, runtime membership, or blanket grants.
DO $definer_privileges$
DECLARE
    role_contract jsonb;
    object_contract jsonb;
    schema_name text;
    routine_signature text;
    role_name text;
    policy_contract jsonb;
    old_policy record;
    policy_index integer;
BEGIN
    FOR role_contract IN SELECT value FROM jsonb_array_elements(${payload}::jsonb) LOOP
        role_name := role_contract->>'name';
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
        END IF;
        EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT %s',
            role_name, CASE WHEN (role_contract->>'bypassRls')::boolean THEN 'BYPASSRLS' ELSE 'NOBYPASSRLS' END);
        IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = role_name)) THEN
            RAISE EXCEPTION 'Definer owner % must not inherit or assume other roles', role_name;
        END IF;
        FOR schema_name IN SELECT jsonb_array_elements_text(role_contract->'schemas') LOOP
            IF to_regnamespace(schema_name) IS NOT NULL THEN
                EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, role_name);
            END IF;
        END LOOP;
        FOR object_contract IN SELECT value FROM jsonb_array_elements(role_contract->'tables') LOOP
            IF to_regclass(object_contract->>'relation') IS NOT NULL THEN
                EXECUTE format('GRANT %s ON TABLE %s TO %I',
                    (SELECT string_agg(value, ',') FROM jsonb_array_elements_text(object_contract->'privileges')),
                    (object_contract->>'relation')::regclass, role_name);
            END IF;
        END LOOP;
        FOR routine_signature IN SELECT jsonb_array_elements_text(role_contract->'functions') LOOP
            IF to_regprocedure(routine_signature) IS NOT NULL THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', routine_signature::regprocedure, role_name);
            END IF;
        END LOOP;
        FOR routine_signature IN SELECT jsonb_array_elements_text(COALESCE(role_contract->'tenantReadPolicies','[]'::jsonb)) LOOP
            IF to_regclass(routine_signature) IS NOT NULL THEN
                EXECUTE format('DROP POLICY IF EXISTS %I ON %s', role_name || '_tenant_read', routine_signature::regclass);
                EXECUTE format('CREATE POLICY %I ON %s FOR SELECT TO %I USING (tenant_id = shared.current_tenant_id_soft())',
                    role_name || '_tenant_read', routine_signature::regclass, role_name);
            END IF;
        END LOOP;
        -- Reconcile only this contract's reserved policy namespace so a stricter
        -- successor cannot leave an older permissive policy active alongside it.
        FOR old_policy IN SELECT pol.polname,pol.polrelid::regclass AS relation FROM pg_policy pol
            WHERE starts_with(pol.polname,role_name || '_p_') AND (SELECT oid FROM pg_roles WHERE rolname=role_name)=ANY(pol.polroles) LOOP
            EXECUTE format('DROP POLICY %I ON %s',old_policy.polname,old_policy.relation);
        END LOOP;
        policy_index := 0;
        FOR policy_contract IN SELECT value FROM jsonb_array_elements(COALESCE(role_contract->'policies','[]'::jsonb)) LOOP
            IF to_regclass(policy_contract->>'relation') IS NOT NULL THEN
                EXECUTE format('CREATE POLICY %I ON %s FOR %s TO %I%s%s',
                    role_name || '_p_' || policy_index, (policy_contract->>'relation')::regclass,policy_contract->>'command',role_name,
                    CASE WHEN policy_contract ? 'using' THEN ' USING (' || (policy_contract->>'using') || ')' ELSE '' END,
                    CASE WHEN policy_contract ? 'check' THEN ' WITH CHECK (' || (policy_contract->>'check') || ')' ELSE '' END);
            END IF;
            policy_index := policy_index + 1;
        END LOOP;
    END LOOP;
END
$definer_privileges$;
`;
}

export function trustedDefinerSchemas(contract: DefinerContract): readonly string[] {
  return [...new Set(contract.roles.flatMap(role => role.schemas))].filter(schema => schema !== "public").sort();
}

export function definerHardeningSql(contract: DefinerContract): string {
  const trustedSchemas = literal(JSON.stringify(trustedDefinerSchemas(contract)));
  const owners = literal(JSON.stringify(contract.ordinaryOwners, null, 2));
  const exceptions = literal(JSON.stringify(contract.exceptions, null, 2));
  const sourceSignatures = literal(JSON.stringify(contract.sourceSignatures, null, 2));
  return `-- Generated by scripts/checks/security/generate-security-definer-contract.ts.
-- Final hardening must run after every plane manifest entry.
DO $hardening$
DECLARE
    routine record;
    exception jsonb;
    target_owner text;
    identity_signature text;
    configured_path text;
    path_schema text;
    trusted_path text[];
BEGIN
    FOR routine IN
        SELECT p.oid, p.prokind, p.proconfig, n.nspname AS schema_name, p.proname AS routine_name,
               pg_get_function_identity_arguments(p.oid) AS identity_arguments,
               oidvectortypes(p.proargtypes) AS argument_types
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           AND n.nspname NOT LIKE 'pg_%'
    LOOP
        identity_signature := routine.schema_name || '.' || routine.routine_name || '(' || routine.argument_types || ')';
        SELECT value INTO exception FROM jsonb_array_elements(${exceptions}::jsonb)
            WHERE value->>'signature' = identity_signature;
        IF ('row_security=off' = ANY(COALESCE(routine.proconfig, ARRAY[]::text[])))
           IS DISTINCT FROM COALESCE((exception->>'rowSecurityOff')::boolean, false) THEN
            RAISE EXCEPTION 'Unlisted or changed RLS bypass signature: %', identity_signature;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${sourceSignatures}::jsonb) approved(signature) WHERE approved.signature=identity_signature) THEN
            RAISE EXCEPTION 'Unregistered source definer signature: %; reconcile catalog drift before applying ownership changes', identity_signature;
        END IF;
        target_owner := COALESCE(exception->>'owner', ${owners}::jsonb->>routine.schema_name);
        IF target_owner = '$ddlOwner' THEN target_owner := current_user; END IF;
        IF target_owner IS NULL THEN RAISE EXCEPTION 'Unregistered definer schema: %', routine.schema_name; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_owner) THEN
            RAISE EXCEPTION 'Definer owner % does not exist', target_owner;
        END IF;
        IF exception IS NULL AND EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname = target_owner AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb OR rolreplication)
        ) THEN RAISE EXCEPTION 'Ordinary definer owner % must be non-login and RLS-bound', target_owner; END IF;
        IF routine.prokind = 'p' THEN
            EXECUTE format('ALTER PROCEDURE %I.%I(%s) OWNER TO %I', routine.schema_name, routine.routine_name, routine.identity_arguments, target_owner);
            EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM PUBLIC', routine.schema_name, routine.routine_name, routine.identity_arguments);
        ELSE
            EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', routine.schema_name, routine.routine_name, routine.identity_arguments, target_owner);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', routine.schema_name, routine.routine_name, routine.identity_arguments);
        END IF;
        SELECT substring(setting FROM length('search_path=') + 1) INTO configured_path
          FROM unnest(COALESCE(routine.proconfig, ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%';
        IF configured_path IS NULL THEN
            RAISE EXCEPTION 'SECURITY DEFINER % lacks an explicit search_path', identity_signature;
        END IF;
        trusted_path := ARRAY['pg_catalog'];
        FOREACH path_schema IN ARRAY string_to_array(configured_path, ',') LOOP
            path_schema := trim(both '"' FROM btrim(path_schema));
            IF path_schema IN ('pg_catalog', 'pg_temp') THEN CONTINUE; END IF;
            IF NOT ${trustedSchemas}::jsonb ? path_schema THEN
                RAISE EXCEPTION 'SECURITY DEFINER % has an untrusted search_path schema: %', identity_signature, path_schema;
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_namespace n,
                    LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
                WHERE n.nspname=path_schema AND acl.grantee=0 AND acl.privilege_type='CREATE'
            ) OR EXISTS (
                SELECT 1 FROM pg_roles r WHERE r.rolname IN ('athyper_runtime', 'athyper_worker')
                  AND to_regnamespace(path_schema) IS NOT NULL
                  AND has_schema_privilege(r.oid, to_regnamespace(path_schema), 'CREATE')
            ) THEN
                RAISE EXCEPTION 'SECURITY DEFINER % search_path schema % is writable by runtime or PUBLIC', identity_signature, path_schema;
            END IF;
            IF NOT path_schema = ANY(trusted_path) THEN trusted_path := array_append(trusted_path, path_schema); END IF;
        END LOOP;
        trusted_path := array_append(trusted_path, 'pg_temp');
        EXECUTE format('ALTER %s %I.%I(%s) SET search_path = %s',
            CASE WHEN routine.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
            routine.schema_name, routine.routine_name, routine.identity_arguments,
            (SELECT string_agg(quote_ident(value), ', ') FROM unnest(trusted_path) value));
    END LOOP;
END
$hardening$;
`;
}
