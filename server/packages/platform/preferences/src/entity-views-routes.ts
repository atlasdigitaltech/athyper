import {randomUUID} from "node:crypto";
import type {Application,RequestHandler,Response} from "express";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import {resolveEntityText,parseSaveableListState,type EntityListDescriptorV1} from "@athyper/contract-platform-entity-list";
import {SavedViewError,SavedViewVersionConflict,type createSavedViewService} from "./index.js";

export function registerEntityViewRoutes(app:Application,options:{authenticate:RequestHandler;readContext:(response:Response)=>VerifiedRequestContext;service:ReturnType<typeof createSavedViewService>;descriptor:(context:VerifiedRequestContext,entity:string,query:Record<string,unknown>)=>Promise<EntityListDescriptorV1>}) {
  const handle:RequestHandler=async(req,res,next)=>{try{
    const context=options.readContext(res),entity=String(req.params.entityCode),surface=String(req.query.surface??"entity_list");
    if(!/^[a-z][a-z0-9_.-]{0,126}$/.test(entity)||!/^[a-z][a-z0-9_.-]{0,126}$/.test(surface))throw new TypeError("Invalid collection identifier");
    const descriptor=await options.descriptor(context,entity,req.query);
    const read=async()=>{
      const result=await options.service.collection(context,entity,surface);
      return {...result,views:[...result.views,...(descriptor.standardViews??[]).map(view=>({id:`standard.${view.key}`,name:resolveEntityText(view.label),scope:"system" as const,version:1,state:{...descriptor.surface.defaultState,standardViewKey:view.key}}))].map(view=>{try{return {...view,state:validateViewState(view.state,descriptor),compatible:true};}catch{return {...view,state:{},compatible:false};}})};
    };
    res.setHeader("Cache-Control","private, no-store");
    if(req.method==="GET"){res.json(await read());return;}
    const value=req.body as Record<string,unknown>;
    if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("Expected a view command");
    const action=value.action;
    if(action==="create"){
      const name=String(value.name??"").trim();if(!name||name.length>160)throw new TypeError("View name must contain 1–160 characters");
      if(value.visibility!=="personal"&&value.visibility!=="shared")throw new TypeError("Invalid visibility");
      const input={entityCode:entity,surfaceCode:surface,code:`view_${randomUUID().replaceAll("-","")}`,name,state:validateViewState(value.state,descriptor) as unknown as Record<string,unknown>};
      const created=value.visibility==="shared"?await options.service.createShared(context,input):await options.service.create(context,input);
      res.status(201).json({...await read(),createdId:created.id});return;
    }
    const id=String(value.id??"");if(id!=="system"&&!id.startsWith("standard.")&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new TypeError("Invalid view ID");
    if(action==="default"){
      if(value.target!=="personal"&&value.target!=="shared")throw new TypeError("Invalid default audience");
      if(id!=="system"){const current=(await read()).views.find(view=>view.id===id);if(!current?.compatible)throw new TypeError("This view is no longer compatible with the available fields");}
      await options.service.collectionDefault(context,entity,surface,id,value.target,(descriptor.standardViews??[]).map(view=>`standard.${view.key}`));
    } else {
      const collection=await options.service.collection(context,entity,surface);
      const view=collection.views.find(item=>item.id===id);if(!view)throw new SavedViewError(404,"SAVED_VIEW_NOT_FOUND","View is not available in this collection");
      if(action==="delete")await options.service.remove(context,id,entity);
      else if(action==="copy"){validateViewState(view.state,descriptor);await options.service.clone(context,id);}
      else if(action==="update"){
        const version=Number(value.version);if(!Number.isSafeInteger(version)||version<1)throw new TypeError("A view revision is required");
        const name=String(value.name??view.name).trim();if(!name||name.length>160)throw new TypeError("Invalid view name");
        await options.service.replace(context,id,version,{name,...(value.state===undefined?{}:{state:validateViewState(value.state,descriptor) as unknown as Record<string,unknown>})},entity);
      }else throw new TypeError("Unknown view command");
    }
    res.json(await read());
  }catch(error){if(error instanceof SavedViewError||error instanceof SavedViewVersionConflict||error instanceof TypeError){const status=error instanceof SavedViewError?error.status:error instanceof SavedViewVersionConflict?409:400;res.status(status).json({status,code:error instanceof SavedViewError?error.code:"SAVED_VIEW_INVALID",message:error.message});}else next(error);}};
  app.get("/api/entity-runtime/:entityCode/views",options.authenticate,handle);
  app.post("/api/entity-runtime/:entityCode/views",options.authenticate,handle);
}

/** Never silently widen a saved filter when metadata or field access changes. */
export function validateViewState(raw:unknown,descriptor:EntityListDescriptorV1) {
 const parsed=parseSaveableListState(raw,descriptor),value=raw as Record<string,unknown>;
 if(parsed.standardViewKey&&!descriptor.standardViews?.some(view=>view.key===parsed.standardViewKey))throw new TypeError("Standard view is unavailable for this collection");
 const allowed=new Set(descriptor.fields.map(field=>field.key));
 if(!Array.isArray(value.columns)||value.columns.some(field=>typeof field!=="string"||!allowed.has(field))||value.columns.length>100)throw new TypeError("Saved view references unavailable fields");
 if(!Array.isArray(value.filters)||value.filters.length!==parsed.filters.length||!Array.isArray(value.sort)||value.sort.length!==parsed.sort.length||value.group&&value.group!==parsed.group)throw new TypeError("Saved view references unavailable filters, sorting or grouping");
 const {query:ignored,...state}=parsed;
 return state;
}
