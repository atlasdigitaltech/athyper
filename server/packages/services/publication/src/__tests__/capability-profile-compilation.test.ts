import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { capabilityArtifactMembers, parseCompiledEntityArtifact, validateEntityCapabilities, type EntityCapabilityAuthoringMember } from "@athyper/server-contract-publication";
import { compileCompiledEntityArtifacts } from "../compiled-entity-artifact-compiler.js";

function fixture(entityCode = "example_reference", plane = "neon") {
  const members = ["comments", "attachments"].map(kind => ({ capabilityKey: kind,
    declaration: { enabled: true, serviceKey: `platform.${kind}.v1`, ownerEntityCode: entityCode, load: "lazy", includeInAggregateData: false },
    profile: { code: `platform.collaboration.${kind}.standard`, version: 1 },
    profileDefinition: JSON.parse(readFileSync(new URL(`../../../../../../metadata/profiles/collaboration/${kind}/standard.v1.json`, import.meta.url), "utf8")),
    overrides: kind === "comments" ? { defaultAudience: "public" } : {},
  })) as EntityCapabilityAuthoringMember[];
  const mapped = capabilityArtifactMembers(entityCode, members);
  const base = (type: string, key: string) => ({ schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2, contractStatus: "published", artifactType: type, artifactKey: `${entityCode}/${key}`, entityCode, plane, dependencies: [] });
  const actions = Object.values(mapped.operationBindings).flatMap(binding => binding.actions);
  return {
    registry: { handlers: new Set(["platform.comments.v1", "platform.attachments.v1", ...actions.map(a => a.handlerKey)]),
      permissions: new Set(actions.map(a => a.permissionCode)), resolvers: new Set(["platform.records.admission.v1"]), renderers: new Set(["platform.comments.v1", "platform.attachments.v1"]), evaluators: new Set<string>() },
    canonicalizer: { canonicalBytes: (value: unknown) => Buffer.from(JSON.stringify(value)), sha256: (value: Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}` },
    release: { content: { schema: "athyper.compiled-entity-release/2.0-draft", contractStatus: "published", releaseId: "fixture", releaseNo: 1, targetPlanes: [plane], externalDependencies: [] } },
    artifacts: [
      { ref: `${entityCode}/core.json`, content: { ...base("core", "core"), fields: [], capabilities: mapped.capabilities } },
      { ref: `${entityCode}/operation.json`, content: { ...base("operation", "operation"), operations: [], ...mapped.operationBindings } },
      ...members.map(member => ({ ref: `${entityCode}/capability-profile.${member.capabilityKey}.1.json`, content: { ...base("capability_profile", `capability-profile.${member.capabilityKey}.1`), profile: member.profileDefinition } })),
    ],
  };
}
describe("profile artifacts and enforced pins", () => {
  for (const entity of ["country", "example_reference"]) for (const plane of ["studio", "neon", "mesh"]) it(`pins ${entity} on ${plane}`, () => {
    const input = fixture(entity, plane);
    const compiled = compileCompiledEntityArtifacts(input);
    expect(compiled).toEqual(compileCompiledEntityArtifacts(input));
    const operation = compiled.artifacts.find(a => a.artifact.artifactType === "operation")!.artifact;
    const profile = compiled.artifacts.find(a => a.artifact.artifactKey.endsWith("capability-profile.comments.1"))!.artifact;
    expect(operation.content.commentBinding).toMatchObject({ ownerEntityCode: entity, defaultAudience: "public", profilePolicy: { artifactKey: profile.artifactKey, hash: profile.artifactHash, plane } });
    expect(operation.dependencies).toContain(profile.artifactKey);
  });
  it.each(["hash", "plane", "missing", "dependency", "limits", "kind"])("rejects broken profile %s", mutation => {
    const input = fixture();
    const values = compileCompiledEntityArtifacts(input).artifacts.map(a => structuredClone(a.artifact.content) as Record<string, any>);
    const op = values.find(a => a.artifactType === "operation")!;
    if (mutation === "hash") op.commentBinding.profilePolicy.hash = `sha256:${"0".repeat(64)}`;
    if (mutation === "plane") op.commentBinding.profilePolicy.plane = "mesh";
    if (mutation === "missing") values.splice(values.findIndex(a => a.artifactKey.endsWith("capability-profile.comments.1")), 1);
    if (mutation === "dependency") op.dependencies = [];
    if (mutation === "limits") op.commentBinding.maxTextLength = 5001;
    if (mutation === "kind") op.commentBinding.profilePolicy = op.attachmentBinding.profilePolicy;
    expect(() => validateEntityCapabilities(values.map(parseCompiledEntityArtifact), input.registry)).toThrow();
  });
});
