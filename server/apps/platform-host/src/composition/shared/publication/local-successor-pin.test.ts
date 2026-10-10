import { expect, it } from "vitest";
import type { LocalPublicationRequest } from "@athyper/server-contract-publication";
import { localSuccessorPin } from "./local-successor-pin.js";
const prior = "00000000-0000-4000-8000-000000000001";
function request(plane: string, predecessorHash: string | null = null) {
  return {
    admission: { host: { environment: "local" } },
    inputs: {
      release: { predecessorReleaseId: prior },
      targets: [{ plane, instance: "dev", predecessorHash }],
    },
  } as unknown as LocalPublicationRequest;
}
it("signs explicit absence on each new destination using the admitted source predecessor", () => {
  for (const plane of ["neon", "mesh"] as const) {
    expect(
      localSuccessorPin(request(plane), plane, "metadata.reference.fixture", 2),
    ).toEqual({
      plane,
      environment: "local",
      instance: "dev",
      publicationKey: "metadata.reference.fixture",
      sourceReleaseId: prior,
      sourceReleaseNo: 1,
      headState: "absent",
    });
  }
});
it("does not turn a missing Studio predecessor or non-null destination hash into absence", () => {
  expect(() =>
    localSuccessorPin(
      request("studio"),
      "studio",
      "metadata.reference.fixture",
      2,
    ),
  ).toThrow("PREDECESSOR_EVIDENCE_REQUIRED");
  expect(() =>
    localSuccessorPin(
      request("neon", "a".repeat(64)),
      "neon",
      "metadata.reference.fixture",
      2,
    ),
  ).toThrow("PREDECESSOR_EVIDENCE_REQUIRED");
});
