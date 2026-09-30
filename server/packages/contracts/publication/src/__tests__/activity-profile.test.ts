import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareActivityEnrollment } from "../activity-enrollment.js";
import {
  activityPolicyActions,
  parseActivityPolicy,
  qualifyActivityPolicy,
} from "../activity-policy.js";
import {
  parseCapabilityProfile,
  resolveCapabilityProfileDefaults,
  validateCapabilityProfileBinding,
} from "../capability-profile.js";
import { capabilityArtifactMembers } from "../entity-capabilities.js";

const profile = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/profiles/activity/standard.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const selection = () => ({
  schema: "athyper.entity-activity-source/1",
  profile: { code: "platform.activity.standard", version: 1 },
});
const referenceSupport = {
  versionHistoryAvailable: false,
  automaticCaptureAvailable: false,
  writableOperations: [],
};

describe("shared Activity source profile", () => {
  it("inherits defaults and exact canonical/service mappings without granting activation", () => {
    const result = prepareActivityEnrollment(
      selection(),
      profile,
      referenceSupport,
    );
    expect(result.policy).toEqual(profile().defaults);
    expect(result.requiredPermissions).toEqual([
      "common.audit.event.query",
      "common.records.snapshot.capture",
      "common.records.snapshot.read",
    ]);
    expect(
      result.actions.find((action) => action.key === "snapshots_capture"),
    ).toMatchObject({
      permissionCode: "common.records.snapshot.capture",
      servicePermissionCode: "records.snapshot.capture",
      idempotency: "required",
    });
    expect(
      result.actions.some((action) => action.key === "versions_read"),
    ).toBe(false);
    // Incomplete declarations cannot bypass the required pinned source profile.
    expect(() =>
      capabilityArtifactMembers("example_reference", [
        { capabilityKey: "activity", declaration: { enabled: true } } as never,
      ]),
    ).toThrow();
  });

  it("isolates entity overrides from another entity and the locked source", () => {
    const source = profile();
    const first = prepareActivityEnrollment(
      {
        ...selection(),
        overrides: {
          views: ["snapshots"],
          defaultView: "snapshots",
          snapshots: { manualCapture: false, retentionClass: "operational" },
          query: { pageSize: 20 },
        },
      },
      () => source,
      referenceSupport,
    );
    expect(first.policy.views).toEqual(["snapshots"]);
    expect(first.actions.map((action) => action.key)).toEqual([
      "snapshots_read",
      "snapshots_compare",
    ]);
    expect(
      prepareActivityEnrollment(selection(), () => source, referenceSupport)
        .policy,
    ).toEqual(profile().defaults);
    expect(source).toEqual(profile());
  });

  it.each([
    { views: ["revisions"] },
    { views: ["versions", "auditLog"] },
    { views: [] },
    { views: ["snapshots"] },
    { defaultView: "requests" },
    { snapshots: { manualCapture: "true" } },
    {
      snapshots: {
        automaticCapture: "committed",
        captureOperations: ["patch"],
      },
    },
    { snapshots: { retentionClass: "permanent" } },
    { query: { pageSize: 101 } },
    { query: { maxRangeDays: 10 } },
    { query: { pageSize: 1.5 } },
    { permissionCode: "common.platform.reference.view" },
    { admissionResolverKey: "allow.all" },
    { snapshots: { fields: ["private_value"] } },
    JSON.parse('{"__proto__":{"enabled":true}}'),
  ])("rejects unsupported or inconsistent entity override %j", (overrides) => {
    expect(() =>
      prepareActivityEnrollment(
        { ...selection(), overrides },
        profile,
        referenceSupport,
      ),
    ).toThrow();
  });

  it.each([
    { binding: {} },
    { profileDefinition: {} },
    { permissionCode: "audit.event.query" },
    { ownerEntityCode: "other" },
  ])("rejects source injection outside profile selection %j", (extra) => {
    expect(() =>
      prepareActivityEnrollment(
        { ...selection(), ...extra },
        profile,
        referenceSupport,
      ),
    ).toThrow();
  });

  it("pins profile identity and version", () => {
    expect(() =>
      prepareActivityEnrollment(
        selection(),
        () => ({ ...profile(), profileVersion: 2 }),
        referenceSupport,
      ),
    ).toThrow();
    expect(() =>
      parseCapabilityProfile({
        ...profile(),
        profileCode: "platform.collaboration.activity.standard",
      }),
    ).toThrow();
    expect(() =>
      parseCapabilityProfile({
        ...profile(),
        defaults: {
          ...profile().defaults,
          permissionCode: "audit.event.query",
        },
      }),
    ).toThrow();
    expect(() =>
      resolveCapabilityProfileDefaults(
        {
          declaration: { enabled: true },
          capabilityKey: "comments",
          profile: selection().profile,
        },
        profile,
      ),
    ).toThrow();
  });

  it("rechecks relationships after overrides and when reading effective policy", () => {
    const source = parseCapabilityProfile(profile());
    expect(() =>
      validateCapabilityProfileBinding(source, {
        ...profile().defaults,
        defaultView: "snapshots",
        views: ["auditLog"],
      }),
    ).toThrow();
    expect(() =>
      validateCapabilityProfileBinding(source, {
        ...profile().defaults,
        snapshots: {
          ...profile().defaults.snapshots,
          automaticCapture: "committed",
          captureOperations: ["patch"],
        },
      }),
    ).toThrow();
  });
});

describe("Activity provider qualification", () => {
  it("requires an authoritative provider before showing committed Versions", () => {
    const value = profile().defaults;
    value.views.push("versions");
    const policy = parseActivityPolicy(value);
    expect(() => qualifyActivityPolicy(policy, referenceSupport)).toThrow(
      "authoritative version history provider required",
    );
    expect(() =>
      qualifyActivityPolicy(policy, {
        ...referenceSupport,
        versionHistoryAvailable: true,
      }),
    ).not.toThrow();
    expect(
      activityPolicyActions(policy).find(
        (action) => action.key === "versions_read",
      )?.permissionCode,
    ).toBe("common.audit.event.query");
  });

  it("requires the owning write path for each automatic capture trigger", () => {
    const value = profile().defaults;
    value.snapshots.automaticCapture = "committed";
    value.snapshots.captureOperations = ["patch"];
    const policy = parseActivityPolicy(value);
    expect(() => qualifyActivityPolicy(policy, referenceSupport)).toThrow(
      "transactional automatic capture provider required",
    );
    expect(() =>
      qualifyActivityPolicy(policy, {
        ...referenceSupport,
        automaticCaptureAvailable: true,
      }),
    ).toThrow("owning write path");
    expect(() =>
      qualifyActivityPolicy(policy, {
        ...referenceSupport,
        automaticCaptureAvailable: true,
        writableOperations: ["patch"],
      }),
    ).not.toThrow();
  });

  it("does not disable required automatic capture when the snapshot view is hidden", () => {
    const value = profile().defaults;
    value.views = ["auditLog"];
    value.snapshots.automaticCapture = "milestone";
    value.snapshots.captureOperations = ["activate"];
    const policy = parseActivityPolicy(value);
    expect(activityPolicyActions(policy).map((action) => action.key)).toEqual([
      "audit_query",
    ]);
    expect(policy.snapshots.automaticCapture).toBe("milestone");
    expect(() => qualifyActivityPolicy(policy, referenceSupport)).toThrow();
  });

  it.each([
    { automaticCapture: "committed", captureOperations: [] },
    { automaticCapture: "none", captureOperations: ["patch"] },
    { automaticCapture: "committed", captureOperations: ["patch", "patch"] },
    { automaticCapture: ["committed"], captureOperations: ["patch"] },
    { retentionClass: ["standard"] },
  ])("rejects malformed capture policy %j", (changes) => {
    const value = profile().defaults;
    expect(() =>
      parseActivityPolicy({
        ...value,
        snapshots: { ...value.snapshots, ...changes },
      }),
    ).toThrow();
  });
});
