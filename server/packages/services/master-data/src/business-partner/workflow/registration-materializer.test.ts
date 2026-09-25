import { describe, expect, it } from "vitest";
import { registrationMaterializer } from "./registration-materializer.js";
const base = { operationCode: "new_partner", requestedRole: null, status: "approved", materializerCode: null };
describe("registration writer cutover", () => {
  it("selects identity-only authority for new core registration", () => {
    expect(registrationMaterializer(base)).toBe("master.command_materialize_business_partner_registration_case");
  });
  it.each(["supplier", "customer"])("does not reinterpret %s intake", requestedRole => {
    expect(registrationMaterializer({ ...base, requestedRole })).toBeNull();
  });
  it.each(["role", "registration"])("replays the recorded %s writer", kind => {
    expect(registrationMaterializer({ ...base, status: "materialized", materializerCode: `neon.business_partner_${kind}` }))
      .toBe(`master.command_materialize_business_partner_${kind}_case`);
  });
  it("does not guess missing or unknown replay authority", () => {
    expect(() => registrationMaterializer({ ...base, status: "materialized" })).toThrow("recorded materialization authority");
    expect(() => registrationMaterializer({ ...base, status: "materialized", materializerCode: "unknown" })).toThrow("recorded materialization authority");
  });
  it("does not intercept company setup", () => {
    expect(registrationMaterializer({ ...base, operationCode: "configure_company" })).toBeNull();
  });
});
