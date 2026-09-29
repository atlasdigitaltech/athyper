import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { prepareActivityCapabilityMember, capabilityArtifactMembers, parseCompiledEntityArtifact, validateEntityCapabilities } from "@athyper/server-contract-publication";
import { compileCompiledEntityArtifacts } from "../compiled-entity-artifact-compiler.js";

function fixture(plane = "neon", recorded = false) {
  const owner = "example_reference";
  const profile = JSON.parse(readFileSync(new URL(`../../../../../../metadata/profiles/activity/${recorded ? "recorded-root" : "standard"}.v1.json`, import.meta.url), "utf8"));
  const member = prepareActivityCapabilityMember(owner, { schema: "athyper.entity-activity-source/1", profile: { code: profile.profileCode, version: 1 } }, () => profile,
    { versionHistoryAvailable: recorded, automaticCaptureAvailable: recorded, writableOperations: recorded ? ["create","patch"] : [] });
  const mapped = capabilityArtifactMembers(owner, [member]);
  const actions = mapped.operationBindings.activityBinding!.actions;
  const base = (type: string, key: string) => ({ schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2, contractStatus: "published", artifactType: type, artifactKey: `${owner}/${key}`, entityCode: owner, plane, dependencies: [] });
  return {
    registry: { handlers: new Set(["platform.activity.v1", ...actions.map(action => action.handlerKey)]), renderers: new Set(["platform.activity.v1"]), permissions: new Set(actions.map(action => action.permissionCode)), resolvers: new Set(["platform.records.admission.v1"]), evaluators: new Set<string>() },
    canonicalizer: { canonicalBytes: (value: unknown) => Buffer.from(JSON.stringify(value)), sha256: (value: Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}` },
    artifacts: [
      { ref: `${owner}/core.json`, content: { ...base("core", "core"), fields: [], capabilities: mapped.capabilities } },
      { ref: `${owner}/operation.json`, content: { ...base("operation", "operation"), operations: [], ...mapped.operationBindings } },
      { ref: `${owner}/capability-profile.activity.1.json`, content: { ...base("capability_profile", "capability-profile.activity.1"), profile } },
    ],
    release: { content: { schema: "athyper.compiled-entity-release/2.0-draft", contractStatus: "published", releaseId: "activity-fixture", releaseNo: 1, targetPlanes: [plane], externalDependencies: [] } },
  };
}
it.each(["studio", "neon", "mesh"])("compiles an immutable Activity profile dependency on %s", plane => {
  const input = fixture(plane), compiled = compileCompiledEntityArtifacts(input);
  expect(compiled).toEqual(compileCompiledEntityArtifacts(input));
  const op = compiled.artifacts.find(item => item.artifact.artifactType === "operation")!.artifact;
  const profile = compiled.artifacts.find(item => item.artifact.artifactType === "capability_profile")!.artifact;
  expect(op.content.activityBinding).toMatchObject({ profilePolicy: { plane, hash: profile.artifactHash, artifactKey: profile.artifactKey } });
  expect(op.dependencies).toContain(profile.artifactKey);
});
it.each(["hash", "plane", "owner", "missing", "dependency", "pin", "limits", "permission", "service", "resolver"])("rejects invalid compiled Activity: %s", change => {
  const input = fixture();
  const values = compileCompiledEntityArtifacts(input).artifacts.map(item => structuredClone(item.artifact.content) as any);
  const op = values.find(item => item.artifactType === "operation");
  if (change === "hash") op.activityBinding.profilePolicy.hash = `sha256:${"0".repeat(64)}`;
  if (change === "plane") op.activityBinding.profilePolicy.plane = "mesh";
  if (change === "owner") op.activityBinding.ownerEntityCode = "other";
  if (change === "missing") values.splice(values.findIndex(item => item.artifactType === "capability_profile"), 1);
  if (change === "dependency") op.dependencies = [];
  if (change === "pin") delete op.activityBinding.profilePolicy;
  if (change === "limits") op.activityBinding.query.pageSize = 101;
  if (change === "permission") input.registry.permissions.delete("common.records.snapshot.capture");
  if (change === "service") input.registry.handlers.delete("platform.activity.v1");
  if (change === "resolver") input.registry.resolvers.clear();
  expect(() => validateEntityCapabilities(values.map(parseCompiledEntityArtifact), input.registry)).toThrow();
});

it.each(["studio","neon","mesh"])("compiles and hash-pins authoritative recording on %s",plane=>{
  const compiled=compileCompiledEntityArtifacts(fixture(plane,true));
  const operation=compiled.artifacts.find(item=>item.artifact.artifactType==="operation")!.artifact;
  expect(operation.content.activityBinding).toMatchObject({recording:{providerKey:"platform.records.history.v1",projection:"stored_root"},snapshots:{automaticCapture:"committed"},views:["auditLog","versions","snapshots"]});
});
