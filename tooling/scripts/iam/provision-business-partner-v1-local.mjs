#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, chmodSync, existsSync, unlinkSync } from "node:fs";
import { request } from "node:https";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CONFIRMATION = "LOCAL-DEV-BP-V1-ACTORS";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";
const ORGANIZATION_ID = "a478f9c0-8226-5d22-9599-b8fb27a45180";
const ACTOR_ID = "26a55689-ab23-5bb3-a412-5de27a2962f4";
const IAM_ORIGIN = "https://iam.dev.athyper.test";
const CACHE_FILE = resolve(
  "node_modules/.cache/bp-qualification/v1-environment.json",
);
const APPROVER_TOTP_SECRET_FILE = resolve(
  "node_modules/.cache/bp-qualification/v1-approver-totp-secret",
);
const users = [
  {
    key: "REQUESTER",
    code: "acceptance.bp.v1.requester",
    group: "grp:workbench:user",
    roles: [
      "demo.neon.testing-admin-operating_organization-subtree",
      "demo.neon.business-partner-reader",
      "demo.neon.context-reader",
    ],
  },
  {
    key: "APPROVER",
    code: "acceptance.bp.v1.approver",
    group: "grp:workbench:user",
    roles: [
      "catl.demo.business_partner_case_approver",
      "demo.neon.context-reader",
    ],
  },
  {
    key: "MATERIALIZER",
    code: "acceptance.bp.v1.materializer",
    group: "grp:workbench:user",
    roles: [
      "demo.neon.testing-admin-operating_organization-subtree",
      "demo.neon.context-reader",
    ],
  },
];

if (!process.argv.includes(`--confirm=${CONFIRMATION}`))
  throw new Error(`pass --confirm=${CONFIRMATION}`);

function call(path, { method = "GET", token, body, form = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const encoded =
      body === undefined
        ? undefined
        : Buffer.from(
            form ? new URLSearchParams(body).toString() : JSON.stringify(body),
          );
    const req = request(
      `${IAM_ORIGIN}${path}`,
      {
        method,
        rejectUnauthorized: false,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(encoded
            ? {
                "Content-Type": form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
                "Content-Length": encoded.length,
              }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 500) >= 400)
            return reject(
              new Error(
                `${method} ${path} returned ${response.statusCode}: ${text.slice(0, 300)}`,
              ),
            );
          resolvePromise(text ? JSON.parse(text) : null);
        });
      },
    );
    req.on("error", reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

function id(name) {
  const bytes = createHash("sha1")
    .update("athyper.bp.v1.local")
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const adminPassword = readFileSync(
  "/home/chandravel_natarajan/.athyper/instances/dev/secrets/iam-admin-password",
  "utf8",
).trim();
const token = (
  await call("/realms/master/protocol/openid-connect/token", {
    method: "POST",
    form: true,
    body: {
      grant_type: "password",
      client_id: "admin-cli",
      username: "athyper-admin",
      password: adminPassword,
    },
  })
).access_token;
const root = "/admin/realms/athyper";
const organizations = await call(`${root}/organizations?max=100`, { token });
const organization = organizations.find((item) => item.alias === TENANT_ID);
if (!organization)
  throw new Error(
    `CirrusAtlantic IAM organization was not found; available aliases: ${organizations.map((item) => item.alias).join(", ")}`,
  );
const groups = await call(`${root}/groups?briefRepresentation=true&max=100`, {
  token,
});
const environment = {
  PLAYWRIGHT_BASE_URL: "https://neon.dev.athyper.test",
  PLAYWRIGHT_NEON_BASE_URL: "https://neon.dev.athyper.test",
  PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID: ORGANIZATION_ID,
  PLAYWRIGHT_BP_V1_APPROVER_TOTP_SECRET_FILE: APPROVER_TOTP_SECRET_FILE,
};

for (const user of users) {
  let matches = await call(
    `${root}/users?username=${encodeURIComponent(user.code)}&exact=true`,
    { token },
  );
  if (!matches.length) {
    await call(`${root}/users`, {
      method: "POST",
      token,
      body: {
        username: user.code,
        enabled: true,
        emailVerified: true,
        email: `${user.code}@example.test`,
        firstName: "V1",
        lastName: user.key.toLowerCase(),
      },
    });
    matches = await call(
      `${root}/users?username=${encodeURIComponent(user.code)}&exact=true`,
      { token },
    );
  }
  const subjectId = matches[0]?.id;
  if (!/^[0-9a-f-]{36}$/i.test(subjectId ?? ""))
    throw new Error(`IAM subject missing for ${user.code}`);
  const password = `Aa1!${randomBytes(30).toString("base64url")}`;
  await call(`${root}/users/${subjectId}/reset-password`, {
    method: "PUT",
    token,
    body: { type: "password", value: password, temporary: false },
  });
  const group = groups.find((item) => item.name === user.group);
  if (!group)
    throw new Error(
      `IAM group ${user.group} was not found; available groups: ${groups.map((item) => item.name).join(", ")}`,
    );
  await call(`${root}/users/${subjectId}/groups/${group.id}`, {
    method: "PUT",
    token,
  });
  try {
    await call(`${root}/organizations/${organization.id}/members`, {
      method: "POST",
      token,
      body: subjectId,
    });
  } catch (error) {
    if (!String(error).includes("409")) throw error;
  }
  user.subjectId = subjectId;
  if (user.key === "APPROVER") {
    const credentials = await call(`${root}/users/${subjectId}/credentials`, { token });
    for (const credential of credentials.filter((item) => item.type === "otp"))
      await call(`${root}/users/${subjectId}/credentials/${credential.id}`, { method: "DELETE", token });
    if (existsSync(APPROVER_TOTP_SECRET_FILE)) unlinkSync(APPROVER_TOTP_SECRET_FILE);
  }
  environment[`PLAYWRIGHT_BP_V1_${user.key}_USER`] = user.code;
  environment[`PLAYWRIGHT_BP_V1_${user.key}_PASSWORD`] = password;
}

const values = users.flatMap((user) =>
  user.roles.map((role) => ({ user, role })),
);
const sql = `
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('acceptance.bp.v1.local',0)),
  set_config('app.database_plane','neon',true),
  set_config('app.current_tenant_id','${TENANT_ID}',true),
  set_config('app.current_principal_id','${ACTOR_ID}',true);
${users
  .map(
    (user) => `
INSERT INTO master.principal(id,tenant_id,code,name,principal_type,provisioning_source,metadata,status,created_by)
VALUES('${id(`principal:${user.code}`)}','${TENANT_ID}','${user.code}','V1 ${user.key.toLowerCase()} acceptance actor','user','internal','{"environment":"local_acceptance","fixture":"BP-SUP-001"}','active','${ACTOR_ID}') ON CONFLICT(tenant_id,code) DO NOTHING;
INSERT INTO master.principal_identity_binding(tenant_id,principal_id,provider_code,realm_key,subject_id,username,is_primary,status,synced_at,sync_status,metadata,created_by)
VALUES('${TENANT_ID}','${id(`principal:${user.code}`)}','keycloak','athyper','${user.subjectId}','${user.code}',true,'active',clock_timestamp(),'synced','{"fixture":"BP-SUP-001"}','${ACTOR_ID}') ON CONFLICT DO NOTHING;
INSERT INTO authz.plane_membership(id,tenant_id,principal_id,source_type,source_ref,metadata,status,created_by)
VALUES('${id(`membership:${user.code}`)}','${TENANT_ID}','${id(`principal:${user.code}`)}','seed','acceptance.bp.v1.local','{"fixture":"BP-SUP-001"}','active','${ACTOR_ID}') ON CONFLICT(id) DO NOTHING;
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,created_by)
VALUES('${id(`group:${user.code}`)}','${TENANT_ID}','${user.code}','V1 ${user.key.toLowerCase()} acceptance group','system','seed','acceptance.bp.v1.local','{"fixture":"BP-SUP-001"}','${ACTOR_ID}') ON CONFLICT(id) DO NOTHING;
INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,created_by)
VALUES('${id(`member:${user.code}`)}','${TENANT_ID}','${id(`group:${user.code}`)}','${id(`principal:${user.code}`)}','seed','acceptance.bp.v1.local','{"fixture":"BP-SUP-001"}','${ACTOR_ID}') ON CONFLICT(id) DO NOTHING;
`,
  )
  .join("\n")}
${values
  .map(
    ({ user, role }) => `
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by)
SELECT '${id(`grant:${user.code}:${role}`)}','${TENANT_ID}','${id(`group:${user.code}`)}',role.id,scope.id,'subtree','seed','acceptance.bp.v1.local','{"fixture":"BP-SUP-001"}','active','${ACTOR_ID}'
FROM authz.role role CROSS JOIN authz.scope_target scope
WHERE role.tenant_id='${TENANT_ID}' AND role.code='${role}' AND role.status='active'
  AND scope.tenant_id='${TENANT_ID}' AND scope.scope_kind='operating_organization' AND scope.target_id='${ORGANIZATION_ID}' AND scope.status='active'
ON CONFLICT(id) DO NOTHING;
`,
  )
  .join("\n")}
${users
  .map(
    (user) => `
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by)
SELECT '${id(`grant:${user.code}:context-reader:tenant`)}','${TENANT_ID}','${id(`group:${user.code}`)}',role.id,scope.id,'exact','seed','acceptance.bp.v1.local','{"fixture":"BP-SUP-001"}','active','${ACTOR_ID}'
FROM authz.role role CROSS JOIN authz.scope_target scope
WHERE role.tenant_id='${TENANT_ID}' AND role.code='demo.neon.context-reader' AND role.status='active'
  AND scope.tenant_id='${TENANT_ID}' AND scope.scope_kind='tenant' AND scope.target_id='${TENANT_ID}' AND scope.status='active'
ON CONFLICT(id) DO NOTHING;
`,
  )
  .join("\n")}
COMMIT;
SELECT code FROM master.principal WHERE tenant_id='${TENANT_ID}' AND code LIKE 'acceptance.bp.v1.%' ORDER BY code;
`;
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  { input: sql, encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(
    result.stderr || result.stdout || "NEON fixture provisioning failed",
  );
mkdirSync(resolve("node_modules/.cache/bp-qualification"), { recursive: true });
writeFileSync(CACHE_FILE, `${JSON.stringify(environment, null, 2)}\n`, {
  mode: 0o600,
});
chmodSync(CACHE_FILE, 0o600);
process.stdout.write(
  JSON.stringify(
    {
      schema: "athyper.business-partner-v1-local-environment/1",
      target: environment.PLAYWRIGHT_BASE_URL,
      tenantId: TENANT_ID,
      operatingOrganizationId: ORGANIZATION_ID,
      actors: users.map((user) => ({
        code: user.code,
        role: user.key.toLowerCase(),
      })),
      credentialReference:
        "node_modules/.cache/bp-qualification/v1-environment.json",
    },
    null,
    2,
  ) + "\n",
);
