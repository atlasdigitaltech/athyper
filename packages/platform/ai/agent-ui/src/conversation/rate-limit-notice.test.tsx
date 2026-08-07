import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtlasRateLimitNotice } from "./rate-limit-notice";

describe("AtlasRateLimitNotice", () => {
  it("renders one quiet live-region notice with retry guidance", () => {
    render(
      <AtlasRateLimitNotice
        notice={{
          message: "Atlas is busy. Try again in about 17 seconds.",
          retryAfterSeconds: 17,
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Try again in about 17 seconds",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing without a rate-limit failure", () => {
    const { container } = render(<AtlasRateLimitNotice notice={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
