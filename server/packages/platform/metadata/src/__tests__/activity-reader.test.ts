import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityArtifactMembers, parseCompiledEntityArtifact, parseCompiledEntityReleaseEnvelope, type EntityCapabilityAuthoringMember } from "@athyper/server-contract-publication";
import { PinnedCompiledEntityReader } from "../compiled-entity-reader.js";

function fixture(mutation?: string, recorded = false) {
  const entityCode = "example_reference";
  const members = ["activity"].map(kind => ({ capabilityKey: kind,
    declaration: { enabled: true, serviceKey: `platform.${kind}.v1`, ownerEntityCode: entityCode, load: "lazy", includeInAggregateData: false },
    profile: { code: recorded ? "platform.activity.recorded-root" : "platform.activity.standard", version: 1 },
    profileDefinition: JSON.parse(readFileSync(new URL(`../../../../../../metadata/profiles/activity/${recorded ? "recorded-root" : "standard"}.v1.json`, import.meta.url), "utf8")),
  })) as EntityCapabilityAuthoringMember[];
  const mapped = capabilityArtifactMembers(entityCode, members);
  const hash = `sha256:${"a".repeat(64)}`;
  const base = (type: string, key: string) => ({ schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2, contractStatus: "published", artifactType: type, artifactKey: `${entityCode}/${key}`, entityCode, plane: "neon", dependencies: [], artifactHash: hash });
  const profiles = members.map(member => ({ ...base("capability_profile", `capability-profile.${member.capabilityKey}.1`), profile: member.profileDefinition }));
  const bindings = Object.fromEntries(Object.entries(mapped.operationBindings).map(([key, binding], index) => [key, { ...binding, profilePolicy: { artifactKey: profiles[index]!.artifactKey, plane: "neon", hash } }]));
  const operation: Record<string, any> = { ...base("operation", "operation"), operations: [], ...bindings, dependencies: profiles.map(p => p.artifactKey) };
  if (mutation === "hash") operation.activityBinding.profilePolicy.hash = `sha256:${"b".repeat(64)}`;
  if (mutation === "plane") operation.activityBinding.profilePolicy.plane = "mesh";
  if (mutation === "dependency") operation.dependencies = [];
  if (mutation === "limits") operation.activityBinding.query.pageSize = 101;
  const artifacts = [{ ...base("core", "core"), fields: [], capabilities: mapped.capabilities }, operation,
    ...profiles.filter(p => mutation !== "missing" || !p.artifactKey.includes("activity"))].map(parseCompiledEntityArtifact);
  const envelope = parseCompiledEntityReleaseEnvelope({ schema: "athyper.compiled-entity-release/2.0-draft", contractStatus: "published", releaseId: "fixture", releaseNo: 1, targetPlanes: ["neon"], externalDependencies: [], signature: {}, releaseHash: hash,
    artifacts: artifacts.map(a => ({ artifactKey: a.artifactKey, artifactType: a.artifactType, entityCode, ref: `${a.artifactKey}.json`, hash: a.artifactHash })) });
  const reader = new PinnedCompiledEntityReader({ source: { findAdmittedRelease: async () => envelope, findArtifact: async input => artifacts.find(a => a.artifactKey === input.entry.artifactKey) ?? null } });
  return { reader, artifacts, coordinate: { tenantId: "tenant", principalId: "principal", planeKey: "neon" as const, entityCode } };
}

describe("runtime Activity profile pins", () => {
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

it("revalidates policy pins even when the operation artifact is cached", async () => {
  const {reader, coordinate} = fixture();
  const release = await reader.resolve(coordinate);
  const cached = await reader.operation(release!);
  (cached.content.activityBinding as any).profilePolicy.hash = `sha256:${"c".repeat(64)}`;
  await expect(reader.operation(release!)).rejects.toThrow();
});

it("reads pinned recording policy cold and cached, rejecting a substituted projection",async()=>{
  const {reader,coordinate}=fixture(undefined,true);
  const release=await reader.resolve(coordinate);
  const operation=await reader.operation(release!);
  expect(operation.content.activityBinding).toMatchObject({recording:{projection:"stored_root"}});
  const cached = await reader.operation(release!);
  expect(cached).toEqual(operation);
  (cached.content.activityBinding as any).recording={providerKey:"platform.records.history.v1",fields:["secret"],operations:["create","patch"]};
  await expect(reader.operation(release!)).rejects.toThrow();
});
