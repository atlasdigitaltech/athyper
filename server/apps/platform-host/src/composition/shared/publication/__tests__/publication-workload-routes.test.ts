import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import ts from "typescript";
import express from "express";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { registerPublicationWorkloadRoutes } from "../workload-routes.js";
import { createHttpApplication } from "@athyper/server-runtime-http";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture(limited = false) {
  const author = "a".repeat(43),
    publisher = "b".repeat(43);
  const credential = (token: string, n: number) => ({
    principalId: id(n),
    code: `test.actor${n}`,
    authEpoch: 0,
    credentialSha256: createHash("sha256").update(token).digest("hex"),
  });
  const configuration = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
    tenantId: id(1),
    realmKey: "test",
    author: credential(author, 2),
    publisher: credential(publisher, 3),
  };
  const query = vi.fn(async () => ({ rows: [] }));
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const dependencies = { database } as Parameters<
    typeof registerPublicationWorkloadRoutes
  >[1]["dependencies"];
  const app = limited
    ? createHttpApplication({
        rateLimit: {
          scope: "tenant-principal",
          windowMs: 60000,
          maxRequests: 1,
        },
        configure: (application) =>
          registerPublicationWorkloadRoutes(application, {
            configuration,
            dependencies,
          }),
      })
    : express();
  if (!limited) {
    app.use(express.json());
    registerPublicationWorkloadRoutes(app, { configuration, dependencies });
  }
  app.use((error: any, _req: any, res: any, _next: any) =>
    res
      .status(error.status ?? error.statusCode ?? 500)
      .json({ code: error.code }),
  );
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/api/studio/publication-policies/${id(4)}/execute`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-plane": "studio",
          "x-publication-author": author,
          "x-publication-publisher": publisher,
          ...headers,
        },
        body: JSON.stringify(body),
      },
    );
  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.destroy();
  };
  return { request, close, query, configuration, dependencies };
}
it("requires both independently mounted credentials before database access", async () => {
  const f = await fixture();
  try {
    for (const role of ["author", "publisher"])
      expect(
        (await f.request({}, { [`x-publication-${role}`]: "wrong" })).status,
      ).toBe(401);
    expect(f.query).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it("throttles authenticated workloads before database/policy execution", async () => {
  const f = await fixture(true);
  try {
    expect(
      (await f.request({}, { "x-publication-author": "wrong" })).status,
    ).toBe(401);
    const body = { version: 1, expectedHash: "a".repeat(64) };
    expect((await f.request(body)).status).toBe(403);
    f.query.mockClear();
    expect((await f.request(body)).status).toBe(429);
    expect(f.query).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it("rejects caller-selected source/tenant coordinates and missing pins", async () => {
  const f = await fixture();
  try {
    for (const body of [
      {},
      { version: 1, expectedHash: "a".repeat(64), policy: {} },
      { version: 1, expectedHash: "a".repeat(64), tenantId: id(9) },
    ])
      expect((await f.request(body)).status).toBe(400);
    expect(f.query).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it("cannot execute when valid credentials have no persisted policy", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.request({ version: 1, expectedHash: "a".repeat(64) })).status,
    ).toBe(403);
    expect(f.query).toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it.each(["qa", "staging", "production"])(
  "does not mount DEV execution in %s",
  async (instance) => {
    const f = await fixture();
    try {
      expect(() =>
        registerPublicationWorkloadRoutes(express(), {
          configuration: { ...f.configuration, instance },
          dependencies: f.dependencies,
        }),
      ).toThrow("DEV_ONLY");
    } finally {
      await f.close();
    }
  },
);
it("keeps workload mounting independent of legacy product code", () => {
  const text = readFileSync(
    new URL("../workload-routes.ts", import.meta.url),
    "utf8",
  );
  const allowed = new Set([
    "./native-compilation-recovery-execution.js",
    "./deployment-recovery-execution.js",
    "./human-publication-execution.js",
    "node:crypto",
    "express",
    "kysely",
    "@athyper/server-platform-policy",
    "@athyper/server-plane-studio-meta-entity-authoring",
    "@athyper/server-runtime-http",
    "../../../development/publication-workload.js",
    "./machine-policy.js",
    "./enrollment-contract.js",
    "./compilation-recovery-execution.js",
  ]);
  for (const node of ts.createSourceFile(
    "routes.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  ).statements)
    if (ts.isImportDeclaration(node))
      expect(
        allowed.has((node.moduleSpecifier as ts.StringLiteral).text) ||
          (node.moduleSpecifier as ts.StringLiteral).text ===
            "@athyper/server-foundation/context",
      ).toBe(true);
  expect(text).not.toMatch(
    /country|currency|business_partner|dev-publication\.js/,
  );
});
