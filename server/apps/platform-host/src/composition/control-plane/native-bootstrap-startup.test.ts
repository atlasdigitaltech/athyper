import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import ts from "typescript";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  createNativeBootstrapStartup,
  type NativeBootstrapStartupConfiguration,
} from "./native-bootstrap-startup.js";
import { readControlPlaneConfiguration } from "../../config/control-plane.js";
const env = {
  ATHYPER_ENV: "local",
  ATHYPER_INSTANCE: "dev",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
  PLATFORM_AUTHORITY_TENANT_ID: "11111111-1111-4111-8111-111111111111",
  PLATFORM_CONTROL_REALM: "platform-control",
  PLATFORM_CONTROL_ISSUER_URL:
    "https://iam.dev.athyper.test/realms/platform-control",
  PLATFORM_CONTROL_AUDIENCE: "athyper-platform-control-api",
  PLATFORM_CONTROL_DATABASE_URL_FILE: "/private/database",
  PLATFORM_CONTROL_TRUST_MANIFEST_FILE: "/private/trust",
  PLATFORM_CONTROL_SIGNING_KEY_ID: "dev-key",
  PLATFORM_CONTROL_SIGNING_KEY_FILE: "/private/key",
  PLATFORM_CONTROL_VERIFICATION_KEY_FILE: "/private/public",
  PLATFORM_CONTROL_COMMAND_ISSUER_DATABASE_URL_FILE: "/private/issuer",
  PLATFORM_CONTROL_COMMAND_APPLICATION_DATABASE_URL_FILE:
    "/private/application",
  PLATFORM_CONTROL_COMMAND_APPLICATION_LOGIN: "command_app",
  PLATFORM_CONTROL_COMMAND_LABEL_POLICY_FILE: "/private/labels",
  PLATFORM_CONTROL_REFERENCE_RESOURCE_POLICY_FILE: "/private/reference",
  PLATFORM_CONTROL_NATIVE_BOOTSTRAP_CONFIGURATION_FILE: "/private/native",
};
it("requires explicit local command and descriptor configuration for native startup", () => {
  expect(
    readControlPlaneConfiguration(env).nativeBootstrapConfigurationFile,
  ).toBe("/private/native");
  for (const change of [
    { PLATFORM_CONTROL_REFERENCE_RESOURCE_POLICY_FILE: undefined },
    { PLATFORM_CONTROL_NATIVE_BOOTSTRAP_CONFIGURATION_FILE: "relative" },
    { ATHYPER_ENV: "production" },
  ])
    expect(() =>
      readControlPlaneConfiguration({ ...env, ...change }),
    ).toThrow();
});
it("constructs concrete proposal and resource resolvers from bounded configuration", () => {
  const { graph } = nativeReleaseFixture();
  const declaration = {
    schema: "entity.local-operation-initialization/1" as const,
    targets: [
      {
        entityId: graph.authoringSource.entityId,
        changeSetId: graph.ownedLabels!.changeSetId,
        operations: graph.operations.map((o) => ({
          id: o.id,
          operationKey: o.operationKey,
          operationHash: sha256(o),
          requiresMfa: false as const,
        })),
      },
    ],
  };
  const resource = {
    owner: "tests",
    key: "reference",
    version: 1,
    hash: "a".repeat(64),
  };
  const configuration: NativeBootstrapStartupConfiguration = {
    schema: "entity.local-native-startup/1",
    proposals: {
      root: "/private/proposals",
      manifest: "manifest.json",
      manifestHash: "a".repeat(64),
      maximumBytes: 100000,
    },
    database: {
      database: "test",
      applicationRole: "command_app",
      schemaHash: "a".repeat(64),
    },
    commands: {
      authoringSchemaHash: "a".repeat(64),
      maxMembers: 1000,
      maxCommands: 100,
      maxBatchBytes: 100000,
    },
    hostReleaseHash: "a".repeat(64),
    componentPins: [],
    initialization: {
      profile: "owner-approved-local-native",
      approvedDeclarationHash: sha256(declaration),
      declaration,
    },
    targets: [],
    domains: [],
    referenceContract: { key: "reference", version: 1, hash: "a".repeat(64) },
    identityResource: resource,
  };
  const options = {
    configuration,
    authorityTenantId: env.PLATFORM_AUTHORITY_TENANT_ID,
    loader: {
      canonicalizer: {
        canonicalBytes: (value: unknown) => Buffer.from(JSON.stringify(value)),
        sha256,
      },
      runtimeVersion: "1.0.0",
      verifier: { verify: vi.fn() },
      store: { get: vi.fn(), putImmutable: vi.fn() },
      uiComponents: { qualify: vi.fn() },
    },
    audit: vi.fn(),
  };
  const startup = createNativeBootstrapStartup(options);
  expect(typeof startup.nativeSource).toBe("function");
  expect(typeof startup.nativeBootstrapProposals!.readProposal).toBe(
    "function",
  );
  expect(typeof startup.nativeBootstrapProposals!.resolveResources).toBe(
    "function",
  );
  expect(typeof startup.nativeBootstrapResources!.components).toBe("function");
  expect(() =>
    createNativeBootstrapStartup({
      ...options,
      configuration: {
        ...configuration,
        commands: { ...configuration.commands, maxBatchBytes: 1 },
      },
    }),
  ).toThrow("CONFIGURATION_INVALID");
  expect(() =>
    createNativeBootstrapStartup({
      ...options,
      loader: { ...options.loader, uiComponents: undefined },
    }),
  ).toThrow("READER_CONFIGURATION_INVALID");
});
it("production entrypoint constructs and passes native composition to the actual command runtime", () => {
  const source = ts.createSourceFile(
    "control-api.ts",
    readFileSync(
      new URL("../../entrypoints/control-api.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  let assembled = false,
    wired = false,
    reviewWired = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "nativeBootstrap"
    )
      assembled =
        node.initializer
          ?.getText(source)
          .includes("createNativeBootstrapStartup(") ?? false;
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "createControlProductCommandRuntime"
    ) {
      const arg = node.arguments[0];
      wired = Boolean(
        arg &&
        ts.isObjectLiteralExpression(arg) &&
        arg.properties.some(
          (p) =>
            ts.isSpreadAssignment(p) &&
            p.expression.getText(source) === "nativeBootstrap",
        ),
      );
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "registerControlPlane"
    )
      reviewWired = node.arguments.some((arg) =>
        arg
          .getText(source)
          .includes("nativeSource: nativeBootstrap.nativeSource"),
      );
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(assembled).toBe(true);
  expect(wired).toBe(true);
  expect(reviewWired).toBe(true);
});
