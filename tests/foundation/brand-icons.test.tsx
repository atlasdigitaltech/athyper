import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as React from "react";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND_PLANES, getPlaneBrand, isSafePublicAssetUrl } from "../../packages/platform/foundation/brand/src/index";
import { CheckIcon, InfoIcon, resolveIcon } from "../../packages/platform/foundation/icons/src/index";

describe("brand and icon contracts", () => {
  it("publishes safe complete metadata with deployable public assets and no React", () => { for (const plane of BRAND_PLANES) { const brand = getPlaneBrand(plane); assert.ok(brand.applicationName); for (const url of [brand.favicon, brand.wordmark.src, brand.inverseWordmark.src, brand.appIcon.src]) { assert.ok(isSafePublicAssetUrl(url)); assert.ok(existsSync(`apps/${plane}/public${url}`), `${plane} is missing ${url}`); } } assert.equal(isSafePublicAssetUrl("//evil.test/a"), false); assert.equal(isSafePublicAssetUrl("/../secret"), false); });
  it("renders semantic SVGs and safely falls back for unknown keys", () => { assert.match(renderToStaticMarkup(<CheckIcon title="Complete" />), /role="img"/); assert.equal(resolveIcon("missing"), InfoIcon); });
});
