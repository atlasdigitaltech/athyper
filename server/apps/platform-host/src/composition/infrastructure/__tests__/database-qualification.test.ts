import { describe, expect, it } from "vitest";
import { assertRuntimePlaneDatabaseIdentity, type PlaneDatabaseIdentity } from "../database-qualification.js";

const valid: PlaneDatabaseIdentity = {
  databaseName: "athyper_neon",
  configuredPlane: "neon",
  sessionUser: "athyper_runtime",
  superuser: false,
  bypassRls: false,
  applicationRole: true,
};

describe("runtime plane database qualification", () => {
  it("accepts only an exact-plane least-privilege application role", () => {
    expect(() => assertRuntimePlaneDatabaseIdentity(valid, "neon")).not.toThrow();
  });

  it("rejects a wrong physical database or database-plane setting", () => {
    expect(() => assertRuntimePlaneDatabaseIdentity({ ...valid, databaseName: "athyper_studio" }, "neon"))
      .toThrow(/DATABASE_PLANE_MISMATCH/);
    expect(() => assertRuntimePlaneDatabaseIdentity({ ...valid, configuredPlane: "mesh" }, "neon"))
      .toThrow(/DATABASE_PLANE_MISMATCH/);
  });

  it("rejects superuser, BYPASSRLS, and non-application logins", () => {
    expect(() => assertRuntimePlaneDatabaseIdentity({ ...valid, superuser: true }, "neon"))
      .toThrow(/DATABASE_RUNTIME_ROLE_PRIVILEGED/);
    expect(() => assertRuntimePlaneDatabaseIdentity({ ...valid, bypassRls: true }, "neon"))
      .toThrow(/DATABASE_RUNTIME_ROLE_PRIVILEGED/);
    expect(() => assertRuntimePlaneDatabaseIdentity({ ...valid, applicationRole: false }, "neon"))
      .toThrow(/DATABASE_RUNTIME_ROLE_MISSING/);
  });
});
