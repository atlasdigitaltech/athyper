import express from "express";
import { routeContracts } from "@athyper/server-runtime-http";
import { describe, expect, it, vi } from "vitest";
import { registerExperienceRoutes } from "./routes.js";

describe("experience route contract", () => {
  it("registers an authenticated OpenAPI-visible bootstrap route", () => {
    const application = express();
    registerExperienceRoutes(application, { authenticate: (_request, _response, next) => next(), readContext: vi.fn() as never, service: { bootstrap: vi.fn() } as never });
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method: "get", path: "/api/platform/experience/bootstrap", operationId: "platformExperienceBootstrap", authenticated: true }));
  });
});
