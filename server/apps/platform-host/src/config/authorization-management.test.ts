import { describe, expect, it } from "vitest";
import { assertAuthorizationManagementHostQualification } from "./index.js";

describe("C4 authorization management host qualification", () => {
  const qualified = {
    authorizationGoldenEvaluatorCorpusQualified: true,
    authorizationDdlEpochIntegrationQualified: true,
    authorizationWriterSwitchQualified: true,
  } as const;

  it("allows legacy and shadow without enabling the v2 writer", () => {
    expect(() => assertAuthorizationManagementHostQualification({ ...qualified, authorizationManagementMode: "legacy" })).not.toThrow();
    expect(() => assertAuthorizationManagementHostQualification({ ...qualified, authorizationManagementMode: "shadow", authorizationWriterSwitchQualified: false })).not.toThrow();
  });

  it.each([
    "authorizationGoldenEvaluatorCorpusQualified",
    "authorizationDdlEpochIntegrationQualified",
    "authorizationWriterSwitchQualified",
  ] as const)("refuses enforce when %s is false", (field) => {
    expect(() => assertAuthorizationManagementHostQualification({ ...qualified, authorizationManagementMode: "enforce", [field]: false })).toThrow("AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED");
  });

  it("accepts enforce only when all three host gates qualify", () => {
    expect(() => assertAuthorizationManagementHostQualification({ ...qualified, authorizationManagementMode: "enforce" })).not.toThrow();
  });
});
