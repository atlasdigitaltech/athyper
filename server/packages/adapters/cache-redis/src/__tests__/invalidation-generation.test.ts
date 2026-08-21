import {describe,expect,it,vi} from "vitest";
import type {Redis} from "ioredis";
import {createRedisInvalidationGenerationStore} from "../index.js";
describe("Redis invalidation generations",()=>{
 it("uses one atomic script with hash-tagged event and generation keys",async()=>{const evalCommand=vi.fn(async()=>7);const store=createRedisInvalidationGenerationStore({eval:evalCommand} as unknown as Redis,{prefix:"test"});await expect(store.incrementOnce({eventId:"event-1",kind:"metadata",planeKey:"neon",tenantId:"tenant-1",scopeKey:"invoice"})).resolves.toBe(7);expect(evalCommand).toHaveBeenCalledWith(expect.any(String),2,"test:{metadata:neon:tenant-1:invoice}:event:event-1","test:{metadata:neon:tenant-1:invoice}:generation","604800");});
});
