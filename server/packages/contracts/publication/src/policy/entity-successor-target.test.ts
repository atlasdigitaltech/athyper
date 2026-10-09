import { expect, it } from "vitest";
import {
  assertEntitySuccessorTargetHead,
  parseEntitySuccessorTargetPin,
} from "./entity-successor-policy.js";
const absent = {
  plane: "neon",
  environment: "local",
  instance: "dev",
  publicationKey: "metadata.entity.example",
  sourceReleaseId: "00000000-0000-4000-8000-000000000001",
  sourceReleaseNo: 1,
  headState: "absent",
};
it("requires explicit absence and rejects a competing head", () => {
  const pin = parseEntitySuccessorTargetPin(absent);
  expect(() => assertEntitySuccessorTargetHead(pin, null)).not.toThrow();
  const { headState: _, ...coordinates } = absent;
  const head = parseEntitySuccessorTargetPin({
    ...coordinates,
    appliedReleaseId: absent.sourceReleaseId,
    artifactHash: "a".repeat(64),
    headVersion: 1,
  });
  expect(() => assertEntitySuccessorTargetHead(pin, head)).toThrow(
    "HEAD_CHANGED",
  );
  expect(() => assertEntitySuccessorTargetHead(head, null)).toThrow(
    "HEAD_MISSING",
  );
});
it.each([
  { ...absent, headState: "any" },
  { ...absent, appliedReleaseId: null },
  { ...absent, sourceReleaseId: null },
  { ...absent, sourceReleaseNo: 0 },
  { ...absent, artifactHash: "a".repeat(64) },
])("rejects malformed or mixed target expectations", (value) => {
  expect(() => parseEntitySuccessorTargetPin(value)).toThrow();
});
