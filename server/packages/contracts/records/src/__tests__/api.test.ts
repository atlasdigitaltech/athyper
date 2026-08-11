import { describe, expect, expectTypeOf, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  CreateRecordCommand,
  RecordMutationResult,
  RecordMutationService,
  RecordQueryService,
} from "../index.js";

describe("records contract API", () => {
  it("uses the canonical auth context and discriminated mutation results", () => {
    expectTypeOf<CreateRecordCommand["context"]>().toEqualTypeOf<VerifiedRequestContext>();
    expectTypeOf<RecordMutationService>().toHaveProperty("create");
    expectTypeOf<RecordQueryService>().toHaveProperty("list");

    const result = {
      kind: "VersionConflict",
      expectedVersion: 1,
      currentVersion: 2,
    } as const satisfies RecordMutationResult;
    expect(result.kind).toBe("VersionConflict");
  });
});
