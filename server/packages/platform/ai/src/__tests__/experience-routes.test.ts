import express from "express";
import { describe, expect, it } from "vitest";
import { routeContracts } from "@athyper/server-runtime-http";
import { registerAtlasExperienceRoutes } from "../atlas-experience-routes.js";

describe("Atlas experience route contracts",()=>{it("keeps public projections independent from inference and authoring restricted to Studio catalog administration",()=>{const app=express();registerAtlasExperienceRoutes(app,{authenticate:((_request,_response,next)=>next()),readContext:()=>({} as never),authorizeAdmin:async()=>true,experience:{} as never});const contracts=routeContracts(app);expect(contracts.map((item)=>item.operationId)).toEqual(["atlas.experience.get","atlas.admin.experience.draft","atlas.admin.experience.saveDraft","atlas.admin.experience.publish"]);expect(contracts[0]?.permission).toBeUndefined();expect(contracts.slice(1).every((item)=>item.permission==="studio.platform.catalog.manage")).toBe(true);});});
