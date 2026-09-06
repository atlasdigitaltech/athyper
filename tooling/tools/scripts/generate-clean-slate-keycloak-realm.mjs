import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("deploy/config/iam/realm-athyper.json");
const outputPath = resolve("deploy/config/iam/realm-athyper-clean-slate.json");
const realm = JSON.parse(readFileSync(sourcePath, "utf8"));
const platformSourcePath = resolve("deploy/config/iam/realm-platform-control.json");
const platformOutputPath = resolve("deploy/config/iam/realm-platform-control-clean-slate.json");
const platformRealm = JSON.parse(readFileSync(platformSourcePath, "utf8"));

const managedClients = Object.freeze({
  "studio-web": { variable: "STUDIO_IAM_CLIENT_SECRET", host: "studio" },
  "neon-web": { variable: "NEON_IAM_CLIENT_SECRET", host: "neon" },
  "mesh-web": { variable: "MESH_IAM_CLIENT_SECRET", host: "mesh" },
  "athyper-svc-runtime-worker": { variable: "RUNTIME_IAM_CLIENT_SECRET", host: null },
});

realm.users = [];
realm.groups = [];
realm.identityProviders = [];
realm.identityProviderMappers = [];
realm.smtpServer = {};

for (const client of realm.clients ?? []) {
  for (const field of ["rootUrl", "adminUrl", "baseUrl"]) {
    if (client[field] === "") delete client[field];
  }
  for (const attribute of Object.keys(client.attributes ?? {})) {
    if (attribute.startsWith("backchannel.logout.")) delete client.attributes[attribute];
  }
  const policy = managedClients[client.clientId];
  if (policy) {
    client.enabled = true;
    client.publicClient = false;
    client.clientAuthenticatorType = "client-secret";
    client.secret = `\${${policy.variable}}`;
    client.attributes ??= {};
    if (policy.host) {
      const origin = `https://${policy.host}.dev.athyper.test`;
      client.redirectUris = [...new Set([...(client.redirectUris ?? []), `${origin}/api/auth/callback`])];
      client.webOrigins = [...new Set([...(client.webOrigins ?? []), origin])];
      const logoutRedirect = `${origin}/api/auth/logout/callback`;
      client.attributes["post.logout.redirect.uris"] = [
        ...new Set([
          ...(client.attributes["post.logout.redirect.uris"] ?? "").split("##").filter(Boolean),
          logoutRedirect,
        ]),
      ].join("##");
    }
    // Back-channel logout is activated only after the DEV endpoints expose and
    // pass their logout handlers; importing an unqualified URL blocks Keycloak.
    delete client.attributes["backchannel.logout.url"];
    continue;
  }
  if (Object.hasOwn(client, "secret")) delete client.secret;
  if (/-svc-bff$|svc-runtime-worker$/u.test(client.clientId ?? "")) client.enabled = false;
}

for (const [clientId, policy] of Object.entries(managedClients)) {
  const client = realm.clients?.find((candidate) => candidate.clientId === clientId);
  if (!client || client.secret !== `\${${policy.variable}}`) {
    throw new Error(`Managed client ${clientId} is absent or not placeholder-backed.`);
  }
}

const serialized = `${JSON.stringify(realm, null, 2)}\n`;
if (/"secret"\s*:\s*"(?!\$\{)/u.test(serialized)) {
  throw new Error("A literal client secret remains in the clean-slate realm.");
}
writeFileSync(outputPath, serialized, "utf8");

platformRealm.users = [];
platformRealm.identityProviders = [];
platformRealm.identityProviderMappers = [];
platformRealm.smtpServer = {};
for (const client of platformRealm.clients ?? []) {
  for (const field of ["rootUrl", "adminUrl", "baseUrl"]) {
    if (client[field] === "") delete client[field];
  }
  for (const attribute of Object.keys(client.attributes ?? {})) {
    if (attribute.startsWith("backchannel.logout.")) delete client.attributes[attribute];
  }
  if (client.clientId === "athyper-studio") {
    client.redirectUris = [...new Set([...(client.redirectUris ?? []), "https://studio.dev.athyper.test/*"])];
    client.webOrigins = [...new Set([...(client.webOrigins ?? []), "https://studio.dev.athyper.test"])];
  }
}
writeFileSync(platformOutputPath, `${JSON.stringify(platformRealm, null, 2)}\n`, "utf8");
console.log(`Generated clean-slate realms with ${Object.keys(managedClients).length} placeholder-backed clients.`);
