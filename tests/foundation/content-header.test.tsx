import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContentHeader } from "@athyper/platform-shell";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("ContentHeader", () => {
  it("renders the shared semantic page heading contract", () => {
    const html = renderToStaticMarkup(<ContentHeader eyebrow="Platform configuration" title="Languages and regions" description="Govern catalog readiness." actions={<button type="button">Save</button>} />);

    assert.match(html, /data-slot="content-header"/);
    assert.match(html, /aria-labelledby="page-title"/);
    assert.match(html, /<h1 class="athyper-content-header__title" id="page-title">Languages and regions<\/h1>/);
    assert.match(html, /athyper-content-header__actions/);
  });

  it("supports a custom title relationship and governed hero variant", () => {
    const html = renderToStaticMarkup(<ContentHeader variant="hero" titleId="workspace-title" title="Build and manage Athyper." />);

    assert.match(html, /athyper-content-header--hero/);
    assert.match(html, /aria-labelledby="workspace-title"/);
    assert.match(html, /id="workspace-title"/);
  });

  it("does not require redundant context when breadcrumbs provide location", () => {
    const html = renderToStaticMarkup(<ContentHeader title="Languages and regions" description="Govern catalog readiness." />);

    assert.match(html, /data-has-eyebrow="false"/);
    assert.doesNotMatch(html, /athyper-content-header__eyebrow/);
  });
});
