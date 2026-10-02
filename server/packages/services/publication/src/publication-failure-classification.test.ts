import { describe, expect, it } from "vitest";
import { classifyPublicationFailure } from "./publication-orchestrator.js";

describe("publication state conflict classification", () => {
  it.each([
    "ACTIVATION_REGRESSION",
    "RELEASE_SEQUENCE_NOT_FORWARD",
    "LOCAL_ACTIVATION_HEAD_MISMATCH",
    "LOCAL_ROLLBACK_HEAD_MISMATCH",
    "ACKNOWLEDGEMENT_CONFLICT",
    "DEPLOYMENT_TERMINAL",
  ])("preserves message-only %s as a non-retryable conflict", (code) => {
    const failure = classifyPublicationFailure(new Error(code), "activate");
    expect(failure.evidence()).toEqual({
      category: "conflict",
      code,
      step: "activate",
      retryable: false,
    });
    expect(failure.message).toBe("Publication state conflict");
  });

  it("recognizes the rollback mismatch when supplied as a structured code", () => {
    const failure = classifyPublicationFailure(
      Object.assign(new Error("private database details"), {
        code: "LOCAL_ROLLBACK_HEAD_MISMATCH",
      }),
      "activate",
    );
    expect(failure.evidence()).toMatchObject({
      category: "conflict",
      code: "LOCAL_ROLLBACK_HEAD_MISMATCH",
      retryable: false,
    });
    expect(failure.message).not.toContain("private");
  });

  it.each(["ECONNRESET", "40001", "40P01"])(
    "preserves structured transient %s even with a conflict-like message",
    (code) => {
      expect(
        classifyPublicationFailure(
          Object.assign(new Error("LOCAL_ACTIVATION_HEAD_MISMATCH"), { code }),
          "activate",
        ).evidence(),
      ).toMatchObject({ category: "transient", code, retryable: true });
    },
  );

  it.each([
    "LOCAL_ACTIVATION_HEAD_MISMATCH: private data",
    "unexpected LOCAL_ROLLBACK_HEAD_MISMATCH",
    "unrecognized dependency failure",
  ])(
    "does not infer conflict or expose arbitrary message content: %s",
    (message) => {
      const failure = classifyPublicationFailure(
        new Error(message),
        "activate",
      );
      expect(failure.evidence()).toMatchObject({
        category: "transient",
        code: "PUBLICATION_DEPENDENCY_UNAVAILABLE",
        retryable: true,
      });
      expect(failure.message).toBe("Publication dependency unavailable");
    },
  );
});
