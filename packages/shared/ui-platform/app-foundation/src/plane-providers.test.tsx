import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlaneProviders } from "./plane-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("PlaneProviders", () => {
  it("mounts the common query, toast, and auth-failure provider stack", () => {
    render(
      <PlaneProviders>
        <div>Application child</div>
      </PlaneProviders>,
    );

    expect(screen.getByText("Application child")).toBeInTheDocument();
  });
});
