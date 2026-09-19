import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationLoading, ApplicationFatalError, ApplicationError } from "../../packages/platform/shell/app-foundation/src/application-fallbacks";

for (const plane of ["neon", "mesh", "studio"] as const) {
  test(`${plane} loading and fatal fallback render without application providers`, () => {
    const loading = renderToStaticMarkup(<ApplicationLoading plane={plane} collapsed />);
    assert.match(loading, new RegExp(`/brand/${plane}/identity-lockup.svg`));
    assert.match(loading, /data-collapsed="true"/);
    assert.equal((loading.match(/<main\b/g) ?? []).length, 1);
    assert.equal((loading.match(/role="status"/g) ?? []).length, 1);
    const content = renderToStaticMarkup(<ApplicationLoading plane={plane} content />);
    assert.doesNotMatch(content, /<main\b/);
    assert.match(content, /Updating .* workspace/);
    const startup = renderToStaticMarkup(<ApplicationError plane={plane} error={new Error("private startup details")} />);
    assert.equal((startup.match(/<main\b/g) ?? []).length, 1);
    assert.doesNotMatch(startup, /private startup details/);
    const localError = renderToStaticMarkup(<ApplicationError plane={plane} content error={new Error("private content details")} />);
    assert.doesNotMatch(localError, /<main\b/);
    assert.match(localError, /href="\/home"/);
    const fatal = renderToStaticMarkup(<ApplicationFatalError plane={plane} error={new Error("private diagnostic must not render")} />);
    assert.match(fatal, /<html lang="en">/);
    assert.match(fatal, /Try again/);
    assert.doesNotMatch(fatal, /private diagnostic must not render/);
  });
}
