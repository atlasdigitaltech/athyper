import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compileCompiledEntityArtifacts } from "../compiled-entity-artifact-compiler.js";

function compile(
  options: {
    source?: string;
    additionalSource?: string;
    permission?: string;
    handler?: string;
  } = {},
) {
  const base = {
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "draft_for_review",
    entityCode: "business_partner_request",
    plane: "neon",
    dependencies: [],
  };
  return compileCompiledEntityArtifacts({
    canonicalizer: {
      canonicalBytes: (value) => Buffer.from(JSON.stringify(value)),
      sha256: (value) =>
        `sha256:${createHash("sha256").update(value).digest("hex")}`,
    },
    registry: {
      sourceObjects: new Set([
        "document.entity_case",
        "snapshot.entity_snapshot",
      ]),
      permissions: new Set(["neon.relationship.entity_case.read"]),
      handlers: new Set(["case.read"]),
      renderers: new Set(),
      resolvers: new Set(),
      evaluators: new Set(),
    },
    release: {
      content: {
        schema: "athyper.compiled-entity-release/2.0-draft",
        contractStatus: "unsigned_review_only",
        releaseId: "bp2-source-check",
        releaseNo: 1,
        targetPlanes: ["neon"],
        externalDependencies: [],
      },
    },
    artifacts: [
      {
        ref: "business_partner_request/core.json",
        content: {
          ...base,
          artifactType: "core",
          artifactKey: "business_partner_request/core",
          storage: {
            primaryObject: options.source ?? "document.entity_case",
            sourceObjects: [
              "document.entity_case",
              options.additionalSource ?? "snapshot.entity_snapshot",
            ],
            genericWriteEnabled: false,
          },
          fields: [
            {
              key: "id",
              binding: {
                sourceObject: options.source ?? "document.entity_case",
                column: "id",
              },
            },
          ],
        },
      },
      {
        ref: "business_partner_request/operation.json",
        content: {
          ...base,
          artifactType: "operation",
          artifactKey: "business_partner_request/operation",
          operations: [
            {
              key: "read",
              permissionCode:
                options.permission ?? "neon.relationship.entity_case.read",
              execution: { handlerKey: options.handler ?? "case.read" },
            },
          ],
        },
      },
    ],
  });
}

describe("BP2 authoritative source and registration admission", () => {
  it("keeps the logical request identity while admitting current case/snapshot sources", () => {
    expect(compile().artifacts[0]?.artifact.entityCode).toBe(
      "business_partner_request",
    );
  });
  it.each([
    "document.business_partner_request",
    "document.business_partner_request_evidence",
  ])("rejects retired source %s", (source) => {
    expect(() => compile({ source })).toThrow(/Missing source object/);
    expect(() => compile({ additionalSource: source })).toThrow(
      /Missing source object/,
    );
  });
  it("rejects a missing required permission even when the handler exists", () => {
    expect(() => compile({ permission: "not.registered" })).toThrow(
      /Missing permissionCode/,
    );
  });
  it("rejects a missing required handler even when the permission exists", () => {
    expect(() => compile({ handler: "not.registered" })).toThrow(
      /Missing handlerKey/,
    );
  });
});
