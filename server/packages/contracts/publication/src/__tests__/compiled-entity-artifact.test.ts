import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertCompiledEntityRuntimePublication,
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
  validateCompiledEntityRelease,
} from "../index.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL("./fixtures/review-package.json", import.meta.url), "utf8"))[name.split("/").at(-1)!];
describe("compiled entity artifact v2 draft contract", () => {
  it("parses the shared reference Core, Operation and presentation fixtures", async () => {
    const artifacts = await Promise.all([
      fixture("reference_owner/core.json"),
      fixture("reference_owner/operation.json"),
      fixture("reference_owner/presentation.detail.json"),
      fixture("reference_owner/presentation.section.contacts.json"),
    ]);
    expect(artifacts.map(parseCompiledEntityArtifact).map((item) => item.artifactType)).toEqual([
      "core",
      "operation",
      "presentation_surface",
      "presentation_section",
    ]);
    const release = parseCompiledEntityReleaseEnvelope(
      await fixture("reference_owner/release.json"),
    );
    expect(release.releaseId).toBeTruthy();
    expect(release.artifacts.length).toBeGreaterThan(4);
  });

  it("rejects an unknown normative property", async () => {
    const core = (await fixture("reference_owner/core.json")) as Record<string, unknown>;
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
    const release = parseCompiledEntityReleaseEnvelope(await fixture("reference_owner/release.json"));
    const core = parseCompiledEntityArtifact(await fixture("reference_owner/core.json"));
    expect(() => assertCompiledEntityRuntimePublication({
      entityCode: "reference_owner",
      release,
      artifacts: [core],
      generatedAt: "2026-09-19T00:00:00.000Z",
    })).toThrowError(/not published/);
  });
});
