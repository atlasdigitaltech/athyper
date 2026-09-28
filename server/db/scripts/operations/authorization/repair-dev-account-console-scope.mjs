#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !["--check", "--confirm=DEV-ACCOUNT-CONSOLE-ROLES"].includes(args[0])) throw Error("Explicit check or DEV confirmation required");
  const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-iam-1"], { encoding: "utf8" }))[0];
  assertDevContainer(container);
  const env = Object.fromEntries(container.Config.Env.map(value => { const i=value.indexOf("="); return [value.slice(0,i),value.slice(i+1)]; }));
  const mount = container.Mounts.find(m => m.Destination === "/run/secrets/iam-admin-password");
  if (!mount?.Source.includes("/.athyper/instances/dev/secrets/")) throw Error("Wrong DEV credential mount");
  const ip = Object.values(container.NetworkSettings.Networks)[0]?.IPAddress;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw Error("DEV identity network unavailable");
  const base = `http://${ip}:${env.KC_HTTP_PORT || "8080"}`;
  const response = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: "POST", signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: "admin-cli", grant_type: "password", username: env.KC_BOOTSTRAP_ADMIN_USERNAME,
      password: readFileSync(mount.Source, "utf8").trim() }) });
  if (!response.ok) throw Error(`DEV administration authentication failed: ${response.status}`);
  const { access_token } = await response.json();
  const request = async (path, method = "GET") => {
    const result = await fetch(`${base}/admin/realms/platform-control${path}`, { method, signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${access_token}` } });
    if (!result.ok) throw Error(`Account console ${method} failed: ${result.status}`);
    return result.status === 204 ? undefined : result.json();
  };
  const clients = await request("/clients?clientId=account-console");
  if (clients.length !== 1) throw Error("Expected exactly one account console");
  const client = clients[0];
  if (!client.enabled || !client.publicClient || client.fullScopeAllowed !== false) throw Error("Unexpected account console security configuration");
  const scopes = (await request("/client-scopes")).filter(scope => scope.name === "roles");
  if (scopes.length !== 1 || scopes[0].protocol !== "openid-connect") throw Error("Existing OIDC roles scope required");
  const scope = scopes[0];
  const mappers = await request(`/client-scopes/${scope.id}/protocol-mappers/models`);
  if (!mappers.some(mapper => mapper.protocolMapper === "oidc-usermodel-client-role-mapper"
    && mapper.config["claim.name"] === "resource_access.${client_id}.roles" && mapper.config["access.token.claim"] === "true")) throw Error("Client role token mapper unavailable");
  const before = await request(`/clients/${client.id}/default-client-scopes`);
  const mappingsBefore = await request(`/clients/${client.id}/scope-mappings`);
  let changed = false;
  if (args[0].startsWith("--confirm=") && !before.some(item => item.id === scope.id)) {
    // The only mutation: attach an existing token mapper scope to one client.
    await request(`/clients/${client.id}/default-client-scopes/${scope.id}`, "PUT"); changed = true;
  }
  const after = await request(`/clients/${client.id}/default-client-scopes`);
  const current = await request(`/clients/${client.id}`);
  if (current.fullScopeAllowed !== false || JSON.stringify(await request(`/clients/${client.id}/scope-mappings`)) !== JSON.stringify(mappingsBefore)) throw Error("Unexpected role scope drift");
  if (args[0].startsWith("--confirm=") && !after.some(item => item.id === scope.id)) throw Error("Scope attachment was not persisted");
  const evaluations = [];
  for (const username of ["platform.admin", "platform.owner"]) {
    const users = await request(`/users?exact=true&username=${username}`);
    if (users.length !== 1) throw Error("Expected provisioned platform actor");
    // Read-only simulation. Never print the complete token model or claim a login.
    const sample = await request(`/clients/${client.id}/evaluate-scopes/generate-example-access-token?userId=${users[0].id}`);
    const roles = sample.resource_access?.account?.roles ?? [];
    if (after.some(item => item.id === scope.id) && !roles.includes("manage-account")) throw Error("Account role still missing in token simulation");
    evaluations.push({ username, simulationOnly: true, accountRoles: roles });
  }
  console.log(JSON.stringify({ realm: "platform-control", client: "account-console", changed,
    defaultScopes: after.map(item => item.name), fullScopeAllowed: current.fullScopeAllowed, roleAssignmentsChanged: false, evaluations }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1])))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
