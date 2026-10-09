import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordAncestorPath } from "../../packages/platform/entity/runtime/form-detail/src/detail-workspace";

// The ancestor path on the record detail page (Entity list Tree blueprint B5).
const intl = { message: (key: string) => ({ "detail.ancestors": "Where this record sits", "detail.ancestorsOutsideView": "Outside your view" })[key] ?? key } as never;

test("shows the visible ancestors as links, then the record as the current location", () => {
  const html = renderToStaticMarkup(
    <RecordAncestorPath
      path={{ items: [{ id: "a", label: "1000 Assets", href: "/app/entity/gl_account/a" }, { id: "b", label: "1100 Current assets" }] }}
      current="1110 Cash and bank"
      intl={intl}
    />,
  );
  assert.match(html, /<nav[^>]*aria-label="Where this record sits"/);
  assert.match(html, /<a[^>]*href="\/app\/entity\/gl_account\/a"[^>]*>1000 Assets<\/a>/);
  assert.match(html, /<span>1100 Current assets<\/span>/);
  assert.match(html, /<li aria-current="page">1110 Cash and bank<\/li>/);
  assert.doesNotMatch(html, /Outside your view/);
});

test("marks a hidden parent first, without naming it", () => {
  const html = renderToStaticMarkup(<RecordAncestorPath path={{ items: [], parentOutsideView: true }} current="2110" intl={intl} />);
  assert.match(html, /<li class="a-metadata-detail__ancestor-hidden">Outside your view<\/li><li aria-current="page">2110<\/li>/);
});
