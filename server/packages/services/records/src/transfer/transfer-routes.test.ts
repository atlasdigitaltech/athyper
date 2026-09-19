import express from "express";
import { routeContracts } from "@athyper/server-runtime-http";
import { describe,expect,it } from "vitest";
import type { RecordTransferService } from "./transfer-service.js";
import { registerPublicRecordTransferRoutes,registerRecordTransferRoutes } from "./transfer-routes.js";

describe("record transfer route publication",()=>{
  it("publishes a versioned API over the same governed service without route collisions",()=>{const application=express(),options={authenticate:((_request:unknown,_response:unknown,next:()=>void)=>next()) as never,readContext:()=>({}) as never,transfers:{} as RecordTransferService};registerRecordTransferRoutes(application,options);registerPublicRecordTransferRoutes(application,options);const contracts=routeContracts(application),publicContracts=contracts.filter(item=>item.path.startsWith("/api/v1/records"));expect(contracts).toHaveLength(40);expect(publicContracts).toHaveLength(20);expect(publicContracts.every(item=>item.operationId.startsWith("public.v1.records.")&&item.authenticated&&Boolean(item.permission))).toBe(true);const paths=publicContracts.map(item=>`${item.method} ${item.path}`);expect(paths).toContain("post /api/v1/records/:entityCode/imports");expect(paths).toContain("post /api/v1/records/imports/:sessionId/file-upload");expect(paths).toContain("post /api/v1/records/imports/:sessionId/restart");expect(paths).toContain("post /api/v1/records/exports/:exportRequestId/restart");expect(paths).toContain("get /api/v1/records/transfers");});
});
