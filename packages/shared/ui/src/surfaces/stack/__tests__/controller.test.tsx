import { describe, expect, it, vi } from "vitest";
import { renderHook, render, act } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  SurfaceStackProvider,
  useStackFrame,
  useSurfaceStack,
  type SurfaceStackApi,
} from "../index";

function wrap(opts?: { onRuleViolation?: "throw" | "warn" }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SurfaceStackProvider onRuleViolation={opts?.onRuleViolation}>
        {children}
      </SurfaceStackProvider>
    );
  };
}

describe("SurfaceStackProvider — open / close lifecycle", () => {
  it("starts with an empty stack", () => {
    const { result } = renderHook(() => useSurfaceStack(), { wrapper: wrap() });
    expect(result.current.frames).toEqual([]);
  });

  it("open() pushes a frame and returns its id", () => {
    const { result } = renderHook(() => useSurfaceStack(), { wrapper: wrap() });
    let id = "";
    act(() => {
      id = result.current.open({ kind: "drawer-peek", source: "test" });
    });
    expect(id).toMatch(/^surface-/);
    expect(result.current.frames).toHaveLength(1);
    expect(result.current.frames[0]).toMatchObject({
      id,
      kind: "drawer-peek",
      source: "test",
    });
  });

  it("close() pops the named frame", () => {
    const { result } = renderHook(() => useSurfaceStack(), { wrapper: wrap() });
    let firstId = "";
    let secondId = "";
    act(() => {
      firstId = result.current.open({ kind: "overlay" });
      secondId = result.current.open({ kind: "drawer-form" });
    });
    expect(result.current.frames.map((f) => f.id)).toEqual([firstId, secondId]);
    act(() => {
      result.current.close(secondId);
    });
    expect(result.current.frames.map((f) => f.id)).toEqual([firstId]);
  });

  it("update() patches the frame in place", () => {
    const { result } = renderHook(() => useSurfaceStack(), { wrapper: wrap() });
    let id = "";
    act(() => {
      id = result.current.open({ kind: "drawer-form" });
    });
    expect(result.current.frames[0]?.dirty).toBeUndefined();
    act(() => {
      result.current.update(id, { dirty: true });
    });
    expect(result.current.frames[0]?.dirty).toBe(true);
  });
});

describe("SurfaceStackProvider — rule violations", () => {
  it("throws in dev mode by default when drawer-in-drawer is attempted", () => {
    const { result } = renderHook(() => useSurfaceStack(), {
      wrapper: wrap({ onRuleViolation: "throw" }),
    });
    act(() => {
      result.current.open({ kind: "drawer-form" });
    });
    expect(() =>
      act(() => {
        result.current.open({ kind: "drawer-peek" });
      }),
    ).toThrow(/Drawer-in-drawer is prohibited/);
  });

  it("warns and returns empty id in production mode", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useSurfaceStack(), {
      wrapper: wrap({ onRuleViolation: "warn" }),
    });
    act(() => {
      result.current.open({ kind: "drawer-form" });
    });
    let rejectedId = "_";
    act(() => {
      rejectedId = result.current.open({ kind: "drawer-form" });
    });
    expect(rejectedId).toBe("");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Drawer-in-drawer is prohibited"),
    );
    expect(result.current.frames).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it("rejects out-of-order opens (overlay over drawer-form)", () => {
    const { result } = renderHook(() => useSurfaceStack(), {
      wrapper: wrap({ onRuleViolation: "warn" }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    act(() => {
      result.current.open({ kind: "drawer-form" });
    });
    act(() => {
      result.current.open({ kind: "overlay" });
    });
    expect(result.current.frames).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stacking order violation"));
    warn.mockRestore();
  });
});

describe("useStackFrame — auto-register lifecycle", () => {
  it("registers when open=true and deregisters on unmount", () => {
    const capturedApi: { current: SurfaceStackApi | null } = { current: null };
    function Capture() {
      capturedApi.current = useSurfaceStack();
      return null;
    }
    function Frame({ open }: { open: boolean }) {
      useStackFrame({ open, kind: "dialog-confirm", source: "test-frame" });
      return null;
    }

    const { unmount, rerender } = render(
      <SurfaceStackProvider>
        <Capture />
        <Frame open={true} />
      </SurfaceStackProvider>,
    );

    expect(capturedApi.current).not.toBeNull();
    expect(capturedApi.current!.frames).toHaveLength(1);
    expect(capturedApi.current!.frames[0]?.kind).toBe("dialog-confirm");

    rerender(
      <SurfaceStackProvider>
        <Capture />
        <Frame open={false} />
      </SurfaceStackProvider>,
    );
    expect(capturedApi.current!.frames).toHaveLength(0);

    rerender(
      <SurfaceStackProvider>
        <Capture />
        <Frame open={true} />
      </SurfaceStackProvider>,
    );
    expect(capturedApi.current!.frames).toHaveLength(1);

    unmount();
  });

  it("noop when no provider mounted (graceful degradation)", () => {
    function Frame() {
      useStackFrame({ open: true, kind: "drawer-form" });
      return null;
    }
    // No wrapper — provider not present. Must not throw.
    expect(() => render(<Frame />)).not.toThrow();
  });
});
