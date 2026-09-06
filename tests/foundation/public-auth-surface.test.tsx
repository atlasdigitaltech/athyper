import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextGatePage, LoginGatePage, LogoutGatePage } from "../../packages/platform/iam/identity-gate/src/index";
import { getPlaneBrand, getPlaneWebMetadata } from "../../packages/platform/foundation/brand/src/index";

describe("production identity-gate experience", () => {
  it("renders the shared Atlas Modern identity shell with the approved pre-authentication lockup in every plane", () => {
    for (const plane of ["neon", "mesh", "studio"] as const) {
      const brand = getPlaneBrand(plane); const html = renderToStaticMarkup(<LoginGatePage plane={plane} />);
      assert.match(html, new RegExp(brand.identityLockup.src.replaceAll("/", "\\/"))); assert.match(html, new RegExp(`alt="${brand.identityLockup.alt}"`));
      assert.equal((html.match(/a-presentation-card/g) ?? []).length, 1); assert.match(html, /Continue securely/);
      assert.match(html, /a-public-identity__story/); assert.match(html, new RegExp(brand.description));
      assert.match(html, /Atlas Digital Technology Solutions/); assert.match(html, /Secured by Athyper Identity/);
      assert.doesNotMatch(html, /Server-managed sessions|No browser tokens|a-auth-wordmark/);
    }
  });

  it("renders safe production recovery, context, and logout states", () => {
    const failure = renderToStaticMarkup(<LoginGatePage plane="neon" reason="access" requestId="req-safe-42" returnTo="https://evil.example" />);
    assert.match(failure, /Access could not be confirmed/); assert.match(failure, /Use a different account/); assert.match(failure, /Try this account again/); assert.match(failure, /req-safe-42/); assert.match(failure, /returnTo=%2F/);
    assert.match(failure, /mode=switch/); assert.match(failure, /mode=retry/); assert.doesNotMatch(failure, /active membership|evil\.example|auth\.invalid_identity/);
    assert.match(renderToStaticMarkup(<ContextGatePage plane="mesh" />), /No active context is available/);
    const logout = renderToStaticMarkup(<LogoutGatePage plane="studio" csrfToken="csrf-safe" />); assert.match(logout, /Sign out of Studio/); assert.match(logout, /Sign out of Athyper everywhere/); assert.match(logout, /name="_csrf" value="csrf-safe"/);
  });

  it("renders exact-plane context choices with plane-specific work-scope summaries", () => {
    const examples = [
      { plane: "neon", noun: "business context", description: "Business operations, finance and governed execution", badges: ["2 legal entities", "4 operating organizations"] },
      { plane: "mesh", noun: "network workspace", description: "Verified buyer and supplier network participation", badges: ["1 buyer account", "2 supplier accounts"] },
      { plane: "studio", noun: "administration context", description: "Platform administration and governed tenant operations", badges: ["Administrative authority", "Audited access"] },
    ] as const;
    for (const example of examples) {
      const html = renderToStaticMarkup(<ContextGatePage plane={example.plane} contexts={[{ tenantId: "tenant-1", tenantCode: "athyper", tenantName: "Athyper Group", principalId: "principal-1", description: example.description, badges: example.badges }]} />);
      assert.match(html, new RegExp(`Choose your ${example.noun}`)); assert.match(html, /Athyper Group/); assert.match(html, new RegExp(example.description));
      for (const badge of example.badges) assert.match(html, new RegExp(badge));
      assert.match(html, /Use a different account/); assert.match(html, /Sign out securely/);
    }
  });

  it("keeps public plane stories short and immediately understandable", () => {
    const stories = {
      neon: ["Govern Business Partner data.", "Create, validate, approve, and maintain trusted partner records."],
      mesh: ["Connect your Business Partner network.", "Manage governed partner relationships and shared profiles."],
      studio: ["Define Business Partner governance.", "Author and publish the definitions used by Neon and Mesh."],
    } as const;
    for (const [plane, copy] of Object.entries(stories) as [keyof typeof stories, readonly [string, string]][]) {
      const html = renderToStaticMarkup(<LoginGatePage plane={plane} />);
      assert.match(html, new RegExp(copy[0].replace(".", "\\.")));
      assert.match(html, new RegExp(copy[1].replace(".", "\\.")));
    }
  });

  it("uses the same recovery structure for every supported reason, including pasted trailing punctuation", () => {
    for (const reason of ["access", "service", "retry", "expired", "signed-out", "signed-out-everywhere", "logout-incomplete", "access;"] as const) {
      for (const plane of ["neon", "mesh", "studio"] as const) {
        const html = renderToStaticMarkup(<LoginGatePage plane={plane} reason={reason} />);
        assert.equal((html.match(/a-presentation-card/g) ?? []).length, 1);
        assert.equal((html.match(/a-notice/g) ?? []).length >= 1, true);
        assert.match(html, new RegExp(getPlaneBrand(plane).identityLockup.src.replaceAll("/", "\\/")));
      }
    }
  });

  it("ships complete metadata and approved assets for every plane", () => {
    for (const plane of ["neon", "mesh", "studio"] as const) {
      const metadata = getPlaneWebMetadata(plane); const root = `apps/${plane}/public`;
      for (const asset of [metadata.favicon, metadata.appleTouchIcon, metadata.manifest]) assert.equal(existsSync(`${root}${asset}`), true, `${plane} missing ${asset}`);
    }
  });

  it("uses semantic tokens and has no backup runtime dependency", () => {
    const css = readFileSync("packages/platform/iam/identity-gate/src/styles.css", "utf8");
    const source = readFileSync("packages/platform/iam/identity-gate/src/index.tsx", "utf8");
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i);
    assert.doesNotMatch(`${css}\n${source}`, /apps-backup|packages-backup/);
  });

  it("centers the public identity composition on mobile while preserving readable form alignment", () => {
    const appCss = readFileSync("packages/platform/iam/identity-gate/src/styles.css", "utf8");
    const iamCss = readFileSync("deploy/config/iam/themes/neon/login/resources/css/login.css", "utf8");
    assert.match(appCss, /@media\(max-width:52rem\)\{\.a-identity-panel\{text-align:center\}/);
    assert.match(iamCss, /\.kc-page-header\s*\{\s*justify-content:\s*center;/);
    assert.match(iamCss, /\.kc-panel-right\s*\{\s*justify-content:\s*center;/);
    assert.match(iamCss, /\.kc-form,\s*\.kc-field,[\s\S]*text-align:\s*left;/);
    assert.match(iamCss, /\.kc-footer\s*\{\s*justify-content:\s*center;[\s\S]*text-align:\s*center;/);
  });

  it("uses concise page-specific IAM and application browser titles", () => {
    const context = readFileSync("deploy/config/iam/themes/neon/login/_iam-context.ftl", "utf8");
    const resolver = readFileSync("deploy/config/iam/themes/neon/login/_theme-resolver.ftl", "utf8");
    assert.match(context, /<\#return "\$\{pageTitle\} \$\{iamProductName\}">/);
    assert.doesNotMatch(context, /Athyper (?:Neon|Mesh|Studio) -/);
    assert.doesNotMatch(resolver, /document\.title/);
    for (const plane of ["neon", "mesh", "studio"] as const) {
      const layout = readFileSync(`apps/${plane}/app/layout.tsx`, "utf8");
      assert.match(layout, /template: brand\.titleTemplate/);
      for (const [route, title] of [["sign-in", "Sign in"], ["logout", "Sign out"], ["select-context", "Choose context"]] as const) {
        const page = readFileSync(`apps/${plane}/app/(public)/${route}/page.tsx`, "utf8");
        assert.match(page, new RegExp(`title: "${title}"`));
      }
    }
  });
});
