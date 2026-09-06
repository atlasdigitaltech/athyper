#!/usr/bin/env node
// DEV-only reconciliation. Existing realms are not updated by Keycloak imports.
import { execFileSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
const iam = JSON.parse(docker("inspect", "athyper-dev-iam-1"))[0];
const address = iam.NetworkSettings.Networks["athyper-dev_app"]?.IPAddress;
if (!address) throw new Error("DEV IAM app network is unavailable");
const base = `http://${address}:8080`;
const env = Object.fromEntries(iam.Config.Env.map(value => { const index = value.indexOf("="); return [value.slice(0, index), value.slice(index + 1)]; }));
const username = env.KC_BOOTSTRAP_ADMIN_USERNAME ?? env.KEYCLOAK_ADMIN;
if (!username) throw new Error("DEV IAM administrator username is missing");
const password = docker("exec", "athyper-dev-iam-1", "cat", "/run/secrets/iam-admin-password");
const login = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
  method: "POST", body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username, password }), signal: AbortSignal.timeout(15_000),
});
if (!login.ok) throw new Error(`DEV IAM admin authentication failed (${login.status})`);
const { access_token: token } = await login.json();
async function admin(path, method = "GET", body) {
  const response = await fetch(`${base}/admin/realms/athyper/${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`DEV IAM ${method} failed (${response.status})`);
  return response.status === 204 ? undefined : response.json();
}
for (const plane of ["neon", "mesh", "studio"]) {
  const matches = await admin(`clients?clientId=${plane}-web`);
  if (matches.length !== 1) throw new Error(`Expected exactly one DEV ${plane} client`);
  const client = await admin(`clients/${matches[0].id}`);
  const url = `http://${plane}-web:3000/api/auth/backchannel-logout`;
  const attributes = { ...client.attributes, "backchannel.logout.url": url, "backchannel.logout.session.required": "true", "backchannel.logout.revoke.offline.tokens": "false" };
  const changed = client.frontchannelLogout !== false || Object.entries(attributes).some(([key, value]) => client.attributes?.[key] !== value);
  if (apply && changed) await admin(`clients/${client.id}`, "PUT", { ...client, frontchannelLogout: false, attributes });
  const verified = apply ? await admin(`clients/${client.id}`) : client;
  if (apply && (verified.frontchannelLogout !== false || Object.entries(attributes).some(([key, value]) => verified.attributes?.[key] !== value))) throw new Error(`DEV ${plane} logout verification failed`);
  console.log(JSON.stringify({ plane, action: changed ? (apply ? "updated" : "would_update") : "unchanged", backchannelUrl: apply ? verified.attributes["backchannel.logout.url"] : client.attributes?.["backchannel.logout.url"] ?? null, targetUrl: url }));
}
