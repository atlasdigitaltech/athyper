import { resolveSourcePath } from "../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  it("captures the canonical registered name without requiring rejected legacy name fields", () => {
    const form = JSON.parse(readFileSync(resolveSourcePath(new URL("../../../../../../metadata/entities/business_partner_request/presentation.section.form.supplierRequest.json", import.meta.url)), "utf8"));
    const fields = form.form.sections.flatMap((section: {fields: {path:string; target:string; required?:boolean}[]}) => section.fields);
    expect(fields).toContainEqual(expect.objectContaining({path:"name",target:"canonical",required:true}));
    expect(fields.filter((field: {path:string;target:string}) => field.target === "canonical").map((field: {path:string}) => field.path)).not.toEqual(expect.arrayContaining(["legalName"]));
    expect(fields.some((field: {path:string}) => field.path === "displayName")).toBe(false);
  });
  it("binds the authored request to case identity and keeps derived values out of generic storage reads", () => {
    const root = new URL("../../../../../../metadata/entities/", import.meta.url);
    const core = JSON.parse(readFileSync(resolveSourcePath(new URL("business_partner_request/core.json", root)), "utf8"));
    const section = JSON.parse(readFileSync(resolveSourcePath(new URL("business_partner/presentation.section.requests.json", root)), "utf8"));
    expect(core.storage).toMatchObject({kind:"handler_projection",primaryObject:"document.entity_case",genericWriteEnabled:false});
    expect(core.fields.find((field: {key:string}) => field.key === "request_no").binding.column).toBe("case_code");
    for (const key of ["request_kind", "status"])
      expect(core.fields.find((field: {key:string}) => field.key === key).valueOrigin).toBe("derived");
    expect(core.fields.some((field: {key:string}) => field.key === "base_record_version")).toBe(false);
    expect(section.fieldBindings.some((field: {fieldKey:string}) => field.fieldKey === "base_record_version")).toBe(false);
    expect(JSON.stringify(core)).not.toContain('"document.business_partner_request"');
    expect(core.serverDependencies).toContainEqual({sourceObject:"snapshot.entity_snapshot",column:"payload_json",purpose:"identity_context_or_concurrency"});
  });
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
