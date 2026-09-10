import { expect, it, vi } from "vitest";
import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import { createShadowAuthorizer } from "../shadow-authorizer.js";
const request = { permissionCode: "read", context: {} } as AuthorizationRequest;
it("returns exactly the existing decision and never combines it with shadow", async () => {
  const decision = { allowed: false as const, reason: "denied_by_grant" },
    observe = vi.fn(async () => {});
  const result = await createShadowAuthorizer({
    authority: { authorize: async () => decision },
    observe,
    unavailable: () => {},
  }).authorize(request);
  expect(result).toBe(decision);
  expect(observe).toHaveBeenCalledWith(request, decision, expect.any(AbortSignal));
});
it("bounds failed and hung observers without changing authorization", async () => {
  const unavailable = vi.fn(),
    decision = { allowed: true as const };
  expect(
    await createShadowAuthorizer({
      authority: { authorize: async () => decision },
      observe: async () => new Promise(() => {}),
      unavailable,
      timeoutMs: 5,
    }).authorize(request),
  ).toBe(decision);
  expect(unavailable).toHaveBeenCalledOnce();
});
it("does not swallow failures of the selected authority", async () => {
  const observe = vi.fn();
  await expect(
    createShadowAuthorizer({
      authority: {
        authorize: async () => {
          throw Error("AUTHORITY_DOWN");
        },
      },
      observe,
      unavailable: () => {},
    }).authorize(request),
  ).rejects.toThrow("AUTHORITY_DOWN");
  expect(observe).not.toHaveBeenCalled();
});
it("isolates mutation of advisory inputs from the selected authority", async () => {
  const decision = { allowed: false as const, reason: "denied_by_grant" };
  const result = await createShadowAuthorizer({
    authority: { authorize: async () => decision },
    observe: async (_input, preview) => {
      Object.assign(preview, { allowed: true });
    },
    unavailable: () => {},
  }).authorize(request);
  expect(result).toBe(decision);
  expect(result.allowed).toBe(false);
});
it("aborts expired observations so late previews cannot be reported as completed comparisons", async () => {
  let observedSignal: AbortSignal | undefined;
  const unavailable = vi.fn();
  const result = await createShadowAuthorizer({
    authority: { authorize: async () => ({ allowed: false, reason: "selected_deny" }) },
    timeoutMs: 1,
    observe: async (_request, _decision, signal) => {
      observedSignal = signal;
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
    unavailable,
  }).authorize(request);
  expect(result).toEqual({ allowed: false, reason: "selected_deny" });
  expect(observedSignal?.aborted).toBe(true);
  expect(unavailable).toHaveBeenCalledOnce();
});

it("preserves the selected enforcement marker through advisory wrapping",()=>{
 const wrapped=createShadowAuthorizer({authority:{authorize:async()=>({allowed:true}),enforcedEntityProfile:(plane,entity)=>plane==="neon"&&entity==="business_partner"?"pinned":undefined},observe:async()=>{},unavailable:()=>{}});
 expect(wrapped.enforcedEntityProfile?.("neon","business_partner")).toBe("pinned");
 expect(wrapped.enforcedEntityProfile?.("mesh","business_partner")).toBeUndefined();
});
