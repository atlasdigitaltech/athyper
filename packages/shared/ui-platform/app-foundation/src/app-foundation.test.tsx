import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createPlaneMetadata } from "./metadata";
import { GlobalApplicationError } from "./global-application-error";
import { PlaneAppBootstrapSkeleton } from "./plane-app-bootstrap-skeleton";
import { PlaneNotFound } from "./plane-not-found";
import { PlaneRouteError } from "./plane-route-error";

describe("shared app boundaries", () => {
  it.each(["admin", "mesh", "neon"] as const)(
    "creates metadata and branded boundaries for %s",
    (plane) => {
      const metadata = createPlaneMetadata(plane);
      const notFound = renderToStaticMarkup(<PlaneNotFound plane={plane} />);
      const loading = renderToStaticMarkup(
        <PlaneAppBootstrapSkeleton plane={plane} />,
      );

      expect(metadata.title).toBeTruthy();
      expect(metadata.applicationName).toBeTruthy();
      expect(notFound).toContain("Page not found");
      expect(notFound).toContain('href="/dashboard"');
      expect(loading).toContain(`data-plane="${plane}"`);
      expect(loading).toContain('data-loading-skeleton="application-bootstrap"');
    },
  );

  it("renders generic and fatal route failures through one primitive", () => {
    const generic = renderToStaticMarkup(
      <PlaneRouteError
        error={new Error("UNEXPECTED_FAILURE")}
        reset={() => undefined}
      />,
    );
    const fatal = renderToStaticMarkup(
      <PlaneRouteError
        error={Object.assign(new Error("fatal"), {
          code: "SESSION_STORE_UNAVAILABLE",
          digest: "fatal-request",
        })}
        reset={() => undefined}
      />,
    );

    expect(generic).toContain("Route error");
    expect(fatal).toContain("Sign-in is temporarily unavailable.");
    expect(fatal).toContain("fatal-request");
  });

  it("renders application-level failure content without owning root markup", () => {
    const markup = renderToStaticMarkup(
      <GlobalApplicationError
        error={Object.assign(new Error("fatal"), {
          digest: "global-request",
        })}
        reset={() => undefined}
      />,
    );

    expect(markup).toContain("Application error");
    expect(markup).toContain("global-request");
    expect(markup).not.toContain("<html");
    expect(markup).not.toContain("<body");
  });
});
