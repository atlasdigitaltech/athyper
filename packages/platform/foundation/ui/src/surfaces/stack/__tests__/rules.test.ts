import { describe, expect, it } from "vitest";
import { STACK_ORDER, topFrame, validateOpen, type MinimalFrame } from "../rules";

const frame = (kind: MinimalFrame["kind"]): MinimalFrame => ({ kind });

describe("STACK_ORDER", () => {
  it("orders destination < parent_bound_full < drawer < selection < confirmation", () => {
    expect(STACK_ORDER.destination).toBeLessThan(STACK_ORDER.parent_bound_full);
    expect(STACK_ORDER.parent_bound_full).toBeLessThan(STACK_ORDER.drawer);
    expect(STACK_ORDER.drawer).toBeLessThan(STACK_ORDER.selection);
    expect(STACK_ORDER.selection).toBeLessThan(STACK_ORDER.confirmation);
  });
});

describe("validateOpen — empty stack", () => {
  it("allows overlay on empty stack", () => {
    expect(validateOpen([], "overlay").ok).toBe(true);
  });

  it("allows drawer-form on empty stack", () => {
    expect(validateOpen([], "drawer-form").ok).toBe(true);
  });

  it("rejects page (pages do not enter the stack)", () => {
    const result = validateOpen([], "page");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("page_in_stack");
  });
});

describe("validateOpen — stacking order (Rule §4.1)", () => {
  it("allows drawer-form on top of overlay", () => {
    expect(validateOpen([frame("overlay")], "drawer-form").ok).toBe(true);
  });

  it("allows modal-select on top of drawer-form", () => {
    expect(validateOpen([frame("overlay"), frame("drawer-form")], "modal-select").ok).toBe(true);
  });

  it("allows dialog-confirm on top of any non-confirmation kind", () => {
    expect(validateOpen([frame("drawer-form")], "dialog-confirm").ok).toBe(true);
    expect(validateOpen([frame("modal-select")], "dialog-confirm").ok).toBe(true);
  });

  it("rejects overlay on top of drawer-form (out-of-order)", () => {
    const result = validateOpen([frame("drawer-form")], "overlay");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("out_of_order");
  });

  it("rejects drawer-form on top of dialog-confirm", () => {
    const result = validateOpen([frame("dialog-confirm")], "drawer-form");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("out_of_order");
  });

  it("rejects modal-select on top of dialog-confirm", () => {
    const result = validateOpen([frame("dialog-confirm")], "modal-select");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("out_of_order");
  });
});

describe("validateOpen — drawer-in-drawer (Rule §4)", () => {
  it("rejects drawer-form when drawer-form is already open", () => {
    const result = validateOpen([frame("drawer-form")], "drawer-form");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("drawer_in_drawer");
  });

  it("rejects drawer-peek when drawer-form is already open", () => {
    const result = validateOpen([frame("drawer-form")], "drawer-peek");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("drawer_in_drawer");
  });

  it("rejects drawer-form when drawer-peek is already open", () => {
    const result = validateOpen([frame("drawer-peek")], "drawer-form");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("drawer_in_drawer");
  });

  it("rejects drawer when one is buried under modal-select", () => {
    // Even when a modal-select sits on top of an existing drawer, opening
    // another drawer is still rejected — the drawer-class invariant is
    // about presence in the stack, not about the top frame.
    const result = validateOpen(
      [frame("drawer-form"), frame("modal-select")],
      "drawer-form",
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("drawer_in_drawer");
  });
});

describe("validateOpen — dialog-confirm stacking", () => {
  it("allows dialog-confirm on top of an existing dialog-confirm", () => {
    // Two confirmations in a row (e.g. type-switch after discard) is
    // legitimate and not blocked by the rule set.
    expect(validateOpen([frame("dialog-confirm")], "dialog-confirm").ok).toBe(true);
  });
});

describe("topFrame", () => {
  it("returns null for empty stack", () => {
    expect(topFrame([])).toBeNull();
  });

  it("returns the last frame", () => {
    const a = frame("overlay");
    const b = frame("drawer-form");
    expect(topFrame([a, b])).toBe(b);
  });
});
