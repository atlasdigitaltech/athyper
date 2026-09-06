import express, { type ErrorRequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enforceContractResponses,
  HttpError,
} from "@athyper/server-runtime-http";
import { registerRecordBookmarkRoutes } from "../bookmarks/record-bookmark-routes.js";
import { RecordServiceError } from "../errors.js";
import type { Server } from "node:http";

const ID = "018f6d2a-1111-7a11-8111-111111111111";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});
async function fixture(failure?: number, authenticated = true) {
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  const context = {} as never;
  const result = async () => {
    if (failure)
      throw new RecordServiceError(
        failure,
        "EXPECTED_FAILURE",
        "Expected failure",
      );
    return new Set([ID]);
  };
  const bookmarks = {
    list: vi.fn(async () => []),
    membership: vi.fn(result),
    add: vi.fn(result),
    remove: vi.fn(result),
  };
  registerRecordBookmarkRoutes(app, {
    authenticate: (_req, _res, next) =>
      next(
        authenticated
          ? undefined
          : new HttpError(401, "UNAUTHORIZED", "Sign in"),
      ),
    readContext: () => context,
    bookmarks,
  });
  app.use(((error, _req, res, _next) => {
    res
      .status(error.statusCode ?? 500)
      .json({ code: error.code ?? "INTERNAL_ERROR" });
  }) satisfies ErrorRequestHandler);
  const server = await new Promise<Server>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  servers.push(server);
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}/api/record-bookmarks`,
    bookmarks,
  };
}

describe("record bookmark HTTP contracts", () => {
  it("serves all four authenticated operations with no-store responses", async () => {
    const { url, bookmarks } = await fixture();
    const list = await fetch(url);
    expect(await list.json()).toEqual({ items: [] });
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    const membership = await fetch(
      `${url}/business_partner/membership?recordId=${ID}&recordId=${ID}`,
    );
    expect(await membership.json()).toEqual({
      entityCode: "business_partner",
      bookmarkedRecordIds: [ID],
    });
    for (const method of ["PUT", "DELETE"]) {
      const response = await fetch(`${url}/business_partner`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: [{ id: ID }] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        operation: method === "PUT" ? "add" : "remove",
        recordIds: [ID],
      });
    }
    expect(bookmarks.membership).toHaveBeenCalledWith({}, "business_partner", [
      ID,
      ID,
    ]);
  });

  it.each([400, 403, 404, 409, 503])(
    "preserves expected %i failures with response enforcement enabled",
    async (status) => {
      const { url } = await fixture(status);
      const response = await fetch(`${url}/business_partner`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: [{ id: ID }] }),
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code: "EXPECTED_FAILURE" });
    },
  );

  it("preserves authentication failures and never invokes the service", async () => {
    const { url, bookmarks } = await fixture(undefined, false);
    const response = await fetch(url);
    expect(response.status).toBe(401);
    expect(bookmarks.list).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { records: [] },
    { records: [{ id: "invalid" }] },
    { records: [{ id: ID, label: 42 }] },
    { records: Array(101).fill({ id: ID }) },
  ])(
    "rejects malformed mutations before calling the service: %j",
    async (body) => {
      const { url, bookmarks } = await fixture();
      const response = await fetch(`${url}/business_partner`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect(bookmarks.add).not.toHaveBeenCalled();
    },
  );

  it("rejects one-character entity codes and incomplete work context", async () => {
    const { url, bookmarks } = await fixture();
    for (const [entity, body] of [
      ["a", { records: [{ id: ID }] }],
      ["business_partner", { records: [{ id: ID }], companyCodeId: ID }],
    ] as const) {
      const response = await fetch(`${url}/${entity}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(bookmarks.add).not.toHaveBeenCalled();
  });
  it.each(["", "?recordId=invalid", `?recordId=${ID}&unexpected=true`])(
    "rejects invalid membership queries: %s",
    async (query) => {
      const { url, bookmarks } = await fixture();
      const response = await fetch(
        `${url}/business_partner/membership${query}`,
      );
      expect(response.status).toBe(400);
      expect(bookmarks.membership).not.toHaveBeenCalled();
    },
  );
});
