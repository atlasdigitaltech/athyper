import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeaderContextIdentity, ShellContextPickerPanel, ShellContextSelector } from "../../packages/platform/shell/shell/src/client";

describe("HeaderContextIdentity", () => {
  it("renders a governed logo, switch affordance, and contextual hover detail", () => {
    const markup = renderToStaticMarkup(<HeaderContextIdentity name="Athyper Saudi Hospitality" logoAssetRef="/brand/companies/asah.svg" switchable hoverLines={["asah · Athyper Saudi Hospitality", "le-asah · Athyper Saudi Hospitality"]} />);
    assert.match(markup, /src="\/brand\/companies\/asah\.svg"/);
    assert.match(markup, /athyper-context-identity__switch/);
    assert.match(markup, /asah · Athyper Saudi Hospitality/);
    assert.match(markup, /le-asah · Athyper Saudi Hospitality/);
  });

  it("falls back to the universal company tile and supplied name when no logo is configured", () => {
    const markup = renderToStaticMarkup(<HeaderContextIdentity name="Athyper Taiwan Electronics Mfg" />);
    assert.doesNotMatch(markup, /<img/);
    assert.match(markup, /athyper-context-identity__company/);
    assert.match(markup, /Athyper Taiwan Electronics Mfg/);
  });

  it("can render a compact name-only selector with a disclosure affordance", () => {
    const markup = renderToStaticMarkup(<HeaderContextIdentity name="Athyper India Textile & Leather Mfg" logoAssetRef="/brand/companies/aitl.svg" showMark={false} switchable hoverLines={["AITL · Athyper India Textile & Leather Mfg", "LE-AITL · Athyper India Textile & Leather Mfg"]} />);
    assert.doesNotMatch(markup, /<img/);
    assert.doesNotMatch(markup, /athyper-context-identity__company/);
    assert.match(markup, /athyper-context-identity__disclosure/);
    assert.match(markup, /Athyper India Textile &amp; Leather Mfg/);
  });

  it("renders either the logo or the company name in an exclusive selector", () => {
    const withLogo = renderToStaticMarkup(<HeaderContextIdentity name="Athyper UAE Trading" logoAssetRef="/brand/companies/autr.svg" logoOrName switchable />);
    assert.match(withLogo, /src="\/brand\/companies\/autr\.svg"/);
    assert.match(withLogo, /athyper-context-identity--logo-or-name/);
    assert.match(withLogo, /athyper-context-identity--switchable/);
    assert.match(withLogo, /athyper-context-identity--logo-only/);
    assert.match(withLogo, /athyper-context-identity__switch/);
    assert.doesNotMatch(withLogo, /<strong>Athyper UAE Trading<\/strong>/);

    const withoutLogo = renderToStaticMarkup(<HeaderContextIdentity name="Athyper UAE Trading" logoOrName switchable />);
    assert.doesNotMatch(withoutLogo, /<img/);
    assert.match(withoutLogo, /athyper-context-identity__company/);
    assert.match(withoutLogo, /athyper-context-identity--switchable/);
    assert.doesNotMatch(withoutLogo, /athyper-context-identity--logo-only/);
    assert.match(withoutLogo, /athyper-context-identity__switch/);
    assert.match(withoutLogo, /<strong>Athyper UAE Trading<\/strong>/);
    assert.doesNotMatch(withoutLogo, /athyper-context-identity__disclosure/);
  });

  it("never renders an external or traversing logo reference", () => {
    for (const logoAssetRef of ["https://example.test/logo.svg", "/brand/../private.svg"]) {
      const markup = renderToStaticMarkup(<HeaderContextIdentity name="Safe company" logoAssetRef={logoAssetRef} />);
      assert.doesNotMatch(markup, /<img/);
      assert.match(markup, /athyper-context-identity__company/);
    }
  });
});

describe("ShellContextSelector", () => {
  it("renders a single resolved context as static identity without a picker", () => {
    const markup = renderToStaticMarkup(<ShellContextSelector ariaLabel="Working company: CirrusAtlantic UK" name="CirrusAtlantic UK" interactive={false} />);
    assert.match(markup, /athyper-context-selector--static/);
    assert.match(markup, /athyper-context-identity__company/);
    assert.match(markup, /CirrusAtlantic UK/);
    assert.doesNotMatch(markup, /<details/);
  });

  it("renders multiple contexts with the shared interactive picker contract", () => {
    const markup = renderToStaticMarkup(<ShellContextSelector ariaLabel="Working company: Athyper UAE Trading" name="Athyper UAE Trading" logoAssetRef="/brand/tenants/athyper/auet.png" interactive><ShellContextPickerPanel title="Choose company" description="Select the company you are working with." searchLabel="Search companies" searchValue="" onSearchChange={()=>{}} resultSummary="17 companies available"><button data-context-picker-select type="button">Athyper UAE Trading</button></ShellContextPickerPanel></ShellContextSelector>);
    assert.match(markup, /<details/);
    assert.match(markup, /data-appearance="ghost"/);
    assert.match(markup, /data-context-picker-autofocus/);
    assert.match(markup, /data-context-picker-select/);
    assert.match(markup, /17 companies available/);
  });
});
