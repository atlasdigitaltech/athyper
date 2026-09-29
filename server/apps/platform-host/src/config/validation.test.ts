import { describe, expect, it } from "vitest";
import { selectProcessRole } from "./validation.js";

describe("host process role selection", () => {
  it("defaults the compatibility launcher to api", () => {
    expect(selectProcessRole({})).toBe("api");
  });
  it.each(["api", "worker", "scheduler"] as const)("selects the explicit %s entrypoint without MODE", role => {
    expect(selectProcessRole({}, role)).toBe(role);
    expect(selectProcessRole({ MODE: role }, role)).toBe(role);
    expect(selectProcessRole({ MODE: role })).toBe(role);
  });
  it("rejects a conflicting deployment role", () => {
    expect(() => selectProcessRole({ MODE: "api" }, "worker")).toThrow("DEPLOYMENT_ROLE_MISMATCH");
  });
  it.each(["", "constructor", "toString", "__proto__", "unknown"])("rejects invalid MODE %j before runtime loading", MODE => {
    expect(() => selectProcessRole({ MODE })).toThrow("Unknown MODE");
  });
});
