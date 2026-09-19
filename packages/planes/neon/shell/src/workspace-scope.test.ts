import { expect, it, vi } from "vitest";
import {
  coordinatesEqual,
  createWorkspaceScopeController,
  resolvedCoordinate,
  UNRESOLVED,
} from "./workspace-scope";

it("apply() commits pending only when compatible, and clears pending", () => {
  const onCommit = vi.fn();
  const controller = createWorkspaceScopeController({
    isCompatible: (candidate) =>
      candidate.mode === "unresolved" ||
      candidate.operatingOrganizationId === "org-a",
    onCommit,
  });
  controller.beginEdit("navigation");
  controller.updatePending(resolvedCoordinate(undefined, "org-b"));
  expect(controller.apply()).toBe(false);
  expect(controller.getSnapshot().committed).toEqual(UNRESOLVED);
  expect(onCommit).not.toHaveBeenCalled();

  controller.updatePending(resolvedCoordinate(undefined, "org-a"));
  expect(controller.apply()).toBe(true);
  expect(controller.getSnapshot().committed).toEqual(
    resolvedCoordinate(undefined, "org-a"),
  );
  expect(controller.getSnapshot().pending).toBeUndefined();
  expect(onCommit).toHaveBeenCalledWith(resolvedCoordinate(undefined, "org-a"));
});

it("beginEdit from one surface continues the same pending edit for the other, never a divergent draft", () => {
  const controller = createWorkspaceScopeController({
    isCompatible: () => true,
  });
  controller.beginEdit("navigation");
  controller.updatePending(resolvedCoordinate("co-1", "org-a"));
  // Filters opens while navigation's edit is still pending: it must see and continue it.
  controller.beginEdit("filters");
  expect(controller.getSnapshot().pending).toEqual(
    resolvedCoordinate("co-1", "org-a"),
  );
  expect(controller.getSnapshot().editingSurface).toBe("filters");
});

it("discardPending clears the pending edit without committing", () => {
  const onCommit = vi.fn();
  const controller = createWorkspaceScopeController({
    isCompatible: () => true,
    onCommit,
  });
  controller.beginEdit("navigation");
  controller.updatePending(resolvedCoordinate("co-1"));
  controller.discardPending();
  expect(controller.getSnapshot().pending).toBeUndefined();
  expect(controller.getSnapshot().committed).toEqual(UNRESOLVED);
  expect(onCommit).not.toHaveBeenCalled();
});

it("reset() resolves the configured default and never widens beyond it", () => {
  const controller = createWorkspaceScopeController({
    isCompatible: () => true,
    initial: resolvedCoordinate("co-1", "org-a"),
    defaultCoordinate: () => resolvedCoordinate("co-1"),
  });
  controller.beginEdit("navigation");
  controller.updatePending(resolvedCoordinate("co-1", "org-b"));
  controller.reset();
  expect(controller.getSnapshot().committed).toEqual(resolvedCoordinate("co-1"));
  expect(controller.getSnapshot().pending).toBeUndefined();
});

it("reset() falls back to unresolved with no configured default", () => {
  const controller = createWorkspaceScopeController({ isCompatible: () => true });
  controller.reset();
  expect(controller.getSnapshot().committed).toEqual(UNRESOLVED);
});

it("subscribe() notifies listeners on every committed change", () => {
  const controller = createWorkspaceScopeController({ isCompatible: () => true });
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);
  controller.beginEdit("navigation");
  controller.updatePending(resolvedCoordinate("co-1"));
  controller.apply();
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
  controller.reset();
  expect(listener).toHaveBeenCalledTimes(3);
});

it("coordinatesEqual compares resolved coordinates by field, not identity", () => {
  expect(
    coordinatesEqual(
      resolvedCoordinate("co-1", "org-a"),
      resolvedCoordinate("co-1", "org-a"),
    ),
  ).toBe(true);
  expect(
    coordinatesEqual(resolvedCoordinate("co-1"), resolvedCoordinate("co-2")),
  ).toBe(false);
  expect(coordinatesEqual(UNRESOLVED, resolvedCoordinate("co-1"))).toBe(false);
});
