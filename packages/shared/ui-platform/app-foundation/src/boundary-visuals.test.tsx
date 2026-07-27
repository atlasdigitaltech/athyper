import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlaneNotFound } from "./plane-not-found";
import {
  PlaneAppBootstrapSkeleton,
  PlanePublicLoading,
} from "./plane-app-bootstrap-skeleton";
import { PlaneRouteError } from "./plane-route-error";

const PLANES = ["admin", "mesh", "neon"] as const;

describe.each(PLANES)("%s boundary visuals", (plane) => {
  it("snapshots not-found", () => {
    expect(renderToStaticMarkup(<PlaneNotFound plane={plane} />)).toMatchSnapshot();
  });

  it("snapshots generic error", () => {
    expect(
      renderToStaticMarkup(
        <PlaneRouteError
          error={new Error("UNEXPECTED_FAILURE")}
          reset={() => undefined}
        />,
      ),
    ).toMatchSnapshot();
  });

  it("snapshots fatal auth error as visible full-page UI", () => {
    const markup = renderToStaticMarkup(
      <PlaneRouteError
        error={Object.assign(new Error("fatal"), {
          code: "SESSION_STORE_UNAVAILABLE",
          digest: `${plane}-fatal-request`,
        })}
        reset={() => undefined}
      />,
    );

    expect(markup).toContain("min-h-screen");
    expect(markup).toMatchSnapshot();
  });

  it("snapshots public loading", () => {
    expect(
      renderToStaticMarkup(<PlanePublicLoading plane={plane} />),
    ).toMatchSnapshot();
  });

  it("snapshots shell loading", () => {
    expect(
      renderToStaticMarkup(
        <PlaneAppBootstrapSkeleton plane={plane} surface="shell" />,
      ),
    ).toMatchSnapshot();
  });
});
