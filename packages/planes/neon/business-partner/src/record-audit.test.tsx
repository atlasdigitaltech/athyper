// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createSharedRequestCoordinator } from "../../../../platform/entity/runtime/form-detail/src/shared-section-request";
import { mergeSectionPages } from "../../../../platform/entity/runtime/form-detail/src/use-section-resource";
import { writeRecordLocation } from "../../../../platform/entity/runtime/form-detail/src/record/write-record-location";
import { readBrowserPreference, writeBrowserPreference } from "../../../../platform/entity/runtime/form-detail/src/record/browser-preferences";
import { entityRecordHref } from "@athyper/contract-platform-entity-runtime";
import { commentCanReply } from "../../../../platform/entity/runtime/form-detail/src/comments-workspace";
import {requiredControlValue,optionalControlValue} from "./control-form-values";
import {retryRequiresDescriptor} from "../../../../platform/entity/runtime/list-view/src/retry-policy";
import {rollbackBookmarks} from "../../../../platform/entity/runtime/list-view/src/bookmark-state";
import {entityDisplayPreferenceNamespace,readDisplayPreferences,writeDisplayPreferences} from "../../../../platform/entity/runtime/list-view/src/preferences";
import {parseEntityApplicationPath} from "@athyper/contract-platform-entity-runtime";
import {entityLocationSearch} from "../../../../platform/entity/runtime/list-view/src/entity-location";

it("clears inherited entity query state without discarding explicit destination links",()=>{
 const previous={entityCode:"business_partner",pathname:"/manage"};
 expect(entityLocationSearch(previous,"person",{pathname:"/manage",search:"?sort=old&filters=old&columns=old"})).toBe("");
 expect(entityLocationSearch(previous,"person",{pathname:"/people",search:"?sort=name"})).toBe("?sort=name");
 expect(entityLocationSearch(previous,"business_partner",{pathname:"/manage",search:"?sort=name"})).toBe("?sort=name");
});

it("rolls back only failed bookmark records while retaining another successful toggle",()=>{
 expect([...rollbackBookmarks(new Set(["first","second"]),new Set(),["first"])]).toEqual(["second"]);
 expect([...rollbackBookmarks(new Set(["second"]),new Set(["first"]),["first"])]).toEqual(["second","first"]);
});
it("isolates display preferences by entity and surface within one plane",()=>{
 const namespace=(entity:string,surface="manage")=>entityDisplayPreferenceNamespace({entity:{code:entity},surface:{key:surface}} as any);
 const first={density:"compact",mode:"table",searchBehavior:"submit"} as const;
 const second={density:"spacious",mode:"table",searchBehavior:"instant"} as const;
 writeDisplayPreferences("neon",first,namespace("business_partner"));
 writeDisplayPreferences("neon",second,namespace("person"));
 expect(readDisplayPreferences("neon",namespace("business_partner"))).toEqual(first);
 expect(readDisplayPreferences("neon",namespace("person"))).toEqual(second);
 expect(readDisplayPreferences("neon",namespace("person","lookup"))).toBeUndefined();
});
it("parses canonical entity routes consistently and rejects ambiguous encoded separators",()=>{
 expect(parseEntityApplicationPath("/app/entity/business_partner/record/ ")).toBeUndefined();
 expect(parseEntityApplicationPath("/app/entity/business_partner/record/")).toEqual({entityCode:"business_partner",segments:["record"]});
 for(const path of ["/app/entity/business_partner//record","/app/entity/business_partner/%2fsecret","/app/entity/business_partner/%252fsecret","/app/entity/business_partner/%","/app/entity/business_partner/.."])
   expect(parseEntityApplicationPath(path)).toBeUndefined();
});

it("retries transient list errors without discarding the descriptor and pagination state", () => {
  for(const status of [0,429,500,502,503]) expect(retryRequiresDescriptor({kind:"http",status})).toBe(false);
  for(const status of [401,403,409]) expect(retryRequiresDescriptor({kind:"http",status})).toBe(true);
  expect(retryRequiresDescriptor({kind:"parse",status:0})).toBe(true);
});

it("uses tenant reply-depth boundaries and never overrides a server denial", () => {
  expect(commentCanReply({threadDepth:1},2)).toBe(true);
  expect(commentCanReply({threadDepth:2},2)).toBe(false);
  expect(commentCanReply({threadDepth:5},8)).toBe(true);
  expect(commentCanReply({threadDepth:1,canReply:false},8)).toBe(false);
  expect(commentCanReply({threadDepth:0})).toBe(false);
});
it("uses the same required-field semantics for Customer and Supplier", () => {
  const form=new FormData();
  expect(()=>requiredControlValue(form,"reason")).toThrow("required");
  form.set("reason","  ");
  expect(()=>requiredControlValue(form,"reason")).toThrow("required");
  expect(optionalControlValue(form,"reason")).toBeUndefined();
  form.set("reason"," Review ");
  expect(requiredControlValue(form,"reason")).toBe("Review");
});

it("removes malformed preference JSON and preserves valid preference objects", () => {
  localStorage.setItem("test-pref", "{");
  expect(readBrowserPreference("test-pref")).toEqual({});
  expect(localStorage.getItem("test-pref")).toBeNull();
  writeBrowserPreference("test-pref", {pinned:true,width:400});
  expect(readBrowserPreference("test-pref")).toEqual({pinned:true,width:400});
  localStorage.removeItem("test-pref");
});
it("encodes record coordinates and preserves repeated query parameters", () => {
  expect(entityRecordHref("business_partner", "id/with?reserved", new URLSearchParams("section=banking&tag=a&tag=b"))).toBe("/app/entity/business_partner/id%2Fwith%3Freserved?section=banking&tag=a&tag=b");
});

it("keeps a shared request alive when one consumer leaves and aborts after the last leaves", async () => {
  const request = createSharedRequestCoordinator<string>();
  let finish!: (value: string) => void;
  let transport!: AbortSignal;
  const start = vi.fn((signal: AbortSignal) => { transport = signal; return new Promise<string>(resolve => { finish = resolve; }); });
  const first = new AbortController(), second = new AbortController();
  const a = request("tenant:principal:epoch:release:context:section", start, first.signal);
  const b = request("tenant:principal:epoch:release:context:section", start, second.signal);
  const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve(); first.abort(); await rejected;
  expect(start).toHaveBeenCalledTimes(1); expect(transport.aborted).toBe(false);
  finish("ready"); expect(await b).toBe("ready");
  const last = new AbortController(); const c = request("other-epoch", start, last.signal);
  const cancelled = expect(c).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve(); last.abort(); await cancelled; expect(transport.aborted).toBe(true);
});
it("accumulates named collections and removes exhausted cursors", () => {
  const first = { data: { collections: { industries: [{ id: "a" }] }, nextCursor: "next" } };
  const second = { data: { collections: { industries: [{ id: "b" }] } } };
  expect(mergeSectionPages(first as never, second as never).data).toEqual({ collections: { industries: [{ id: "a" }, { id: "b" }] } });
});
it("preserves context, router state and Back/Forward while ignoring unchanged writes", async () => {
  window.history.replaceState({ router: true }, "", "/app/entity/business_partner/bp?companyCodeId=c&section=identity#anchor");
  writeRecordLocation(url => url.searchParams.set("section", "banking"));
  expect(window.history.state).toEqual({ router: true });
  expect(window.location.search).toContain("companyCodeId=c"); expect(window.location.hash).toBe("#anchor");
  expect(writeRecordLocation(url => url.searchParams.set("section", "banking"))).toBe(false);
  const changed = () => new Promise<void>(resolve => window.addEventListener("popstate", () => resolve(), { once: true }));
  let event = changed(); window.history.back(); await event; expect(window.location.search).toContain("section=identity");
  event = changed(); window.history.forward(); await event; expect(window.location.search).toContain("section=banking");
});
