import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { requestKind, requestTab, RequestActivity, RequestLifecycle } from "./request-workspace";
import type { RequestView } from "./client";
const view = {
  request: {id:"request-1",kind:"new_partner",requestedRole:"supplier",status:"draft",createdAt:"2026-09-14T01:00:00Z",proposedPayload:{},validationSummary:{}},
  case: {rowVersion:2,ownership:{requesterId:"internal-person-id"},sections:[{id:"details",label:"Case details",state:"complete",errors:0},{id:"completion",label:"Materialization",state:"not_started",errors:0}]},
} as unknown as RequestView;
describe("request workspace", () => {
  it.each(["case","validation","workflow","evidence","result"])("preserves old %s links by opening Review", tab => expect(requestTab(tab)).toBe("review"));
  it("preserves new destinations and falls back safely", () => {
    for (const tab of ["overview","details","review","activity"]) expect(requestTab(tab)).toBe(tab);
    expect(requestTab("unknown")).toBe("overview");
  });
  it("distinguishes creation, extension and amendment context", () => {
    expect(requestKind(view.request)).toBe("New supplier request");
    expect(requestKind({...view.request,targetBusinessPartnerId:"partner-1"})).toBe("Supplier role extension");
    expect(requestKind({...view.request,kind:"amend_partner"})).toBe("Partner amendment");
  });
  it("shows authoritative stages and exceptional status without internal process terminology", () => {
    const html = renderToStaticMarkup(<RequestLifecycle view={{...view,request:{...view.request,status:"returned"}}}/>);
    expect(html).toContain("Returned");
    expect(html).toContain("Completion");
    expect(html).not.toContain("Materialization");
    expect(html).toContain("Not Started");
    expect(html).not.toContain("internal-person-id");
  });
  it("does not invent audit events or snapshots from a row version", () => {
    const html = renderToStaticMarkup(<RequestActivity view={view}/>);
    expect(html).toContain("Request created");
    expect(html).not.toContain("Request approved");
    expect(html).toContain("complete audit feed is not available");
    expect(html).toContain("Historical request snapshots and version comparison are not available");
    expect(html).not.toContain("View snapshot");
  });
});
