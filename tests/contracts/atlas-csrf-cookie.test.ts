import assert from "node:assert/strict";
import test from "node:test";
import { readCsrfCookie } from "../../packages/platform/foundation/api-client/src/browser-csrf";
import { createAtlasAnswerClient } from "../../packages/platform/ai/agent-runtime/src/index";

test("CSRF cookie selection follows the session namespace, regardless of cookie order", () => {
  for (const cookies of [
    "__Host-athyper-csrf=stale; athyper-csrf=current",
    "athyper-csrf=current; __Host-athyper-csrf=stale",
  ]) {
    assert.equal(readCsrfCookie(cookies, false), "current");
    assert.equal(readCsrfCookie(cookies, true), "stale");
  }
  assert.equal(
    readCsrfCookie("__Host-athyper-csrf=other-mode", false),
    undefined,
  );
  assert.equal(readCsrfCookie("athyper-csrf=other-mode", true), undefined);
  assert.equal(readCsrfCookie("athyper-csrf=%invalid", false), undefined);
});

test("Atlas thread creation uses the current DEV token when an old production cookie remains", async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const previousFetch = globalThis.fetch;
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      cookie: "__Host-athyper-csrf=old-production; athyper-csrf=current-dev",
    },
  });
  let threadRequests = 0;
  let submittedToken: string | null = null;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      threadRequests++;
      submittedToken = new Headers(init.headers).get("x-csrf-token");
      return new Response(
        JSON.stringify({
          type: "https://athyper.dev/problems/RELAY_CSRF_INVALID",
          title: "CSRF validation failed",
          status: 403,
          code: "RELAY_CSRF_INVALID",
        }),
        {
          status: 403,
          headers: { "content-type": "application/problem+json" },
        },
      );
    }
    return Response.json({
      schema: "atlas-plane-admission/1",
      planeKey: "neon",
      chatAllowed: true,
      persistenceAllowed: true,
      readToolsAllowed: true,
      mutationToolsAllowed: false,
      invoiceExtractionAllowed: false,
      allowedPublicModelIds: ["local"],
      allowedDataClasses: ["internal"],
      policyRevision: "p",
    });
  };
  try {
    await assert.rejects(
      createAtlasAnswerClient().answer("Explain this record"),
    );
    assert.equal(submittedToken, "current-dev");
    assert.equal(
      threadRequests,
      1,
      "A rejected unsafe request must not be retried automatically",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});
