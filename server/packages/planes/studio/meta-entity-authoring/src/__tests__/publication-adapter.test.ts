import { describe, expect, it, vi } from "vitest";
import { PublicationServiceMetaEntityAdapter } from "../publication-adapter.js";

describe("publication service adapter",()=>{
  it("dispatches through the existing authority queue and appends activation generations",async()=>{
    const enqueue=vi.fn(async()=>"job-1"),append=vi.fn(async()=>undefined);
    const adapter=new PublicationServiceMetaEntityAdapter({jobs:{enqueue} as never,execution:()=>({planeKey:"studio",scope:"tenant",tenantId:"tenant-1",principalId:"publisher"}),createEventId:()=>"event-1",activateLocal:async()=>({plane:"neon",tenantId:"tenant-1",entityCode:"invoice",generation:3,releaseId:"release-1"}),appendDurableEvent:append});
    await adapter.publish({releaseId:"release-1",artifact:{} as never,targetPlanes:["neon"]});
    expect(enqueue).toHaveBeenCalledWith("publication.authority","publication.compile-artifact",{releaseId:"release-1"},expect.objectContaining({enqueueKey:"publication:release-1:compile:1",execution:{planeKey:"studio",scope:"tenant",tenantId:"tenant-1",principalId:"publisher"}}));
    const event=await adapter.activate({releaseId:"release-1",plane:"neon",actorId:"reviewer"});await adapter.appendGenerationEvent(event);
    expect(event).toEqual(expect.objectContaining({eventId:"event-1",generation:3}));expect(append).toHaveBeenCalledWith(event);
  });
});
