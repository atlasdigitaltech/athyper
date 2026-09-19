import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request } from "@playwright/test";
import capture from "./auth-capture-step-up.cjs";

test("step-up sends session-bound CSRF and keeps the issuer redirect interactive", async (t) => {
  const server = createServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/auth/step-up/start?returnTo=%2Fhome");
    assert.equal(req.headers.origin, origin);
    assert.equal(req.headers["sec-fetch-site"], "same-origin");
    assert.equal(req.headers["x-csrf-token"], "csrf-proof");
    assert.match(req.headers.cookie, /athyper-session=session-id/);
    res.writeHead(302, {
      location: "https://issuer.example/interactive-mfa",
      "set-cookie": "athyper-oauth=browser-binding; Path=/; HttpOnly",
    });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cookies = ["session", "csrf"].map((kind) => ({
    name: `athyper-${kind}`,
    value: kind === "session" ? "session-id" : "csrf-proof",
    domain: "127.0.0.1",
    path: "/",
    expires: -1,
    httpOnly: kind === "session",
    secure: false,
    sameSite: "Lax",
  }));
  const api = await request.newContext({
    storageState: { cookies, origins: [] },
  });
  t.after(() => api.dispose());
  let destination;
  await capture.startCaptureStepUp(
    { cookies: async () => (await api.storageState()).cookies, request: api },
    {
      goto: async (url) => {
        destination = url;
      },
    },
    origin,
  );
  assert.equal(destination, "https://issuer.example/interactive-mfa");
  assert.equal(
    (await api.storageState()).cookies.find((c) => c.name === "athyper-oauth")
      .value,
    "browser-binding",
  );
});

test("rejected step-up fails immediately without exposing response contents", async () => {
  let disposed = false;
  const context = {
    cookies: async () => [{ name: "__Host-athyper-csrf", value: "proof" }],
    request: {
      post: async () => ({
        status: () => 403,
        headers: () => ({}),
        dispose: async () => {
          disposed = true;
        },
      }),
    },
  };
  await assert.rejects(
    capture.startCaptureStepUp(
      context,
      { goto: () => assert.fail("must not navigate") },
      "https://studio.dev.athyper.test",
    ),
    /Step-up capture: start rejected \(HTTP 403\)/,
  );
  assert.equal(disposed, true);
});

test("missing CSRF cookie fails before making a request", async () => {
  await assert.rejects(
    capture.startCaptureStepUp(
      {
        cookies: async () => [],
        request: { post: () => assert.fail("must not post") },
      },
      {},
      "https://studio.dev.athyper.test",
    ),
    /CSRF cookie unavailable/,
  );
});
