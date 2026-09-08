import test from "node:test";
import assert from "node:assert/strict";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {ShellRouteProvider,useShellRoute,useEntityBreadcrumbBinding,deriveEntityBreadcrumbs,type EntityBreadcrumbBinding} from "../../packages/platform/shell/shell/src/route-state";
import type {DerivedShellNavigation} from "../../packages/platform/shell/shell/src/core";
const base="/mdg/business-partner";
const navigation={routes:[{href:base,label:"Business Partner Management",workspaceCode:"mdg",workspaceName:"Master Data Governance"}],workspaces:[{code:"mdg",name:"Master Data Governance",href:"/mdg"}]} as unknown as DerivedShellNavigation;
const binding:EntityBreadcrumbBinding={basePath:base,sections:[{href:base,aliases:[],label:"Overview"},{href:`${base}/manage`,aliases:[`${base}/partners`],label:"Manage"},{href:`${base}/requests`,aliases:[],label:"Review & Approval"}]};
function Registration({value}:{value?:EntityBreadcrumbBinding}){useEntityBreadcrumbBinding(value);return null;}
function Observer(){const route=useShellRoute()!;return <nav>{deriveEntityBreadcrumbs(navigation,route.pathname,route.binding).map((crumb,i)=><span key={i}>{crumb.label}|</span>)}</nav>;}
test("persistent shell breadcrumbs follow section, history, locale and metadata removal",async()=>{
  const dom=new JSDOM('<div id="root"></div>');
  const previous=["window","document","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
  const root=createRoot(dom.window.document.getElementById('root')!);
  const render=(path:string,value:EntityBreadcrumbBinding|undefined=binding)=>root.render(<ShellRouteProvider pathname={path}><Observer/><Registration value={value}/></ShellRouteProvider>);
  try{
    for(const [path,label] of [[`${base}/partners`,'Manage'],[base,'Overview'],[`${base}/requests`,'Review & Approval'],[base,'Overview'],[`${base}/manage?density=compact`,'Manage']]){
      await act(async()=>render(path!));
      assert.equal(dom.window.document.querySelector('nav')?.textContent,`Master Data Governance|Business Partner Management|${label}|`);
    }
    await act(async()=>render(`${base}/requests`,{...binding,sections:binding.sections.map(section=>({...section,label:section.href.endsWith('/requests')?'Semakan':section.label}))}));
    assert.match(dom.window.document.querySelector('nav')!.textContent!,/Semakan/);
    await act(async()=>root.render(<ShellRouteProvider pathname="/mdg"><Observer/></ShellRouteProvider>));
    assert.equal(dom.window.document.querySelector('nav')?.textContent,'Master Data Governance|');
  }finally{await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}dom.window.close();}
});
