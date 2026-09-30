import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityArtifactMembers, parseCompiledEntityArtifact, parseCompiledEntityReleaseEnvelope, type EntityCapabilityAuthoringMember } from "@athyper/server-contract-publication";
import { PinnedCompiledEntityReader } from "../compiled-entity-reader.js";

function fixture(mutation?: string) {
  const entityCode = "example_reference";
  const members = ["comments", "attachments"].map(kind => ({ capabilityKey: kind,
    declaration: { enabled: true, serviceKey: `platform.${kind}.v1`, ownerEntityCode: entityCode, load: "lazy", includeInAggregateData: false },
    profile: { code: `platform.collaboration.${kind}.standard`, version: 1 },
    profileDefinition: JSON.parse(readFileSync(new URL(`../../../../../../metadata/profiles/collaboration/${kind}/standard.v1.json`, import.meta.url), "utf8")),
  })) as EntityCapabilityAuthoringMember[];
  const mapped = capabilityArtifactMembers(entityCode, members);
  const hash = `sha256:${"a".repeat(64)}`;
  const base = (type: string, key: string) => ({ schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2, contractStatus: "published", artifactType: type, artifactKey: `${entityCode}/${key}`, entityCode, plane: "neon", dependencies: [], artifactHash: hash });
  const profiles = members.map(member => ({ ...base("capability_profile", `capability-profile.${member.capabilityKey}.1`), profile: member.profileDefinition }));
  const bindings = Object.fromEntries(Object.entries(mapped.operationBindings).map(([key, binding], index) => [key, { ...binding, profilePolicy: { artifactKey: profiles[index]!.artifactKey, plane: "neon", hash } }]));
  const operation: Record<string, any> = { ...base("operation", "operation"), operations: [], ...bindings, dependencies: profiles.map(p => p.artifactKey) };
  if (mutation === "hash") operation.commentBinding.profilePolicy.hash = `sha256:${"b".repeat(64)}`;
  if (mutation === "plane") operation.commentBinding.profilePolicy.plane = "mesh";
  if (mutation === "dependency") operation.dependencies = [];
  if (mutation === "limits") operation.commentBinding.maxTextLength = 5001;
  const artifacts = [{ ...base("core", "core"), fields: [], capabilities: mapped.capabilities }, operation,
    ...profiles.filter(p => mutation !== "missing" || !p.artifactKey.includes("comments"))].map(parseCompiledEntityArtifact);
  const envelope = parseCompiledEntityReleaseEnvelope({ schema: "athyper.compiled-entity-release/2.0-draft", contractStatus: "published", releaseId: "fixture", releaseNo: 1, targetPlanes: ["neon"], externalDependencies: [], signature: {}, releaseHash: hash,
    artifacts: artifacts.map(a => ({ artifactKey: a.artifactKey, artifactType: a.artifactType, entityCode, ref: `${a.artifactKey}.json`, hash: a.artifactHash })) });
  const reader = new PinnedCompiledEntityReader({ source: { findAdmittedRelease: async () => envelope, findArtifact: async input => artifacts.find(a => a.artifactKey === input.entry.artifactKey) ?? null } });
  return { reader, coordinate: { tenantId: "tenant", principalId: "principal", planeKey: "neon" as const, entityCode } };
}

describe("runtime capability profile pins", () => {
  it("admits pinned profiles on an operation read", async () => {
    const { reader, coordinate } = fixture();
    const release = await reader.resolve(coordinate);
    await expect(reader.operation(release!)).resolves.toMatchObject({ artifactType: "operation" });
  });
  it.each(["hash", "plane", "dependency", "limits", "missing"])("rejects %s on a cold read", async mutation => {
    const { reader, coordinate } = fixture(mutation);
    const release = await reader.resolve(coordinate);
    await expect(reader.operation(release!)).rejects.toThrow();
  });
});
