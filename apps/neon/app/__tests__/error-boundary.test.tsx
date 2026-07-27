import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ props: undefined as unknown }));

vi.mock("@athyper/app-foundation/client", () => ({
  PlaneRouteError: (props: unknown) => {
    captured.props = props;
    return null;
  },
}));

import ErrorPage from "../error";

describe("Neon route error boundary", () => {
  it("forwards Next error-boundary props to PlaneRouteError", () => {
    const error = new Error("UNEXPECTED_FAILURE");
    const reset = vi.fn();

    renderToStaticMarkup(<ErrorPage error={error} reset={reset} />);

    expect(captured.props).toEqual({ error, reset });
  });
});
