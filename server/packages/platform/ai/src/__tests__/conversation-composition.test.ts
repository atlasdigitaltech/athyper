import { describe, expect, it, vi } from "vitest";
import { createAtlasConversationServices } from "../conversation-composition.js";
import { context as fixture } from "./review-fixture.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasThread } from "@athyper/server-contract-ai";
const services = createAtlasConversationServices({ run: vi.fn() } as never);
function context(
  planeKey: VerifiedRequestContext["planeKey"],
): VerifiedRequestContext {
  return {
    ...fixture,
    planeKey,
    permissions: {
      ...fixture.permissions,
      planeKey,
      allowed: [`${planeKey}.ai.agent.use`],
    },
  };
}
describe.each(["neon", "mesh", "studio"] as const)(
  "%s durable conversation authorization",
  (plane) => {
    it("admits history independently of inference readiness", async () => {
      const ctx = context(plane);
      expect(await services.admission.resolve(ctx)).toMatchObject({
        persistenceAllowed: true,
        chatAllowed: false,
        reasonCode: "provider_not_configured",
      });
      expect(
        await services.authorizer.authorize({
          context: ctx,
          operation: "create",
        }),
      ).toBe(true);
    });
    it.each(["denied", "planLocked", "planeExcluded"] as const)(
      "honors %s even for an owner",
      async (category) => {
        const base = context(plane);
        const ctx = {
          ...base,
          permissions: {
            ...base.permissions,
            [category]: [`${plane}.ai.agent.use`],
          },
        };
        expect(
          await services.authorizer.authorize({
            context: ctx,
            operation: "read",
          }),
        ).toBe(false);
        expect(await services.admission.resolve(ctx)).toMatchObject({
          persistenceAllowed: false,
          reasonCode: "permission_denied",
        });
      },
    );
    it("rejects a permission from a different plane", async () => {
      const base = context(plane);
      const ctx = {
        ...base,
        permissions: {
          ...base.permissions,
          allowed: [`${plane === "neon" ? "studio" : "neon"}.ai.agent.use`],
        },
      };
      expect(
        await services.authorizer.authorize({
          context: ctx,
          operation: "read",
        }),
      ).toBe(false);
    });
    it("limits active participants to their role and rejects cross-tenant threads", async () => {
      const ctx = context(plane);
      const thread = {
        tenantId: ctx.tenantId,
        planeKey: plane,
        ownerPrincipalId: "other",
        participants: [{ principalId: ctx.principalId, role: "observer" }],
      } as unknown as AtlasThread;
      expect(
        await services.authorizer.authorize({
          context: ctx,
          operation: "read",
          thread,
        }),
      ).toBe(true);
      expect(
        await services.authorizer.authorize({
          context: ctx,
          operation: "manage",
          thread,
        }),
      ).toBe(false);
      expect(
        await services.authorizer.authorize({
          context: ctx,
          operation: "read",
          thread: { ...thread, tenantId: "other" },
        }),
      ).toBe(false);
      expect(
        await services.authorizer.authorize({
          context: ctx,
          operation: "read",
          thread: {
            ...thread,
            participants: [
              { ...thread.participants[0]!, revokedAt: "2026-09-07T00:00:00Z" },
            ],
          },
        }),
      ).toBe(false);
    });
  },
);
