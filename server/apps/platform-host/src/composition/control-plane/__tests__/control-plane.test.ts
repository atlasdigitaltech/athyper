import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { readControlPlaneConfiguration } from "../../../config/control-plane.js";
import { validatePlatformAuthority } from "../../shared/identity/platform-authority.js";
import { createControlPlaneIdentityResolver } from "../identity.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const authority = {
  tenantId,
  realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control",
  audience: "athyper-platform-control-api",
};
const env = {
  ATHYPER_ENV: "local",
  ATHYPER_INSTANCE: "dev",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
  PLATFORM_AUTHORITY_TENANT_ID: tenantId,
  PLATFORM_CONTROL_REALM: authority.realmKey,
  PLATFORM_CONTROL_ISSUER_URL: authority.issuer,
  PLATFORM_CONTROL_AUDIENCE: authority.audience,
  PLATFORM_CONTROL_DATABASE_URL_FILE: "/run/secrets/control-db",
  PLATFORM_CONTROL_TRUST_MANIFEST_FILE: "/run/secrets/control-trust",
  PLATFORM_CONTROL_SIGNING_KEY_ID: "dev-key",
  PLATFORM_CONTROL_SIGNING_KEY_FILE: "/run/secrets/control-signing",
  PLATFORM_CONTROL_VERIFICATION_KEY_FILE: "/run/secrets/control-verification",
};

it("uses an explicit single-issuer control configuration, independent of tenant API variables", () => {
  expect(
    readControlPlaneConfiguration({
      ...env,
      KEYCLOAK_REALM: "athyper",
      IAM_ISSUER_URL: "https://untrusted.invalid",
    }).authority,
  ).toEqual(authority);
  expect(() =>
    readControlPlaneConfiguration({
      ...env,
      PLATFORM_CONTROL_AUDIENCE: undefined,
      IAM_CLIENT_ID: authority.audience,
    }),
  ).toThrow("CONFIGURATION_REQUIRED");
});
it.each(["qa", "staging", "production"])(
  "does not extend DEV control authority into %s",
  (instance) => {
    expect(() =>
      readControlPlaneConfiguration({ ...env, ATHYPER_INSTANCE: instance }),
    ).toThrow("DEV_ONLY");
  },
);
it.each([
  { realmKey: "athyper" },
  { audience: "athyper-api-runtime" },
  { tenantId: "" },
  { issuer: "http://iam.dev.athyper.test/realms/platform-control" },
  { issuer: "https://iam.dev.athyper.test/realms/athyper" },
  {
    issuer:
      "https://iam.dev.athyper.test/realms/platform-control?realm=athyper",
  },
])("rejects an ambiguous authority coordinate: %j", (override) => {
  expect(() =>
    validatePlatformAuthority({ ...authority, ...override }),
  ).toThrow();
});

function fixture(rows: unknown[] = []) {
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("FROM master.principal_identity_binding")
      ? rows
      : text.includes("FROM master.fn_resolve_principal_identity")
        ? [
            {
              principalId:
                (rows[0] as { principalId?: string })?.principalId ?? "absent",
            },
          ]
        : [],
  }));
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  return {
    database,
    query,
    resolve: createControlPlaneIdentityResolver(database, authority),
  };
}
const request = {
  planeKey: "studio" as const,
  realmKey: authority.realmKey,
  subject: "verified-subject",
  organizationIds: [],
};
it.each([
  { planeKey: "neon" },
  { planeKey: "mesh" },
  { realmKey: "athyper" },
  { requestedTenantId: "44444444-4444-4444-8444-444444444444" },
  { tokenTenantId: "other" },
  { subject: "" },
])(
  "rejects foreign identity context before database access: %j",
  async (override) => {
    const f = fixture();
    try {
      expect(
        await f.resolve({ ...request, ...override } as typeof request),
      ).toBeUndefined();
      expect(f.query).not.toHaveBeenCalled();
    } finally {
      await f.database.destroy();
    }
  },
);
it.each([
  [],
  [
    { principalId: "a", authEpoch: 0 },
    { principalId: "b", authEpoch: 0 },
  ],
])("does not infer missing or ambiguous identity bindings", async (rows) => {
  const f = fixture(rows);
  try {
    expect(await f.resolve(request)).toBeUndefined();
    const query = f.query.mock.calls.find(([text]) =>
      text.includes("FROM master.principal_identity_binding"),
    )?.[0];
    expect(query).toContain("b.issuer=");
    expect(query).toContain("b.audience=");
    expect(query).toContain("p.principal_type='user'");
    expect(query).toContain("b.status='active'");
    expect(
      f.query.mock.calls.some(([text]) => text.includes("scope_tree")),
    ).toBe(false);
  } finally {
    await f.database.destroy();
  }
});
it("does not accept a token's asserted principal in place of the persisted subject binding", async () => {
  const f = fixture([{ principalId: "persisted", authEpoch: 0 }]);
  try {
    expect(
      await f.resolve({ ...request, tokenPrincipalId: "forged" }),
    ).toBeUndefined();
  } finally {
    await f.database.destroy();
  }
});

it("enforces the isolated entrypoint import boundary and removes enrollment from tenant composition", () => {
  const filename = new URL(
    "../../../entrypoints/control-api.ts",
    import.meta.url,
  );
  const source = ts.createSourceFile(
    "control-api.ts",
    readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const allowed = new Set([
    "node:http",
    "node:fs/promises",
    "kysely",
    "@athyper/server-adapter-db-core",
    "@athyper/server-adapter-secretstore-infisical",
    "@athyper/server-adapter-auth-keycloak",
    "@athyper/server-adapter-publication-signing",
    "@athyper/server-platform-audit",
    "@athyper/server-platform-iam",
    "@athyper/server-runtime-http",
    "../config/control-plane.js",
    "../composition/control-plane/identity.js",
    "../composition/control-plane/product-command-runtime.js",
    "../composition/control-plane/control-plane.js",
    "../kernel/launch.js",
    "../diagnostics/telemetry/error-collector.js",
  ]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node))
      expect(allowed.has((node.moduleSpecifier as ts.StringLiteral).text)).toBe(
        true,
      );
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(source) === "require")
    )
      throw Error(
        "Dynamic loading is not permitted in the isolated entrypoint",
      );
    ts.forEachChild(node, visit);
  }
  visit(source);
  const combined = readFileSync(
    new URL("../../register-services.ts", import.meta.url),
    "utf8",
  );
  expect(combined).not.toContain("createPublicationPolicyEnrollment");
  expect(combined).not.toContain("registerPublicationPolicyEnrollmentRoutes");
  const registration = readFileSync(
    new URL("../control-plane.ts", import.meta.url),
    "utf8",
  );
  expect(registration).not.toContain("registerServices");
  expect(registration).not.toContain("registerPublicationWorkloadRoutes");
});

it("keeps product commands absent unless every isolated runtime binding is configured", () => {
  expect(readControlPlaneConfiguration(env).productCommands).toBeUndefined();
  const commands = {
    PLATFORM_CONTROL_COMMAND_ISSUER_DATABASE_URL_FILE:
      "/run/secrets/command-issuer",
    PLATFORM_CONTROL_COMMAND_APPLICATION_DATABASE_URL_FILE:
      "/run/secrets/command-app",
    PLATFORM_CONTROL_COMMAND_APPLICATION_LOGIN: "command-app",
    PLATFORM_CONTROL_COMMAND_LABEL_POLICY_FILE: "/run/secrets/command-policy",
  };
  for (const key of Object.keys(commands)) {
    expect(() =>
      readControlPlaneConfiguration({ ...env, ...commands, [key]: undefined }),
    ).toThrow("CONFIGURATION_REQUIRED");
  }
  expect(
    readControlPlaneConfiguration({ ...env, ...commands }).productCommands,
  ).toEqual({
    issuerDatabaseUrlFile:
      commands.PLATFORM_CONTROL_COMMAND_ISSUER_DATABASE_URL_FILE,
    applicationDatabaseUrlFile:
      commands.PLATFORM_CONTROL_COMMAND_APPLICATION_DATABASE_URL_FILE,
    applicationLogin: commands.PLATFORM_CONTROL_COMMAND_APPLICATION_LOGIN,
    labelPolicyFile: commands.PLATFORM_CONTROL_COMMAND_LABEL_POLICY_FILE,
  });
});
