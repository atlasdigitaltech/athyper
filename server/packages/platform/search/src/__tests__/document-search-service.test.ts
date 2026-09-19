import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import type { SearchHit, SearchQuery } from "@athyper/server-contract-search";
import { describe, expect, it, vi } from "vitest";
import { createDocumentSearchService } from "../index.js";
import { context } from "./fixtures.js";

function hit(id: number): SearchHit {
  return { attachmentId: String(id), entityType: "invoice", entityId: `entity-${id}`, title: `Invoice ${id}`, contentType: "text/plain", fileName: "invoice.txt", updatedAt: "2026-09-06" };
}
function setup(hits: SearchHit[] = [], allowed: (input: AuthorizationRequest) => boolean = () => true) {
  const search = vi.fn(async (query: SearchQuery) => ({ hits: hits.slice(query.offset, query.offset + query.limit), total: 999999, processingMs: 1 }));
  const authorize = vi.fn(async (input: AuthorizationRequest) => allowed(input) ? { allowed: true as const } : { allowed: false as const, reason: "denied" });
  const service = createDocumentSearchService({ authorizer: { authorize }, index: { search, upsert: async () => undefined, remove: async () => undefined } });
  return { service, search, authorize };
}
describe("document search service", () => {
  it("derives scope from verified context and normalizes filters", async () => {
    const { service, search } = setup();
    await service.search({ context: context(), text: " invoice ", entityTypes: [" invoice ", "invoice", "order"], page: 2, pageSize: 10 });
    expect(search).toHaveBeenCalledWith({ planeKey: "mesh", tenantId: context().tenantId, text: "invoice", entityTypes: ["invoice", "order"], resourceTypes: ["attachment"], limit: 500, offset: 0 });
  });
  it("requires documents.search before querying the index", async () => {
    const { service, search } = setup([], () => false);
    await expect(service.search({ context: context(), text: "x" })).rejects.toMatchObject({ statusCode: 403 });
    expect(search).not.toHaveBeenCalled();
  });
  it("paginates authorized results without duplicates and reports the authorized total", async () => {
    const { service } = setup(Array.from({ length: 30 }, (_, i) => hit(i)), (input) => input.permissionCode === "documents.search" || Number(input.resource?.["attachmentId"]) % 2 === 1);
    const results = await Promise.all([1, 2, 3, 4].map((page) => service.search({ context: context(), text: "invoice", page, pageSize: 5 })));
    expect(results.map((result) => result.hits.map((h) => h.attachmentId))).toEqual([["1", "3", "5", "7", "9"], ["11", "13", "15", "17", "19"], ["21", "23", "25", "27", "29"], []]);
    expect(results.map((result) => result.total)).toEqual([15, 15, 15, 15]);
  });
  it("continues beyond a batch of forbidden hits", async () => {
    const { service, search } = setup(Array.from({ length: 502 }, (_, i) => hit(i)), (input) => input.permissionCode === "documents.search" || Number(input.resource?.["attachmentId"]) >= 500);
    const result = await service.search({ context: context(), text: "invoice", pageSize: 1 });
    expect(result).toMatchObject({ hits: [hit(500)], total: 2, processingMs: 2 });
    expect(search.mock.calls.map(([query]) => query.offset)).toEqual([0, 500]);
  });
  it("does not expose content items or malformed attachment hits even if the index returns them", async () => {
    const { service, authorize } = setup([{ ...hit(1), resourceType: "content_item", resourceId: "private-content" }, { ...hit(2), attachmentId: "" }, hit(3)]);
    expect(await service.search({ context: context(), text: "invoice" })).toMatchObject({ hits: [hit(3)], total: 1 });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenLastCalledWith({ context: context(), permissionCode: "documents.read", resource: { tenantId: context().tenantId, resourceCode: "invoice", recordId: "entity-3", resourceId: "3", attachmentId: "3", entityType: "invoice", entityId: "entity-3" } });
  });
  it("passes canonical record coordinates for per-record denials", async () => {
    const { service } = setup([hit(1), hit(2)], (input) => input.resource?.["resourceCode"] !== "invoice" || input.resource?.["recordId"] !== "entity-1");
    expect(await service.search({ context: context(), text: "invoice" })).toMatchObject({ hits: [hit(2)], total: 1 });
  });
  it.each(["", " ", "x".repeat(257)])("rejects invalid text %j", async (text) => {
    const { service, search } = setup();
    await expect(service.search({ context: context(), text })).rejects.toMatchObject({ code: "INVALID_SEARCH_QUERY" });
    expect(search).not.toHaveBeenCalled();
  });
  it.each([[], [""], [" "], ["invoice", ""], ["invoice OR x"], ["a".repeat(128)]])("rejects invalid filters %j", async (...entityTypes) => {
    const { service, search } = setup();
    await expect(service.search({ context: context(), text: "x", entityTypes })).rejects.toMatchObject({ code: "INVALID_ENTITY_TYPE" });
    expect(search).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Number.NaN, Infinity, 10001])("rejects invalid page %s", async (page) => {
    await expect(setup().service.search({ context: context(), text: "x", page })).rejects.toMatchObject({ code: "INVALID_PAGINATION" });
  });
  it.each([0, -1, 1.5, Number.NaN, 101])("rejects invalid page size %s", async (pageSize) => {
    await expect(setup().service.search({ context: context(), text: "x", pageSize })).rejects.toMatchObject({ code: "INVALID_PAGINATION" });
  });
  it("propagates index and authorization failures", async () => {
    const { service, search, authorize } = setup([hit(1)]);
    search.mockRejectedValueOnce(new Error("index failed"));
    await expect(service.search({ context: context(), text: "x" })).rejects.toThrow("index failed");
    authorize.mockRejectedValueOnce(new Error("authorization failed"));
    await expect(service.search({ context: context(), text: "x" })).rejects.toThrow("authorization failed");
  });
});
