import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SurfaceStackProvider,
  useSurfaceStack,
  type SurfaceStackApi,
} from "../index";

describe("SurfaceStackProvider nesting", () => {
  it("reuses the shell-level controller unless isolation is explicit", () => {
    let outer: SurfaceStackApi | null = null;
    let inner: SurfaceStackApi | null = null;

    function OuterCapture() {
      outer = useSurfaceStack();
      return null;
    }

    function InnerCapture() {
      inner = useSurfaceStack();
      return null;
    }

    render(
      <SurfaceStackProvider onRuleViolation="warn">
        <OuterCapture />
        <SurfaceStackProvider>
          <InnerCapture />
        </SurfaceStackProvider>
      </SurfaceStackProvider>,
    );

    expect(inner).toBe(outer);
    act(() => {
      inner?.open({ kind: "overlay", source: "atlas-agent" });
    });
    expect(outer?.frames).toHaveLength(1);
    expect(outer?.frames[0]?.source).toBe("atlas-agent");
  });

  it("supports an explicitly isolated controller for test or embedded roots", () => {
    let outer: SurfaceStackApi | null = null;
    let inner: SurfaceStackApi | null = null;

    function Capture({ target }: { target: "outer" | "inner" }) {
      const api = useSurfaceStack();
      if (target === "outer") outer = api;
      else inner = api;
      return null;
    }

    render(
      <SurfaceStackProvider>
        <Capture target="outer" />
        <SurfaceStackProvider isolate>
          <Capture target="inner" />
        </SurfaceStackProvider>
      </SurfaceStackProvider>,
    );

    expect(inner).not.toBe(outer);
  });
});
