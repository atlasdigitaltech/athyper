/** Run on the isolated QA network with QA secrets mounted read-only. */
import { readFileSync } from "node:fs";
if (process.env.ATHYPER_DOMAIN_SUFFIX !== "qa.athyper.test")
  throw new Error("QA domain guard required");
const base = "http://iam:8080";
const password = readFileSync("/run/secrets/iam-admin-password", "utf8").trim();
const response = await fetch(
  `${base}/realms/master/protocol/openid-connect/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: "athyper-admin",
      password,
    }),
    signal: AbortSignal.timeout(20000),
  },
);
if (!response.ok)
  throw new Error(
    `QA IAM admin authentication failed: HTTP ${response.status}`,
  );
const token = (await response.json()).access_token;
async function request(path, method = "GET", body) {
  const r = await fetch(`${base}/admin/realms/athyper/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`QA IAM client configuration HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
const checks = [];
for (const plane of ["studio", "neon", "mesh"]) {
  const clients = await request(`clients?clientId=${plane}-web`);
  if (clients.length !== 1)
    throw new Error(`Exactly one existing ${plane} client required`);
  const client = clients[0],
    origin = `https://${plane}.qa.athyper.test`;
  const configuredSecret = (await request(`clients/${client.id}/client-secret`))
    .value;
  const expectedSecret = readFileSync(
    `/run/secrets/${plane}-iam-client-secret`,
    "utf8",
  ).trim();
  if (configuredSecret !== expectedSecret)
    throw new Error(
      `${plane} QA client secret mismatch; explicit service credential reconciliation required`,
    );
  const logout = new Set(
    (client.attributes?.["post.logout.redirect.uris"] ?? "")
      .split("##")
      .filter(Boolean),
  );
  logout.add(`${origin}/api/auth/logout/callback`);
  await request(`clients/${client.id}`, "PUT", {
    redirectUris: [
      ...new Set([
        ...(client.redirectUris ?? []),
        `${origin}/api/auth/callback`,
      ]),
    ],
    webOrigins: [...new Set([...(client.webOrigins ?? []), origin])],
    attributes: {
      ...client.attributes,
      "post.logout.redirect.uris": [...logout].join("##"),
    },
  });
  const after = await request(`clients/${client.id}`);
  if (!after.redirectUris.includes(`${origin}/api/auth/callback`))
    throw new Error("QA callback not retained");
  checks.push({
    plane,
    callbackRegistered: true,
    existingClientSecretMatched: true,
  });
}
console.log(
  JSON.stringify({
    schemaVersion: 1,
    environment: "qa",
    checks,
    userCredentialsChanged: false,
    mfaChanged: false,
  }),
);
