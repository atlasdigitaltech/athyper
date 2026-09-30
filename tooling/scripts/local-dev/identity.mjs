import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { inventory, writeJson } from "./runtime.mjs";
import { readJson } from "./model.mjs";

export async function configureIdentity(plan, { personas = false } = {}) {
  await inventory(plan);
  if (
    plan.realm !== `local-${plan.id}` ||
    plan.origins.iam !== `http://127.0.0.1:${plan.ports.iam}`
  )
    throw new Error("Identity setup requires the isolated local realm");
  const tokenResponse = await fetch(
    `${plan.origins.iam}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: "athyper-admin",
        password: readFileSync(
          join(plan.root, "secrets/iam-admin-password"),
          "utf8",
        ).trim(),
      }),
    },
  );
  if (!tokenResponse.ok)
    throw new Error(
      `Local identity administration failed (${tokenResponse.status})`,
    );
  const { access_token: token } = await tokenResponse.json();
  async function request(path, method = "GET", body) {
    const response = await fetch(
      `${plan.origins.iam}/admin/realms/${plan.realm}${path}`,
      {
        method,
        signal: AbortSignal.timeout(10000),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      let detail = String(
        failure.errorMessage ?? failure.error ?? "request rejected",
      );
      for (const credential of body?.credentials ?? [])
        if (credential.value)
          detail = detail.replaceAll(credential.value, "[redacted]");
      throw new Error(
        `Local realm ${method} ${path.split("?")[0]} failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    return response.status === 204 || response.status === 201
      ? undefined
      : response.json();
  }
  for (const app of ["studio", "neon", "mesh"]) {
    const clients = await request(`/clients?clientId=${app}-web`);
    if (clients.length !== 1)
      throw new Error(`Missing unique ${app} identity client`);
    await request(`/clients/${clients[0].id}`, "PUT", {
      ...clients[0],
      rootUrl: plan.origins[app],
      baseUrl: plan.origins[app],
      redirectUris: [`${plan.origins[app]}/api/auth/callback`],
      webOrigins: [plan.origins[app]],
    });
  }
  const receipt = {
    schemaVersion: 1,
    evidenceType: "development-identity",
    environment: plan.id,
    realm: plan.realm,
    at: new Date().toISOString(),
    callbacks: Object.fromEntries(
      ["studio", "neon", "mesh"].map((app) => [
        app,
        `${plan.origins[app]}/api/auth/callback`,
      ]),
    ),
    personas: [],
    grantsConfigured: false,
  };
  if (personas) {
    const path = join(plan.root, "secrets/test-personas.json");
    const credentials = existsSync(path) ? readJson(path) : {};
    for (const role of ["requester", "approver", "steward", "unauthorized"]) {
      const username = `local.${role}`;
      let password =
        credentials[role]?.password ??
        `Aa1!@-${randomBytes(24).toString("base64url")}`;
      const previousSubject = credentials[role]?.subject;
      credentials[role] = { username, password, subject: previousSubject };
      // Persist credentials before creating a user, so an interruption is recoverable.
      writeJson(path, credentials);
      let users = await request(
        `/users?username=${encodeURIComponent(username)}&exact=true`,
      );
      const created = users.length === 0;
      if (created) {
        if (!password.startsWith("Aa1!@-")) {
          password = `Aa1!@-${randomBytes(24).toString("base64url")}`;
          credentials[role].password = password;
          writeJson(path, credentials);
        }
        await request("/users", "POST", {
          username,
          enabled: true,
          email: `${role}@local.invalid`,
          emailVerified: true,
          firstName: "Local",
          lastName: role,
          requiredActions: [],
          attributes: {
            localDevelopmentEnvironment: [plan.id],
            syntheticPersona: [role],
          },
          credentials: [
            { type: "password", value: password, temporary: false },
          ],
        });
        users = await request(
          `/users?username=${encodeURIComponent(username)}&exact=true`,
        );
      }
      if (
        users.length !== 1 ||
        (!created && previousSubject && users[0].id !== previousSubject)
      )
        throw new Error(`Unexpected local persona ownership: ${username}`);
      credentials[role].subject = users[0].id;
      writeJson(path, credentials);
      receipt.personas.push({ role, username, subject: users[0].id });
    }
  }
  writeJson(join(plan.root, "identity.json"), receipt);
  return receipt;
}
