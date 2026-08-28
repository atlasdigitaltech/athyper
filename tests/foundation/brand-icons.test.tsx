import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as React from "react";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ATLAS_MODERN_BRAND, BRAND_PLANES, getPlaneBrand, getPlaneWebMetadata, isSafePublicAssetUrl } from "../../packages/platform/foundation/brand/src/index";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon, GripVerticalIcon, InfoIcon, MoreVerticalIcon, resolveIcon, StarIcon } from "../../packages/platform/foundation/icons/src/index";

describe("brand and icon contracts", () => {
  it("publishes safe complete metadata with deployable public assets and no React", () => { for (const plane of BRAND_PLANES) { const brand = getPlaneBrand(plane); assert.ok(brand.applicationName); for (const url of [brand.favicon, brand.wordmark.src, brand.inverseWordmark.src, brand.appIcon.src]) { assert.ok(isSafePublicAssetUrl(url)); assert.ok(existsSync(`apps/${plane}/public${url}`), `${plane} is missing ${url}`); } } assert.equal(isSafePublicAssetUrl("//evil.test/a"), false); assert.equal(isSafePublicAssetUrl("/../secret"), false); });
  it("publishes Atlas Modern browser chrome for every plane", () => { for (const plane of BRAND_PLANES) { const brand = getPlaneBrand(plane); assert.equal(brand.themeColor, ATLAS_MODERN_BRAND.colors.primary); const manifest = JSON.parse(readFileSync(`apps/${plane}/public${brand.manifest}`, "utf8")); assert.equal(manifest.theme_color, ATLAS_MODERN_BRAND.colors.primary); assert.equal(manifest.description, brand.description); } });
  it("keeps browser tabs plane-first with the configured compact separator while retaining the Athyper family in install metadata", () => { for (const plane of BRAND_PLANES) { const brand = getPlaneBrand(plane); const metadata = getPlaneWebMetadata(plane); assert.equal(metadata.applicationName, `Athyper ${brand.shortName}`); assert.equal(metadata.title, `${brand.shortName} - ${brand.description}`); assert.equal(metadata.titleTemplate, `%s - ${brand.shortName}`); assert.doesNotMatch(metadata.title, /^Athyper\b/); assert.doesNotMatch(metadata.title, /—|--/u); } });
  it("renders semantic SVGs and safely falls back for unknown keys", () => { assert.match(renderToStaticMarkup(<CheckIcon title="Complete" />), /role="img"/); assert.equal(resolveIcon("missing"), InfoIcon); });
  it("publishes shared Lucide-compatible list sorting, favourites, reordering, and row-action icons", () => { for (const Icon of [ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, StarIcon, GripVerticalIcon, MoreVerticalIcon]) assert.match(renderToStaticMarkup(<Icon size={16}/>), /<svg[^>]+viewBox="0 0 24 24"/); });
});
