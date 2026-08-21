import {describe,expect,it,vi} from "vitest";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import {createNotificationOperations,NotificationOperationsError,type NotificationOperationsRepository} from "../notification-operations.js";
import {createNotificationPreferenceService} from "../notification-preferences.js";

const context={tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222",planeKey:"neon"} as VerifiedRequestContext;
const timeline={deliveryId:"33333333-3333-4333-8333-333333333333",messageId:"44444444-4444-4444-8444-444444444444",tenantId:context.tenantId,recipientId:context.principalId,channel:"email" as const,status:"failed" as const,attemptCount:3,maxAttempts:3,events:[]};

describe("notification operations",()=>{
  it("always narrows subscriber timeline reads to the authenticated principal",async()=>{const read=vi.fn().mockResolvedValue(timeline);const service=createNotificationOperations({repository:{timeline:read,replay:vi.fn()},authorizer:{authorize:vi.fn()}});await expect(service.subscriberTimeline(context,timeline.deliveryId)).resolves.toBe(timeline);expect(read).toHaveBeenCalledWith({context,deliveryId:timeline.deliveryId,recipientId:context.principalId});});

  it("requires operator permissions before an unscoped timeline read or replay",async()=>{const repository:NotificationOperationsRepository={timeline:vi.fn(),replay:vi.fn()};const service=createNotificationOperations({repository,authorizer:{authorize:vi.fn().mockResolvedValue({allowed:false,reason:"denied"})}});await expect(service.operatorTimeline(context,timeline.deliveryId)).rejects.toMatchObject({statusCode:403,code:"FORBIDDEN"});await expect(service.replay(context,timeline.deliveryId,"incident-42")).rejects.toBeInstanceOf(NotificationOperationsError);expect(repository.timeline).not.toHaveBeenCalled();expect(repository.replay).not.toHaveBeenCalled();});

  it("passes a stable operator replay key after authorization",async()=>{const replay=vi.fn().mockResolvedValue({deliveryId:timeline.deliveryId,replayKey:"incident-42",replayed:false,status:"pending"});const service=createNotificationOperations({repository:{timeline:vi.fn(),replay},authorizer:{authorize:vi.fn().mockResolvedValue({allowed:true})}});await expect(service.replay(context,timeline.deliveryId," incident-42 ")).resolves.toMatchObject({status:"pending",replayed:false});expect(replay).toHaveBeenCalledWith({context,deliveryId:timeline.deliveryId,replayKey:"incident-42"});});

  it("previews unsupported and consent-blocked preferences without persisting",async()=>{const replace=vi.fn();const service=createNotificationPreferenceService({store:{get:vi.fn().mockResolvedValue({preferences:[],version:0}),replace},capabilities:{supports:async(_scope,channel)=>channel!=="sms",hasConsent:async(_scope,channel)=>channel!=="whatsapp"},events:{publish:vi.fn()}});await expect(service.preview(context,[{eventCode:"invoice.approved",channels:["in_app","sms","whatsapp"]}])).resolves.toEqual([{eventCode:"invoice.approved",channels:[{channel:"in_app",enabled:true,supported:true,consented:true,reason:"enabled"},{channel:"sms",enabled:false,supported:false,consented:false,reason:"unsupported"},{channel:"whatsapp",enabled:false,supported:true,consented:false,reason:"consent_required"}]}]);expect(replace).not.toHaveBeenCalled();});
});
