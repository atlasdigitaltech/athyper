import { expect, it, vi } from "vitest";
import { parseAtlasResponseFeedback } from "@athyper/server-contract-ai";
import { AtlasResponseFeedbackService } from "../response-feedback.js";
import { context as actor } from "./review-fixture.js";
const feedback = {schemaVersion: 1, feedbackId: actor.tenantId, runId: actor.tenantId, messageId: actor.principalId, category: "intent", verdict: "wrong"} as const;
it.each(["neon", "mesh", "studio"] as const)("accepts only currently disclosed response feedback in %s", async planeKey => {
  const context = {...actor, planeKey, realmKey: planeKey, permissions: {...actor.permissions, planeKey, allowed: [`${planeKey}.ai.agent.use`]}};
  const append = vi.fn(async () => {}), canDiscloseMessage = vi.fn(async () => true);
  const service = new AtlasResponseFeedbackService({append}, {canDiscloseMessage});
  expect(await service.submit(context, feedback)).toEqual({feedbackId: feedback.feedbackId, accepted: true});
  expect(append).toHaveBeenCalledWith(context, feedback);
  canDiscloseMessage.mockResolvedValue(false);
  await expect(service.submit(context, feedback)).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  expect(append).toHaveBeenCalledTimes(1);
});
it.each([{schemaVersion: 2}, {runId: "invalid"}, {category: "grant_access"}, {verdict: "verified"}, {prompt: "private text"}, {tenantId: actor.tenantId}, {messageId: undefined}])("rejects invalid and authority-expanding feedback %j", patch => {
  expect(() => parseAtlasResponseFeedback({...feedback, ...patch})).toThrow();
});
