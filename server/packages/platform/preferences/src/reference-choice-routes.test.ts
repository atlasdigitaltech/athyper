import express from "express";
import { afterEach, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  registerReferenceChoiceRoutes,
  type ReferenceHistoryStore,
} from "./reference-choice-routes.js";
let server: Server;
afterEach(() => new Promise<void>((resolve) => server?.close(() => resolve())));
it("derives owner and policy from authenticated metadata, merges choices and clears only that owner", async () => {
  const rows = new Map<string, Map<string, string>>();
  let enabled = true;
  const store: ReferenceHistoryStore = {
    async execute(scope, cmd) {
      const scopeKey = JSON.stringify(scope);
      const history = rows.get(scopeKey) ?? new Map();
      rows.set(scopeKey, history);
      if (cmd.action === "select")
        history.set(cmd.key!, new Date().toISOString());
      if (cmd.action === "clear") history.clear();
      return [...history].map(([key, selectedAt]) => ({ key, selectedAt }));
    },
  };
  const app = express();
  app.use(express.json());
  registerReferenceChoiceRoutes(app, {
    authenticate: (req, res, next) => {
      if (!req.headers.authorization) {
        res.sendStatus(401);
        return;
      }
      res.locals.owner = req.headers.authorization;
      next();
    },
    readContext: (res) =>
      ({
        planeKey: "neon",
        tenantId: "tenant",
        principalId: res.locals.owner,
      }) as never,
    descriptor: async () =>
      ({
        scope: { status: "ready", fingerprint: "context" },
        intakeSurfaces: [
          {
            key: "details",
            sections: [
              {
                fields: [
                  {
                    control: "input",
                    key: "country",
                    widget: "select",
                    lookup: {
                      sourceKey: "iso.country",
                      recent: {
                        enabled,
                        limit: 5,
                        persistence: "server",
                        scope: "referenceSource",
                        retentionDays: 90,
                      },
                      options: [
                        { value: "MY", label: "Malaysia" },
                        { value: "SA", label: "Saudi Arabia" },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }) as never,
    store,
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = (owner: string | undefined, body?: unknown, extra = "") =>
    fetch(
      `http://127.0.0.1:${port}/api/entity-runtime/business_partner/reference-history?surface=details&field=country${extra}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          ...(owner ? { authorization: owner } : {}),
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  expect((await request(undefined)).status).toBe(401);
  await request("alice", {
    action: "select",
    key: "MY",
    principalId: "bob",
    retentionDays: 999,
  });
  await request(
    "alice",
    { action: "select", key: "SA" },
    "&organization=other",
  );
  expect(
    (await (await request("alice")).json()).items.map((x: any) => x.key).sort(),
  ).toEqual(["MY", "SA"]);
  expect((await (await request("bob")).json()).items).toEqual([]);
  expect(
    [...rows.keys()].every(
      (key) => !key.includes("other") && !key.includes("999"),
    ),
  ).toBe(true);
  expect((await request("alice", { action: "select", key: "XX" })).status).toBe(
    422,
  );
  await request("bob", { action: "select", key: "MY" });
  await request("alice", { action: "clear" });
  expect((await (await request("alice")).json()).items).toEqual([]);
  expect((await (await request("bob")).json()).items).toHaveLength(1);
  enabled = false;
  expect((await request("alice", { action: "select", key: "MY" })).status).toBe(
    403,
  );
});
