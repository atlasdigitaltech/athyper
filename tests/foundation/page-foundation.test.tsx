import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PageFrame, PageHeader, SectionNavigation } from "@athyper/platform-shell";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("page foundation", () => {
  it("renders a levelled page identity with metadata and actions", () => {
    const html = renderToStaticMarkup(<PageFrame width="wide"><PageHeader level="collection" context="Business Partner · Manage" title="Business Partners" description="Governed records." icon={<span>BP</span>} metadata={<span>101 records</span>} actions={<button type="button">Create</button>}/></PageFrame>);

    assert.match(html, /athyper-page-frame--wide/);
    assert.match(html, /athyper-page-header--collection/);
    assert.match(html, /Business Partner · Manage/);
    assert.match(html, /101 records/);
    assert.match(html, /athyper-page-header__actions/);
  });

  it("marks the active section destination", () => {
    const html = renderToStaticMarkup(<SectionNavigation label="Business Partner module" currentHref="/mdg/business-partner/manage" items={[{ href: "/mdg/business-partner", label: "Overview" }, { href: "/mdg/business-partner/manage", label: "Manage" }]}/>);

    assert.match(html, /aria-current="page"/);
    assert.match(html, />Manage<\/a>/);
  });
});
