import { expect, it } from "vitest";
import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { entityDirectory } from "./entity-list-routes.js";
import { RecordServiceError } from "./errors.js";

const context = {} as VerifiedRequestContext;
function descriptor(code: string, actions: EntityListDescriptorV1["actions"] = []) {
  return {
    surface: { key: code, title: `${code} title`, description: `${code} description`, header: { iconKey: "globe", title: { defaultLocale: "en", values: {} } } },
    actions,
  } as unknown as EntityListDescriptorV1;
}
const action = (key: string, overrides: Partial<EntityListDescriptorV1["actions"][number]> = {}) => ({
  key, label: key, href: `/app/entity/x/${key}`, placement: "primary", selection: "none", execution: "navigate", state: "enabled", ...overrides,
}) as EntityListDescriptorV1["actions"][number];

it("returns only entities the caller may list, in request order, with authorized primary navigation", async () => {
  const lists = {
    descriptor: async (_context: VerifiedRequestContext, code: string) => {
      if (code === "denied") throw new RecordServiceError(403, "FORBIDDEN", "no");
      if (code === "unpublished") throw new RecordServiceError(404, "NOT_FOUND", "no");
      return descriptor(code, [
        action("new"),
        action("disabled", { state: "disabled" }),
        action("overflow", { placement: "overflow" }),
        action("command", { execution: "synchronous" }),
      ]);
    },
  };
  const result = await entityDirectory(lists, context, ["currency", "denied", "country", "unpublished"]);
  expect(result.items.map((item) => item.entityCode)).toEqual(["currency", "country"]);
  expect(result.items[0]).toEqual({
    entityCode: "currency",
    title: "currency title",
    description: "currency description",
    iconKey: "globe",
    actions: [{ key: "new", label: "new", href: "/app/entity/x/new" }],
  });
});

it("leaves out an entity that cannot be served and reports it, without blanking the rest", async () => {
  const reported: string[] = [];
  const lists = {
    descriptor: async (_context: VerifiedRequestContext, code: string) => {
      if (code === "broken") throw new Error("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
      if (code === "denied") throw new RecordServiceError(403, "FORBIDDEN", "no");
      return descriptor(code);
    },
  };
  const result = await entityDirectory(lists, context, ["country", "broken", "denied"], (code, error) => reported.push(`${code}:${(error as Error).message}`));
  expect(result.items.map((item) => item.entityCode)).toEqual(["country"]);
  // Access denials are routine and silent; only serving failures reach operators.
  expect(reported).toEqual(["broken:ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE"]);
});

it("adds the authorized exact record count; an inexact, failed or slow count is left out, never zero", async () => {
  const { vi } = await import("vitest");
  vi.useFakeTimers();
  try {
    const pending = new Promise<never>(() => {});
    const lists = {
      descriptor: async (_context: VerifiedRequestContext, code: string) => descriptor(code),
      list: async (query: { entityCode: string; countMode?: string; limit?: number }) => {
        expect(query.countMode).toBe("exact");
        expect(query.limit).toBe(1);
        if (query.entityCode === "country") return { pagination: { countMode: "exact", total: 247 } };
        if (query.entityCode === "currency") return { pagination: { countMode: "estimated", total: 180 } };
        if (query.entityCode === "denied") throw new RecordServiceError(403, "FORBIDDEN", "no");
        return pending;
      },
    };
    const result = entityDirectory(lists as never, context, ["country", "currency", "denied", "slow"]);
    await vi.advanceTimersByTimeAsync(1500);
    const items = (await result).items;
    expect(items.map((item) => [item.entityCode, item.count])).toEqual([["country", 247], ["currency", undefined], ["denied", undefined], ["slow", undefined]]);
    expect(items.every((item) => item.count !== 0)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
