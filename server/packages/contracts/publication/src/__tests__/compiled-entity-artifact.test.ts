import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertCompiledEntityRuntimePublication,
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
  validateCompiledEntityRelease,
} from "../index.js";

const fixture = (path: string) =>
  readFile(
    new URL(
      `../../../../../../metadata/entities/${path}`,
      import.meta.url,
    ),
  ).then((bytes) => JSON.parse(bytes.toString("utf8")) as unknown);

describe("compiled entity artifact v2 draft contract", () => {
  it("parses the Business Partner Core, Operation and presentation fixtures", async () => {
    const artifacts = await Promise.all([
      fixture("business_partner/core.json"),
      fixture("business_partner/operation.json"),
      fixture("business_partner/presentation.detail.json"),
      fixture("business_partner/presentation.section.contacts.json"),
    ]);
    expect(artifacts.map(parseCompiledEntityArtifact).map((item) => item.artifactType)).toEqual([
      "core",
      "operation",
      "presentation_surface",
      "presentation_section",
    ]);
    const release = parseCompiledEntityReleaseEnvelope(
      await fixture("business_partner/release.json"),
    );
    expect(release.releaseId).toBeTruthy();
    expect(release.artifacts.length).toBeGreaterThan(4);
  });

  it("rejects an unknown normative property", async () => {
    const core = (await fixture("business_partner/core.json")) as Record<string, unknown>;
    expect(() => parseCompiledEntityArtifact({ ...core, typoedRequiredBehavior: true }))
      .toThrowError(/Unknown normative property/);
  });

  it("rejects a missing required handler and a child binding absent from its Core", () => {
    const core = parseCompiledEntityArtifact({
      schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2,
      contractStatus: "draft_for_review", artifactType: "core", artifactKey: "child/core",
      entityCode: "child", plane: "neon", dependencies: [],
      artifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fields: [{ key: "id" }],
    });
    const section = parseCompiledEntityArtifact({
      schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2,
      contractStatus: "draft_for_review", artifactType: "presentation_section", artifactKey: "parent/presentation.section.children",
      entityCode: "parent", plane: "neon", dependencies: ["child/core"],
      artifactHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sectionKey: "children", rendererKey: "missing.renderer.v1",
      childCollections: [{ key: "children", coreRef: "child/core.json", fieldBindings: [{ fieldKey: "missing" }] }],
    });
    const release = parseCompiledEntityReleaseEnvelope({
      schema: "athyper.compiled-entity-release/2.0-draft", contractStatus: "unsigned_review_only",
      releaseId: "bp-review", releaseNo: 1, targetPlanes: ["neon"], externalDependencies: [],
      releaseHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      signature: {}, artifacts: [
        { artifactKey: core.artifactKey, artifactType: core.artifactType, entityCode: core.entityCode, ref: "child/core.json", hash: core.artifactHash },
        { artifactKey: section.artifactKey, artifactType: section.artifactType, entityCode: section.entityCode, ref: "parent/presentation.section.children.json", hash: section.artifactHash },
      ],
    });
    expect(() => validateCompiledEntityRelease(release, [core, section], {
      handlers: new Set(), renderers: new Set(), resolvers: new Set(), evaluators: new Set(),
    })).toThrowError(/Missing rendererKey/);
    expect(() => validateCompiledEntityRelease(release, [core, section], {
      handlers: new Set(), renderers: new Set(["missing.renderer.v1"]), resolvers: new Set(), evaluators: new Set(),
    })).toThrowError(/Invalid child field binding/);
  });

  it("does not allow unsigned review artifacts to cross the publication boundary", async () => {
    const release = parseCompiledEntityReleaseEnvelope(await fixture("business_partner/release.json"));
    const core = parseCompiledEntityArtifact(await fixture("business_partner/core.json"));
    expect(() => assertCompiledEntityRuntimePublication({
      entityCode: "business_partner",
      release,
      artifacts: [core],
      generatedAt: "2026-09-19T00:00:00.000Z",
    })).toThrowError(/not published/);
  });
});
