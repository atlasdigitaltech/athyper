import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
const bundle = build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {AtlasBusinessContextProvider,AtlasBusinessContextStore,useAtlasBusinessContextPublisher} from './packages/platform/ai/agent-ui/src/business-context';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation,recordBookmarkMembershipOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const first='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002',row='20000000-0000-4000-8000-000000000001';
    const store=new AtlasBusinessContextStore();window.atlasStore=store;window.queries=[];
    const descriptor={schemaVersion:1,plane:'neon',entity:{code:'child_record',label:'Setting',pluralLabel:'Settings',identityField:'code',detailRouteTemplate:'/app/entity/child_record/:recordId'},revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},surface:{key:'default_list',title:'Settings',defaultState:{filters:[],sort:[],columns:['code','name'],density:'comfortable',mode:'table'},supportedModes:['table'],search:{minimumQueryLength:1}},fields:['code','name'].map((key,i)=>({key,label:i?'Name':'Code',valueKind:'string',semanticRole:i?'title':'identity',defaultVisible:true,defaultOrder:i,filterOperators:['contains','eq'],sortable:true,groupable:false,aggregations:[]})),actions:[],scope:{status:'ready',labels:[],fingerprint:'c'.repeat(64)},limits:{defaultPageSize:10,allowedPageSizes:[10],maxSortLevels:2,countMode:'none'}};
    const client={request:async(op,input)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op===recordBookmarkMembershipOperation)return new Set();
      if(op!==entityListOperation)return [];
      window.queries.push(input.query);
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:[{id:row,values:{code:'setting',name:'Saved setting'}}],pagination:{pageSize:10,hasNext:false,hasPrevious:false,countMode:'none'}};
    }};
    function App(){const [parent,setParent]=useState(first),[show,setShow]=useState(true);
      useAtlasBusinessContextPublisher({kind:'record',entityCode:'parent_record',recordId:parent,dirty:false,section:'children'});
      return <><button onClick={()=>setParent(second)}>Change parent</button><button onClick={()=>setShow(false)}>Leave children</button>{show?<EntityListRuntime client={client} entityCode='child_record' scopeCoordinate={{parentEntityCode:'parent_record',parentRecordId:parent,relationshipKey:'children',parentDescriptorHash:'e'.repeat(64)}} contentOnly/>:null}</>;
    }
    createRoot(document.getElementById('root')).render(<AtlasBusinessContextProvider store={store}><App/></AtlasBusinessContextProvider>);
  ` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"), define: { "process.env.NODE_ENV": '"test"' },
}).then(result => result.outputFiles[0]!.text);
test("the standard embedded list publishes the locked parent selector and restores record context", async ({ page }) => {
  await page.route("https://parent.test/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto("https://parent.test/app/entity/parent_record/10000000-0000-4000-8000-000000000001");
  await page.addScriptTag({ content: await bundle });
  await expect(page.getByText("Saved setting", { exact: true })).toBeVisible();
  const current = () => page.evaluate(() => (window as any).atlasStore.snapshot());
  await expect.poll(current).toMatchObject({ kind: "manage", entityCode: "child_record", parentScope: {
    parentEntityCode: "parent_record", parentRecordId: "10000000-0000-4000-8000-000000000001", relationshipKey: "children", parentDescriptorHash: "e".repeat(64),
  } });
  expect((await current()).directory).toBeUndefined();
  const generation = (await current()).generationId;
  await page.getByRole("button", { name: "Change parent", exact: true }).click();
  await expect.poll(current).toMatchObject({ parentScope: { parentRecordId: "10000000-0000-4000-8000-000000000002" } });
  expect((await current()).generationId).not.toBe(generation);
  expect(await page.evaluate(() => (window as any).queries.at(-1))).toMatchObject({ parentEntityCode: "parent_record", parentRecordId: "10000000-0000-4000-8000-000000000002", relationshipKey: "children", parentDescriptorHash: "e".repeat(64) });
  await page.getByRole("button", { name: "Leave children", exact: true }).click();
  await expect.poll(current).toMatchObject({ kind: "record", entityCode: "parent_record", recordId: "10000000-0000-4000-8000-000000000002" });
});
