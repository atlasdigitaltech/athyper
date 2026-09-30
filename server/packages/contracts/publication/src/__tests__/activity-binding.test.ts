import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { capabilityArtifactMembers, parseCapabilityBinding, type EntityCapabilityAuthoringMember } from "../entity-capabilities.js";
import { prepareActivityCapabilityMember } from "../activity-enrollment.js";

const profile = () => JSON.parse(readFileSync(new URL("../../../../../../metadata/profiles/activity/standard.v1.json", import.meta.url), "utf8"));
function member(entity = "example_reference"): EntityCapabilityAuthoringMember {
  return prepareActivityCapabilityMember(entity, { schema: "athyper.entity-activity-source/1", profile: { code: "platform.activity.standard", version: 1 } }, profile,
    { versionHistoryAvailable: false, automaticCaptureAvailable: false, writableOperations: [] });
}
it("lowers a profile into the canonical owner-bound operation binding", () => {
  const result = capabilityArtifactMembers("example_reference", [member()]);
  expect(result.capabilities.activity).toMatchObject({ enabled: true, load: "lazy", includeInAggregateData: false });
  const binding = parseCapabilityBinding(result.operationBindings.activityBinding, "activity", "example_reference");
  expect(binding.views).toEqual(["auditLog", "snapshots"]);
  expect(binding.actions.find(action => action.key === "snapshots_capture")).toMatchObject({ permissionCode: "common.records.snapshot.capture", servicePermissionCode: "records.snapshot.capture", idempotency: "required" });
  expect(result.operationBindings).not.toHaveProperty("attachmentBinding");
});
it.each(["permission", "alias", "handler", "duplicate", "missing", "extra", "owner", "notifications", "resolver", "versions", "capture"])("rejects invalid Activity binding: %s", change => {
  const binding = structuredClone(capabilityArtifactMembers("example_reference", [member()]).operationBindings.activityBinding!) as any;
  if (change === "permission") binding.actions[0].permissionCode = "common.platform.reference.view";
  if (change === "alias") binding.actions[0].servicePermissionCode = "records.snapshot.capture";
  if (change === "handler") binding.actions[0].handlerKey = "entity.record.patch.v1";
  if (change === "duplicate") binding.actions[1] = binding.actions[0];
  if (change === "missing") binding.actions.pop();
  if (change === "extra") binding.actions[0].bypass = true;
  if (change === "owner") binding.ownerEntityCode = "other";
  if (change === "notifications") binding.notifications = {};
  if (change === "resolver") binding.admissionResolverKey = "allow.all";
  if (change === "versions") binding.views.push("versions");
  if (change === "capture") { binding.snapshots.automaticCapture = "committed"; binding.snapshots.captureOperations = ["patch"]; }
  expect(() => parseCapabilityBinding(binding, "activity", "example_reference")).toThrow();
});
it("rejects explicit Activity policy and profile substitution", () => {
  const binding = capabilityArtifactMembers("example_reference", [member()]).operationBindings.activityBinding!;
  expect(() => capabilityArtifactMembers("example_reference", [{ capabilityKey: "activity", declaration: member().declaration, binding }])).toThrow("pinned source profile");
  expect(() => capabilityArtifactMembers("example_reference", [member("other")])).toThrow();
  expect(() => capabilityArtifactMembers("example_reference", [{ ...member(), profile: { code: "platform.activity.standard", version: 2 } }])).toThrow();
});
it("compiles the reusable recorded-root profile and pins recording against profile substitution", async () => {
  const { validateCapabilityProfileBinding } = await import("../capability-profile.js");
  const p = JSON.parse(readFileSync(new URL("../../../../../../metadata/profiles/activity/recorded-root.v1.json",import.meta.url),"utf8"));
  const m = prepareActivityCapabilityMember("example_record",{schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:1}},()=>p,{versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:["create","patch"]});
  const binding = capabilityArtifactMembers("example_record",[m]).operationBindings.activityBinding!;
  expect(parseCapabilityBinding(binding,"activity","example_record")).toMatchObject({recording:{providerKey:"platform.records.history.v1",projection:"stored_root"},views:["auditLog","versions","snapshots"]});
  expect(()=>validateCapabilityProfileBinding(profile(),binding)).toThrow("recording");
  expect(()=>parseCapabilityBinding({...binding,recording:{providerKey:"platform.records.history.v1",fields:["name"],projection:"stored_root",operations:["create","patch"]}},"activity","example_record")).toThrow();
  expect(()=>parseCapabilityBinding({...binding,recording:{providerKey:"domain.unqualified",projection:"stored_root",operations:["create"]}},"activity","example_record")).toThrow();
});
it("admits reviewed delete and owned-adapter profiles without changing root v1", () => {
  for (const [file, operations] of [["recorded-root.v2.json",["create","patch","delete"]],["recorded-owned.v1.json",["create","patch","aggregate","domain","delete"]]] as const) {
    const p = JSON.parse(readFileSync(new URL(`../../../../../../metadata/profiles/activity/${file}`,import.meta.url),"utf8"));
    const source = {schema:"athyper.entity-activity-source/1",profile:{code:p.profileCode,version:p.profileVersion},overrides:{recording:{operations:[...operations]},snapshots:{captureOperations:[...operations]}}};
    const m = prepareActivityCapabilityMember("example_record",source,()=>p,{versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:operations});
    const binding = capabilityArtifactMembers("example_record",[m]).operationBindings.activityBinding!;
    expect(parseCapabilityBinding(binding,"activity","example_record")).toMatchObject({recording:{operations:[...operations]}});
    if (file === "recorded-owned.v1.json") expect(()=>parseCapabilityBinding({...binding,recording:{...(binding as any).recording,adapterKey:undefined}},"activity","example_record")).toThrow();
  }
});
