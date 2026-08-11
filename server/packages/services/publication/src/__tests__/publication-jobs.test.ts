import { describe,expect,it,vi } from "vitest";
import type { JobEnvelope,JobPublisher } from "@athyper/server-contract-jobs";
import { COMPILE_PUBLICATION_ARTIFACT_JOB,DISPATCH_PUBLICATION_JOB,PUBLICATION_APPLY_QUEUE,PUBLICATION_AUTHORITY_QUEUE,ROLLBACK_PUBLICATION_RELEASE_JOB,SIGN_PUBLICATION_ARTIFACT_JOB,createPublicationAuthorityHandlers,createPublicationRollbackHandler,type PublicationAuthorityWork } from "../publication-jobs.js";

const context={signal:new AbortController().signal,attempt:1,reportProgress:async()=>undefined};
const envelope=<Name extends string,Payload extends object>(name:Name,data:Payload):JobEnvelope<Name,Payload>=>({id:`job-${name}`,name,queue:PUBLICATION_AUTHORITY_QUEUE,data,attempt:1,maxAttempts:5,enqueuedAt:"2026-08-10T00:00:00.000Z"});

describe("Publication authority jobs",()=>{
  it("persists each step before deterministically enqueueing the next",async()=>{
    const enqueued:unknown[][]=[];const jobs:JobPublisher={enqueue:vi.fn(async(...args:unknown[])=>{enqueued.push(args);return String((args[3] as {jobId:string}).jobId);})};
    const work:PublicationAuthorityWork={compile:vi.fn(async()=>({compilationIds:["11111111-1111-4111-8111-111111111111"]})),sign:vi.fn(async()=>({deploymentId:"22222222-2222-4222-8222-222222222222"})),dispatch:vi.fn(async()=>({deploymentId:"22222222-2222-4222-8222-222222222222",targetPlane:"neon" as const})),acknowledge:vi.fn(),recoverStalled:vi.fn(async()=>[])};
    const handlers=createPublicationAuthorityHandlers(work,jobs);
    await handlers[COMPILE_PUBLICATION_ARTIFACT_JOB]!.handle(envelope(COMPILE_PUBLICATION_ARTIFACT_JOB,{releaseId:"33333333-3333-4333-8333-333333333333"}),context);
    expect(enqueued[0]?.slice(0,3)).toEqual([PUBLICATION_AUTHORITY_QUEUE,SIGN_PUBLICATION_ARTIFACT_JOB,{compilationId:"11111111-1111-4111-8111-111111111111"}]);
    await handlers[SIGN_PUBLICATION_ARTIFACT_JOB]!.handle(envelope(SIGN_PUBLICATION_ARTIFACT_JOB,{compilationId:"11111111-1111-4111-8111-111111111111"}),context);
    expect(enqueued[1]?.slice(0,3)).toEqual([PUBLICATION_AUTHORITY_QUEUE,DISPATCH_PUBLICATION_JOB,{deploymentId:"22222222-2222-4222-8222-222222222222"}]);
    await handlers[DISPATCH_PUBLICATION_JOB]!.handle(envelope(DISPATCH_PUBLICATION_JOB,{deploymentId:"22222222-2222-4222-8222-222222222222"}),context);
    expect(enqueued[2]?.slice(0,3)).toEqual([PUBLICATION_APPLY_QUEUE,"publication.apply-release",{deploymentId:"22222222-2222-4222-8222-222222222222",targetPlane:"neon"}]);
    expect((enqueued[2]?.[3] as {jobId:string}).jobId).toBe("publication:22222222-2222-4222-8222-222222222222:apply:neon:1");
  });
  it("executes governed rollback as durable worker work",async()=>{const rollback=vi.fn(async()=>({id:"applied-1",publicationKey:"metadata.entity.invoice",deploymentId:"deployment-1",sourceReleaseId:"release-1",sourceReleaseNo:1,artifactHash:"a".repeat(64),status:"active" as const,stagedAt:"2026-08-10T00:00:00.000Z",activatedAt:"2026-08-10T00:01:00.000Z"}));const handler=createPublicationRollbackHandler({neon:{rollback} as never});const result=await handler.handle(envelope(ROLLBACK_PUBLICATION_RELEASE_JOB,{publicationKey:"metadata.entity.invoice",targetAppliedReleaseId:"applied-1",targetPlane:"neon",reason:"canary",actorId:"operator"}),context);expect(rollback).toHaveBeenCalledWith(expect.objectContaining({publicationKey:"metadata.entity.invoice",targetAppliedReleaseId:"applied-1"}));expect(result).toMatchObject({status:"completed",output:{activeAppliedReleaseId:"applied-1",targetPlane:"neon"}});});
});
