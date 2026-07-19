import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppBootstrapSkeleton,
  BrandedLoginLoader,
  DashboardSkeleton,
  DocumentDetailSkeleton,
  GenericPageSkeleton,
  RouteLoadingFrame,
} from "../_components/loading/LoadingSkeletons";

describe("Neon loading skeletons", () => {
  it("renders a neutral application shell while session validation is pending", () => {
    const markup = renderToStaticMarkup(<AppBootstrapSkeleton />);

    expect(markup).toContain('aria-label="Loading application"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("w-nav-rail");
    expect(markup).toContain('data-loading-skeleton="neutral-bootstrap"');
    expect(markup).not.toContain('data-loading-skeleton="dashboard"');
    expect(markup).not.toContain("Settings");
    expect(markup).not.toContain("Notifications");
  });

  it("keeps the dashboard fallback specific to the command-hub page shape", () => {
    const markup = renderToStaticMarkup(<DashboardSkeleton />);

    expect(markup).toContain('data-loading-skeleton="dashboard"');
    expect(markup).not.toContain("grid-cols-5");
  });

  it("renders a login-only brand loader without authenticated application chrome", () => {
    const markup = renderToStaticMarkup(<BrandedLoginLoader />);

    expect(markup).toContain('data-loading-skeleton="branded-auth"');
    expect(markup).toContain('aria-label="Preparing secure sign-in…"');
    expect(markup).toContain('src="/brand/favicon.png"');
    expect(markup).toContain('src="/brand/wordmark-black.png"');
    expect(markup).toContain("athyper-auth-orbit");
    expect(markup).not.toContain("w-nav-rail");
  });

  it("keeps route loading inside a single accessible busy region", () => {
    const markup = renderToStaticMarkup(
      <RouteLoadingFrame label="Loading record…">
        <DocumentDetailSkeleton />
      </RouteLoadingFrame>,
    );

    expect(markup).toContain('aria-label="Loading record…"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain('aria-hidden="true"');
  });

  it("provides distinct generic and document page structures", () => {
    const genericMarkup = renderToStaticMarkup(<GenericPageSkeleton />);
    const documentMarkup = renderToStaticMarkup(<DocumentDetailSkeleton />);

    expect(genericMarkup).not.toBe(documentMarkup);
    expect(documentMarkup.length).toBeGreaterThan(genericMarkup.length);
  });
});
