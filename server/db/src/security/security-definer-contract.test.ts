import assert from "node:assert/strict";
import { test } from "node:test";
import { readDefinerContract, validateDefinerContract, expectedDefinerOwner } from "./security-definer-contract.js";
import { definerCatalogErrors, runtimeRoleErrors, rlsCatalogErrors, type RoleRow, type TableRow } from "./plane-boundary-catalog.js";

const contract = await readDefinerContract();
const safeRole = (name: string, login = false): RoleRow => ({name,login,superuser:false,bypassRls:false,createDb:false,createRole:false,replication:false,inherit:false});

test("ordinary ownership is independent of a superuser DDL executor", () => {
  assert.equal(expectedDefinerOwner(contract,"shared","shared.current_tenant_id()",false,"postgres"),"athyper_definer_shared");
  assert.equal(expectedDefinerOwner(contract,"audit","audit.ensure_monthly_partitions(date, integer)",false,"postgres"),"postgres");
});
test("a known name with a new overload cannot acquire bypass ownership", () => {
  assert.throws(() => expectedDefinerOwner(contract,"ai","ai.fn_atlas_conversation_access(uuid, uuid, text)",true,"postgres"),/Unlisted RLS bypass/);
  assert.throws(() => expectedDefinerOwner(contract,"ai","ai.fn_atlas_conversation_access(uuid, uuid, boolean)",false,"postgres"),/configuration drift/);
});
test("deployed-only definers require source reconciliation before ownership changes", () => {
  assert.throws(() => expectedDefinerOwner(contract,"publication","publication.undeclared_release(uuid)",false,"postgres"),/Unregistered source/);
});
test("an ordinary owner cannot become a bypass or login role", () => {
  const changed = {...contract,roles:contract.roles.map(role => role.name === contract.ordinaryOwners.shared ? {...role,bypassRls:true} : role)};
  assert.throws(() => validateDefinerContract(changed),/RLS-bound/);
  const roles = contract.roles.map(role => ({...safeRole(role.name),bypassRls:role.bypassRls}));
  roles.find(role => role.name === contract.ordinaryOwners.shared)!.login = true;
  const errors = definerCatalogErrors([{schema:"shared",identity:"shared.current_tenant_id()",signature:"shared.current_tenant_id()",owner:"athyper_definer_shared",publicExecute:false,searchPath:"search_path=pg_catalog, shared",rowSecurityOff:false}],roles,contract,"postgres");
  assert.ok(errors.some(error => error.includes("athyper_definer_shared")));
});
test("definer contracts reject wildcard, administrative, and grant-option table privileges", () => {
  for (const privilege of ["ALL", "TRUNCATE", "SELECT WITH GRANT OPTION"]) {
    const changed = {...contract,roles:contract.roles.map((role,index) => index === 0 ? {...role,tables:[{relation:"master.principal",privileges:[privilege]}]} : role)};
    assert.throws(() => validateDefinerContract(changed),/enumerate relations and DML/);
  }
});
test("qualification rejects an indirect SET ROLE route to a bypass owner", () => {
  const roles = [safeRole("athyper_runtime",true),safeRole("athyper_worker",true),safeRole("intermediate"),{...safeRole("elevated"),bypassRls:true}];
  const errors = runtimeRoleErrors(roles,[{root:"athyper_runtime",role:"elevated",path:["athyper_runtime","intermediate","elevated"],settable:true,inheritable:false}],[]);
  assert.ok(errors.some(error => error.includes("athyper_runtime -> intermediate -> elevated")));
});
test("qualification also rejects an ordinary definer owner reachable by runtime", () => {
  const roles = [safeRole("athyper_runtime",true),safeRole("athyper_worker",true),safeRole("athyper_definer_shared")];
  assert.equal(runtimeRoleErrors(roles,[{root:"athyper_worker",role:"athyper_definer_shared",path:["athyper_worker","athyper_definer_shared"],settable:true,inheritable:false}],["athyper_definer_shared"]).length,1);
});
test("ADMIN OPTION is unsafe even with SET and INHERIT disabled", () => {
  const roles = [safeRole("athyper_runtime",true),safeRole("athyper_worker",true),{...safeRole("elevated"),bypassRls:true}];
  assert.equal(runtimeRoleErrors(roles,[{root:"athyper_runtime",role:"elevated",path:["athyper_runtime","elevated"],settable:false,inheritable:false,administrable:true}],[]).length,1);
});
const table: TableRow = {relation:"document.fixture",partition:false,tenantColumns:["tenant_id"],rlsEnabled:true,rlsForced:true,policies:[{name:"tenant",command:"*",roles:["PUBLIC"],using:"tenant_id = shared.current_tenant_id_soft()",check:null}],runtimeSelect:true,workerSelect:false,runtimeWrite:false,workerWrite:false};
test("enabled/forced parity cannot hide a tenant table without RLS", () => {
  assert.equal(rlsCatalogErrors([table,{...table,relation:"document.missing",rlsEnabled:false,rlsForced:false,policies:[]}]).length,1);
});
test("partition parents protect routed reads but directly accessible partitions require their own policies", () => {
  assert.equal(rlsCatalogErrors([table,{...table,relation:"document.fixture_partition",partition:true,rlsEnabled:false,rlsForced:false,policies:[],runtimeSelect:false}]).length,0);
  assert.equal(rlsCatalogErrors([table,{...table,relation:"document.fixture_partition",partition:true,rlsEnabled:false,rlsForced:false,policies:[]}]).length,1);
});

test("qualification rejects public, catalog-last, implicit temporary schemas, and undeclared paths", () => {
  const roles = contract.roles.map(role => ({...safeRole(role.name),bypassRls:role.bypassRls}));
  for (const searchPath of ["search_path=shared, pg_catalog", "search_path=pg_catalog, shared", "search_path=pg_catalog, public, pg_temp", "search_path=pg_catalog, untrusted, pg_temp"]) {
    const errors = definerCatalogErrors([{schema:"shared",identity:"shared.current_tenant_id()",signature:"shared.current_tenant_id()",owner:"athyper_definer_shared",publicExecute:false,searchPath,rowSecurityOff:false}],roles,contract,"postgres");
    assert.ok(errors.some(error => error.includes("search_path requires")));
  }
  assert.deepEqual(definerCatalogErrors([{schema:"shared",identity:"shared.current_tenant_id()",signature:"shared.current_tenant_id()",owner:"athyper_definer_shared",publicExecute:false,searchPath:"search_path=pg_catalog, shared, pg_temp",rowSecurityOff:false}],roles,contract,"postgres"), []);
});
test("inaccessible default-deny tables qualify without granting a placeholder policy", () => {
  assert.deepEqual(rlsCatalogErrors([{...table,policies:[],runtimeSelect:false}]), []);
  assert.equal(rlsCatalogErrors([{...table,policies:[]}]).length, 1);
});
