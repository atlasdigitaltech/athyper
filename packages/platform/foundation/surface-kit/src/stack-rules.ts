export const SURFACE_KINDS = ["page", "overlay", "context-drawer", "form-drawer", "popover", "confirm-dialog"] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];
export const SURFACE_ORDER: Readonly<Record<SurfaceKind, number>> = Object.freeze({ page: 0, overlay: 1, "context-drawer": 2, "form-drawer": 2, popover: 3, "confirm-dialog": 4 });
export interface SurfaceFrame { readonly kind: SurfaceKind; readonly id: string; }
export type SurfaceRuleResult = { readonly ok: true } | { readonly ok: false; readonly code: "page-in-stack" | "drawer-in-drawer" | "out-of-order"; readonly reason: string };

export function validateSurfaceOpen(stack: readonly Pick<SurfaceFrame, "kind">[], kind: SurfaceKind): SurfaceRuleResult {
  if (kind === "page") return { ok: false, code: "page-in-stack", reason: "Pages are route-owned and never enter the overlay stack" };
  if ((kind === "context-drawer" || kind === "form-drawer") && stack.some((frame) => frame.kind === "context-drawer" || frame.kind === "form-drawer")) return { ok: false, code: "drawer-in-drawer", reason: "Only one drawer-class surface may be open" };
  const top = stack.at(-1); if (top && SURFACE_ORDER[kind] < SURFACE_ORDER[top.kind]) return { ok: false, code: "out-of-order", reason: `${kind} cannot open over ${top.kind}` };
  return { ok: true };
}

export function topSurface<T extends Pick<SurfaceFrame, "kind">>(stack: readonly T[]): T | null { return stack.at(-1) ?? null; }
