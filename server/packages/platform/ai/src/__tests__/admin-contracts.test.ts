import express from "express";
import { routeContracts } from "@athyper/server-runtime-http";
import { describe,expect,it } from "vitest";
import { registerAtlasAdminRoutes } from "../atlas-admin-routes.js";

describe("Atlas admin contracts",()=>{it("registers every administration and dashboard route through the contract registry",()=>{const app=express();registerAtlasAdminRoutes(app,{authenticate:((_req,_res,next)=>next()),readContext:()=>({tenantId:"tenant-1"} as never),authorize:async()=>true,credentials:{} as never,knowledge:{} as never,policies:{} as never,quotas:{} as never,dashboards:{} as never});const contracts=routeContracts(app);expect(contracts.map(value=>value.operationId)).toEqual(expect.arrayContaining(["atlas.admin.credentials.put","atlas.admin.quota.put","atlas.admin.monitoring.calibration","atlas.admin.monitoring.drift"]));expect(contracts).toHaveLength(10);expect(contracts.every(value=>value.permission==="atlas.admin.manage")).toBe(true);});});
