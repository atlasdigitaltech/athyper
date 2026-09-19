import assert from "node:assert/strict";
import test from "node:test";
import { planClientRoleIdTokenReconciliation, planOrganizationScopeReconciliation, planPlaneDefaultScopeReconciliation } from "./reconcile-keycloak-organization-scope.mjs";

const scope={id:"scope-org",name:"organization"};
const clients=["studio-web","neon-web","mesh-web"].map((clientId,index)=>({id:`client-${index}`,clientId,optionalClientScopes:index===0?[scope]:[]}));
test("adds organization as an optional scope without changing already-correct clients",()=>{const plan=planOrganizationScopeReconciliation(clients,scope);assert.deepEqual(plan.map((item)=>item.action),["none","add_optional_scope","add_optional_scope"]);});
test("fails closed when the scope or a plane client is missing",()=>{assert.throws(()=>planOrganizationScopeReconciliation(clients,null),/scope is missing/);assert.throws(()=>planOrganizationScopeReconciliation(clients.slice(1),scope),/studio-web/);});
test("enables client roles in ID and access tokens",()=>{const operation=planClientRoleIdTokenReconciliation([{id:"mapper-1",name:"client roles",protocolMapper:"oidc-usermodel-client-role-mapper",config:{"access.token.claim":"true","id.token.claim":"false"}}]);assert.equal(operation.action,"patch");assert.equal(operation.body.config["id.token.claim"],"true");assert.equal(operation.body.config["access.token.claim"],"true");});
test("requires roles and exact plane scopes as client defaults",()=>{const scopes=[{id:"roles",name:"roles"},{id:"studio",name:"athyper-studio-plane"},{id:"neon",name:"athyper-neon-plane"},{id:"mesh",name:"athyper-mesh-plane"}];const withDefaults=clients.map((client,index)=>({...client,defaultClientScopes:index===1?[scopes[0],scopes[2]]:[]}));const plan=planPlaneDefaultScopeReconciliation(withDefaults,scopes);assert.deepEqual(plan.filter((item)=>item.clientId==="neon-web").map((item)=>item.action),["none","none"]);assert.equal(plan.filter((item)=>item.action==="add_default_scope").length,4);});
